const jwt = require('jsonwebtoken');
const { User, Organization } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  const startTime = Date.now();
  const clientIP = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent');
  const requestId = Math.random().toString(36).substring(7);
  const path = req.path;
  const method = req.method;
  
  console.log(`🔒 [${requestId}] Auth middleware started:`, {
    method: method,
    path: path,
    ip: clientIP,
    timestamp: new Date().toISOString()
  });

  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    console.log(`🎫 [${requestId}] Token extraction:`, {
      hasAuthHeader: !!authHeader,
      authHeaderType: authHeader ? authHeader.split(' ')[0] : 'none',
      hasToken: !!token,
      tokenLength: token ? token.length : 0
    });

    if (!token) {
      console.log(`❌ [${requestId}] No token provided:`, {
        path: path,
        ip: clientIP,
        authHeader: authHeader ? 'present but invalid format' : 'missing'
      });
      
      return res.status(401).json({
        error: 'Access denied',
        message: 'No authentication token provided.'
      });
    }

    console.log(`🔍 [${requestId}] Verifying JWT token...`);

    // Verify token
    const tokenVerifyStart = Date.now();
    const decoded = jwt.verify(token, JWT_SECRET);
    const tokenVerifyDuration = Date.now() - tokenVerifyStart;
    
    console.log(`✅ [${requestId}] JWT token verified:`, {
      userId: decoded.id,
      email: decoded.email,
      role: decoded.role,
      orgId: decoded.organization_id,
      iat: new Date(decoded.iat * 1000).toISOString(),
      exp: new Date(decoded.exp * 1000).toISOString(),
      verifyDuration: `${tokenVerifyDuration}ms`
    });
    
    console.log(`👤 [${requestId}] Looking up user: ${decoded.id}`);
    
    // Get user from database (to ensure user still exists and is active)
    const userLookupStart = Date.now();
    const user = await User.findByPk(decoded.id, {
      include: [{ model: Organization, as: 'organization' }],
      attributes: { exclude: ['password'] } // Don't include password
    });
    const userLookupDuration = Date.now() - userLookupStart;
    
    console.log(`🔍 [${requestId}] User lookup result:`, {
      userId: decoded.id,
      userFound: !!user,
      lookupDuration: `${userLookupDuration}ms`
    });

    if (!user) {
      console.log(`❌ [${requestId}] User not found:`, {
        tokenUserId: decoded.id,
        ip: clientIP,
        path: path
      });
      
      return res.status(401).json({
        error: 'Invalid token',
        message: 'User associated with token not found.'
      });
    }

    console.log(`✅ [${requestId}] User found:`, {
      userId: user.id,
      email: user.email,
      role: user.role,
      isActive: user.is_active,
      orgId: user.organization_id,
      orgName: user.organization?.name || 'none'
    });

    if (!user.is_active) {
      console.log(`⚠️ [${requestId}] Inactive user access attempt:`, {
        userId: user.id,
        email: user.email,
        isActive: user.is_active,
        ip: clientIP,
        path: path
      });
      
      return res.status(403).json({
        error: 'Account inactive',
        message: `Your account is inactive. Please contact an administrator.`
      });
    }

    const totalDuration = Date.now() - startTime;
    
    console.log(`🎉 [${requestId}] Authentication successful:`, {
      userId: user.id,
      email: user.email,
      role: user.role,
      method: method,
      path: path,
      totalDuration: `${totalDuration}ms`,
      ip: clientIP
    });

    // Add user info to request object
    req.user = user;
    req.token = decoded;
    req.authRequestId = requestId;
    
    next();
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    
    if (error.name === 'JsonWebTokenError') {
      console.log(`❌ [${requestId}] Invalid JWT token:`, {
        error: error.message,
        ip: clientIP,
        path: path,
        duration: `${totalDuration}ms`
      });
      
      return res.status(401).json({
        error: 'Invalid token',
        message: 'The provided token is invalid.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      console.log(`⏰ [${requestId}] Expired JWT token:`, {
        expiredAt: error.expiredAt,
        ip: clientIP,
        path: path,
        duration: `${totalDuration}ms`
      });
      
      return res.status(401).json({
        error: 'Token expired',
        message: 'Your session has expired. Please log in again.'
      });
    }

    console.error(`💥 [${requestId}] Authentication middleware error (${totalDuration}ms):`, {
      error: error.message,
      stack: error.stack,
      path: path,
      method: method,
      ip: clientIP,
      userAgent: userAgent,
      timestamp: new Date().toISOString()
    });
    
    return res.status(500).json({
      error: 'Authentication failed',
      message: 'An error occurred during authentication.'
    });
  }
};

// Middleware to check user roles
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please authenticate to access this resource.'
      });
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}`
      });
    }

    next();
  };
};

// Middleware to check if user is admin
const requireAdmin = requireRole(['admin', 'super_admin']);

// Middleware to check if user is in same organization or is admin
const requireSameOrgOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please authenticate to access this resource.'
    });
  }

  const userRole = req.user.role;
  const userOrgId = req.user.organization_id;
  const targetOrgId = req.params.organizationId || req.body.organization_id;

  // Admins can access any organization
  if (['admin', 'super_admin'].includes(userRole)) {
    return next();
  }

  // Users can only access their own organization
  if (targetOrgId && userOrgId !== parseInt(targetOrgId)) {
    return res.status(403).json({
      error: 'Access denied',
      message: 'You can only access resources from your own organization.'
    });
  }

  next();
};

// Optional authentication - adds user info if token is present but doesn't require it
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findByPk(decoded.id, {
        include: [{ model: Organization, as: 'organization' }],
        attributes: { exclude: ['password_hash'] }
      });

      if (user && user.status === 'active') {
        req.user = user;
        req.token = decoded;
      }
    }
  } catch (error) {
    // Silently fail for optional auth
    console.log('Optional auth failed:', error.message);
  }

  next();
};

module.exports = {
  authenticateToken,
  requireRole,
  requireAdmin,
  requireSameOrgOrAdmin,
  optionalAuth
}; 