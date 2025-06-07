# TykBasic Implementation Guide

## Overview

This guide provides comprehensive instructions for building a frontend application that interfaces with the Tyk Gateway API to manage organizations, users, and authentication methods. Based on extensive API testing and analysis, this document covers both architectural considerations and specific implementation details.

## Architecture Overview

### API Selection Strategy

This implementation uses the **Tyk Gateway API** (`gateway-swagger.yml`) which provides:
- Simple authentication (single secret)
- Direct key management
- Organization-level rate limiting (for existing organizations)
- Certificate and policy management

**Note**: Organizations must be pre-configured in Tyk or managed at the application level.

## Authentication & Security

### API Authentication
```javascript
// All requests require this header
const headers = {
  'x-tyk-authorization': 'your-gateway-secret',
  'Content-Type': 'application/json'
};
```

### Frontend User Authentication Architecture

#### Authentication Requirements:
- **Self-registration** with email as username
- **Email whitelisting** with wildcard support (e.g., `*@supercust.com`)
- **Configurable admin approval** for new users
- **Simple username/password** authentication
- **Optional 2FA** (configurable requirement)

#### Two-Level Architecture:
1. **Frontend Users**: Access the management interface
2. **Tyk Resources**: Organization-scoped API keys and certificates

#### Recommended Tech Stack:
- **Express.js** + **Passport.js** (local strategy)
- **JWT tokens** for session management
- **bcrypt** for password hashing
- **speakeasy** for 2FA/TOTP
- **nodemailer** for email notifications

## Core Implementation Components

## 1. Organization Management

### Create Organization (Admin Only)

**Note**: The Gateway API does not create organizations directly. Organizations must be either:
1. Pre-configured in Tyk's configuration files
2. Managed entirely at your application level (recommended approach below)

**Alternative Implementation**:
```javascript
// Track organizations in your application database
const createOrganization = async (orgData) => {
  // 1. Store organization in your database
  const org = await db.organizations.create({
    id: generateOrgId(),
    name: orgData.name,
    domain: orgData.domain,
    created_at: new Date(),
    admin_users: [adminUserId]
  });
  
  // 2. Create organization-level rate limiting key
  const orgKey = await fetch(`${TYK_GATEWAY_URL}/tyk/org/keys/${org.id}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      org_id: org.id,
      allowance: orgData.defaultAllowance || 10000,
      rate: orgData.defaultRate || 1000,
      per: 60,
      quota_max: orgData.defaultQuota || 100000,
      quota_renewal_rate: 3600
    })
  });
  
  return org;
};
```

## 2. User Management

### Create User in Organization

```javascript
const createUserInOrganization = async (orgId, userData) => {
  // 1. Create user in your application database
  const user = await db.users.create({
    id: generateUserId(),
    org_id: orgId,
    email: userData.email,
    name: userData.name,
    role: userData.role || 'user',
    auth_methods: [], // Will be populated when auth is set up
    created_at: new Date()
  });
  
  return user;
};
```

## 3. mTLS Authentication Setup

### Certificate Generation Option

```javascript
// Backend endpoint for certificate generation
const generateClientCertificate = async (userId) => {
  const userInfo = await db.users.findById(userId);
  
  // Generate client certificate using cert-generator.js pattern
  const clientCert = await generateCertificate({
    commonName: userInfo.email,
    organizationName: userInfo.org_name,
    keySize: 2048,
    validityDays: 365
  });
  
  // Store certificate info in database
  await db.auth_certificates.create({
    user_id: userId,
    certificate_id: clientCert.fingerprint,
    certificate_pem: clientCert.cert,
    private_key_pem: clientCert.key,
    created_at: new Date(),
    expires_at: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000))
  });
  
  return {
    certificate: clientCert.cert,
    private_key: clientCert.key,
    ca_certificate: serverCaCert, // Your server's CA cert
    instructions: \`
# Client Certificate Setup Instructions

## Download Files:
1. client-certificate.pem (This file)
2. client-private-key.pem 
3. ca-certificate.pem (Server CA certificate)

## Usage Examples:

### cURL:
curl --cert client-certificate.pem --key client-private-key.pem --cacert ca-certificate.pem https://your-api.com/endpoint

### Node.js:
const https = require('https');
const fs = require('fs');

const options = {
  cert: fs.readFileSync('client-certificate.pem'),
  key: fs.readFileSync('client-private-key.pem'),
  ca: fs.readFileSync('ca-certificate.pem')
};

### Browser (if supported):
Import the certificate into your browser's certificate store.
    \`
  };
};
```

### Certificate Upload Option

```javascript
// Frontend certificate upload component
const CertificateUploadForm = () => {
  const [certificateFile, setCertificateFile] = useState(null);
  
  const handleCertificateUpload = async (file) => {
    const formData = new FormData();
    formData.append('certificate', file);
    
    const response = await fetch('/api/users/certificates/upload', {
      method: 'POST',
      body: formData
    });
    
    if (response.ok) {
      // Certificate validated and stored
      await setupMTLSAuth();
    }
  };
  
  return (
    <div>
      <h3>Upload Client Certificate</h3>
      <input 
        type="file" 
        accept=".pem,.crt,.cer" 
        onChange={(e) => setCertificateFile(e.target.files[0])}
      />
      <button onClick={() => handleCertificateUpload(certificateFile)}>
        Upload & Configure
      </button>
      
      <div className="instructions">
        <h4>Generate Certificate with OpenSSL:</h4>
        <pre>{\`
# Generate private key
openssl genrsa -out client-private-key.pem 2048

# Generate certificate signing request
openssl req -new -key client-private-key.pem -out client.csr \\
  -subj "/C=US/ST=State/L=City/O=Organization/CN=user@example.com"

# Generate self-signed certificate (for testing)
openssl x509 -req -in client.csr -signkey client-private-key.pem \\
  -out client-certificate.pem -days 365

# Or get it signed by your CA
        \`}</pre>
      </div>
    </div>
  );
};
```

### Configure mTLS in Tyk

```javascript
const setupMTLSAuth = async (userId, certificatePem) => {
  // 1. Upload certificate to Tyk
  const certResponse = await fetch(`${TYK_GATEWAY_URL}/tyk/certs`, {
    method: 'POST',
    headers: {
      'x-tyk-authorization': TYK_SECRET,
      'Content-Type': 'text/plain'
    },
    body: certificatePem
  });
  
  const certData = await certResponse.json();
  const certificateId = certData.id;
  
  // 2. Create API key with mTLS binding
  const keyResponse = await fetch(`${TYK_GATEWAY_URL}/tyk/keys`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      org_id: user.org_id,
      certificate: certificateId,
      alias: \`\${user.email}-mtls\`,
      access_rights: await getUserApiAccess(userId),
      meta_data: {
        user_id: userId,
        auth_method: 'mtls'
      }
    })
  });
  
  const keyData = await keyResponse.json();
  
  // 3. Update user record
  await db.users.update(userId, {
    auth_methods: [...user.auth_methods, {
      type: 'mtls',
      certificate_id: certificateId,
      key_id: keyData.key,
      created_at: new Date()
    }]
  });
  
  return keyData.key;
};
```

## 4. Token + HMAC Authentication Setup

```javascript
const setupTokenHMACAuth = async (userId) => {
  const user = await db.users.findById(userId);
  
  // Generate HMAC secret
  const hmacSecret = crypto.randomBytes(32).toString('hex');
  
  // Create API key with HMAC enabled
  const keyResponse = await fetch(`${TYK_GATEWAY_URL}/tyk/keys`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      org_id: user.org_id,
      hmac_enabled: true,
      hmac_string: hmacSecret,
      alias: \`\${user.email}-hmac\`,
      access_rights: await getUserApiAccess(userId),
      meta_data: {
        user_id: userId,
        auth_method: 'hmac'
      }
    })
  });
  
  const keyData = await keyResponse.json();
  
  // Store credentials securely
  await db.user_credentials.create({
    user_id: userId,
    auth_type: 'hmac',
    api_key: keyData.key,
    hmac_secret: hmacSecret,
    created_at: new Date()
  });
  
  // Update user record
  await db.users.update(userId, {
    auth_methods: [...user.auth_methods, {
      type: 'hmac',
      key_id: keyData.key,
      created_at: new Date()
    }]
  });
  
  return {
    api_key: keyData.key,
    hmac_secret: hmacSecret,
    usage_examples: {
      curl: \`
# HMAC Authentication Example
# Calculate HMAC signature and include in Authorization header
curl -H "Authorization: Bearer \${API_KEY}" \\
     -H "X-HMAC-Signature: \${CALCULATED_SIGNATURE}" \\
     https://your-api.com/endpoint
      \`,
      javascript: \`
const crypto = require('crypto');

const apiKey = '\${keyData.key}';
const hmacSecret = '\${hmacSecret}';
const requestBody = JSON.stringify(yourData);

const signature = crypto.createHmac('sha256', hmacSecret)
  .update(requestBody)
  .digest('hex');

const headers = {
  'Authorization': 'Bearer ' + apiKey,
  'X-HMAC-Signature': signature,
  'Content-Type': 'application/json'
};
      \`
    }
  };
};
```

## 5. API Management

### Add API to Tyk

```javascript
const addAPIToTyk = async (apiDefinition) => {
  // Create API definition
  const apiResponse = await fetch(`${TYK_GATEWAY_URL}/tyk/apis`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      api_id: apiDefinition.id,
      name: apiDefinition.name,
      slug: apiDefinition.slug,
      listen_path: apiDefinition.listen_path,
      target_url: apiDefinition.target_url,
      strip_listen_path: true,
      use_standard_auth: true,
      auth: {
        auth_header_name: "Authorization"
      },
      version_data: {
        not_versioned: true,
        versions: {
          "Default": {
            name: "Default",
            use_extended_paths: true
          }
        }
      }
    })
  });
  
  // Reload Tyk configuration
  await fetch(`${TYK_GATEWAY_URL}/tyk/reload/group`, {
    method: 'GET',
    headers
  });
  
  return apiResponse.json();
};
```

### Grant API Access to Users/Organizations

```javascript
const grantAPIAccess = async (apiId, targetType, targetId, permissions) => {
  // targetType: 'user' or 'organization'
  
  if (targetType === 'organization') {
    // Grant access to all users in organization
    const users = await db.users.findByOrgId(targetId);
    
    for (const user of users) {
      await updateUserAPIAccess(user.id, apiId, permissions);
    }
  } else {
    await updateUserAPIAccess(targetId, apiId, permissions);
  }
};

const updateUserAPIAccess = async (userId, apiId, permissions) => {
  const user = await db.users.findById(userId);
  
  // Update all of user's API keys
  for (const authMethod of user.auth_methods) {
    const keyResponse = await fetch(`${TYK_GATEWAY_URL}/tyk/keys/${authMethod.key_id}`, {
      method: 'GET',
      headers
    });
    
    const keyData = await keyResponse.json();
    
    // Add new API access rights
    keyData.access_rights[apiId] = {
      api_id: apiId,
      api_name: permissions.api_name,
      versions: ["Default"],
      allowed_urls: permissions.allowed_urls || [],
      limit: {
        rate: permissions.rate_limit || 1000,
        per: 60,
        quota_max: permissions.quota || 10000,
        quota_renewal_rate: 3600
      }
    };
    
    // Update the key
    await fetch(`${TYK_GATEWAY_URL}/tyk/keys/${authMethod.key_id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(keyData)
    });
  }
};
```

## 6. Self-Service vs Admin-Managed Implementation

### Frontend Route Structure

```javascript
// Admin routes
app.use('/admin', requireAdminAuth, adminRoutes);
app.use('/admin/organizations', organizationAdminRoutes);
app.use('/admin/users', userAdminRoutes);
app.use('/admin/apis', apiAdminRoutes);

// User self-service routes
app.use('/user', requireUserAuth, userSelfServiceRoutes);
app.use('/user/auth', authSelfServiceRoutes);

// Organization admin routes
app.use('/org-admin', requireOrgAdminAuth, orgAdminRoutes);
```

### Self-Service Authentication Setup Component

```javascript
const SelfServiceAuthSetup = ({ userId }) => {
  const [authMethods, setAuthMethods] = useState([]);
  
  const setupMTLS = async (certificateOption) => {
    if (certificateOption === 'generate') {
      const response = await fetch('/api/user/auth/mtls/generate', {
        method: 'POST'
      });
      const data = await response.json();
      
      // Trigger download of certificates
      downloadFile(data.certificate, 'client-certificate.pem');
      downloadFile(data.private_key, 'client-private-key.pem');
      downloadFile(data.ca_certificate, 'ca-certificate.pem');
      
    } else {
      // Show certificate upload form
      setShowCertUpload(true);
    }
  };
  
  const setupHMAC = async () => {
    const response = await fetch('/api/user/auth/hmac/generate', {
      method: 'POST'
    });
    const data = await response.json();
    
    // Show credentials to user with copy functionality
    setHMACCredentials(data);
  };
  
  return (
    <div className="auth-setup">
      <h2>Authentication Setup</h2>
      
      <div className="auth-method">
        <h3>mTLS Certificate Authentication</h3>
        <button onClick={() => setupMTLS('generate')}>
          Generate New Certificate
        </button>
        <button onClick={() => setupMTLS('upload')}>
          Upload Existing Certificate
        </button>
      </div>
      
      <div className="auth-method">
        <h3>Token + HMAC Authentication</h3>
        <button onClick={setupHMAC}>
          Generate API Key & HMAC Secret
        </button>
      </div>
      
      <div className="current-methods">
        <h3>Current Authentication Methods</h3>
        {authMethods.map(method => (
          <AuthMethodCard key={method.id} method={method} />
        ))}
      </div>
    </div>
  );
};
```

## Error Handling & Best Practices

### API Error Handling

```javascript
const handleTykAPIError = (response, operation) => {
  if (!response.ok) {
    switch (response.status) {
      case 403:
        throw new Error(\`Access denied for \${operation}. Check Tyk authorization header.\`);
      case 404:
        throw new Error(\`Resource not found for \${operation}.\`);
      case 400:
        throw new Error(\`Invalid request for \${operation}. Check request format.\`);
      default:
        throw new Error(\`Tyk API error (\${response.status}) for \${operation}\`);
    }
  }
};
```

### Key Rotation Strategy

```javascript
const rotateUserCredentials = async (userId, authType) => {
  const user = await db.users.findById(userId);
  const oldAuth = user.auth_methods.find(m => m.type === authType);
  
  if (authType === 'hmac') {
    // Generate new credentials
    const newCreds = await setupTokenHMACAuth(userId);
    
    // Keep old key active for grace period
    setTimeout(async () => {
      await fetch(\`\${TYK_GATEWAY_URL}/tyk/keys/\${oldAuth.key_id}\`, {
        method: 'DELETE',
        headers
      });
    }, 24 * 60 * 60 * 1000); // 24 hour grace period
    
    return newCreds;
  }
  
  // Similar logic for mTLS
};
```

## Frontend Authentication Implementation

### Enhanced Database Schema

```sql
-- Organizations table
CREATE TABLE organizations (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255),
  org_key_id VARCHAR(255), -- Tyk organization-level key
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Enhanced Users table with authentication fields
CREATE TABLE users (
  id VARCHAR(255) PRIMARY KEY,
  org_id VARCHAR(255) REFERENCES organizations(id),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role ENUM('admin', 'org_admin', 'user') DEFAULT 'user',
  password_hash VARCHAR(255) NOT NULL,
  totp_secret VARCHAR(255), -- for 2FA
  totp_secret_temp VARCHAR(255), -- temporary during setup
  totp_enabled BOOLEAN DEFAULT FALSE,
  email_verified BOOLEAN DEFAULT FALSE,
  is_approved BOOLEAN DEFAULT TRUE, -- configurable
  approved_by VARCHAR(255),
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Email whitelist for registration control
CREATE TABLE email_whitelist (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  pattern VARCHAR(255) NOT NULL, -- e.g., "*@supercust.com", "john@company.com"
  created_by VARCHAR(255), -- admin user ID
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE
);

-- Pending user registrations (if admin approval required)
CREATE TABLE pending_users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  requested_org_id VARCHAR(255), -- if they specify during registration
  registration_token VARCHAR(255), -- for email verification
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP -- registration link expiry
);

-- System configuration
CREATE TABLE system_config (
  key_name VARCHAR(255) PRIMARY KEY,
  value_data JSON,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default auth configuration
INSERT INTO system_config (key_name, value_data) VALUES 
('auth_settings', JSON_OBJECT(
  'require_admin_approval', false,
  'require_2fa', false,
  'require_email_verification', true,
  'password_min_length', 8
));

-- User credentials table (for Tyk API keys)
CREATE TABLE user_credentials (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) REFERENCES users(id),
  auth_type ENUM('mtls', 'hmac', 'token') NOT NULL,
  tyk_key_id VARCHAR(255) NOT NULL,
  certificate_id VARCHAR(255) NULL, -- For mTLS
  hmac_secret VARCHAR(255) NULL, -- Encrypted
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  is_active BOOLEAN DEFAULT TRUE
);

-- API definitions table
CREATE TABLE api_definitions (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  tyk_api_id VARCHAR(255) NOT NULL,
  listen_path VARCHAR(255) NOT NULL,
  target_url VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API access grants table
CREATE TABLE api_access_grants (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  api_id VARCHAR(255) REFERENCES api_definitions(id),
  user_id VARCHAR(255) REFERENCES users(id) NULL,
  org_id VARCHAR(255) REFERENCES organizations(id) NULL,
  permissions JSON, -- Store rate limits, allowed URLs, etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Core Authentication Service

```javascript
// auth/authService.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');

class AuthService {
  
  // Check if email matches whitelist patterns
  async isEmailWhitelisted(email) {
    const patterns = await db.email_whitelist.findActive();
    
    for (const pattern of patterns) {
      if (this.matchesPattern(email, pattern.pattern)) {
        return true;
      }
    }
    return false;
  }
  
  // Wildcard pattern matching
  matchesPattern(email, pattern) {
    // Convert wildcard pattern to regex
    // *@company.com -> .*@company\.com
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');
    
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(email);
  }
  
  // Self-registration
  async registerUser(userData) {
    const { email, password, name, orgId } = userData;
    
    // 1. Check email whitelist
    if (!await this.isEmailWhitelisted(email)) {
      throw new Error('Email domain not authorized for registration');
    }
    
    // 2. Check if user exists
    const existingUser = await db.users.findByEmail(email);
    if (existingUser) {
      throw new Error('User already exists');
    }
    
    // 3. Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    
    // 4. Get system config
    const config = await this.getAuthConfig();
    
    // 5. Create registration token
    const registrationToken = crypto.randomBytes(32).toString('hex');
    
    if (config.require_admin_approval) {
      // Add to pending users
      await db.pending_users.create({
        email,
        password_hash: passwordHash,
        name,
        requested_org_id: orgId,
        registration_token: registrationToken,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      });
      
      // Notify admins
      await this.notifyAdminsOfPendingUser(email);
      
      return { 
        status: 'pending_approval',
        message: 'Registration submitted. Awaiting admin approval.'
      };
    } else {
      // Create user directly
      const user = await db.users.create({
        email,
        password_hash: passwordHash,
        name,
        org_id: orgId,
        email_verified: !config.require_email_verification,
        is_approved: true
      });
      
      if (config.require_email_verification) {
        await this.sendVerificationEmail(user, registrationToken);
        return {
          status: 'verification_required',
          message: 'Please check your email to verify your account.'
        };
      }
      
      return {
        status: 'success',
        user: this.sanitizeUser(user)
      };
    }
  }
  
  // Login
  async login(email, password, totpCode = null) {
    // 1. Find user
    const user = await db.users.findByEmail(email);
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
    
    // 5. Check 2FA if enabled
    const config = await this.getAuthConfig();
    if (config.require_2fa || user.totp_enabled) {
      if (!totpCode) {
        return {
          status: 'require_2fa',
          message: 'Two-factor authentication required'
        };
      }
      
      const totpValid = speakeasy.totp.verify({
        secret: user.totp_secret,
        token: totpCode,
        window: 2
      });
      
      if (!totpValid) {
        throw new Error('Invalid 2FA code');
      }
    }
    
    // 6. Generate JWT
    const token = this.generateJWT(user);
    
    return {
      status: 'success',
      token,
      user: this.sanitizeUser(user)
    };
  }
  
  // Setup 2FA
  async setup2FA(userId) {
    const user = await db.users.findById(userId);
    
    const secret = speakeasy.generateSecret({
      name: `${user.email} (Tyk API Manager)`,
      issuer: 'Your Company Name'
    });
    
    // Save secret (temporarily, until confirmed)
    await db.users.update(userId, {
      totp_secret_temp: secret.base32
    });
    
    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
    
    return {
      secret: secret.base32,
      qrCode: qrCodeUrl,
      manualEntry: secret.base32
    };
  }
  
  // Confirm 2FA setup
  async confirm2FA(userId, token) {
    const user = await db.users.findById(userId);
    
    const verified = speakeasy.totp.verify({
      secret: user.totp_secret_temp,
      token: token,
      window: 2
    });
    
    if (verified) {
      await db.users.update(userId, {
        totp_secret: user.totp_secret_temp,
        totp_secret_temp: null,
        totp_enabled: true
      });
      return { success: true };
    } else {
      throw new Error('Invalid 2FA code');
    }
  }
  
  generateJWT(user) {
    return jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        orgId: user.org_id,
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
  }
  
  sanitizeUser(user) {
    const { password_hash, totp_secret, totp_secret_temp, ...sanitized } = user;
    return sanitized;
  }
  
  async getAuthConfig() {
    const config = await db.system_config.findByKey('auth_settings');
    return config ? config.value_data : {
      require_admin_approval: false,
      require_2fa: false,
      require_email_verification: true,
      password_min_length: 8
    };
  }
}
```

### Admin Management Service

```javascript
// admin/adminService.js
class AdminService {
  
  // Add email whitelist pattern
  async addEmailWhitelist(pattern, adminUserId) {
    await db.email_whitelist.create({
      pattern: pattern.toLowerCase(),
      created_by: adminUserId
    });
  }
  
  // Get pending users
  async getPendingUsers() {
    return await db.pending_users.findAll({
      where: {
        expires_at: { $gt: new Date() }
      }
    });
  }
  
  // Approve pending user
  async approveUser(pendingUserId, adminUserId, orgId) {
    const pendingUser = await db.pending_users.findById(pendingUserId);
    
    // Create actual user
    const user = await db.users.create({
      email: pendingUser.email,
      password_hash: pendingUser.password_hash,
      name: pendingUser.name,
      org_id: orgId,
      email_verified: true,
      is_approved: true,
      approved_by: adminUserId,
      approved_at: new Date()
    });
    
    // Remove from pending
    await db.pending_users.delete(pendingUserId);
    
    // Send welcome email
    await this.sendWelcomeEmail(user);
    
    return user;
  }
  
  // Update auth configuration
  async updateAuthConfig(config, adminUserId) {
    await db.system_config.upsert('auth_settings', config);
  }
  
  // Manage email whitelist
  async getEmailWhitelist() {
    return await db.email_whitelist.findAll({ where: { is_active: true } });
  }
  
  async removeEmailWhitelist(id, adminUserId) {
    await db.email_whitelist.update(id, { is_active: false });
  }
}
```

### Express Authentication Routes

```javascript
// routes/auth.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts'
});

// Self-registration
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('name').trim().isLength({ min: 2 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  try {
    const result = await authService.registerUser(req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Login
router.post('/login', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const { email, password, totpCode } = req.body;
    const result = await authService.login(email, password, totpCode);
    
    if (result.token) {
      res.cookie('auth-token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });
    }
    
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// Setup 2FA
router.post('/setup-2fa', requireAuth, async (req, res) => {
  try {
    const result = await authService.setup2FA(req.user.userId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Confirm 2FA
router.post('/confirm-2fa', requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    const result = await authService.confirm2FA(req.user.userId, token);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

### Admin Routes

```javascript
// routes/admin.js
router.post('/whitelist/add', requireAdminAuth, async (req, res) => {
  try {
    const { pattern } = req.body;
    await adminService.addEmailWhitelist(pattern, req.user.userId);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/pending-users', requireAdminAuth, async (req, res) => {
  try {
    const pendingUsers = await adminService.getPendingUsers();
    res.json(pendingUsers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/approve-user/:id', requireAdminAuth, async (req, res) => {
  try {
    const { orgId } = req.body;
    const user = await adminService.approveUser(req.params.id, req.user.userId, orgId);
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/auth-config', requireAdminAuth, async (req, res) => {
  try {
    await adminService.updateAuthConfig(req.body, req.user.userId);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

### Frontend Components

```javascript
// React components for authentication
const RegisterForm = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    orgId: ''
  });
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const result = await response.json();
      // Handle registration result
    } catch (error) {
      // Handle error
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        placeholder="Email"
        value={formData.email}
        onChange={(e) => setFormData({...formData, email: e.target.value})}
        required
      />
      <input
        type="password"
        placeholder="Password (min 8 characters)"
        value={formData.password}
        onChange={(e) => setFormData({...formData, password: e.target.value})}
        required
      />
      <input
        type="text"
        placeholder="Full Name"
        value={formData.name}
        onChange={(e) => setFormData({...formData, name: e.target.value})}
        required
      />
      <button type="submit">Register</button>
    </form>
  );
};

const AdminDashboard = () => {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [whitelist, setWhitelist] = useState([]);
  
  return (
    <div>
      <h2>Admin Dashboard</h2>
      
      {/* Email Whitelist Management */}
      <WhitelistManager whitelist={whitelist} onUpdate={setWhitelist} />
      
      {/* Pending User Approvals */}
      <PendingApprovals users={pendingUsers} onApprove={handleApprove} />
      
      {/* Auth Configuration */}
      <AuthSettings />
    </div>
  );
};
```

### Cost & Independence Analysis

#### ✅ **Free/Cheap Components:**
- **Express.js, Passport.js, JWT**: Free
- **bcrypt, speakeasy, QRCode**: Free  
- **PostgreSQL/MySQL**: Free (or existing)
- **nodemailer**: Free (with your SMTP)

#### 💰 **Minimal Costs:**
- **SMTP service**: $5-20/month (SendGrid, Mailgun) or use existing email
- **Server hosting**: Your existing infrastructure

#### 🔧 **Independence Benefits:**
- **No vendor lock-in**: All code is yours
- **Complete control**: Customize everything
- **Data ownership**: All user data in your database
- **Easy migration**: Standard technologies
- **No external dependencies**: Runs entirely on your infrastructure

#### 📊 **Scalability:**
- **Horizontal scaling**: Standard Node.js app
- **Database scaling**: Standard SQL database
- **Caching**: Add Redis for session storage if needed

## Security Considerations

1. **Secret Management**: Store Tyk secrets, HMAC secrets, and private keys using proper secret management (HashiCorp Vault, AWS Secrets Manager, etc.)

2. **Certificate Storage**: Store certificates securely and implement proper access controls

3. **Audit Logging**: Log all administrative actions and authentication setup events

4. **Rate Limiting**: Implement rate limiting on your frontend API to prevent abuse

5. **Input Validation**: Validate all certificate uploads and API definitions

## Deployment Considerations

1. **Environment Variables**:
```bash
TYK_GATEWAY_URL=http://localhost:8080
TYK_SECRET=your-gateway-secret
DB_CONNECTION_STRING=your-database-url
CERT_STORAGE_PATH=/secure/certificates
```

2. **Docker Compose Integration**: Use the existing `docker-compose.yml` as a base

3. **SSL/TLS**: Ensure your frontend application runs over HTTPS in production

## Files to Delete

Based on this implementation guide, you can delete the following files from your `tyk` directory as they won't be helpful for the frontend implementation:

### Test Files (Not Needed for Production):
- `test-gateway-swagger-comprehensive.js`
- `test-gateway-enhanced-minimal.js` 
- `test-gateway-comprehensive-enhanced.js`
- `test-api-server.js`
- `test-tyk-api.js`
- `test-gateway-api-comprehensive.js`
- `simple-test-server.js`

### Documentation Files (Archival):
- `ENHANCEMENT_SUMMARY.md`
- `GATEWAY_SWAGGER_API_TEST_RESULTS.md`
- `API_CAPABILITIES_SUMMARY.md`
- `API_AVAILABILITY_REPORT.md`

### Keep These Files:
- `gateway-swagger.yml` - Essential API reference
- `dashboard-admin-swagger.yml` - Alternative API reference
- `cert-generator.js` - Useful for certificate generation functionality
- `docker-compose.yml` - For local development environment
- `tyk.conf` - Tyk configuration reference
- `package.json` & `package-lock.json` - If using Node.js for backend

### Summary
Delete these files:
```bash
rm test-gateway-swagger-comprehensive.js
rm test-gateway-enhanced-minimal.js  
rm test-gateway-comprehensive-enhanced.js
rm test-api-server.js
rm test-tyk-api.js
rm test-gateway-api-comprehensive.js
rm simple-test-server.js
rm ENHANCEMENT_SUMMARY.md
rm GATEWAY_SWAGGER_API_TEST_RESULTS.md
rm API_CAPABILITIES_SUMMARY.md
rm API_AVAILABILITY_REPORT.md
```

The remaining files provide essential API documentation, configuration examples, and utility functions that will be valuable for your frontend implementation. 