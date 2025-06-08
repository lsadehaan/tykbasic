const express = require('express');
const tykGatewayService = require('../services/TykGatewayService');
const { authenticateToken } = require('../middleware/auth');
const { AuditLog } = require('../models');
const UserCredentials = require('../models').UserCredentials;

const router = express.Router();

// Apply authentication to all Tyk routes
router.use(authenticateToken);

// Helper function to log Tyk operations
const logTykOperation = async (req, action, resourceType, resourceId, details, error = null) => {
  try {
    await AuditLog.create({
      user_id: req.user.id,
      organization_id: req.user.organization_id,
      action: action,
      resource_type: resourceType,
      resource_id: resourceId,
      details: details,
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
    console.log(`📋 [${requestId}] Fetching APIs for user: ${req.user.email}`);
    
    const apis = await tykGatewayService.getApis();
    
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
    console.log(`📋 [${requestId}] Fetching API ${apiId} for user: ${req.user.email}`);
    
    const api = await tykGatewayService.getApi(apiId);
    
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
    console.log(`🆕 [${requestId}] Creating API for user: ${req.user.email}`, {
      apiName: req.body.name,
      listenPath: req.body.proxy?.listen_path
    });
    
    const newApi = await tykGatewayService.createApi(req.body);
    
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
    console.log(`✏️ [${requestId}] Updating API ${apiId} for user: ${req.user.email}`);
    
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
    console.log(`🗑️ [${requestId}] Deleting API ${apiId} for user: ${req.user.email}`);
    
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
  const { orgId = 'all' } = req.query;

  console.log(`🔑 [${requestId}] Fetching keys for user: ${req.user.email}`, { orgId });

  try {
    const response = await tykGatewayService.getKeys();
    
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
        const keyDetail = await tykGatewayService.getKey(keyId);
        
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
        org_filter: orgId
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
    allowance = 1000,
    rate = 1000,
    per = 60,
    quota_max,
    quota_renewal_rate,
    expires = null,
    access_rights = {}
  } = req.body;

  console.log(`🔑 [${requestId}] Creating new key:`, {
    name,
    hasDescription: !!description,
    allowance,
    rate,
    per,
    quota_max,
    quota_renewal_rate,
    expires,
    accessRightCount: Object.keys(access_rights).length,
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

    // Prepare key data for Tyk
    const keyData = {
      org_id: "default",
      alias: name.trim(),                    // ✅ Use alias for name
      meta_data: {                          // ✅ Store custom data in meta_data
        description: description?.trim() || "",
        created_by: req.user.email,
        created_by_id: req.user.id,
        created_at: new Date().toISOString(),
        project: "tykbasic",
        user_type: "frontend_user"
      },
      allowance: parseInt(allowance) || 1000,
      rate: parseInt(rate) || 1000,
      per: parseInt(per) || 60
    };

    // Only add access_rights if we have actual access rights to grant
    // Empty access_rights object causes Tyk 500 errors
    if (access_rights && Object.keys(access_rights).length > 0) {
      keyData.access_rights = access_rights;
    }

    // Add quota settings if provided
    if (quota_max && quota_max > 0) {
      keyData.quota_max = parseInt(quota_max);
      keyData.quota_renewal_rate = parseInt(quota_renewal_rate) || 3600;
    }

    // Add expiration if provided
    if (expires) {
      keyData.expires = parseInt(expires);
    }

    console.log(`🌐 [${requestId}] Tyk key creation request:`, {
      alias: keyData.alias,
      org_id: keyData.org_id,
      allowance: keyData.allowance,
      rate: keyData.rate,
      per: keyData.per,
      hasQuota: !!keyData.quota_max,
      hasExpiration: !!keyData.expires,
      metaDataKeys: Object.keys(keyData.meta_data)
    });

    const response = await tykGatewayService.createKey(keyData);

    console.log(`✅ [${requestId}] Key created successfully:`, {
      keyHash: response.key_hash || response.key?.substring(0, 8) + '...' || 'unknown',
      action: response.action,
      status: response.status
    });

    // Store minimal reference in database (just for audit/tracking)
    try {
      await UserCredentials.create({
        user_id: req.user.id,
        organization_id: req.user.organization_id,
        credential_type: 'api_key',
        name: name.trim(),
        description: description?.trim() || null,
        tyk_key_id: response.key,           // The actual key value (shown once)
        tyk_key_hash: response.key_hash,    // The hash for subsequent operations
        api_key_data: {
          alias: keyData.alias,
          org_id: keyData.org_id,
          created_via: 'frontend'
        }
      });

      console.log(`💾 [${requestId}] Database record created for key`);
    } catch (dbError) {
      console.warn(`⚠️  [${requestId}] Database storage failed (non-critical):`, dbError.message);
      // Don't fail the request if database storage fails
    }

          // Create audit log
      await AuditLog.create({
        user_id: req.user.id,
        organization_id: req.user.organization_id,
        action: 'CREATE',
        resource_type: 'api_key',
        resource_id: response.key_hash || response.key,
        details: {
          key_name: name,
          key_hash: response.key_hash || response.key,
        rate_limit: { rate, per, allowance },
        has_quota: !!quota_max,
        has_expiration: !!expires
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      status: 'success'
    });

    res.status(201).json({
      success: true,
      message: 'API key created successfully',
      data: {
        key: response.key,                           // ⚠️  The actual key - shown only once!
        key_hash: response.key_hash || response.key, // The hash for subsequent operations
        action: response.action,
        name: name,
        description: description || '',
        alias: keyData.alias,
        meta_data: keyData.meta_data,
        security_notice: 'This key will only be displayed once. Save it securely.'
      }
    });

  } catch (error) {
    console.error(`❌ [${requestId}] Key creation failed:`, {
      error: error.message,
      stack: error.stack,
      userId: req.user.id
    });

    // Create audit log for failure
    try {
      await AuditLog.create({
        user_id: req.user.id,
        organization_id: req.user.organization_id,
        action: 'CREATE',
        resource_type: 'api_key',
        resource_id: null,
        details: {
          error: error.message,
          attempted_key_name: name
        },
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        status: 'failed'
      });
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError);
    }

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
    
    const key = await tykGatewayService.getKey(keyId, hashed === 'true');
    
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
    
    const updatedKey = await tykGatewayService.updateKey(keyId, req.body, hashed === 'true');
    
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
    
    const result = await tykGatewayService.deleteKey(keyId, hashed === 'true');
    
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
    
    const certificates = await tykGatewayService.getCertificates('default');
    
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

router.post('/certificates', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    console.log(`📋 [${requestId}] Uploading certificate for user: ${req.user.email}`);
    
    const { certificate, name, description } = req.body;
    
    if (!certificate) {
      return res.status(400).json({
        success: false,
        message: 'Certificate PEM data is required'
      });
    }

    // Validate certificate format (basic check)
    if (!certificate.includes('-----BEGIN CERTIFICATE-----')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid certificate format. Must be PEM encoded.'
      });
    }
    
    const result = await tykGatewayService.uploadCertificate(certificate, 'default');
    
    await logTykOperation(req, 'upload_certificate', 'certificate', result.id || result.key, {
      requestId: requestId,
      certificateName: name || 'unnamed',
      description: description || ''
    });

    res.status(201).json({
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

router.get('/certificates/:certId', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const { certId } = req.params;
  
  try {
    console.log(`📋 [${requestId}] Fetching certificate ${certId} for user: ${req.user.email}`);
    
    const certificate = await tykGatewayService.getCertificate(certId, 'default');
    
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

router.delete('/certificates/:certId', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const { certId } = req.params;
  
  try {
    console.log(`🗑️ [${requestId}] Deleting certificate ${certId} for user: ${req.user.email}`);
    
    const result = await tykGatewayService.deleteCertificate(certId, 'default');
    
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

// Gateway Operations
router.post('/gateway/reload', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    console.log(`🔄 [${requestId}] Reloading gateway for user: ${req.user.email}`);
    
    const result = await tykGatewayService.reloadGateway();
    
    await logTykOperation(req, 'gateway_reload', 'gateway', 'main', {
      requestId: requestId
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
      requestId: requestId
    }, error);

    res.status(error.status || 500).json({
      success: false,
      message: 'Failed to reload gateway',
      error: error.message
    });
  }
});

module.exports = router; 