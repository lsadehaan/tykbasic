const express = require('express');
const router = express.Router();
const policyService = require('../services/PolicyService');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logTykOperation } = require('../utils/auditLogger');

// Helper function to get Tyk organization context from request
const getTykOrgContext = (req) => {
  if (!req.user || !req.user.organization) {
    throw new Error('User does not have valid organization context');
  }
  
  return {
    orgId: req.user.organization.tyk_org_id,
    orgKey: req.user.organization.tyk_org_key,
    orgContext: req.user.organization
  };
};

// Get available policies for current organization (for end users)
router.get('/available', authenticateToken, async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    console.log(`📋 [${requestId}] Fetching available policies for user: ${req.user.email}`);
    
    // Use database organization ID for policy queries (same as /created route)
    const organizationId = req.user.organization_id;
    const policies = await policyService.getAvailablePolicies(organizationId);
    
    await logTykOperation(req, 'list_available_policies', 'policy', null, {
      requestId: requestId,
      policyCount: policies.length,
      org_filter: organizationId
    });

    res.json({
      success: true,
      data: policies,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to fetch available policies:`, error);
    
    await logTykOperation(req, 'list_available_policies', 'policy', null, {
      requestId: requestId,
      error: error.message,
      success: false
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch available policies',
      timestamp: new Date().toISOString()
    });
  }
});

// Get policies created by current organization (for admins)
router.get('/created', authenticateToken, requireRole(['admin', 'super_admin']), async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    console.log(`📋 [${requestId}] Fetching created policies for admin: ${req.user.email}`);
    
    // Use database organization ID for policy queries
    const organizationId = req.user.organization_id;
    const policies = await policyService.getCreatedPolicies(organizationId);
    
    await logTykOperation(req, 'list_created_policies', 'policy', null, {
      requestId: requestId,
      policyCount: policies.length,
      org_filter: organizationId
    });

    res.json({
      success: true,
      data: policies,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to fetch created policies:`, error);
    
    await logTykOperation(req, 'list_created_policies', 'policy', null, {
      requestId: requestId,
      error: error.message,
      success: false
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch created policies',
      timestamp: new Date().toISOString()
    });
  }
});

// Get single policy details
router.get('/:policyId', authenticateToken, async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const { policyId } = req.params;
  
  try {
    console.log(`🔍 [${requestId}] Fetching policy ${policyId} for user: ${req.user.email}`);
    
    const policy = await policyService.getPolicyWithDetails(policyId);
    
    if (!policy) {
      return res.status(404).json({
        success: false,
        error: 'Policy not found',
        timestamp: new Date().toISOString()
      });
    }

    // Check if user has access to this policy
    const organizationId = req.user.organization_id;
    const hasAccess = policy.owner_organization_id === organizationId || 
                     await policyService.validatePolicyAccess(policyId, organizationId);
    
    if (!hasAccess && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this policy',
        timestamp: new Date().toISOString()
      });
    }
    
    await logTykOperation(req, 'get_policy', 'policy', policyId, {
      requestId: requestId
    });

    res.json({
      success: true,
      data: policy,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to fetch policy ${policyId}:`, error);
    
    await logTykOperation(req, 'get_policy', 'policy', policyId, {
      requestId: requestId,
      error: error.message,
      success: false
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch policy',
      timestamp: new Date().toISOString()
    });
  }
});

// Create new policy (admin only)
router.post('/', authenticateToken, requireRole(['admin', 'super_admin']), async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    console.log(`🆕 [${requestId}] Creating policy for admin: ${req.user.email}`);
    
    const {
      name,
      description,
      rate_limit,
      rate_per,
      quota_max,
      quota_renewal_rate,
      api_accesses,
      target_organization_id,
      available_to_organizations,
      tags
    } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Policy name is required',
        timestamp: new Date().toISOString()
      });
    }

    // Check if user's organization allows policy creation
    const { orgContext } = getTykOrgContext(req);
    if (!orgContext.allow_admin_policy_creation && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Policy creation is disabled for this organization',
        timestamp: new Date().toISOString()
      });
    }

    // Super admin can create policies for other organizations
    if (target_organization_id && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Only super admins can create cross-organization policies',
        timestamp: new Date().toISOString()
      });
    }

    const policyData = {
      name: name.trim(),
      description: description?.trim() || '',
      rate_limit: parseInt(rate_limit) || 1000,
      rate_per: parseInt(rate_per) || 60,
      quota_max: parseInt(quota_max) || -1,
      quota_renewal_rate: parseInt(quota_renewal_rate) || 3600,
      api_accesses: api_accesses || [],
      target_organization_id: target_organization_id || null,
      available_to_organizations: available_to_organizations || [],
      tags: tags || []
    };

    const policy = await policyService.createPolicy(policyData, req.user.id);
    
    await logTykOperation(req, 'create_policy', 'policy', policy.id, {
      requestId: requestId,
      policyName: policy.name,
      apiCount: policyData.api_accesses.length,
      targetOrgId: target_organization_id
    });

    res.status(201).json({
      success: true,
      data: policy,
      message: 'Policy created successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to create policy:`, error);
    
    await logTykOperation(req, 'create_policy', 'policy', null, {
      requestId: requestId,
      error: error.message,
      success: false
    });

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create policy',
      timestamp: new Date().toISOString()
    });
  }
});

// Update policy (admin only)
router.put('/:policyId', authenticateToken, requireRole(['admin', 'super_admin']), async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const { policyId } = req.params;
  
  try {
    console.log(`✏️ [${requestId}] Updating policy ${policyId} by admin: ${req.user.email}`);
    
    // Check if policy exists and user has permission
    const existingPolicy = await policyService.getPolicyWithDetails(policyId);
    if (!existingPolicy) {
      return res.status(404).json({
        success: false,
        error: 'Policy not found',
        timestamp: new Date().toISOString()
      });
    }

    const { orgId } = getTykOrgContext(req);
    if (existingPolicy.owner_organization_id !== orgId && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied to modify this policy',
        timestamp: new Date().toISOString()
      });
    }

    const updates = {
      name: req.body.name?.trim(),
      description: req.body.description?.trim(),
      rate_limit: req.body.rate_limit ? parseInt(req.body.rate_limit) : undefined,
      rate_per: req.body.rate_per ? parseInt(req.body.rate_per) : undefined,
      quota_max: req.body.quota_max !== undefined ? parseInt(req.body.quota_max) : undefined,
      quota_renewal_rate: req.body.quota_renewal_rate ? parseInt(req.body.quota_renewal_rate) : undefined,
      tags: req.body.tags,
      is_active: req.body.is_active
    };

    // Remove undefined values
    Object.keys(updates).forEach(key => updates[key] === undefined && delete updates[key]);

    const updatedPolicy = await policyService.updatePolicy(policyId, updates, req.user.id);
    
    await logTykOperation(req, 'update_policy', 'policy', policyId, {
      requestId: requestId,
      updatedFields: Object.keys(updates)
    });

    res.json({
      success: true,
      data: updatedPolicy,
      message: 'Policy updated successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to update policy ${policyId}:`, error);
    
    await logTykOperation(req, 'update_policy', 'policy', policyId, {
      requestId: requestId,
      error: error.message,
      success: false
    });

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update policy',
      timestamp: new Date().toISOString()
    });
  }
});

// Delete policy (admin only)
router.delete('/:policyId', authenticateToken, requireRole(['admin', 'super_admin']), async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const { policyId } = req.params;
  
  try {
    console.log(`🗑️ [${requestId}] Deleting policy ${policyId} by admin: ${req.user.email}`);
    
    // Check if policy exists and user has permission
    const existingPolicy = await policyService.getPolicyWithDetails(policyId);
    if (!existingPolicy) {
      return res.status(404).json({
        success: false,
        error: 'Policy not found',
        timestamp: new Date().toISOString()
      });
    }

    const { orgId } = getTykOrgContext(req);
    if (existingPolicy.owner_organization_id !== orgId && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied to delete this policy',
        timestamp: new Date().toISOString()
      });
    }

    const result = await policyService.deletePolicy(policyId, req.user.id);
    
    await logTykOperation(req, 'delete_policy', 'policy', policyId, {
      requestId: requestId,
      policyName: existingPolicy.name
    });

    res.json({
      success: true,
      message: result.message,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to delete policy ${policyId}:`, error);
    
    await logTykOperation(req, 'delete_policy', 'policy', policyId, {
      requestId: requestId,
      error: error.message,
      success: false
    });

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete policy',
      timestamp: new Date().toISOString()
    });
  }
});

// Assign policy to organization (super admin only)
router.post('/:policyId/assign/:organizationId', authenticateToken, requireRole(['super_admin']), async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const { policyId, organizationId } = req.params;
  
  try {
    console.log(`🔗 [${requestId}] Assigning policy ${policyId} to org ${organizationId} by super admin: ${req.user.email}`);
    
    const assignment = await policyService.assignPolicyToOrganization(
      parseInt(policyId),
      parseInt(organizationId),
      req.user.id
    );
    
    await logTykOperation(req, 'assign_policy', 'policy', policyId, {
      requestId: requestId,
      targetOrgId: organizationId
    });

    res.json({
      success: true,
      data: assignment,
      message: 'Policy assigned to organization successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to assign policy ${policyId} to org ${organizationId}:`, error);
    
    await logTykOperation(req, 'assign_policy', 'policy', policyId, {
      requestId: requestId,
      targetOrgId: organizationId,
      error: error.message,
      success: false
    });

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to assign policy to organization',
      timestamp: new Date().toISOString()
    });
  }
});

// Remove policy from organization (super admin only)
router.delete('/:policyId/assign/:organizationId', authenticateToken, requireRole(['super_admin']), async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const { policyId, organizationId } = req.params;
  
  try {
    console.log(`🔗❌ [${requestId}] Removing policy ${policyId} from org ${organizationId} by super admin: ${req.user.email}`);
    
    await policyService.removePolicyFromOrganization(
      parseInt(policyId),
      parseInt(organizationId)
    );
    
    await logTykOperation(req, 'remove_policy_assignment', 'policy', policyId, {
      requestId: requestId,
      targetOrgId: organizationId
    });

    res.json({
      success: true,
      message: 'Policy removed from organization successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`💥 [${requestId}] Failed to remove policy ${policyId} from org ${organizationId}:`, error);
    
    await logTykOperation(req, 'remove_policy_assignment', 'policy', policyId, {
      requestId: requestId,
      targetOrgId: organizationId,
      error: error.message,
      success: false
    });

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to remove policy from organization',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router; 