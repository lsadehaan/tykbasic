const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { User, Organization, EmailWhitelist, PendingUser, AuditLog } = require('../models');
const { Op } = require('sequelize');

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
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

    // Password strength validation
    if (password.length < 8) {
      return res.status(400).json({
        error: 'Weak password',
        message: 'Password must be at least 8 characters long.'
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

    // Find or create default organization
    let organization;
    if (organizationName) {
      organization = await Organization.findOne({ 
        where: { name: organizationName } 
      });
      if (!organization) {
        organization = await Organization.create({
          name: organizationName,
          display_name: organizationName,
          description: `Organization for ${organizationName}`,
          status: 'active'
        });
      }
    } else {
      organization = await Organization.findOne({ 
        where: { name: 'default' } 
      });
      if (!organization) {
        organization = await Organization.create({
          name: 'default',
          display_name: 'Default Organization',
          description: 'Default organization for TykBasic users',
          status: 'active'
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
      
      // Log failed login attempt
      await AuditLog.create({
        action: 'login_failed',
        resource_type: 'user',
        resource_id: user.id,
        details: { 
          reason: 'invalid_password',
          requestId: requestId,
          failedAttempts: user.failed_login_attempts + 1
        },
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });

      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Invalid email or password.'
      });
    }

    console.log(`✅ [${requestId}] Password valid, updating login tracking for: ${user.email}`);

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

module.exports = router; 