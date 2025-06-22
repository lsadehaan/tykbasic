const express = require('express');
const router = express.Router();
const organizationService = require('../services/OrganizationService');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logTykOperation } = require('../utils/auditLogger');

/**
 * @route GET /api/organizations
 * @desc Get all organizations (super admin only)
 * @access Private (requires super admin role)
 * @returns {Array} List of organizations
 */
router.get('/', [authenticateToken, requireRole('super_admin')], async (req, res) => {
  try {
    const organizations = await organizationService.getAllOrganizations();
    res.json(organizations);
  } catch (error) {
    console.error('Failed to get organizations:', error);
    res.status(500).json({ error: 'Failed to get organizations' });
  }
});

/**
 * @route POST /api/organizations
 * @desc Create a new organization
 * @access Private (requires super admin role)
 * @param {Object} req.body - Organization data including name, tyk_org_id, tyk_org_key
 * @returns {Object} Created organization data
 */
router.post('/', [authenticateToken, requireRole('super_admin')], async (req, res) => {
  try {
    const organization = await organizationService.createOrganization(req.body);
    await logTykOperation(req.user.id, 'create_organization', {
      organization_id: organization.id,
      organization_name: organization.name
    });
    res.status(201).json(organization);
  } catch (error) {
    console.error('Failed to create organization:', error);
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

/**
 * @route GET /api/organizations/:id
 * @desc Get a specific organization by ID
 * @access Private (requires super admin role)
 * @param {string} req.params.id - Organization ID
 * @returns {Object} Organization data
 */
router.get('/:id', [authenticateToken, requireRole('super_admin')], async (req, res) => {
  try {
    const organization = await organizationService.getOrganizationById(req.params.id);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    res.json(organization);
  } catch (error) {
    console.error('Failed to get organization:', error);
    res.status(500).json({ error: 'Failed to get organization' });
  }
});

/**
 * @route PUT /api/organizations/:id
 * @desc Update an organization
 * @access Private (requires super admin role)
 * @param {string} req.params.id - Organization ID
 * @param {Object} req.body - Updated organization data
 * @returns {Object} Updated organization data
 */
router.put('/:id', [authenticateToken, requireRole('super_admin')], async (req, res) => {
  try {
    const organization = await organizationService.updateOrganization(req.params.id, req.body);
    await logTykOperation(req.user.id, 'update_organization', {
      organization_id: organization.id,
      organization_name: organization.name
    });
    res.json(organization);
  } catch (error) {
    console.error('Failed to update organization:', error);
    res.status(500).json({ error: 'Failed to update organization' });
  }
});

/**
 * @route DELETE /api/organizations/:id
 * @desc Delete an organization
 * @access Private (requires super admin role)
 * @param {string} req.params.id - Organization ID
 * @returns {Object} Deletion result
 */
router.delete('/:id', [authenticateToken, requireRole('super_admin')], async (req, res) => {
  try {
    const result = await organizationService.deleteOrganization(req.params.id);
    await logTykOperation(req.user.id, 'delete_organization', {
      organization_id: req.params.id
    });
    res.json(result);
  } catch (error) {
    console.error('Failed to delete organization:', error);
    res.status(500).json({ error: 'Failed to delete organization' });
  }
});

/**
 * @route GET /api/organizations/:id/users
 * @desc Get all users in an organization
 * @access Private (requires super admin role)
 * @param {string} req.params.id - Organization ID
 * @returns {Array} List of users in the organization
 */
router.get('/:id/users', [authenticateToken, requireRole('super_admin')], async (req, res) => {
  try {
    const users = await organizationService.getOrganizationUsers(req.params.id);
    res.json(users);
  } catch (error) {
    console.error('Failed to get organization users:', error);
    res.status(500).json({ error: 'Failed to get organization users' });
  }
});

/**
 * @route POST /api/organizations/:id/users
 * @desc Add a user to an organization
 * @access Private (requires super admin role)
 * @param {string} req.params.id - Organization ID
 * @param {Object} req.body - User data including email, role
 * @returns {Object} Added user data
 */
router.post('/:id/users', [authenticateToken, requireRole('super_admin')], async (req, res) => {
  try {
    const user = await organizationService.addUserToOrganization(req.params.id, req.body);
    await logTykOperation(req.user.id, 'add_user_to_organization', {
      organization_id: req.params.id,
      user_id: user.id,
      user_email: user.email
    });
    res.status(201).json(user);
  } catch (error) {
    console.error('Failed to add user to organization:', error);
    res.status(500).json({ error: 'Failed to add user to organization' });
  }
});

/**
 * @route DELETE /api/organizations/:id/users/:userId
 * @desc Remove a user from an organization
 * @access Private (requires super admin role)
 * @param {string} req.params.id - Organization ID
 * @param {string} req.params.userId - User ID
 * @returns {Object} Removal result
 */
router.delete('/:id/users/:userId', [authenticateToken, requireRole('super_admin')], async (req, res) => {
  try {
    const result = await organizationService.removeUserFromOrganization(req.params.id, req.params.userId);
    await logTykOperation(req.user.id, 'remove_user_from_organization', {
      organization_id: req.params.id,
      user_id: req.params.userId
    });
    res.json(result);
  } catch (error) {
    console.error('Failed to remove user from organization:', error);
    res.status(500).json({ error: 'Failed to remove user from organization' });
  }
});

module.exports = router; 