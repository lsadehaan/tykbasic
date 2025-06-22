const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User, Organization, EmailWhitelist, PendingUser, AuditLog } = require('../models');
const { Op } = require('sequelize');

class AuthService {
  constructor() {
    this.JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
    this.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
  }

  // Check if email matches whitelist patterns
  async isEmailWhitelisted(email) {
    const patterns = await EmailWhitelist.findAll({
      where: { is_active: true }
    });
    
    for (const pattern of patterns) {
      if (this.matchesPattern(email, pattern.pattern)) {
        return true;
      }
    }
    return false;
  }
  
  // Wildcard pattern matching
  matchesPattern(email, pattern) {
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');
    
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(email);
  }

  // Login user
  async login(email, password) {
    // 1. Find user
    const user = await User.findOne({ 
      where: { email },
      include: [{ model: Organization }]
    });
    
    if (!user) {
      throw new Error('Invalid credentials');
    }
    
    // 2. Check approval status
    if (!user.is_approved) {
      throw new Error('Account pending approval');
    }
    
    // 3. Check email verification
    if (!user.email_verified) {
      throw new Error('Please verify your email address');
    }
    
    // 4. Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      throw new Error('Invalid credentials');
    }
    
    // 5. Generate JWT
    const token = this.generateToken(user);
    
    return {
      status: 'success',
      token,
      user: this.sanitizeUser(user)
    };
  }

  // Register new user
  async registerUser(userData) {
    const { email, password, firstName, lastName } = userData;
    
    // 1. Check email whitelist
    if (!await this.isEmailWhitelisted(email)) {
      throw new Error('Email domain not authorized for registration');
    }
    
    // 2. Check if user exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      throw new Error('User already exists');
    }
    
    // 3. Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    
    // 4. Create user
    const user = await User.create({
      email,
      password_hash: passwordHash,
      first_name: firstName,
      last_name: lastName,
      role: 'user',
      is_approved: false,
      email_verified: false
    });

    // 5. Create audit log
    await AuditLog.create({
      user_id: user.id,
      action: 'user_registered',
      details: { email }
    });

    return this.sanitizeUser(user);
  }

  // Generate JWT token
  generateToken(user) {
    return jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        organization_id: user.organization_id 
      },
      this.JWT_SECRET,
      { expiresIn: this.JWT_EXPIRES_IN }
    );
  }

  // Sanitize user object
  sanitizeUser(user) {
    const { password_hash, ...sanitized } = user.toJSON();
    return sanitized;
  }

  // Get current user
  async getCurrentUser(userId) {
    const user = await User.findByPk(userId, {
      include: [{ model: Organization }]
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    return this.sanitizeUser(user);
  }
}

module.exports = new AuthService(); 