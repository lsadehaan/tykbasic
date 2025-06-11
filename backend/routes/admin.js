const express = require('express');
const rateLimit = require('express-rate-limit');
const { User, Organization, EmailWhitelist, PendingUser, AuditLog, SystemConfig, UserCredentials, ApiDefinition, ApiAccessGrant, sequelize } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { Op } = require('sequelize');

const router = express.Router();

// Rate limiting for admin endpoints
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many admin requests, please try again later.',
  trustProxy: false
});

// Apply authentication and admin role requirement to all routes
router.use(authenticateToken);
router.use(requireRole(['super_admin', 'admin']));
router.use(adminLimiter);

// Health check for admin routes
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'admin',
    user: req.user.email,
    role: req.user.role,
    timestamp: new Date().toISOString()
  });
});

// === USER MANAGEMENT ===

// Get all users with pagination and filtering
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, role, organization, search } = req.query;
    const offset = (page - 1) * limit;
    
    const whereClause = {};
    
    if (status) whereClause.is_active = status === 'active';
    if (role) whereClause.role = role;
    if (organization) whereClause.organization_id = organization;
    if (search) {
      whereClause[Op.or] = [
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: users } = await User.findAndCountAll({
      where: whereClause,
      include: [{ model: Organization, as: 'organization' }],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    res.json({
      users: users.map(user => ({
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: user.getFullName(),
        role: user.role,
        isActive: user.is_active,
        isVerified: user.is_verified,
        twoFactorEnabled: user.two_factor_enabled,
        lastLogin: user.last_login,
        failedLoginAttempts: user.failed_login_attempts,
        accountLockedUntil: user.account_locked_until,
        organization: user.organization ? {
          id: user.organization.id,
          name: user.organization.name,
          displayName: user.organization.display_name
        } : null,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      error: 'Failed to get users',
      message: 'An error occurred while retrieving users.'
    });
  }
});

// Get specific user by ID
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      include: [{ model: Organization, as: 'organization' }]
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist.'
      });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: user.getFullName(),
        role: user.role,
        isActive: user.is_active,
        isVerified: user.is_verified,
        twoFactorEnabled: user.two_factor_enabled,
        lastLogin: user.last_login,
        lastPasswordChange: user.last_password_change,
        failedLoginAttempts: user.failed_login_attempts,
        accountLockedUntil: user.account_locked_until,
        preferences: user.preferences,
        organization: user.organization ? {
          id: user.organization.id,
          name: user.organization.name,
          displayName: user.organization.display_name
        } : null,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Failed to get user',
      message: 'An error occurred while retrieving user information.'
    });
  }
});

// Update user
router.put('/users/:id', async (req, res) => {
  try {
    const { 
      firstName, 
      lastName, 
      role, 
      isActive, 
      organizationId,
      resetFailedAttempts,
      forcePasswordReset
    } = req.body;

    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist.'
      });
    }

    // Prevent non-super-admin from modifying super-admin users
    if (user.role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: 'Cannot modify super admin users.'
      });
    }

    // Update fields
    if (firstName !== undefined) user.first_name = firstName;
    if (lastName !== undefined) user.last_name = lastName;
    if (role !== undefined && req.user.role === 'super_admin') user.role = role;
    if (isActive !== undefined) user.is_active = isActive;
    if (organizationId !== undefined) user.organization_id = organizationId;

    // Reset failed login attempts if requested
    if (resetFailedAttempts) {
      user.failed_login_attempts = 0;
      user.account_locked_until = null;
    }

    // Force password reset on next login
    if (forcePasswordReset) {
      user.last_password_change = new Date('1970-01-01'); // Force password change
    }

    await user.save();

    // Log admin action
    await AuditLog.create({
      action: 'user_updated',
      resource_type: 'user',
      resource_id: user.id,
      user_id: req.user.id,
      organization_id: req.user.organization_id,
      details: { 
        updatedBy: req.user.email,
        changes: req.body,
        targetUser: user.email
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json({
      message: 'User updated successfully',
      user: user.toSafeObject()
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      error: 'Failed to update user',
      message: 'An error occurred while updating the user.'
    });
  }
});

// Delete user
router.delete('/users/:id', requireRole(['super_admin']), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist.'
      });
    }

    // Prevent deleting super admin users
    if (user.role === 'super_admin') {
      return res.status(403).json({
        error: 'Cannot delete super admin',
        message: 'Super admin users cannot be deleted.'
      });
    }

    // Prevent users from deleting themselves
    if (user.id === req.user.id) {
      return res.status(403).json({
        error: 'Cannot delete yourself',
        message: 'You cannot delete your own account.'
      });
    }

    await user.destroy();

    // Log admin action
    await AuditLog.create({
      action: 'user_deleted',
      resource_type: 'user',
      resource_id: user.id,
      user_id: req.user.id,
      organization_id: req.user.organization_id,
      details: { 
        deletedBy: req.user.email,
        deletedUser: user.email,
        deletedUserRole: user.role
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json({
      message: 'User deleted successfully',
      deletedUser: {
        id: user.id,
        email: user.email,
        fullName: user.getFullName()
      }
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      error: 'Failed to delete user',
      message: 'An error occurred while deleting the user.'
    });
  }
});

// === PENDING USER MANAGEMENT ===

// Get all pending users
router.get('/pending-users', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows: pendingUsers } = await PendingUser.findAndCountAll({
      include: [{ model: Organization, as: 'organization' }],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    res.json({
      pendingUsers: pendingUsers.map(user => ({
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: `${user.first_name} ${user.last_name}`,
        organization: user.organization ? {
          id: user.organization.id,
          name: user.organization.name,
          displayName: user.organization.display_name
        } : null,
        additionalInfo: user.additional_info,
        createdAt: user.created_at
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get pending users error:', error);
    res.status(500).json({
      error: 'Failed to get pending users',
      message: 'An error occurred while retrieving pending users.'
    });
  }
});

// Approve pending user
router.post('/pending-users/:id/approve', async (req, res) => {
  try {
    const { role = 'user', organizationId } = req.body;
    
    const pendingUser = await PendingUser.findByPk(req.params.id, {
      include: [{ model: Organization, as: 'organization' }]
    });

    if (!pendingUser) {
      return res.status(404).json({
        error: 'Pending user not found',
        message: 'The specified pending user does not exist.'
      });
    }

    // Determine which organization to assign the user to
    let targetOrganizationId = pendingUser.organization_id; // Default to their original organization
    let targetOrganization = pendingUser.organization;

    if (organizationId) {
      // Admin has selected a specific organization
      targetOrganization = await Organization.findByPk(organizationId);
      if (!targetOrganization) {
        return res.status(400).json({
          error: 'Invalid organization',
          message: 'The specified organization does not exist.'
        });
      }
      targetOrganizationId = organizationId;
    }

    // Create actual user account
    // Note: We need to bypass the password hashing hook since pendingUser.password_hash is already hashed
    const newUser = await User.create({
      email: pendingUser.email,
      password: pendingUser.password_hash,
      first_name: pendingUser.first_name,
      last_name: pendingUser.last_name,
      role: role,
      organization_id: targetOrganizationId,
      is_active: true,
      is_verified: true // Auto-verify approved users
    }, {
      hooks: false // Bypass beforeCreate hook to prevent double-hashing the password
    });

    // Update organization user count
    if (targetOrganization) {
      await targetOrganization.updateUserCount();
    }

    // Remove from pending users
    await pendingUser.destroy();

    // Send welcome email
    try {
      const emailService = require('../services/emailService');
      const welcomeResult = await emailService.sendWelcomeEmail(
        newUser.email,
        newUser.first_name
      );

      if (welcomeResult.success) {
        console.log(`✅ Welcome email sent to ${newUser.email}`);
        
        // Log successful welcome email
        await AuditLog.create({
          action: 'welcome_email_sent',
          resource_type: 'user',
          resource_id: newUser.id,
          user_id: req.user.id,
          organization_id: req.user.organization_id,
          details: { 
            email: newUser.email,
            messageId: welcomeResult.messageId,
            sentBy: req.user.email
          },
          ip_address: req.ip,
          user_agent: req.get('User-Agent')
        });
      } else {
        console.error(`❌ Failed to send welcome email to ${newUser.email}:`, welcomeResult.error);
        
        // Log failed welcome email (but don't fail the approval)
        await AuditLog.create({
          action: 'welcome_email_failed',
          resource_type: 'user',
          resource_id: newUser.id,
          user_id: req.user.id,
          organization_id: req.user.organization_id,
          details: { 
            email: newUser.email,
            error: welcomeResult.error,
            sentBy: req.user.email
          },
          ip_address: req.ip,
          user_agent: req.get('User-Agent')
        });
      }
    } catch (emailError) {
      console.error('Email service error during user approval:', emailError);
      
      // Log email service error (but don't fail the approval)
      await AuditLog.create({
        action: 'welcome_email_error',
        resource_type: 'user',
        resource_id: newUser.id,
        user_id: req.user.id,
        organization_id: req.user.organization_id,
        details: { 
          email: newUser.email,
          error: emailError.message,
          sentBy: req.user.email
        },
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });
    }

    // Log admin action
    await AuditLog.create({
      action: 'user_approved',
      resource_type: 'user',
      resource_id: newUser.id,
      user_id: req.user.id,
      organization_id: req.user.organization_id,
      details: { 
        approvedBy: req.user.email,
        approvedUser: newUser.email,
        assignedRole: role,
        organization: pendingUser.organization?.name
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json({
      message: 'User approved successfully',
      user: newUser.toSafeObject()
    });

  } catch (error) {
    console.error('Approve user error:', error);
    res.status(500).json({
      error: 'Failed to approve user',
      message: 'An error occurred while approving the user.'
    });
  }
});

// Reject pending user
router.post('/pending-users/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    
    const pendingUser = await PendingUser.findByPk(req.params.id);

    if (!pendingUser) {
      return res.status(404).json({
        error: 'Pending user not found',
        message: 'The specified pending user does not exist.'
      });
    }

    // Log rejection before deletion
    await AuditLog.create({
      action: 'user_rejected',
      resource_type: 'pending_user',
      resource_id: pendingUser.id,
      user_id: req.user.id,
      organization_id: req.user.organization_id,
      details: { 
        rejectedBy: req.user.email,
        rejectedUser: pendingUser.email,
        reason: reason || 'No reason provided'
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    await pendingUser.destroy();

    res.json({
      message: 'User registration rejected',
      rejectedUser: {
        email: pendingUser.email,
        fullName: `${pendingUser.first_name} ${pendingUser.last_name}`,
        reason: reason || 'No reason provided'
      }
    });

  } catch (error) {
    console.error('Reject user error:', error);
    res.status(500).json({
      error: 'Failed to reject user',
      message: 'An error occurred while rejecting the user.'
    });
  }
});

// === EMAIL WHITELIST MANAGEMENT ===

// Get email whitelist patterns
router.get('/email-whitelist', async (req, res) => {
  try {
    const patterns = await EmailWhitelist.findAll({
      order: [['created_at', 'DESC']]
    });

    res.json({
      patterns: patterns.map(p => ({
        id: p.id,
        pattern: p.pattern,
        description: p.description,
        isActive: p.is_active,
        createdAt: p.created_at,
        updatedAt: p.updated_at
      }))
    });

  } catch (error) {
    console.error('Get email whitelist error:', error);
    res.status(500).json({
      error: 'Failed to get email whitelist',
      message: 'An error occurred while retrieving email whitelist patterns.'
    });
  }
});

// Add email whitelist pattern
router.post('/email-whitelist', async (req, res) => {
  try {
    const { pattern, description } = req.body;

    if (!pattern) {
      return res.status(400).json({
        error: 'Missing pattern',
        message: 'Email pattern is required.'
      });
    }

    const newPattern = await EmailWhitelist.create({
      pattern,
      description,
      is_active: true
    });

    // Log admin action
    await AuditLog.create({
      action: 'email_whitelist_added',
      resource_type: 'email_whitelist',
      resource_id: newPattern.id,
      user_id: req.user.id,
      organization_id: req.user.organization_id,
      details: { 
        addedBy: req.user.email,
        pattern: pattern,
        description: description
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.status(201).json({
      message: 'Email whitelist pattern added successfully',
      pattern: {
        id: newPattern.id,
        pattern: newPattern.pattern,
        description: newPattern.description,
        isActive: newPattern.is_active,
        createdAt: newPattern.created_at
      }
    });

  } catch (error) {
    console.error('Add email whitelist error:', error);
    res.status(500).json({
      error: 'Failed to add email whitelist pattern',
      message: 'An error occurred while adding the email whitelist pattern.'
    });
  }
});

// Update email whitelist pattern
router.put('/email-whitelist/:id', async (req, res) => {
  try {
    const { pattern, description, isActive } = req.body;
    
    const whitelistPattern = await EmailWhitelist.findByPk(req.params.id);

    if (!whitelistPattern) {
      return res.status(404).json({
        error: 'Pattern not found',
        message: 'The specified email whitelist pattern does not exist.'
      });
    }

    if (pattern !== undefined) whitelistPattern.pattern = pattern;
    if (description !== undefined) whitelistPattern.description = description;
    if (isActive !== undefined) whitelistPattern.is_active = isActive;

    await whitelistPattern.save();

    // Log admin action
    await AuditLog.create({
      action: 'email_whitelist_updated',
      resource_type: 'email_whitelist',
      resource_id: whitelistPattern.id,
      user_id: req.user.id,
      organization_id: req.user.organization_id,
      details: { 
        updatedBy: req.user.email,
        changes: req.body,
        pattern: whitelistPattern.pattern
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json({
      message: 'Email whitelist pattern updated successfully',
      pattern: {
        id: whitelistPattern.id,
        pattern: whitelistPattern.pattern,
        description: whitelistPattern.description,
        isActive: whitelistPattern.is_active,
        updatedAt: whitelistPattern.updated_at
      }
    });

  } catch (error) {
    console.error('Update email whitelist error:', error);
    res.status(500).json({
      error: 'Failed to update email whitelist pattern',
      message: 'An error occurred while updating the email whitelist pattern.'
    });
  }
});

// Delete email whitelist pattern
router.delete('/email-whitelist/:id', async (req, res) => {
  try {
    const whitelistPattern = await EmailWhitelist.findByPk(req.params.id);

    if (!whitelistPattern) {
      return res.status(404).json({
        error: 'Pattern not found',
        message: 'The specified email whitelist pattern does not exist.'
      });
    }

    await whitelistPattern.destroy();

    // Log admin action
    await AuditLog.create({
      action: 'email_whitelist_deleted',
      resource_type: 'email_whitelist',
      resource_id: whitelistPattern.id,
      user_id: req.user.id,
      organization_id: req.user.organization_id,
      details: { 
        deletedBy: req.user.email,
        deletedPattern: whitelistPattern.pattern
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json({
      message: 'Email whitelist pattern deleted successfully',
      deletedPattern: {
        id: whitelistPattern.id,
        pattern: whitelistPattern.pattern
      }
    });

  } catch (error) {
    console.error('Delete email whitelist error:', error);
    res.status(500).json({
      error: 'Failed to delete email whitelist pattern',
      message: 'An error occurred while deleting the email whitelist pattern.'
    });
  }
});

// === AUDIT LOGS ===

// Get audit logs with filtering
router.get('/audit-logs', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      action, 
      resource_type, 
      user_id, 
      start_date, 
      end_date 
    } = req.query;
    
    const offset = (page - 1) * limit;
    const whereClause = {};
    
    if (action) whereClause.action = action;
    if (resource_type) whereClause.resource_type = resource_type;
    if (user_id) whereClause.user_id = user_id;
    if (start_date || end_date) {
      whereClause.created_at = {};
      if (start_date) whereClause.created_at[Op.gte] = new Date(start_date);
      if (end_date) whereClause.created_at[Op.lte] = new Date(end_date);
    }

    const { count, rows: logs } = await AuditLog.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    res.json({
      auditLogs: logs.map(log => ({
        id: log.id,
        action: log.action,
        resourceType: log.resource_type,
        resourceId: log.resource_id,
        userId: log.user_id,
        organizationId: log.organization_id,
        details: log.details,
        ipAddress: log.ip_address,
        userAgent: log.user_agent,
        status: log.status,
        errorMessage: log.error_message,
        createdAt: log.created_at
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({
      error: 'Failed to get audit logs',
      message: 'An error occurred while retrieving audit logs.'
    });
  }
});

// === SYSTEM STATISTICS ===

// Get system statistics dashboard
router.get('/statistics', async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      pendingUsers,
      totalOrganizations,
      recentLogins,
      failedLogins
    ] = await Promise.all([
      User.count(),
      User.count({ where: { is_active: true } }),
      PendingUser.count(),
      Organization.count(),
      AuditLog.count({ 
        where: { 
          action: 'login_success',
          created_at: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      }),
      AuditLog.count({ 
        where: { 
          action: 'login_failed',
          created_at: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      })
    ]);

    // Get user role distribution
    const roleDistribution = await User.findAll({
      attributes: [
        'role',
        [sequelize.fn('COUNT', sequelize.col('role')), 'count']
      ],
      group: ['role'],
      raw: true
    });

    res.json({
      statistics: {
        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: totalUsers - activeUsers,
          pending: pendingUsers
        },
        organizations: {
          total: totalOrganizations
        },
        activity: {
          recentLogins: recentLogins,
          failedLogins: failedLogins
        },
        roleDistribution: roleDistribution.reduce((acc, row) => {
          acc[row.role] = parseInt(row.count);
          return acc;
        }, {})
      },
      generatedAt: new Date().toISOString(),
      generatedBy: req.user.email
    });

  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({
      error: 'Failed to get statistics',
      message: 'An error occurred while retrieving system statistics.'
    });
  }
});

// === ORGANIZATION MANAGEMENT ===

// Get all organizations with pagination and filtering
router.get('/organizations', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const offset = (page - 1) * limit;
    
    const whereClause = {};
    
    if (status) whereClause.is_active = status === 'active';
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { display_name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: organizations } = await Organization.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      include: [{
        model: User,
        as: 'users',
        attributes: ['id'],
        required: false
      }]
    });

    const enrichedOrganizations = await Promise.all(
      organizations.map(async (org) => {
        const userCount = await org.countUsers();
        return {
          id: org.id,
          name: org.name,
          displayName: org.display_name,
          description: org.description,
          domain: org.domain,
          autoAssignDomains: org.auto_assign_domains || [],
          isActive: org.is_active,
          settings: org.settings,
          defaultRateLimits: org.default_rate_limits,
          tykOrgId: org.tyk_org_id,
          contactEmail: org.contact_email,
          contactPhone: org.contact_phone,
          address: org.address,
          userCount: userCount,
          apiCount: org.api_count,
          createdAt: org.created_at,
          updatedAt: org.updated_at
        };
      })
    );

    res.json({
      organizations: enrichedOrganizations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get organizations error:', error);
    res.status(500).json({
      error: 'Failed to get organizations',
      message: 'An error occurred while retrieving organizations.'
    });
  }
});

// Get specific organization by ID
router.get('/organizations/:id', async (req, res) => {
  try {
    const organization = await Organization.findByPk(req.params.id, {
      include: [{
        model: User,
        as: 'users',
        attributes: ['id', 'email', 'first_name', 'last_name', 'role', 'is_active', 'created_at']
      }]
    });

    if (!organization) {
      return res.status(404).json({
        error: 'Organization not found',
        message: 'The specified organization does not exist.'
      });
    }

    res.json({
      organization: {
        id: organization.id,
        name: organization.name,
        displayName: organization.display_name,
        description: organization.description,
        domain: organization.domain,
        autoAssignDomains: organization.auto_assign_domains || [],
        isActive: organization.is_active,
        settings: organization.settings,
        defaultRateLimits: organization.default_rate_limits,
        tykOrgId: organization.tyk_org_id,
        tykOrgKey: organization.tyk_org_key,
        contactEmail: organization.contact_email,
        contactPhone: organization.contact_phone,
        address: organization.address,
        userCount: organization.user_count,
        apiCount: organization.api_count,
        users: organization.users?.map(user => ({
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          fullName: `${user.first_name} ${user.last_name}`,
          role: user.role,
          isActive: user.is_active,
          createdAt: user.created_at
        })) || [],
        createdAt: organization.created_at,
        updatedAt: organization.updated_at
      }
    });

  } catch (error) {
    console.error('Get organization error:', error);
    res.status(500).json({
      error: 'Failed to get organization',
      message: 'An error occurred while retrieving organization information.'
    });
  }
});

// Create new organization
router.post('/organizations', async (req, res) => {
  try {
    const {
      name,
      displayName,
      description,
      domain,
      autoAssignDomains = [],
      contactEmail,
      contactPhone,
      address = {},
      settings = {},
      defaultRateLimits = {}
    } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        error: 'Missing organization name',
        message: 'Organization name is required.'
      });
    }

    // Check if organization with this name already exists
    const existingOrg = await Organization.findOne({ where: { name } });
    if (existingOrg) {
      return res.status(409).json({
        error: 'Organization already exists',
        message: 'An organization with this name already exists.'
      });
    }

    // Validate auto-assign domains format
    if (autoAssignDomains && !Array.isArray(autoAssignDomains)) {
      return res.status(400).json({
        error: 'Invalid auto-assign domains',
        message: 'Auto-assign domains must be an array.'
      });
    }

    // Validate each domain format
    for (const domain of autoAssignDomains) {
      if (typeof domain !== 'string' || domain.trim().length === 0) {
        return res.status(400).json({
          error: 'Invalid domain format',
          message: 'Each domain must be a non-empty string.'
        });
      }
    }

    // Check for domain conflicts with existing organizations
    if (autoAssignDomains.length > 0) {
      const existingOrgs = await Organization.findAll({
        where: { is_active: true }
      });

      for (const existingOrg of existingOrgs) {
        const existingDomains = existingOrg.auto_assign_domains || [];
        for (const newDomain of autoAssignDomains) {
          for (const existingDomain of existingDomains) {
            if (newDomain.toLowerCase() === existingDomain.toLowerCase()) {
              return res.status(409).json({
                error: 'Domain conflict',
                message: `Domain "${newDomain}" is already assigned to organization "${existingOrg.name}".`
              });
            }
          }
        }
      }
    }

    // Generate Tyk-compatible organization ID
    const tykOrgId = name.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Date.now();
    
    // Prepare rate limits with defaults
    const orgRateLimits = {
      allowance: 10000,
      rate: 1000,
      per: 60,
      quota_max: 100000,
      quota_renewal_rate: 3600,
      ...defaultRateLimits
    };

    // Create organization in Tyk Gateway first
    let tykOrgKey = null;
    try {
      const tykGatewayService = require('../services/TykGatewayService');
      
      // Create organization key in Tyk (this represents the organization in Tyk)
      const tykOrgData = {
        org_id: tykOrgId,
        allowance: orgRateLimits.allowance,
        rate: orgRateLimits.rate,
        per: orgRateLimits.per,
        quota_max: orgRateLimits.quota_max,
        quota_renewal_rate: orgRateLimits.quota_renewal_rate,
        is_inactive: false,
        tags: [`org:${name}`, 'managed_by_tykbasic']
      };

      console.log(`🏢 Creating Tyk organization for: ${name}`, {
        tykOrgId,
        rateLimits: orgRateLimits
      });

      // Create organization key in Tyk using org keys endpoint
      const tykResponse = await tykGatewayService.makeRequest('PUT', `/tyk/org/keys/${tykOrgId}`, tykOrgData);
      
      if (tykResponse.success) {
        tykOrgKey = tykResponse.data.key || tykOrgId;
        console.log(`✅ Successfully created Tyk organization: ${tykOrgId}`);
      } else {
        throw new Error(`Tyk organization creation failed: ${tykResponse.error}`);
      }

    } catch (tykError) {
      console.error('❌ Failed to create organization in Tyk Gateway:', tykError);
      return res.status(500).json({
        error: 'Tyk Gateway integration failed',
        message: 'Failed to create organization in Tyk Gateway. Please ensure Tyk Gateway is running and properly configured.',
        details: tykError.message
      });
    }

    // Create organization in local database
    const organization = await Organization.create({
      name,
      display_name: displayName || name,
      description,
      domain: domain && domain.trim() !== '' ? domain : null,
      auto_assign_domains: autoAssignDomains,
      contact_email: contactEmail && contactEmail.trim() !== '' ? contactEmail : null,
      contact_phone: contactPhone,
      address,
      tyk_org_id: tykOrgId,
      tyk_org_key: tykOrgKey,
      settings: {
        require_admin_approval: true,
        require_email_verification: true,
        require_2fa: false,
        default_user_role: 'user',
        session_timeout: 24,
        password_policy: {
          min_length: 8,
          require_uppercase: true,
          require_lowercase: true,
          require_numbers: true,
          require_symbols: false
        },
        ...settings
      },
      default_rate_limits: orgRateLimits
    });

    // Log admin action
    await AuditLog.create({
      action: 'organization_created',
      resource_type: 'organization',
      resource_id: organization.id,
      user_id: req.user.id,
      organization_id: req.user.organization_id,
      details: {
        organizationName: organization.name,
        tykOrgId: organization.tyk_org_id,
        createdBy: req.user.email,
        autoAssignDomains: autoAssignDomains,
        tykIntegration: 'success'
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    console.log(`🎉 Organization created successfully:`, {
      name: organization.name,
      id: organization.id,
      tykOrgId: organization.tyk_org_id,
      tykOrgKey: !!organization.tyk_org_key
    });

    res.status(201).json({
      message: 'Organization created successfully with Tyk Gateway integration',
      organization: {
        id: organization.id,
        name: organization.name,
        displayName: organization.display_name,
        description: organization.description,
        domain: organization.domain,
        autoAssignDomains: organization.auto_assign_domains,
        tykOrgId: organization.tyk_org_id,
        isActive: organization.is_active,
        contactEmail: organization.contact_email,
        contactPhone: organization.contact_phone,
        address: organization.address,
        createdAt: organization.created_at
      }
    });

  } catch (error) {
    console.error('Create organization error:', error);
    res.status(500).json({
      error: 'Failed to create organization',
      message: 'An error occurred while creating the organization.'
    });
  }
});

// Update organization
router.put('/organizations/:id', async (req, res) => {
  try {
    const {
      displayName,
      description,
      domain,
      autoAssignDomains,
      isActive,
      contactEmail,
      contactPhone,
      address,
      settings,
      defaultRateLimits
    } = req.body;

    const organization = await Organization.findByPk(req.params.id);

    if (!organization) {
      return res.status(404).json({
        error: 'Organization not found',
        message: 'The specified organization does not exist.'
      });
    }

    // Prevent disabling the default organization
    if (organization.name === 'default' && isActive === false) {
      return res.status(403).json({
        error: 'Cannot disable default organization',
        message: 'The default organization cannot be disabled.'
      });
    }

    // Check for domain conflicts if auto_assign_domains is being updated
    if (autoAssignDomains && Array.isArray(autoAssignDomains)) {
      const existingOrgs = await Organization.findAll({
        where: { 
          is_active: true,
          id: { [Op.ne]: organization.id }
        }
      });

      for (const existingOrg of existingOrgs) {
        const existingDomains = existingOrg.auto_assign_domains || [];
        for (const newDomain of autoAssignDomains) {
          for (const existingDomain of existingDomains) {
            if (newDomain.toLowerCase() === existingDomain.toLowerCase()) {
              return res.status(409).json({
                error: 'Domain conflict',
                message: `Domain "${newDomain}" is already assigned to organization "${existingOrg.name}".`
              });
            }
          }
        }
      }
    }

    // Update fields
    if (displayName !== undefined) organization.display_name = displayName;
    if (description !== undefined) organization.description = description;
    if (domain !== undefined) organization.domain = domain;
    if (autoAssignDomains !== undefined) organization.auto_assign_domains = autoAssignDomains;
    if (isActive !== undefined) organization.is_active = isActive;
    if (contactEmail !== undefined) organization.contact_email = contactEmail;
    if (contactPhone !== undefined) organization.contact_phone = contactPhone;
    if (address !== undefined) organization.address = address;
    
    if (settings !== undefined) {
      organization.settings = { ...organization.settings, ...settings };
      organization.changed('settings', true);
    }
    
    if (defaultRateLimits !== undefined) {
      organization.default_rate_limits = { ...organization.default_rate_limits, ...defaultRateLimits };
      organization.changed('default_rate_limits', true);
    }

    await organization.save();

    // Log admin action
    await AuditLog.create({
      action: 'organization_updated',
      resource_type: 'organization',
      resource_id: organization.id,
      user_id: req.user.id,
      organization_id: req.user.organization_id,
      details: {
        organizationName: organization.name,
        updatedBy: req.user.email,
        changes: req.body
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json({
      message: 'Organization updated successfully',
      organization: {
        id: organization.id,
        name: organization.name,
        displayName: organization.display_name,
        description: organization.description,
        domain: organization.domain,
        autoAssignDomains: organization.auto_assign_domains,
        isActive: organization.is_active,
        contactEmail: organization.contact_email,
        contactPhone: organization.contact_phone,
        address: organization.address,
        updatedAt: organization.updated_at
      }
    });

  } catch (error) {
    console.error('Update organization error:', error);
    res.status(500).json({
      error: 'Failed to update organization',
      message: 'An error occurred while updating the organization.'
    });
  }
});

// Delete organization
router.delete('/organizations/:id', requireRole(['super_admin']), async (req, res) => {
  try {
    const organization = await Organization.findByPk(req.params.id);

    if (!organization) {
      return res.status(404).json({
        error: 'Organization not found',
        message: 'The specified organization does not exist.'
      });
    }

    // Prevent deleting the default organization
    if (organization.name === 'default') {
      return res.status(403).json({
        error: 'Cannot delete default organization',
        message: 'The default organization cannot be deleted.'
      });
    }

    // Check for foreign key dependencies before deletion
    const dependencies = [];
    
    // Check users
    const userCount = await organization.countUsers();
    if (userCount > 0) {
      dependencies.push({
        table: 'users',
        count: userCount,
        description: 'Active users in this organization'
      });
    }

    // Check API definitions
    const apiCount = await ApiDefinition.count({
      where: { organization_id: organization.id }
    });
    if (apiCount > 0) {
      dependencies.push({
        table: 'api_definitions',
        count: apiCount,
        description: 'API definitions owned by this organization'
      });
    }

    // Check API access grants
    const accessGrantCount = await ApiAccessGrant.count({
      where: { organization_id: organization.id }
    });
    if (accessGrantCount > 0) {
      dependencies.push({
        table: 'api_access_grants',
        count: accessGrantCount,
        description: 'API access grants for this organization'
      });
    }

    // Check user credentials
    const credentialCount = await UserCredentials.count({
      where: { organization_id: organization.id }
    });
    if (credentialCount > 0) {
      dependencies.push({
        table: 'user_credentials',
        count: credentialCount,
        description: 'User credentials (keys, certificates) for this organization'
      });
    }

    // Check pending users
    const pendingUserCount = await PendingUser.count({
      where: { organization_id: organization.id }
    });
    if (pendingUserCount > 0) {
      dependencies.push({
        table: 'pending_users',
        count: pendingUserCount,
        description: 'Pending user registrations for this organization'
      });
    }

    // If there are dependencies, return detailed error
    if (dependencies.length > 0) {
      return res.status(409).json({
        error: 'Cannot delete organization',
        message: 'Organization has related data that prevents deletion',
        dependencies: dependencies,
        suggestion: 'You may need to reassign users, remove API definitions, or clean up related data before deleting this organization. Consider if you really need to delete this organization or if deactivating it would be sufficient.'
      });
    }

    // Safe to delete - no foreign key constraints
    await organization.destroy();

    // Log admin action
    await AuditLog.create({
      action: 'organization_deleted',
      resource_type: 'organization',
      resource_id: organization.id,
      user_id: req.user.id,
      organization_id: req.user.organization_id,
      details: {
        organizationName: organization.name,
        deletedBy: req.user.email
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json({
      message: 'Organization deleted successfully',
      deletedOrganization: {
        id: organization.id,
        name: organization.name,
        displayName: organization.display_name
      }
    });

  } catch (error) {
    console.error('Delete organization error:', error);
    res.status(500).json({
      error: 'Failed to delete organization',
      message: 'An error occurred while deleting the organization.'
    });
  }
});

// Add user to organization
router.post('/organizations/:id/users', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'Missing user ID',
        message: 'User ID is required.'
      });
    }

    const organization = await Organization.findByPk(req.params.id);
    if (!organization) {
      return res.status(404).json({
        error: 'Organization not found',
        message: 'The specified organization does not exist.'
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist.'
      });
    }

    // Update user's organization
    const previousOrgId = user.organization_id;
    user.organization_id = organization.id;
    await user.save();

    // Update user counts
    await organization.updateUserCount();
    if (previousOrgId) {
      const previousOrg = await Organization.findByPk(previousOrgId);
      if (previousOrg) {
        await previousOrg.updateUserCount();
      }
    }

    // Log admin action
    await AuditLog.create({
      action: 'user_organization_changed',
      resource_type: 'user',
      resource_id: user.id,
      user_id: req.user.id,
      organization_id: req.user.organization_id,
      details: {
        userEmail: user.email,
        newOrganization: organization.name,
        previousOrganizationId: previousOrgId,
        changedBy: req.user.email
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json({
      message: 'User added to organization successfully',
      user: {
        id: user.id,
        email: user.email,
        fullName: `${user.first_name} ${user.last_name}`,
        organization: {
          id: organization.id,
          name: organization.name,
          displayName: organization.display_name
        }
      }
    });

  } catch (error) {
    console.error('Add user to organization error:', error);
    res.status(500).json({
      error: 'Failed to add user to organization',
      message: 'An error occurred while adding the user to the organization.'
    });
  }
});

// Remove user from organization (move to default)
router.delete('/organizations/:id/users/:userId', async (req, res) => {
  try {
    const organization = await Organization.findByPk(req.params.id);
    if (!organization) {
      return res.status(404).json({
        error: 'Organization not found',
        message: 'The specified organization does not exist.'
      });
    }

    const user = await User.findByPk(req.params.userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist.'
      });
    }

    if (user.organization_id !== organization.id) {
      return res.status(400).json({
        error: 'User not in organization',
        message: 'The user is not a member of this organization.'
      });
    }

    // Find default organization
    const defaultOrg = await Organization.findOne({ where: { name: 'default' } });
    if (!defaultOrg) {
      return res.status(500).json({
        error: 'Default organization not found',
        message: 'Could not find default organization to move user to.'
      });
    }

    // Move user to default organization
    user.organization_id = defaultOrg.id;
    await user.save();

    // Update user counts
    await organization.updateUserCount();
    await defaultOrg.updateUserCount();

    // Log admin action
    await AuditLog.create({
      action: 'user_removed_from_organization',
      resource_type: 'user',
      resource_id: user.id,
      user_id: req.user.id,
      organization_id: req.user.organization_id,
      details: {
        userEmail: user.email,
        removedFromOrganization: organization.name,
        movedToOrganization: defaultOrg.name,
        removedBy: req.user.email
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json({
      message: 'User removed from organization successfully',
      user: {
        id: user.id,
        email: user.email,
        fullName: `${user.first_name} ${user.last_name}`,
        organization: {
          id: defaultOrg.id,
          name: defaultOrg.name,
          displayName: defaultOrg.display_name
        }
      }
    });

  } catch (error) {
    console.error('Remove user from organization error:', error);
    res.status(500).json({
      error: 'Failed to remove user from organization',
      message: 'An error occurred while removing the user from the organization.'
    });
  }
});

// === EMAIL CONFIGURATION ===

// Get email configuration
router.get('/email-config', async (req, res) => {
  try {
    const config = await SystemConfig.findOne({ 
      where: { key: 'email_config' } 
    });

    if (config) {
      // Don't send password/sensitive data to frontend
      const safeConfig = { ...config.value };
      if (safeConfig.password) {
        safeConfig.password = '***'; // Mask password
      }
      res.json({ config: safeConfig });
    } else {
      res.json({ config: null });
    }

  } catch (error) {
    console.error('Get email config error:', error);
    res.status(500).json({
      error: 'Failed to get email configuration',
      message: 'An error occurred while retrieving email configuration.'
    });
  }
});

// Save email configuration
router.post('/email-config', async (req, res) => {
  try {
    const emailConfig = req.body;

    // Validate required fields
    if (emailConfig.enabled) {
      if (!emailConfig.fromEmail) {
        return res.status(400).json({
          error: 'Missing from email',
          message: 'From email is required when email is enabled.'
        });
      }

      if (emailConfig.service === 'gmail' || emailConfig.service === 'smtp') {
        if (!emailConfig.username || !emailConfig.password) {
          return res.status(400).json({
            error: 'Missing credentials',
            message: 'Username and password are required.'
          });
        }
      }
    }

    // Save or update configuration
    await SystemConfig.upsert({
      key: 'email_config',
      value: emailConfig,
      updated_by: req.user.id
    });

    // Log admin action
    await AuditLog.create({
      action: 'email_config_updated',
      resource_type: 'system_config',
      resource_id: 'email_config',
      user_id: req.user.id,
      organization_id: req.user.organization_id,
      details: { 
        service: emailConfig.service,
        enabled: emailConfig.enabled,
        fromEmail: emailConfig.fromEmail,
        updatedBy: req.user.email
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json({
      message: 'Email configuration saved successfully',
      config: {
        ...emailConfig,
        password: emailConfig.password ? '***' : ''
      }
    });

  } catch (error) {
    console.error('Save email config error:', error);
    res.status(500).json({
      error: 'Failed to save email configuration',
      message: 'An error occurred while saving email configuration.'
    });
  }
});

// Test email configuration
router.post('/email-config/test', async (req, res) => {
  try {
    const { testEmail, ...emailConfig } = req.body;

    if (!testEmail) {
      return res.status(400).json({
        error: 'Missing test email',
        message: 'Test email address is required.'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(testEmail)) {
      return res.status(400).json({
        error: 'Invalid email format',
        message: 'Please provide a valid email address.'
      });
    }
    
    if (!emailConfig.enabled) {
      return res.status(400).json({
        error: 'Email disabled',
        message: 'Email sending is not enabled.'
      });
    }

    // First save the current config if it's different
    const currentConfig = await SystemConfig.findOne({ 
      where: { key: 'email_config' } 
    });

    if (!currentConfig || JSON.stringify(currentConfig.value) !== JSON.stringify(emailConfig)) {
      await SystemConfig.upsert({
        key: 'email_config',
        value: emailConfig,
        updated_by: req.user.id
      });
    }

    // Use the email service to send test email
    const emailService = require('../services/emailService');
    const result = await emailService.sendTestEmail(testEmail, 
      `Test email sent by ${req.user.email} from TykBasic admin panel.`
    );

    // Log test email attempt
    await AuditLog.create({
      action: 'email_test_sent',
      resource_type: 'system_config',
      resource_id: 'email_config',
      user_id: req.user.id,
      organization_id: req.user.organization_id,
      details: { 
        service: emailConfig.service,
        testEmail: testEmail,
        sentBy: req.user.email,
        success: result.success,
        error: result.error,
        messageId: result.messageId
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    if (result.success) {
      res.json({
        message: 'Test email sent successfully! Check your inbox.',
        testEmail: testEmail,
        messageId: result.messageId,
        service: emailConfig.service
      });
    } else {
      res.status(500).json({
        error: 'Failed to send test email',
        message: result.error || 'Unknown error occurred while sending email.',
        testEmail: testEmail
      });
    }

  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({
      error: 'Failed to test email configuration',
      message: 'An error occurred while testing email configuration.'
    });
  }
});

module.exports = router; 