const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const { User, Organization, EmailWhitelist, PendingUser, AuditLog } = require('../models');
const { Op } = require('sequelize');

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs (increased for testing)
  message: 'Too many authentication attempts, please try again later.',
  trustProxy: false
});

// JWT secret from environment
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Helper function to generate JWT
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role,
      organization_id: user.organization_id 
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// Helper function to check email whitelist
const checkEmailWhitelist = async (email) => {
  const whitelistEntries = await EmailWhitelist.findAll();
  
  if (whitelistEntries.length === 0) {
    return true; // If no whitelist entries, allow all emails
  }
  
  return whitelistEntries.some(entry => {
    const pattern = entry.pattern.replace(/\*/g, '.*');
    const regex = new RegExp(`^${pattern}$`, 'i');
    return regex.test(email);
  });
};

// Helper function to validate password strength
const validatePasswordStrength = (password) => {
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
  };

  const feedback = [];
  let score = 0;

  if (!checks.length) feedback.push('Must be at least 8 characters long');
  else score += 1;

  if (!checks.uppercase) feedback.push('Must contain at least one uppercase letter');
  else score += 1;

  if (!checks.lowercase) feedback.push('Must contain at least one lowercase letter');
  else score += 1;

  if (!checks.number) feedback.push('Must contain at least one number');
  else score += 1;

  if (!checks.special) feedback.push('Must contain at least one special character');
  else score += 1;

  const isValid = score >= 4; // Must meet first 4 basic requirements

  return {
    score,
    feedback,
    isValid,
    strength: score < 2 ? 'Very Weak' : 
              score < 4 ? 'Weak' : 
              score < 5 ? 'Good' : 
              score < 6 ? 'Strong' : 'Very Strong'
  };
};

// Health check for auth routes
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'auth',
    timestamp: new Date().toISOString()
  });
});

// Register endpoint
router.post('/register', authLimiter, async (req, res) => {
  const startTime = Date.now();
  const clientIP = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent');
  const requestId = Math.random().toString(36).substring(7);
  
  console.log(`📝 [${requestId}] Registration attempt started:`, {
    ip: clientIP,
    userAgent: userAgent,
    timestamp: new Date().toISOString(),
    hasEmail: !!req.body.email,
    hasPassword: !!req.body.password,
    hasFirstName: !!req.body.firstName,
    hasLastName: !!req.body.lastName
  });

  try {
    const { email, password, firstName, lastName, organizationName } = req.body;

    // Validation
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Email, password, first name, and last name are required.'
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format',
        message: 'Please provide a valid email address.'
      });
    }

    // Enhanced password strength validation
    const passwordValidation = validatePasswordStrength(password);
    console.log(`🔐 [${requestId}] Password validation result:`, {
      password: password.substring(0, 3) + '***', // Don't log full password
      score: passwordValidation.score,
      isValid: passwordValidation.isValid,
      feedback: passwordValidation.feedback
    });
    
    if (!passwordValidation.isValid) {
      console.log(`❌ [${requestId}] Password rejected:`, passwordValidation.feedback);
      return res.status(400).json({
        error: 'Weak password',
        message: 'Password does not meet security requirements.',
        details: passwordValidation.feedback
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existingUser) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'An account with this email address already exists.'
      });
    }

    // Check email whitelist
    const isWhitelisted = await checkEmailWhitelist(email);
    if (!isWhitelisted) {
      return res.status(403).json({
        error: 'Email not whitelisted',
        message: 'Registration is restricted. Your email domain is not in the allowed list.'
      });
    }

    // Find organization by email domain or use specified/default organization
    let organization;
    
    // First, try to find organization by email domain (auto-assignment)
    const autoAssignOrg = await Organization.findByEmailDomain(email);
    
    if (autoAssignOrg) {
      organization = autoAssignOrg;
      console.log(`🎯 Auto-assigning user ${email} to organization ${organization.name} based on domain`);
    } else if (organizationName) {
      // Use specified organization name
      organization = await Organization.findOne({ 
        where: { name: organizationName } 
      });
      if (!organization) {
        organization = await Organization.create({
          name: organizationName,
          display_name: organizationName,
          description: `Organization for ${organizationName}`,
          is_active: true
        });
      }
    } else {
      // Fall back to default organization
      organization = await Organization.findOne({ 
        where: { name: 'default' } 
      });
      if (!organization) {
        organization = await Organization.create({
          name: 'default',
          display_name: 'Default Organization',
          description: 'Default organization for TykBasic users',
          is_active: true
        });
      }
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create pending user (requires admin approval)
    const pendingUser = await PendingUser.create({
      email: email.toLowerCase(),
      password_hash: hashedPassword,
      first_name: firstName,
      last_name: lastName,
      organization_id: organization.id,
      registration_token: uuidv4(), // Ensure token is generated
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      additional_info: {
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        timestamp: new Date().toISOString()
      }
    });

    // Log registration attempt
    await AuditLog.create({
      action: 'user_registration_pending',
      resource_type: 'pending_user',
      resource_id: pendingUser.id,
      details: {
        email: email.toLowerCase(),
        organization: organization.name,
        requiresApproval: true
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.status(201).json({
      message: 'Registration successful! Your account is pending approval.',
      details: {
        email: email.toLowerCase(),
        organization: organization.display_name,
        status: 'pending_approval'
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: 'An error occurred during registration. Please try again.'
    });
  }
});

// Login endpoint
router.post('/login', authLimiter, async (req, res) => {
  const startTime = Date.now();
  const clientIP = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent');
  const requestId = Math.random().toString(36).substring(7);
  
  console.log(`🔐 [${requestId}] Login attempt started:`, {
    ip: clientIP,
    userAgent: userAgent,
    timestamp: new Date().toISOString(),
    hasEmail: !!req.body.email,
    hasPassword: !!req.body.password
  });

  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      console.log(`❌ [${requestId}] Validation failed: Missing credentials`, {
        hasEmail: !!email,
        hasPassword: !!password,
        ip: clientIP
      });
      
      return res.status(400).json({
        error: 'Missing credentials',
        message: 'Email and password are required.'
      });
    }

    const normalizedEmail = email.toLowerCase();
    console.log(`🔍 [${requestId}] Looking up user: ${normalizedEmail}`);

    // Find user
    const user = await User.findOne({ 
      where: { email: normalizedEmail },
      include: [{ model: Organization, as: 'organization' }]
    });

    if (!user) {
      console.log(`❌ [${requestId}] User not found: ${normalizedEmail}`, {
        ip: clientIP,
        searchedEmail: normalizedEmail,
        duration: `${Date.now() - startTime}ms`
      });
      
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Invalid email or password.'
      });
    }

    console.log(`✅ [${requestId}] User found:`, {
      userId: user.id,
      email: user.email,
      role: user.role,
      isActive: user.is_active,
      isVerified: user.is_verified,
      failedAttempts: user.failed_login_attempts,
      lastLogin: user.last_login,
      orgId: user.organization_id,
      orgName: user.organization?.name || 'none'
    });

    // Check if user is active
    if (!user.is_active) {
      console.log(`⚠️ [${requestId}] Inactive account login attempt:`, {
        userId: user.id,
        email: user.email,
        isActive: user.is_active,
        ip: clientIP
      });
      
      return res.status(403).json({
        error: 'Account inactive',
        message: `Your account is inactive. Please contact an administrator.`
      });
    }

    // Check if account is locked
    if (user.isAccountLocked()) {
      console.log(`🔒 [${requestId}] Locked account login attempt:`, {
        userId: user.id,
        email: user.email,
        lockedUntil: user.account_locked_until,
        failedAttempts: user.failed_login_attempts,
        ip: clientIP
      });
      
      // Log failed login attempt due to lock
      await AuditLog.create({
        action: 'login_failed',
        resource_type: 'user',
        resource_id: user.id,
        details: { 
          reason: 'account_locked',
          requestId: requestId,
          lockedUntil: user.account_locked_until,
          failedAttempts: user.failed_login_attempts
        },
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });

      const lockoutMinutes = Math.ceil((user.account_locked_until - new Date()) / (1000 * 60));
      return res.status(423).json({
        error: 'Account locked',
        message: `Account is temporarily locked due to too many failed login attempts. Try again in ${lockoutMinutes} minutes.`
      });
    }

    console.log(`🔑 [${requestId}] Validating password for user: ${user.email}`);
    
    // Check password
    const passwordCheckStart = Date.now();
    const isPasswordValid = await user.validatePassword(password);
    const passwordCheckDuration = Date.now() - passwordCheckStart;
    
    console.log(`🔐 [${requestId}] Password validation result:`, {
      userId: user.id,
      email: user.email,
      isValid: isPasswordValid,
      duration: `${passwordCheckDuration}ms`,
      ip: clientIP
    });
    
    if (!isPasswordValid) {
      console.log(`❌ [${requestId}] Invalid password for user: ${user.email}`, {
        userId: user.id,
        currentFailedAttempts: user.failed_login_attempts,
        ip: clientIP
      });
      
      // Increment failed login attempts
      await user.incrementFailedLoginAttempts();

      // Log failed login attempt
      await AuditLog.create({
        action: 'login_failed',
        resource_type: 'user',
        resource_id: user.id,
        details: { 
          reason: 'invalid_password',
          requestId: requestId,
          failedAttempts: user.failed_login_attempts
        },
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });

      // Check if account is now locked after this attempt
      const lockoutMessage = user.isAccountLocked() 
        ? ` Account has been temporarily locked due to too many failed attempts.`
        : '';

      return res.status(401).json({
        error: 'Invalid credentials',
        message: `Invalid email or password.${lockoutMessage}`
      });
    }

    console.log(`✅ [${requestId}] Password valid, updating login tracking for: ${user.email}`);

    // Check if password reset is required
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const needsPasswordReset = user.last_password_change && user.last_password_change < oneWeekAgo;
    
    if (needsPasswordReset) {
      console.log(`🔄 [${requestId}] Password reset required for user: ${user.email}`, {
        lastPasswordChange: user.last_password_change,
        oneWeekAgo: oneWeekAgo
      });
      
      // Log password reset required
      await AuditLog.create({
        action: 'login_password_reset_required',
        resource_type: 'user',
        resource_id: user.id,
        user_id: user.id,
        organization_id: user.organization_id,
        details: { 
          reason: 'admin_forced_reset',
          lastPasswordChange: user.last_password_change,
          requestId: requestId
        },
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });

      return res.status(202).json({
        error: 'Password reset required',
        message: 'Your password must be changed. Please use the password reset process.',
        action: 'password_reset_required',
        email: user.email
      });
    }

    // Update last login
    const loginUpdateStart = Date.now();
    await user.resetFailedLoginAttempts();
    const loginUpdateDuration = Date.now() - loginUpdateStart;
    
    console.log(`📈 [${requestId}] Login tracking updated:`, {
      userId: user.id,
      email: user.email,
      duration: `${loginUpdateDuration}ms`
    });

    console.log(`🎫 [${requestId}] Generating JWT token for user: ${user.email}`);

    // Generate JWT token
    const tokenGenerationStart = Date.now();
    const token = generateToken(user);
    const tokenGenerationDuration = Date.now() - tokenGenerationStart;
    
    console.log(`🎫 [${requestId}] JWT token generated:`, {
      userId: user.id,
      email: user.email,
      role: user.role,
      orgId: user.organization_id,
      duration: `${tokenGenerationDuration}ms`,
      tokenLength: token.length
    });

    // Log successful login
    await AuditLog.create({
      action: 'login_success',
      resource_type: 'user',
      resource_id: user.id,
      user_id: user.id,
      organization_id: user.organization_id,
      details: { 
        login_method: 'password',
        requestId: requestId,
        totalDuration: `${Date.now() - startTime}ms`
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    const totalDuration = Date.now() - startTime;
    
    console.log(`🎉 [${requestId}] Login successful:`, {
      userId: user.id,
      email: user.email,
      role: user.role,
      organization: user.organization?.name || 'none',
      totalDuration: `${totalDuration}ms`,
      ip: clientIP,
      timestamp: new Date().toISOString()
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        organization: user.organization ? {
          id: user.organization.id,
          name: user.organization.name,
          displayName: user.organization.display_name
        } : null
      }
    });

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    
    console.error(`💥 [${requestId}] Login error (${totalDuration}ms):`, {
      error: error.message,
      stack: error.stack,
      email: req.body.email,
      ip: clientIP,
      userAgent: userAgent,
      timestamp: new Date().toISOString(),
      requestId: requestId
    });
    
    // Log the error to audit log if possible
    try {
      await AuditLog.create({
        action: 'login_error',
        resource_type: 'system',
        details: { 
          error: error.message,
          requestId: requestId,
          email: req.body.email,
          duration: `${totalDuration}ms`
        },
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        status: 'error',
        error_message: error.message
      });
    } catch (auditError) {
      console.error(`Failed to log error to audit log:`, auditError);
    }
    
    res.status(500).json({
      error: 'Login failed',
      message: 'An error occurred during login. Please try again.'
    });
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  // For JWT tokens, logout is handled client-side by removing the token
  // In a production system, you might want to maintain a blacklist of tokens
  res.json({
    message: 'Logout successful',
    details: 'Please remove the authentication token from your client.'
  });
});

// Get current user info (requires authentication)
const { authenticateToken } = require('../middleware/auth');

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        status: user.status,
        lastLogin: user.last_login,
        loginCount: user.login_count,
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
    console.error('Get user info error:', error);
    res.status(500).json({
      error: 'Failed to get user info',
      message: 'An error occurred while retrieving user information.'
    });
  }
});

// Password reset request endpoint
router.post('/password-reset', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Missing email',
        message: 'Email address is required for password reset.'
      });
    }

    const user = await User.findByEmail(email);
    
    if (!user) {
      // Return success even if user doesn't exist (security best practice)
      return res.json({
        message: 'If an account with that email exists, a password reset link has been sent.',
        email: email.toLowerCase()
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        error: 'Account inactive',
        message: 'Cannot reset password for inactive account.'
      });
    }

    // Generate reset token
    const resetToken = user.generatePasswordResetToken();
    await user.save();

    // Log password reset request
    await AuditLog.create({
      action: 'password_reset_requested',
      resource_type: 'user',
      resource_id: user.id,
      details: { 
        email: user.email,
        token_expires: user.password_reset_expires
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    // Send password reset email
    try {
      const emailService = require('../services/emailService');
      const emailResult = await emailService.sendPasswordResetEmail(
        user.email, 
        resetToken, 
        user.first_name
      );

      if (emailResult.success) {
        console.log(`✅ Password reset email sent to ${user.email}`);
        
        // Log successful email sending
        await AuditLog.create({
          action: 'password_reset_email_sent',
          resource_type: 'user',
          resource_id: user.id,
          details: { 
            email: user.email,
            messageId: emailResult.messageId
          },
          ip_address: req.ip,
          user_agent: req.get('User-Agent')
        });
      } else {
        console.error(`❌ Failed to send password reset email to ${user.email}:`, emailResult.error);
        
        // Log failed email sending
        await AuditLog.create({
          action: 'password_reset_email_failed',
          resource_type: 'user',
          resource_id: user.id,
          details: { 
            email: user.email,
            error: emailResult.error
          },
          ip_address: req.ip,
          user_agent: req.get('User-Agent')
        });
      }
    } catch (emailError) {
      console.error('Email service error during password reset:', emailError);
      
      // Log email service error
      await AuditLog.create({
        action: 'password_reset_email_error',
        resource_type: 'user',
        resource_id: user.id,
        details: { 
          email: user.email,
          error: emailError.message
        },
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });
    }

    // For development, also log the reset link to console
    if (process.env.NODE_ENV === 'development') {
      const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
      console.log(`🔗 Password reset link for ${user.email}: ${resetLink}`);
    }

    res.json({
      message: 'If an account with that email exists, a password reset link has been sent.',
      email: email.toLowerCase()
    });

  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({
      error: 'Password reset failed',
      message: 'An error occurred during password reset. Please try again.'
    });
  }
});

// Password reset confirmation endpoint
router.post('/password-reset/confirm', authLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Reset token and new password are required.'
      });
    }

    // Enhanced password strength validation
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        error: 'Weak password',
        message: 'Password does not meet security requirements.',
        details: passwordValidation.feedback
      });
    }

    const user = await User.findOne({
      where: {
        password_reset_token: token,
        password_reset_expires: {
          [Op.gt]: new Date()
        }
      }
    });

    if (!user) {
      return res.status(400).json({
        error: 'Invalid or expired token',
        message: 'Password reset token is invalid or has expired.'
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        error: 'Account inactive',
        message: 'Cannot reset password for inactive account.'
      });
    }

    // Update password and clear reset token
    user.password = password;
    user.password_reset_token = null;
    user.password_reset_expires = null;
    user.failed_login_attempts = 0;
    user.account_locked_until = null;
    await user.save();

    // Log successful password reset
    await AuditLog.create({
      action: 'password_reset_completed',
      resource_type: 'user',
      resource_id: user.id,
      user_id: user.id,
      details: { 
        email: user.email,
        reset_method: 'token'
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json({
      message: 'Password reset successful. You can now log in with your new password.',
      email: user.email
    });

  } catch (error) {
    console.error('Password reset confirm error:', error);
    res.status(500).json({
      error: 'Password reset failed',
      message: 'An error occurred during password reset. Please try again.'
    });
  }
});

// Email verification endpoint
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        error: 'Missing token',
        message: 'Verification token is required.'
      });
    }

    const user = await User.findOne({
      where: {
        email_verification_token: token,
        email_verification_expires: {
          [Op.gt]: new Date()
        }
      }
    });

    if (!user) {
      return res.status(400).json({
        error: 'Invalid or expired token',
        message: 'Email verification token is invalid or has expired.'
      });
    }

    // Verify email
    user.is_verified = true;
    user.email_verification_token = null;
    user.email_verification_expires = null;
    await user.save();

    // Log email verification
    await AuditLog.create({
      action: 'email_verified',
      resource_type: 'user',
      resource_id: user.id,
      user_id: user.id,
      details: { 
        email: user.email
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json({
      message: 'Email verification successful.',
      user: {
        id: user.id,
        email: user.email,
        isVerified: user.is_verified
      }
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      error: 'Email verification failed',
      message: 'An error occurred during email verification. Please try again.'
    });
  }
});

module.exports = router; 