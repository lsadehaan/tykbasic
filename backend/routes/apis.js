const express = require('express');
const router = express.Router();
const apiService = require('../services/ApiService');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logTykOperation } = require('../utils/auditLogger');

/**
 * @route GET /api/apis
 * @desc Get all APIs available to the user's organization
 * @access Private (requires authentication)
 * @returns {Array} List of APIs
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const apis = await apiService.getApisForOrganization(req.user.organization_id);
    res.json(apis);
  } catch (error) {
    console.error('Failed to get APIs:', error);
    res.status(500).json({ error: 'Failed to get APIs' });
  }
});

/**
 * @route POST /api/apis
 * @desc Create a new API
 * @access Private (requires admin role)
 * @param {Object} req.body - API configuration data including name, target_url, etc.
 * @returns {Object} Created API data
 */
router.post('/', [authenticateToken, requireRole('admin')], async (req, res) => {
  try {
    const api = await apiService.createApi(req.body, req.user.id);
    await logTykOperation(req.user.id, 'create_api', {
      api_id: api.id,
      api_name: api.name
    });
    res.status(201).json(api);
  } catch (error) {
    console.error('Failed to create API:', error);
    res.status(500).json({ error: 'Failed to create API' });
  }
});

/**
 * @route GET /api/apis/:id
 * @desc Get a specific API by ID
 * @access Private (requires authentication)
 * @param {string} req.params.id - API ID
 * @returns {Object} API data
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const api = await apiService.getApiById(req.params.id);
    if (!api) {
      return res.status(404).json({ error: 'API not found' });
    }
    res.json(api);
  } catch (error) {
    console.error('Failed to get API:', error);
    res.status(500).json({ error: 'Failed to get API' });
  }
});

/**
 * @route PUT /api/apis/:id
 * @desc Update an API
 * @access Private (requires admin role)
 * @param {string} req.params.id - API ID
 * @param {Object} req.body - Updated API data
 * @returns {Object} Updated API data
 */
router.put('/:id', [authenticateToken, requireRole('admin')], async (req, res) => {
  try {
    const api = await apiService.updateApi(req.params.id, req.body, req.user.id);
    await logTykOperation(req.user.id, 'update_api', {
      api_id: api.id,
      api_name: api.name
    });
    res.json(api);
  } catch (error) {
    console.error('Failed to update API:', error);
    res.status(500).json({ error: 'Failed to update API' });
  }
});

/**
 * @route DELETE /api/apis/:id
 * @desc Delete an API
 * @access Private (requires admin role)
 * @param {string} req.params.id - API ID
 * @returns {Object} Deletion result
 */
router.delete('/:id', [authenticateToken, requireRole('admin')], async (req, res) => {
  try {
    const result = await apiService.deleteApi(req.params.id, req.user.id);
    await logTykOperation(req.user.id, 'delete_api', {
      api_id: req.params.id
    });
    res.json(result);
  } catch (error) {
    console.error('Failed to delete API:', error);
    res.status(500).json({ error: 'Failed to delete API' });
  }
});

/**
 * @route POST /api/apis/:id/keys
 * @desc Create a new API key
 * @access Private (requires admin role)
 * @param {string} req.params.id - API ID
 * @param {Object} req.body - Key configuration data
 * @returns {Object} Created API key data
 */
router.post('/:id/keys', [authenticateToken, requireRole('admin')], async (req, res) => {
  try {
    const key = await apiService.createApiKey(req.params.id, req.body, req.user.id);
    await logTykOperation(req.user.id, 'create_api_key', {
      api_id: req.params.id,
      key_id: key.id
    });
    res.status(201).json(key);
  } catch (error) {
    console.error('Failed to create API key:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

/**
 * @route GET /api/apis/:id/keys
 * @desc Get all keys for an API
 * @access Private (requires admin role)
 * @param {string} req.params.id - API ID
 * @returns {Array} List of API keys
 */
router.get('/:id/keys', [authenticateToken, requireRole('admin')], async (req, res) => {
  try {
    const keys = await apiService.getApiKeys(req.params.id);
    res.json(keys);
  } catch (error) {
    console.error('Failed to get API keys:', error);
    res.status(500).json({ error: 'Failed to get API keys' });
  }
});

/**
 * @route DELETE /api/apis/:id/keys/:keyId
 * @desc Delete an API key
 * @access Private (requires admin role)
 * @param {string} req.params.id - API ID
 * @param {string} req.params.keyId - Key ID
 * @returns {Object} Deletion result
 */
router.delete('/:id/keys/:keyId', [authenticateToken, requireRole('admin')], async (req, res) => {
  try {
    const result = await apiService.deleteApiKey(req.params.id, req.params.keyId, req.user.id);
    await logTykOperation(req.user.id, 'delete_api_key', {
      api_id: req.params.id,
      key_id: req.params.keyId
    });
    res.json(result);
  } catch (error) {
    console.error('Failed to delete API key:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

/**
 * @route POST /api/apis/:id/policies
 * @desc Apply a policy to an API
 * @access Private (requires admin role)
 * @param {string} req.params.id - API ID
 * @param {Object} req.body - Policy configuration data
 * @returns {Object} Policy application result
 */
router.post('/:id/policies', [authenticateToken, requireRole('admin')], async (req, res) => {
  try {
    const result = await apiService.applyPolicyToApi(req.params.id, req.body.policyId, req.user.id);
    await logTykOperation(req.user.id, 'apply_policy_to_api', {
      api_id: req.params.id,
      policy_id: req.body.policyId
    });
    res.json(result);
  } catch (error) {
    console.error('Failed to apply policy to API:', error);
    res.status(500).json({ error: 'Failed to apply policy to API' });
  }
});

/**
 * @route DELETE /api/apis/:id/policies/:policyId
 * @desc Remove a policy from an API
 * @access Private (requires admin role)
 * @param {string} req.params.id - API ID
 * @param {string} req.params.policyId - Policy ID
 * @returns {Object} Policy removal result
 */
router.delete('/:id/policies/:policyId', [authenticateToken, requireRole('admin')], async (req, res) => {
  try {
    const result = await apiService.removePolicyFromApi(req.params.id, req.params.policyId, req.user.id);
    await logTykOperation(req.user.id, 'remove_policy_from_api', {
      api_id: req.params.id,
      policy_id: req.params.policyId
    });
    res.json(result);
  } catch (error) {
    console.error('Failed to remove policy from API:', error);
    res.status(500).json({ error: 'Failed to remove policy from API' });
  }
});

module.exports = router; 