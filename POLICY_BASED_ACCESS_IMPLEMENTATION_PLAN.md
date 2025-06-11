# Policy-Based Access Control Implementation Plan

## Summary of Requirements

### Current State
- **Self-Service Model**: Users create keys and directly select APIs + rate limits
- **Organization Scoped**: Users only see/access APIs from their own organization
- **Direct Access Rights**: Keys use `access_rights` object to define API access

### Desired State  
- **Policy-Controlled Model**: Users select from pre-defined policies instead of direct API selection
- **Admin-Managed Access**: Only admins can create policies that define what access is available
- **Cross-Organization Support**: Super admins can create policies for OrgA to access OrgB's APIs
- **Configurable Policy Creation**: Option to disable policy creation for admins (super-admin only mode)

### Business Benefits
1. **API Provider Control**: Platform owners control exactly what access third parties get
2. **Standardized Access Patterns**: Consistent rate limits and API bundles across customers
3. **Cross-Organization API Sharing**: Enable controlled access to APIs across organizational boundaries
4. **Simplified User Experience**: Users choose from curated access packages instead of configuring technical details

---

## Implementation Plan

### Phase 1: Database Schema Updates

**New Tables**:
```sql
-- Policy definitions
CREATE TABLE policies (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  owner_organization_id INTEGER REFERENCES organizations(id), -- Who owns/manages this policy
  target_organization_id INTEGER REFERENCES organizations(id), -- Which org can use this policy (NULL = same as owner)
  tyk_policy_id VARCHAR(255) UNIQUE NOT NULL, -- Tyk's policy ID
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Policy configuration
  rate_limit INTEGER DEFAULT 1000,
  rate_per INTEGER DEFAULT 60,
  quota_max INTEGER DEFAULT -1,
  quota_renewal_rate INTEGER DEFAULT 3600,
  
  -- Metadata
  policy_data JSONB, -- Full Tyk policy data
  tags TEXT[], -- For categorization
  
  UNIQUE(owner_organization_id, name) -- Policy names must be unique within organization
);

-- Policy API access definitions
CREATE TABLE policy_api_access (
  id SERIAL PRIMARY KEY,
  policy_id INTEGER REFERENCES policies(id) ON DELETE CASCADE,
  api_id VARCHAR(255) NOT NULL, -- Tyk API ID
  api_name VARCHAR(255),
  api_organization_id INTEGER REFERENCES organizations(id), -- Which org owns the API
  versions TEXT[] DEFAULT ARRAY['Default'],
  allowed_urls JSONB, -- Specific endpoint restrictions if needed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(policy_id, api_id)
);

-- Track which policies are available to which organizations
CREATE TABLE organization_available_policies (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id),
  policy_id INTEGER REFERENCES policies(id),
  is_active BOOLEAN DEFAULT true,
  assigned_by_user_id INTEGER REFERENCES users(id),
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(organization_id, policy_id)
);
```

**Updated Tables**:
```sql
-- Replace access_rights tracking with policy tracking
ALTER TABLE user_credentials DROP COLUMN IF EXISTS api_key_data;
ALTER TABLE user_credentials ADD COLUMN tyk_policy_id VARCHAR(255);
ALTER TABLE user_credentials ADD COLUMN policy_id INTEGER REFERENCES policies(id);

-- Add policy creation permission to organizations
ALTER TABLE organizations ADD COLUMN allow_admin_policy_creation BOOLEAN DEFAULT true;
```

### Phase 2: Backend Implementation

#### 2.1 Policy Service Layer

**File**: `backend/services/PolicyService.js`
```javascript
class PolicyService {
  // Create policy in Tyk and store in database
  async createPolicy(policyData, creatorUserId) {
    // Create in Tyk first
    const tykPolicy = await tykGatewayService.createPolicy(policyData);
    
    // Store in database
    const dbPolicy = await Policy.create({
      ...policyData,
      tyk_policy_id: tykPolicy.id,
      created_by_user_id: creatorUserId
    });
    
    return dbPolicy;
  }
  
  // Get policies available to an organization
  async getAvailablePolicies(organizationId) {
    return await Policy.findAll({
      include: [{
        model: OrganizationAvailablePolicy,
        where: { organization_id: organizationId, is_active: true }
      }]
    });
  }
  
  // Get policies created by an organization (for admins)
  async getCreatedPolicies(organizationId) {
    return await Policy.findAll({
      where: { owner_organization_id: organizationId }
    });
  }
  
  // Cross-org policy assignment (super admin only)
  async assignPolicyToOrganization(policyId, targetOrgId, assignedByUserId) {
    return await OrganizationAvailablePolicy.create({
      organization_id: targetOrgId,
      policy_id: policyId,
      assigned_by_user_id: assignedByUserId
    });
  }
  
  // Validate policy access
  async validatePolicyAccess(policyId, organizationId) {
    return await Policy.findOne({
      where: { id: policyId },
      include: [{
        model: OrganizationAvailablePolicy,
        where: { organization_id: organizationId, is_active: true }
      }]
    });
  }
}
```

#### 2.2 Policy Management Routes

**File**: `backend/routes/policies.js`
```javascript
const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const PolicyService = require('../services/PolicyService');

// List policies user can manage
router.get('/policies', authenticateToken, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const policies = await PolicyService.getCreatedPolicies(req.user.organization_id);
    res.json({ success: true, data: policies });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// List policies user can select for keys
router.get('/policies/available', authenticateToken, async (req, res) => {
  try {
    const policies = await PolicyService.getAvailablePolicies(req.user.organization_id);
    res.json({ success: true, data: policies });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new policy
router.post('/policies', authenticateToken, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    // Check if admin policy creation is allowed
    if (req.user.role === 'admin' && !req.user.organization.allow_admin_policy_creation) {
      return res.status(403).json({
        success: false,
        error: 'Policy creation disabled for admins in this organization'
      });
    }

    const policy = await PolicyService.createPolicy(req.body, req.user.id);
    res.status(201).json({ success: true, data: policy });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cross-organization policy assignment (super admin only)
router.post('/policies/:policyId/assign-to-org', authenticateToken, requireRole('super_admin'), async (req, res) => {
  try {
    const { organizationId } = req.body;
    const assignment = await PolicyService.assignPolicyToOrganization(
      req.params.policyId, 
      organizationId, 
      req.user.id
    );
    res.json({ success: true, data: assignment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
```

#### 2.3 Updated Key Creation Logic

**File**: `backend/routes/tyk.js` (Replace POST /keys completely)
```javascript
router.post('/keys', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const { 
    name,
    description,
    policy_id, // Policy ID instead of access_rights
    expires = null
  } = req.body;

  console.log(`🔑 [${requestId}] Creating policy-based key:`, {
    name,
    policy_id,
    userId: req.user.id,
    userEmail: req.user.email
  });

  try {
    // Validation
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Key name is required',
        field: 'name'
      });
    }

    if (!policy_id) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Policy selection is required',
        field: 'policy_id'
      });
    }

    // Validate policy is available to user's organization
    const availablePolicy = await PolicyService.validatePolicyAccess(
      policy_id, 
      req.user.organization_id
    );

    if (!availablePolicy) {
      return res.status(403).json({
        error: 'Policy not available',
        message: 'Selected policy is not available to your organization'
      });
    }

    // Get user's organization context
    const { orgId } = getTykOrgContext(req);
    
    // Create key with policy instead of access_rights
    const keyData = {
      org_id: orgId,
      alias: name.trim(),
      apply_policies: [availablePolicy.tyk_policy_id], // Use Tyk policy ID
      meta_data: {
        description: description?.trim() || "",
        created_by: req.user.email,
        created_by_id: req.user.id,
        created_at: new Date().toISOString(),
        policy_name: availablePolicy.name,
        policy_id: availablePolicy.id,
        project: "tykbasic",
        user_type: "frontend_user"
      }
    };

    // Add expiration if provided
    if (expires) {
      keyData.expires = parseInt(expires);
    }

    console.log(`🌐 [${requestId}] Tyk key creation request:`, {
      alias: keyData.alias,
      org_id: keyData.org_id,
      policy_id: availablePolicy.tyk_policy_id,
      policy_name: availablePolicy.name
    });

    const response = await tykGatewayService.createKey(keyData, orgId);

    // Store policy reference in database
    await UserCredentials.create({
      user_id: req.user.id,
      organization_id: req.user.organization_id,
      credential_type: 'api_key',
      name: name.trim(),
      description: description?.trim() || null,
      tyk_key_id: response.key,
      tyk_key_hash: response.key_hash,
      tyk_policy_id: availablePolicy.tyk_policy_id,
      policy_id: availablePolicy.id
    });

    // Audit log
    await AuditLog.create({
      user_id: req.user.id,
      organization_id: req.user.organization_id,
      action: 'CREATE',
      resource_type: 'api_key',
      resource_id: response.key_hash || response.key,
      details: {
        key_name: name,
        policy_name: availablePolicy.name,
        policy_id: availablePolicy.id
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      status: 'success'
    });

    res.status(201).json({
      success: true,
      message: 'API key created successfully',
      data: {
        key: response.key,
        key_hash: response.key_hash || response.key,
        name: name,
        description: description || '',
        policy: {
          id: availablePolicy.id,
          name: availablePolicy.name,
          description: availablePolicy.description
        },
        security_notice: 'This key will only be displayed once. Save it securely.'
      }
    });

  } catch (error) {
    console.error(`❌ [${requestId}] Policy-based key creation failed:`, error);
    res.status(500).json({
      error: 'Key creation failed',
      message: error.message
    });
  }
});
```

### Phase 3: Frontend Updates

#### 3.1 Policy Management Component

**File**: `frontend/src/components/PolicyManagement.js`
```javascript
import React, { useState, useEffect } from 'react';

const PolicyManagement = () => {
  const [policies, setPolicies] = useState([]);
  const [availableApis, setAvailableApis] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadPolicies = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/policies', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (result.success) {
        setPolicies(result.data);
      }
    } catch (error) {
      console.error('Failed to load policies:', error);
    }
  };

  return (
    <div className="policy-management">
      <div className="header">
        <h2>🛡️ Policy Management</h2>
        <button onClick={() => setShowCreateModal(true)}>
          Create Policy
        </button>
      </div>
      
      <div className="policies-grid">
        {policies.map(policy => (
          <div key={policy.id} className="policy-card">
            <h3>{policy.name}</h3>
            <p>{policy.description}</p>
            <div className="policy-stats">
              <span>Rate: {policy.rate_limit} requests per {policy.rate_per}s</span>
              <span>APIs: {policy.api_count}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PolicyManagement;
```

#### 3.2 Updated Key Creation Modal

**File**: `frontend/src/components/dashboard/KeyCreationModal.js` (Complete replacement)
```javascript
import React, { useState, useEffect } from 'react';

const KeyCreationModal = ({ isOpen, onClose, onKeyCreated }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    policy_id: '',
    expires: ''
  });
  const [availablePolicies, setAvailablePolicies] = useState([]);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadAvailablePolicies();
    }
  }, [isOpen]);

  const loadAvailablePolicies = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/policies/available', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (result.success) {
        setAvailablePolicies(result.data);
      }
    } catch (error) {
      console.error('Failed to load policies:', error);
      setError('Failed to load available policies');
    }
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handlePolicySelection = (e) => {
    const policyId = e.target.value;
    const policy = availablePolicies.find(p => p.id === parseInt(policyId));
    setFormData({ ...formData, policy_id: policyId });
    setSelectedPolicy(policy);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const keyData = {
        name: formData.name,
        description: formData.description,
        policy_id: parseInt(formData.policy_id)
      };

      if (formData.expires) {
        keyData.expires = new Date(formData.expires).getTime() / 1000;
      }

      const token = localStorage.getItem('token');
      const response = await fetch('/api/tyk/keys', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(keyData)
      });

      if (response.ok) {
        const result = await response.json();
        onKeyCreated(result.data, formData, selectedPolicy);
        handleClose();
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(`Failed to create key: ${errorData.message || response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to create key:', error);
      setError('Network error while creating key');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({ name: '', description: '', policy_id: '', expires: '' });
    setSelectedPolicy(null);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>🔑 Create API Key</h2>
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="key-creation-form">
          {error && <div className="error-message">⚠️ {error}</div>}

          <div className="form-section">
            <h3>Basic Information</h3>
            
            <div className="form-group">
              <label htmlFor="name">Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g., Mobile App Key, Analytics Service Key"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Optional description for this key"
                rows="3"
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Access Policy *</h3>
            <div className="form-group">
              <label htmlFor="policy_id">Select Access Policy</label>
              <select
                id="policy_id"
                name="policy_id"
                value={formData.policy_id}
                onChange={handlePolicySelection}
                required
              >
                <option value="">-- Select a policy --</option>
                {availablePolicies.map(policy => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name} - {policy.description}
                  </option>
                ))}
              </select>
            </div>

            {selectedPolicy && (
              <div className="policy-preview">
                <h4>Policy Details:</h4>
                <p><strong>Rate Limit:</strong> {selectedPolicy.rate_limit} requests per {selectedPolicy.rate_per} seconds</p>
                <p><strong>Quota:</strong> {selectedPolicy.quota_max === -1 ? 'Unlimited' : selectedPolicy.quota_max}</p>
                <p><strong>APIs:</strong> {selectedPolicy.api_count || 0} APIs included</p>
              </div>
            )}
          </div>

          <div className="form-section">
            <h3>Optional Settings</h3>
            <div className="form-group">
              <label htmlFor="expires">Expiration Date</label>
              <input
                type="datetime-local"
                id="expires"
                name="expires"
                value={formData.expires}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={handleClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" disabled={loading || !formData.policy_id}>
              {loading ? 'Creating...' : 'Create Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default KeyCreationModal;
```

### Phase 4: Database Models

**File**: `backend/models/Policy.js`
```javascript
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Policy = sequelize.define('Policy', {
  name: { type: DataTypes.STRING, allowNull: false },
  description: DataTypes.TEXT,
  created_by_user_id: { type: DataTypes.INTEGER, allowNull: false },
  owner_organization_id: { type: DataTypes.INTEGER, allowNull: false },
  target_organization_id: DataTypes.INTEGER,
  tyk_policy_id: { type: DataTypes.STRING, unique: true, allowNull: false },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  rate_limit: { type: DataTypes.INTEGER, defaultValue: 1000 },
  rate_per: { type: DataTypes.INTEGER, defaultValue: 60 },
  quota_max: { type: DataTypes.INTEGER, defaultValue: -1 },
  quota_renewal_rate: { type: DataTypes.INTEGER, defaultValue: 3600 },
  policy_data: DataTypes.JSONB,
  tags: DataTypes.ARRAY(DataTypes.STRING)
}, {
  tableName: 'policies',
  underscored: true
});

module.exports = Policy;
```

---

## Implementation Timeline (Simplified)

### Week 1: Database & Models
- Create database tables
- Implement models
- Basic PolicyService

### Week 2: Backend Routes
- Policy management routes
- Update key creation route
- Remove old access_rights logic

### Week 3: Frontend Policy Management
- PolicyManagement component
- Policy creation interface

### Week 4: Updated Key Creation
- Replace KeyCreationModal with policy selection
- Remove API selection interface
- Testing and refinement

---

## Benefits of Direct Implementation

1. **Faster Development**: No complex migration logic
2. **Cleaner Codebase**: Single approach, no legacy support
3. **Immediate Value**: Users get the improved experience right away
4. **Simplified Testing**: Only need to test one approach
5. **Better Architecture**: Built for the target use case from day one

This direct approach gets you to the desired state faster and with less complexity since you're still in PoC mode. 