const express = require('express');
const tykGatewayService = require('../services/TykGatewayService');
const { authenticateToken, requireOrganizationForApiOperations, getUserTykContext } = require('../middleware/auth');
const { AuditLog } = require('../models');
const UserCredentials = require('../models').UserCredentials;

const router = express.Router();

// Apply authentication to all Tyk routes
router.use(authenticateToken);

// Apply organization access control to all Tyk API operations
router.use(requireOrganizationForApiOperations);

// Helper function to get organization context for Tyk operations
const getTykOrgContext = async (req) => {
  try {
    if (req.user.role === 'super_admin') {
      // Super admins can optionally specify org context via query params
      const { org_id } = req.query;
      if (org_id) {
        // Convert database org ID to tyk_org_id
        const { Organization } = require('../models');
        const targetOrg = await Organization.findByPk(org_id);
        if (!targetOrg) {
          throw new Error(`Organization with ID ${org_id} not found`);
        }
        return {
          orgId: targetOrg.tyk_org_id || 'default',
          orgKey: targetOrg.tyk_org_key,
          organizationName: targetOrg.name,
          rateLimits: targetOrg.default_rate_limits || {}
        };
      }
      // Default to their own organization if no override
      return getUserTykContext(req.user);
    } else {
      // Regular users must use their organization context
      return getUserTykContext(req.user);
    }
  } catch (error) {
    throw new Error(`Invalid organization context: ${error.message}`);
  }
};

// Enhanced helper function to log Tyk operations with organization context
const logTykOperation = async (req, action, resourceType, resourceId, details, error = null) => {
  try {
    const orgContext = await getTykOrgContext(req);
    
    await AuditLog.create({
      user_id: req.user.id,
      organization_id: req.user.organization_id,
      action: action,
      resource_type: resourceType,
      resource_id: resourceId,
      details: {
        ...details,
        tykOrgId: orgContext.orgId,
        organizationName: orgContext.organizationName
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      status: error ? 'error' : 'success',
      error_message: error?.message
    });
  } catch (auditError) {
    console.error('Failed to log Tyk operation:', auditError);
  }
};

// Health check for Tyk routes
router.get('/health', async (req, res) => {
  try {
    const gatewayHealth = await tykGatewayService.healthCheck();
    
    res.json({ 
      status: 'ok', 
      service: 'tyk',
      gateway: gatewayHealth,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      service: 'tyk',
      gateway: { status: 'unhealthy', error: error.message },
      timestamp: new Date().toISOString()
    });
  }
});

// Gateway status endpoint
router.get('/gateway/status', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    console.log(`🔍 [${requestId}] Checking Tyk Gateway status for user: ${req.user.email}`);
    
    const healthCheck = await tykGatewayService.healthCheck();
    
    await logTykOperation(req, 'gateway_status_check', 'gateway', 'main', {
      requestId: requestId,
      healthStatus: healthCheck.status
    });

    res.json({
      status: healthCheck.status,
      message: healthCheck.message,
      response: healthCheck.response,
      duration: healthCheck.duration,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Gateway status check failed:`, error);
    
    await logTykOperation(req, 'gateway_status_check', 'gateway', 'main', {
      requestId: requestId
    }, error);

    res.status(500).json({
      status: 'error',
      message: 'Failed to check gateway status',
      error: error.message
    });
  }
});

// APIs Management
router.get('/apis', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    const orgContext = await getTykOrgContext(req);
    console.log(`📋 [${requestId}] Fetching APIs for user: ${req.user.email} (org: ${orgContext.organizationName})`);
    
    const apis = await tykGatewayService.getApis(orgContext.orgId);
    
    await logTykOperation(req, 'list_apis', 'api', null, {
      requestId: requestId,
      apiCount: Array.isArray(apis) ? apis.length : 0
    });

    res.json({
      success: true,
      data: apis,
      count: Array.isArray(apis) ? apis.length : 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to fetch APIs:`, error);
    
    await logTykOperation(req, 'list_apis', 'api', null, {
      requestId: requestId
    }, error);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch APIs',
      error: error.message
    });
  }
});

router.get('/apis/:apiId', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const { apiId } = req.params;
  
  try {
    const orgContext = await getTykOrgContext(req);
    console.log(`📋 [${requestId}] Fetching API ${apiId} for user: ${req.user.email} (org: ${orgContext.organizationName})`);
    
    const api = await tykGatewayService.getApi(apiId);
    
    // SECURITY: Verify API belongs to user's organization
    if (api && api.org_id !== orgContext.orgId) {
      console.warn(`🚫 [${requestId}] Access denied: API ${apiId} belongs to org ${api.org_id}, user is in org ${orgContext.orgId}`);
      return res.status(403).json({
        success: false,
        message: 'Access denied: API does not belong to your organization',
        timestamp: new Date().toISOString()
      });
    }
    
    await logTykOperation(req, 'get_api', 'api', apiId, {
      requestId: requestId,
      apiName: api.name || 'unknown'
    });

    res.json({
      success: true,
      data: api,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to fetch API ${apiId}:`, error);
    
    await logTykOperation(req, 'get_api', 'api', apiId, {
      requestId: requestId
    }, error);

    res.status(error.status || 500).json({
      success: false,
      message: `Failed to fetch API ${apiId}`,
      error: error.message
    });
  }
});

router.post('/apis', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    const orgContext = await getTykOrgContext(req);
    console.log(`🆕 [${requestId}] Creating API for user: ${req.user.email} (org: ${orgContext.organizationName})`, {
      apiName: req.body.name,
      listenPath: req.body.proxy?.listen_path
    });
    
    const newApi = await tykGatewayService.createApi(req.body, orgContext.orgId);
    
    await logTykOperation(req, 'create_api', 'api', newApi.key || newApi.id, {
      requestId: requestId,
      apiName: req.body.name,
      listenPath: req.body.proxy?.listen_path
    });

    res.status(201).json({
      success: true,
      data: newApi,
      message: 'API created successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to create API:`, error);
    
    await logTykOperation(req, 'create_api', 'api', null, {
      requestId: requestId,
      apiName: req.body.name
    }, error);

    res.status(error.status || 500).json({
      success: false,
      message: 'Failed to create API',
      error: error.message
    });
  }
});

router.put('/apis/:apiId', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const { apiId } = req.params;
  
  try {
    const orgContext = await getTykOrgContext(req);
    console.log(`✏️ [${requestId}] Updating API ${apiId} for user: ${req.user.email} (org: ${orgContext.organizationName})`);
    
    // SECURITY: First verify the API belongs to user's organization
    const existingApi = await tykGatewayService.getApi(apiId);
    if (existingApi && existingApi.org_id !== orgContext.orgId) {
      console.warn(`🚫 [${requestId}] Access denied: Cannot update API ${apiId} from different organization`);
      return res.status(403).json({
        success: false,
        message: 'Access denied: API does not belong to your organization',
        timestamp: new Date().toISOString()
      });
    }
    
    // Ensure org_id is set correctly in the update data
    if (!req.body.org_id) {
      req.body.org_id = orgContext.orgId;
    }
    
    const updatedApi = await tykGatewayService.updateApi(apiId, req.body);
    
    await logTykOperation(req, 'update_api', 'api', apiId, {
      requestId: requestId,
      apiName: req.body.name
    });

    res.json({
      success: true,
      data: updatedApi,
      message: 'API updated successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to update API ${apiId}:`, error);
    
    await logTykOperation(req, 'update_api', 'api', apiId, {
      requestId: requestId
    }, error);

    res.status(error.status || 500).json({
      success: false,
      message: `Failed to update API ${apiId}`,
      error: error.message
    });
  }
});

router.delete('/apis/:apiId', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const { apiId } = req.params;
  
  try {
    const orgContext = await getTykOrgContext(req);
    console.log(`🗑️ [${requestId}] Deleting API ${apiId} for user: ${req.user.email} (org: ${orgContext.organizationName})`);
    
    // SECURITY: First verify the API belongs to user's organization
    const existingApi = await tykGatewayService.getApi(apiId);
    if (existingApi && existingApi.org_id !== orgContext.orgId) {
      console.warn(`🚫 [${requestId}] Access denied: Cannot delete API ${apiId} from different organization`);
      return res.status(403).json({
        success: false,
        message: 'Access denied: API does not belong to your organization',
        timestamp: new Date().toISOString()
      });
    }
    
    const result = await tykGatewayService.deleteApi(apiId);
    
    await logTykOperation(req, 'delete_api', 'api', apiId, {
      requestId: requestId
    });

    res.json({
      success: true,
      data: result,
      message: 'API deleted successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to delete API ${apiId}:`, error);
    
    await logTykOperation(req, 'delete_api', 'api', apiId, {
      requestId: requestId
    }, error);

    res.status(error.status || 500).json({
      success: false,
      message: `Failed to delete API ${apiId}`,
      error: error.message
    });
  }
});

// Key Management
router.get('/keys', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    const orgContext = await getTykOrgContext(req);
    console.log(`🔑 [${requestId}] Fetching keys for user: ${req.user.email} (org: ${orgContext.organizationName})`);

    const response = await tykGatewayService.getKeys(orgContext.orgId);
    
    console.log(`🔍 [${requestId}] Raw Tyk keys response:`, JSON.stringify(response, null, 2));

    // Handle the response format
    let keyIds = [];
    if (response && response.keys && Array.isArray(response.keys)) {
      keyIds = response.keys;
    } else if (Array.isArray(response)) {
      keyIds = response;
    } else {
      console.warn(`⚠️ [${requestId}] Unexpected keys response format:`, typeof response);
      keyIds = [];
    }

    console.log(`🔍 [${requestId}] Extracted ${keyIds.length} key IDs:`, keyIds);

    // Fetch detailed information for each key
    const detailedKeys = [];
    for (const keyId of keyIds) {
      try {
        console.log(`🔍 [${requestId}] Fetching details for key: ${keyId}`);
        const keyDetail = await tykGatewayService.getKey(keyId, true, orgContext.orgId);
        
        if (keyDetail) {
          // Process key data with priority: alias > meta_data > fallback
          const processedKey = {
            key_hash: keyId,
            // Name priority: alias > meta_data.name > meta.name > fallback
            name: keyDetail.alias || 
                  keyDetail.meta_data?.name || 
                  keyDetail.meta?.name || 
                  `Key ${keyId.substring(0, 8)}`,
            // Description from meta_data or meta
            description: keyDetail.meta_data?.description || 
                        keyDetail.meta?.description || 
                        '',
            // Core fields
            org_id: keyDetail.org_id,
            allowance: keyDetail.allowance,
            rate: keyDetail.rate,
            per: keyDetail.per,
            quota_max: keyDetail.quota_max,
            quota_remaining: keyDetail.quota_remaining,
            quota_renewal_rate: keyDetail.quota_renewal_rate,
            quota_renews: keyDetail.quota_renews,
            // Status (map is_inactive to active for display)
            active: !keyDetail.is_inactive,
            is_inactive: keyDetail.is_inactive,
            // Timestamps
            last_updated: keyDetail.last_updated,
            date_created: keyDetail.date_created,
            expires: keyDetail.expires,
            // Access rights
            access_rights: keyDetail.access_rights || {},
            // Enhanced metadata
            meta_data: keyDetail.meta_data || {},
            meta: keyDetail.meta || {},
            // Additional fields
            alias: keyDetail.alias,
            tags: keyDetail.tags || [],
            apply_policies: keyDetail.apply_policies || [],
            // Creator information (from meta_data)
            created_by: keyDetail.meta_data?.created_by || keyDetail.meta?.created_by || 'Unknown',
            created_by_id: keyDetail.meta_data?.created_by_id || keyDetail.meta?.created_by_id,
            project: keyDetail.meta_data?.project || keyDetail.meta?.project,
            // Raw data for debugging
            _raw: keyDetail
          };

          detailedKeys.push(processedKey);
          console.log(`✅ [${requestId}] Key ${keyId} details fetched successfully`);
        }
      } catch (keyError) {
        console.warn(`⚠️ [${requestId}] Failed to fetch details for key ${keyId}:`, keyError.message);
        // Add a minimal key object so we don't lose the key hash
        detailedKeys.push({
          key_hash: keyId,
          name: `Key ${keyId.substring(0, 8)} (Details unavailable)`,
          description: 'Unable to fetch key details',
          active: false,
          error: keyError.message
        });
      }
    }

    console.log(`🔍 [${requestId}] Successfully fetched ${detailedKeys.length} keys with details`);

    // Create audit log
    await AuditLog.create({
      user_id: req.user.id,
      organization_id: req.user.organization_id,
      action: 'LIST',
      resource_type: 'api_key',
      resource_id: null,
      details: {
        key_count: detailedKeys.length,
        org_filter: orgContext.orgId
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      status: 'success'
    });

    res.json({
      success: true,
      data: detailedKeys,
      count: detailedKeys.length,
      message: `Retrieved ${detailedKeys.length} API keys`
    });

  } catch (error) {
    console.error(`❌ [${requestId}] Failed to fetch keys:`, {
      error: error.message,
      stack: error.stack,
      userId: req.user.id
    });

    // Create audit log for failure
    try {
      await AuditLog.create({
        user_id: req.user.id,
        organization_id: req.user.organization_id,
        action: 'LIST',
        resource_type: 'api_key',
        resource_id: null,
        details: {
          error: error.message
        },
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        status: 'failed'
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

    res.status(500).json({
      success: false,
      message: 'Failed to fetch keys',
      error: error.message
    });
  }
});

router.post('/keys', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const { 
    name,           // Will be stored as alias
    description,    // Will be stored in meta_data.description
    policy_id,      // NEW: Policy to apply to this key
    expires = null
  } = req.body;

  console.log(`🔑 [${requestId}] Creating new policy-based key:`, {
    name,
    hasDescription: !!description,
    policy_id,
    expires,
    userId: req.user.id,
    userEmail: req.user.email
  });

  try {
    // Validation
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Key name is required',
        field: 'name'
      });
    }

    if (name.length > 100) {
      return res.status(400).json({
        error: 'Validation failed', 
        message: 'Key name must be 100 characters or less',
        field: 'name'
      });
    }

    if (!policy_id) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Policy selection is required',
        field: 'policy_id'
      });
    }

    // Get user's organization context
    const { orgId } = await getTykOrgContext(req);
    
    // Validate that the policy is available to this organization
    // Use the database organization ID for policy validation, not the Tyk org ID
    const policyService = require('../services/PolicyService');
    const policy = await policyService.validatePolicyAccess(policy_id, req.user.organization_id);
    
    if (!policy) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Selected policy is not available to your organization'
      });
    }

    // Prepare key data for Tyk using policy
    const keyData = {
      org_id: orgId,
      alias: name.trim(),
      apply_policies: [policy.tyk_policy_id], // Use policy instead of access_rights
      meta_data: {
        description: description?.trim() || "",
        created_by: req.user.email,
        created_by_id: req.user.id,
        created_at: new Date().toISOString(),
        project: "tykbasic",
        user_type: "frontend_user",
        policy_id: policy_id,
        policy_name: policy.name
      }
    };

    // Add expiration if provided
    if (expires) {
      keyData.expires = parseInt(expires);
    }

    console.log(`🌐 [${requestId}] Tyk policy-based key creation request:`, {
      alias: keyData.alias,
      org_id: keyData.org_id,
      policy_id: policy.tyk_policy_id,
      policy_name: policy.name,
      hasExpiration: !!keyData.expires,
      metaDataKeys: Object.keys(keyData.meta_data)
    });

    const response = await tykGatewayService.createKey(keyData, orgId);

    console.log(`✅ [${requestId}] Policy-based key created successfully:`, {
      keyHash: response.key_hash || response.key?.substring(0, 8) + '...' || 'unknown',
      action: response.action,
      status: response.status,
      policy: policy.name
    });

    // Store reference in database with policy information
    try {
      await UserCredentials.create({
        user_id: req.user.id,
        organization_id: req.user.organization_id,
        credential_type: 'api_key',
        name: name.trim(),
        description: description?.trim() || null,
        tyk_key_id: response.key,
        tyk_key_hash: response.key_hash,
        tyk_policy_id: policy.tyk_policy_id,
        policy_id: policy_id
      });

      console.log(`💾 [${requestId}] Database record created for policy-based key`);
    } catch (dbError) {
      console.warn(`⚠️  [${requestId}] Database storage failed (non-critical):`, dbError.message);
    }

    // Create audit log
    await logTykOperation(req, 'create_key', 'api_key', response.key_hash || response.key, {
      requestId: requestId,
      key_name: name,
      policy_id: policy_id,
      policy_name: policy.name,
      has_expiration: !!expires
    });

    res.status(201).json({
      success: true,
      message: 'API key created successfully',
      data: {
        key: response.key,
        key_hash: response.key_hash || response.key,
        action: response.action,
        name: name,
        description: description || '',
        alias: keyData.alias,
        policy: {
          id: policy_id,
          name: policy.name,
          tyk_policy_id: policy.tyk_policy_id
        },
        meta_data: keyData.meta_data,
        security_notice: 'This key will only be displayed once. Save it securely.'
      }
    });

  } catch (error) {
    console.error(`❌ [${requestId}] Policy-based key creation failed:`, {
      error: error.message,
      stack: error.stack,
      userId: req.user.id
    });

    // Create audit log for failure
    await logTykOperation(req, 'create_key', 'api_key', null, {
      requestId: requestId,
      error: error.message,
      attempted_key_name: name,
      policy_id: policy_id
    }, error);

    res.status(500).json({
      error: 'Key creation failed',
      message: error.message
    });
  }
});

router.get('/keys/:keyId', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const { keyId } = req.params;
  const { hashed = 'true' } = req.query;
  
  try {
    console.log(`🔑 [${requestId}] Fetching key ${keyId} for user: ${req.user.email}`);
    
    const { orgId } = await getTykOrgContext(req);
    const key = await tykGatewayService.getKey(keyId, hashed === 'true', orgId);
    
    await logTykOperation(req, 'get_key', 'key', keyId, {
      requestId: requestId,
      hashed: hashed === 'true'
    });

    res.json({
      success: true,
      data: key,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to fetch key ${keyId}:`, error);
    
    await logTykOperation(req, 'get_key', 'key', keyId, {
      requestId: requestId
    }, error);

    res.status(error.status || 500).json({
      success: false,
      message: `Failed to fetch key ${keyId}`,
      error: error.message
    });
  }
});

router.put('/keys/:keyId', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const { keyId } = req.params;
  const { hashed = 'true' } = req.query;
  
  try {
    console.log(`✏️ [${requestId}] Updating key ${keyId} for user: ${req.user.email}`);
    
    const { orgId } = await getTykOrgContext(req);
    const updatedKey = await tykGatewayService.updateKey(keyId, req.body, hashed === 'true', orgId);
    
    await logTykOperation(req, 'update_key', 'key', keyId, {
      requestId: requestId,
      hashed: hashed === 'true'
    });

    res.json({
      success: true,
      data: updatedKey,
      message: 'Key updated successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to update key ${keyId}:`, error);
    
    await logTykOperation(req, 'update_key', 'key', keyId, {
      requestId: requestId
    }, error);

    res.status(error.status || 500).json({
      success: false,
      message: `Failed to update key ${keyId}`,
      error: error.message
    });
  }
});

router.delete('/keys/:keyId', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const { keyId } = req.params;
  const { hashed = 'true' } = req.query;
  
  try {
    console.log(`🗑️ [${requestId}] Deleting key ${keyId} for user: ${req.user.email}`);
    
    const { orgId } = await getTykOrgContext(req);
    const result = await tykGatewayService.deleteKey(keyId, hashed === 'true', orgId);
    
    await logTykOperation(req, 'delete_key', 'key', keyId, {
      requestId: requestId,
      hashed: hashed === 'true'
    });

    res.json({
      success: true,
      data: result,
      message: 'Key deleted successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to delete key ${keyId}:`, error);
    
    await logTykOperation(req, 'delete_key', 'key', keyId, {
      requestId: requestId
    }, error);

    res.status(error.status || 500).json({
      success: false,
      message: `Failed to delete key ${keyId}`,
      error: error.message
    });
  }
});

// Certificate Management
router.get('/certificates', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    console.log(`📋 [${requestId}] Fetching certificates for user: ${req.user.email}`);
    
    const { orgId } = await getTykOrgContext(req);
    const certificates = await tykGatewayService.getCertificates(orgId);
    
    await logTykOperation(req, 'list_certificates', 'certificate', null, {
      requestId: requestId,
      certificateCount: Array.isArray(certificates) ? certificates.length : Object.keys(certificates || {}).length
    });

    res.json({
      success: true,
      data: certificates,
      count: Array.isArray(certificates) ? certificates.length : Object.keys(certificates || {}).length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to fetch certificates:`, error);
    
    await logTykOperation(req, 'list_certificates', 'certificate', null, {
      requestId: requestId
    }, error);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch certificates',
      error: error.message
    });
  }
});

// Upload certificate
router.post('/certificates', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    console.log(`📤 [${requestId}] Uploading certificate for user: ${req.user.email}`);
    
    const { certificate, name, description } = req.body;
    
    if (!certificate || !certificate.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Certificate PEM data is required'
      });
    }

    const { orgId } = await getTykOrgContext(req);
    const result = await tykGatewayService.uploadCertificate(certificate, orgId);
    
    await logTykOperation(req, 'upload_certificate', 'certificate', result.id, {
      requestId: requestId,
      name: name,
      description: description
    });

    res.json({
      success: true,
      data: result,
      message: 'Certificate uploaded successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to upload certificate:`, error);
    
    await logTykOperation(req, 'upload_certificate', 'certificate', null, {
      requestId: requestId
    }, error);

    res.status(error.status || 500).json({
      success: false,
      message: 'Failed to upload certificate',
      error: error.message
    });
  }
});

// Get certificate details
router.get('/certificates/:certId', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const { certId } = req.params;
  
  try {
    console.log(`🔍 [${requestId}] Fetching certificate ${certId} for user: ${req.user.email}`);
    
    const { orgId } = await getTykOrgContext(req);
    const certificate = await tykGatewayService.getCertificate(certId, orgId);
    
    await logTykOperation(req, 'get_certificate', 'certificate', certId, {
      requestId: requestId
    });

    res.json({
      success: true,
      data: certificate,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to fetch certificate ${certId}:`, error);
    
    await logTykOperation(req, 'get_certificate', 'certificate', certId, {
      requestId: requestId
    }, error);

    res.status(error.status || 500).json({
      success: false,
      message: `Failed to fetch certificate ${certId}`,
      error: error.message
    });
  }
});

// Delete certificate
router.delete('/certificates/:certId', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const { certId } = req.params;
  
  try {
    console.log(`🗑️ [${requestId}] Deleting certificate ${certId} for user: ${req.user.email}`);
    
    const { orgId } = await getTykOrgContext(req);
    const result = await tykGatewayService.deleteCertificate(certId, orgId);
    
    await logTykOperation(req, 'delete_certificate', 'certificate', certId, {
      requestId: requestId
    });

    res.json({
      success: true,
      data: result,
      message: 'Certificate deleted successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to delete certificate ${certId}:`, error);
    
    await logTykOperation(req, 'delete_certificate', 'certificate', certId, {
      requestId: requestId
    }, error);

    res.status(error.status || 500).json({
      success: false,
      message: `Failed to delete certificate ${certId}`,
      error: error.message
    });
  }
});

router.post('/certificates/generate', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    console.log(`🔧 [${requestId}] Generating certificate for user: ${req.user.email}`);
    
    const {
      commonName = 'localhost',
      organization = 'TykBasic',
      organizationalUnit = 'Test Department',
      locality = 'Test City',
      state = 'Test State',
      country = 'US',
      validityDays = 365
    } = req.body;

    // Use the existing cert-generator utility
    const { generateSelfSignedCert } = require('../../tyk-configs/cert-generator');
    
    const certData = generateSelfSignedCert({
      commonName,
      organization,
      organizationalUnit,
      locality,
      state,
      country,
      validityDays
    });
    
    await logTykOperation(req, 'generate_certificate', 'certificate', 'generated', {
      requestId: requestId,
      commonName: commonName,
      organization: organization,
      validityDays: validityDays
    });

    res.status(200).json({
      success: true,
      certificate: certData.certificate,
      privateKey: certData.privateKey,
      info: certData.info,
      message: 'Certificate generated successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to generate certificate:`, error);
    
    await logTykOperation(req, 'generate_certificate', 'certificate', null, {
      requestId: requestId
    }, error);

    res.status(500).json({
      success: false,
      message: 'Failed to generate certificate',
      error: error.message
    });
  }
});

// Gateway Reload
router.post('/gateway/reload', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    console.log(`🔄 [${requestId}] Reloading Tyk Gateway for user: ${req.user.email}`);
    
    const result = await tykGatewayService.reloadGateway();
    
    await logTykOperation(req, 'gateway_reload', 'gateway', 'main', {
      requestId: requestId,
      reloadStatus: 'success'
    });

    res.json({
      success: true,
      data: result,
      message: 'Gateway reloaded successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to reload gateway:`, error);
    
    await logTykOperation(req, 'gateway_reload', 'gateway', 'main', {
      requestId: requestId,
      reloadStatus: 'failed'
    }, error);

    res.status(error.status || 500).json({
      success: false,
      message: 'Failed to reload gateway',
      error: error.message
    });
  }
});

// Gateway Statistics (Organization-scoped)
router.get('/gateway/statistics', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    const orgContext = await getTykOrgContext(req);
    console.log(`📊 [${requestId}] Fetching gateway statistics for user: ${req.user.email} (org: ${orgContext.organizationName})`);
    
    // Get organization-scoped statistics
    const [apis, keys, policies, certificates] = await Promise.all([
      tykGatewayService.getApis(orgContext.orgId),
      tykGatewayService.getKeys(orgContext.orgId),
      tykGatewayService.getPolicies(orgContext.orgId),
      tykGatewayService.getCertificates(orgContext.orgId)
    ]);

    // Calculate statistics
    const statistics = {
      apis: {
        total: Array.isArray(apis) ? apis.length : 0,
        active: Array.isArray(apis) ? apis.filter(api => api.active !== false).length : 0,
        inactive: Array.isArray(apis) ? apis.filter(api => api.active === false).length : 0
      },
      keys: {
        total: Array.isArray(keys) ? keys.length : 0,
        active: Array.isArray(keys) ? keys.filter(key => key.active !== false).length : 0,
        inactive: Array.isArray(keys) ? keys.filter(key => key.active === false).length : 0
      },
      policies: {
        total: Array.isArray(policies) ? policies.length : 0,
        active: Array.isArray(policies) ? policies.filter(policy => policy.active !== false).length : 0
      },
      certificates: {
        total: Array.isArray(certificates) ? certificates.length : 0
      },
      organization: {
        id: orgContext.orgId,
        name: orgContext.organizationName
      }
    };
    
    await logTykOperation(req, 'get_gateway_statistics', 'gateway', 'statistics', {
      requestId: requestId,
      apiCount: statistics.apis.total,
      keyCount: statistics.keys.total,
      policyCount: statistics.policies.total,
      certificateCount: statistics.certificates.total
    });

    res.json({
      success: true,
      data: statistics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to fetch gateway statistics:`, error);
    
    await logTykOperation(req, 'get_gateway_statistics', 'gateway', 'statistics', {
      requestId: requestId
    }, error);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch gateway statistics',
      error: error.message
    });
  }
});

// Analytics endpoint (Organization-scoped)
router.get('/analytics', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    const orgContext = await getTykOrgContext(req);
    const { api_id, resolution = 'day', from, to } = req.query;
    
    console.log(`📈 [${requestId}] Fetching analytics for user: ${req.user.email} (org: ${orgContext.organizationName})`);
    
    // If api_id is specified, verify it belongs to the user's organization
    if (api_id) {
      const apis = await tykGatewayService.getApis(orgContext.orgId);
      const apiExists = Array.isArray(apis) && apis.some(api => api.api_id === api_id);
      
      if (!apiExists) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: API does not belong to your organization',
          timestamp: new Date().toISOString()
        });
      }
    }
    
    const analytics = await tykGatewayService.getAnalytics(api_id, resolution, from, to, orgContext.orgId);
    
    await logTykOperation(req, 'get_analytics', 'analytics', api_id || 'all', {
      requestId: requestId,
      resolution: resolution,
      dateRange: from && to ? `${from} to ${to}` : 'default'
    });

    res.json({
      success: true,
      data: analytics,
      params: {
        api_id: api_id || 'all',
        resolution: resolution,
        from: from,
        to: to,
        organization: orgContext.organizationName
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to fetch analytics:`, error);
    
    await logTykOperation(req, 'get_analytics', 'analytics', req.query.api_id || 'all', {
      requestId: requestId
    }, error);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
});

module.exports = router;
