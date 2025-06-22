const express = require('express');
const router = express.Router();
const userService = require('../services/UserService');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logTykOperation } = require('../utils/auditLogger');

/**
 * @route GET /api/users
 * @desc Get all users (super admin only)
 * @access Private (requires super admin role)
 * @returns {Array} List of users
 */
router.get('/', [authenticateToken, requireRole('super_admin')], async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    res.json(users);
  } catch (error) {
    console.error('Failed to get users:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

/**
 * @route POST /api/users
 * @desc Create a new user
 * @access Private (requires super admin role)
 * @param {Object} req.body - User data including email, password, role, organization_id
 * @returns {Object} Created user data
 */
router.post('/', [authenticateToken, requireRole('super_admin')], async (req, res) => {
  try {
    const user = await userService.createUser(req.body);
    await logTykOperation(req.user.id, 'create_user', {
      user_id: user.id,
      user_email: user.email,
      role: user.role
    });
    res.status(201).json(user);
  } catch (error) {
    console.error('Failed to create user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

/**
 * @route GET /api/users/:id
 * @desc Get a specific user by ID
 * @access Private (requires super admin role)
 * @param {string} req.params.id - User ID
 * @returns {Object} User data
 */
router.get('/:id', [authenticateToken, requireRole('super_admin')], async (req, res) => {
  try {
    const user = await userService.getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Failed to get user:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

/**
 * @route PUT /api/users/:id
 * @desc Update a user
 * @access Private (requires super admin role)
 * @param {string} req.params.id - User ID
 * @param {Object} req.body - Updated user data
 * @returns {Object} Updated user data
 */
router.put('/:id', [authenticateToken, requireRole('super_admin')], async (req, res) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body);
    await logTykOperation(req.user.id, 'update_user', {
      user_id: user.id,
      user_email: user.email,
      updated_fields: Object.keys(req.body)
    });
    res.json(user);
  } catch (error) {
    console.error('Failed to update user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * @route DELETE /api/users/:id
 * @desc Delete a user
 * @access Private (requires super admin role)
 * @param {string} req.params.id - User ID
 * @returns {Object} Deletion result
 */
router.delete('/:id', [authenticateToken, requireRole('super_admin')], async (req, res) => {
  try {
    const result = await userService.deleteUser(req.params.id);
    await logTykOperation(req.user.id, 'delete_user', {
      user_id: req.params.id
    });
    res.json(result);
  } catch (error) {
    console.error('Failed to delete user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

/**
 * @route POST /api/users/:id/reset-password
 * @desc Reset a user's password
 * @access Private (requires super admin role)
 * @param {string} req.params.id - User ID
 * @param {Object} req.body - New password data
 * @returns {Object} Password reset result
 */
router.post('/:id/reset-password', [authenticateToken, requireRole('super_admin')], async (req, res) => {
  try {
    const result = await userService.resetUserPassword(req.params.id, req.body.password);
    await logTykOperation(req.user.id, 'reset_user_password', {
      user_id: req.params.id
    });
    res.json(result);
  } catch (error) {
    console.error('Failed to reset user password:', error);
    res.status(500).json({ error: 'Failed to reset user password' });
  }
});

/**
 * @route GET /api/users/:id/organizations
 * @desc Get all organizations a user belongs to
 * @access Private (requires super admin role)
 * @param {string} req.params.id - User ID
 * @returns {Array} List of organizations
 */
router.get('/:id/organizations', [authenticateToken, requireRole('super_admin')], async (req, res) => {
  try {
    const organizations = await userService.getUserOrganizations(req.params.id);
    res.json(organizations);
  } catch (error) {
    console.error('Failed to get user organizations:', error);
    res.status(500).json({ error: 'Failed to get user organizations' });
  }
});

module.exports = router; 