import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './PolicyManagement.css';

const PolicyManagement = () => {
  const { user, loading: authLoading } = useAuth();
  const [policies, setPolicies] = useState([]);
  const [apis, setApis] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [userRole, setUserRole] = useState('');

  useEffect(() => {
    if (user) {
      loadPolicies();
      loadApis();
      loadUserRole();
    }
  }, [user]);

  const loadUserRole = () => {
    const userData = user || {};
    console.log('User data from AuthContext:', userData);
    setUserRole(userData.role || '');
    
    // Load organizations if super admin
    if (userData.role === 'super_admin') {
      console.log('User is super_admin, loading organizations...');
      loadOrganizations();
    } else {
      console.log('User is not super_admin, role:', userData.role);
    }
  };

  const loadPolicies = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/policies/created', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setPolicies(data.data || []);
      } else {
        // Try to get the actual error message from the backend
        const errorData = await response.json().catch(() => ({}));
        console.error('Backend error response:', errorData);
        setError(`Failed to load policies: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to load policies:', error);
      setError('Network error while loading policies');
    } finally {
      setLoading(false);
    }
  };

  const loadApis = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/tyk/apis', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setApis(data.data || []);
      }
    } catch (error) {
      console.error('Failed to load APIs:', error);
    }
  };

  const loadOrganizations = async () => {
    try {
      console.log('Loading organizations...');
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/organizations', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Organizations API response:', data);
        setOrganizations(data.organizations || []);
      } else {
        console.error('Failed to load organizations:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Failed to load organizations:', error);
    }
  };

  const handleDeletePolicy = async (policyId) => {
    if (!window.confirm('Are you sure you want to delete this policy? This action cannot be undone.')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/policies/${policyId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setPolicies(prev => prev.filter(p => p.id !== policyId));
        setError(null);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(`Failed to delete policy: ${errorData.message || response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to delete policy:', error);
      setError('Network error while deleting policy');
    }
  };

  const handleEditPolicy = (policy) => {
    setSelectedPolicy(policy);
    setShowEditModal(true);
  };

  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  // Show loading while auth is loading
  if (authLoading) {
    return (
      <div className="policy-management">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading user data...</p>
        </div>
      </div>
    );
  }

  // Show error if not authenticated
  if (!user) {
    return (
      <div className="policy-management">
        <div className="error-banner">
          <span>⚠️ Please log in to access policy management</span>
        </div>
      </div>
    );
  }

  if (loading && policies.length === 0) {
    return (
      <div className="policy-management">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading policies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="policy-management">
      <div className="page-header">
        <div className="header-content">
          <h1>📋 Policy Management</h1>
          <p>Create and manage access policies for API keys</p>
        </div>
        <div className="header-actions">
          <button 
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            ➕ Create Policy
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Policy List */}
      <div className="policy-list-section">
        {policies.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3>No Policies Created</h3>
            <p>Create your first policy to start managing API access for your organization.</p>
            <button 
              className="btn btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              Create First Policy
            </button>
          </div>
        ) : (
          <div className="policy-grid">
            {policies.map(policy => (
              <div key={policy.id} className="policy-card">
                <div className="policy-header">
                  <h3>{policy.name}</h3>
                  <div className="policy-status">
                    <span className={`status-badge ${policy.is_active ? 'active' : 'inactive'}`}>
                      {policy.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>

                <div className="policy-content">
                  {policy.description && (
                    <p className="policy-description">{policy.description}</p>
                  )}

                  <div className="policy-stats">
                    <div className="stat">
                      <span className="label">APIs:</span>
                      <span className="value">{policy.api_count}</span>
                    </div>
                    <div className="stat">
                      <span className="label">Rate Limit:</span>
                      <span className="value">{policy.rate_limit}/{policy.rate_per}s</span>
                    </div>
                    {policy.quota_max > 0 && (
                      <div className="stat">
                        <span className="label">Quota:</span>
                        <span className="value">{policy.quota_max}</span>
                      </div>
                    )}
                  </div>

                  <div className="policy-meta">
                    <div className="meta-item">
                      <span className="label">Created:</span>
                      <span className="value">{formatDateTime(policy.created_at)}</span>
                    </div>
                    {policy.creator && (
                      <div className="meta-item">
                        <span className="label">By:</span>
                        <span className="value">{policy.creator.email}</span>
                      </div>
                    )}
                    {policy.is_cross_org && (
                      <div className="meta-item">
                        <span className="cross-org-badge">🌐 Cross-Organization</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="policy-actions">
                  <button 
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleEditPolicy(policy)}
                  >
                    ✏️ Edit
                  </button>
                  <button 
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDeletePolicy(policy.id)}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Policy Modal */}
      {showCreateModal && (
        <PolicyCreateModal
          apis={apis}
          organizations={organizations}
          userRole={userRole}
          onClose={() => setShowCreateModal(false)}
          onPolicyCreated={(newPolicy) => {
            setPolicies(prev => [newPolicy, ...prev]);
            setShowCreateModal(false);
            setError(null);
          }}
          onError={setError}
        />
      )}

      {/* Edit Policy Modal */}
      {showEditModal && selectedPolicy && (
        <PolicyEditModal
          policy={selectedPolicy}
          apis={apis}
          organizations={organizations}
          userRole={userRole}
          onClose={() => {
            setShowEditModal(false);
            setSelectedPolicy(null);
          }}
          onPolicyUpdated={(updatedPolicy) => {
            setPolicies(prev => prev.map(p => p.id === updatedPolicy.id ? updatedPolicy : p));
            setShowEditModal(false);
            setSelectedPolicy(null);
            setError(null);
          }}
          onError={setError}
        />
      )}
    </div>
  );
};

// Policy Create Modal Component
const PolicyCreateModal = ({ apis, organizations, userRole, onClose, onPolicyCreated, onError }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    rate_limit: 1000,
    rate_per: 60,
    quota_max: '',
    quota_renewal_rate: 3600,
    target_organization_id: '',
    tags: []
  });
  const [selectedApis, setSelectedApis] = useState([]);
  const [selectedOrganizations, setSelectedOrganizations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [availableApis, setAvailableApis] = useState(apis);
  const [loadingApis, setLoadingApis] = useState(false);

  // Load APIs when target organization changes
  const loadApisForOrganization = async (targetOrgId) => {
    if (!targetOrgId) {
      // If no target org, use all APIs passed from parent
      setAvailableApis(apis);
      return;
    }

    setLoadingApis(true);
    try {
      const token = localStorage.getItem('token');
      const url = `/api/tyk/apis?org_id=${encodeURIComponent(targetOrgId)}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAvailableApis(data.data || []);
        // Clear selected APIs since they might not be valid for the new organization
        setSelectedApis([]);
      } else {
        console.error('Failed to load APIs for organization:', targetOrgId);
        onError('Failed to load APIs for selected organization');
      }
    } catch (error) {
      console.error('Error loading APIs for organization:', error);
      onError('Network error while loading APIs');
    } finally {
      setLoadingApis(false);
    }
  };

  // Initialize with all APIs
  React.useEffect(() => {
    setAvailableApis(apis);
  }, [apis]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // If target organization changes, reload APIs
    if (name === 'target_organization_id') {
      loadApisForOrganization(value);
    }
  };

  const handleApiSelection = (api, isSelected) => {
    if (isSelected) {
      setSelectedApis(prev => [...prev, {
        api_id: api.api_id,
        api_name: api.name,
        versions: ['Default']
      }]);
    } else {
      setSelectedApis(prev => prev.filter(a => a.api_id !== api.api_id));
    }
  };

  const handleOrganizationSelection = (orgId, isSelected) => {
    if (isSelected) {
      setSelectedOrganizations(prev => [...prev, orgId]);
    } else {
      setSelectedOrganizations(prev => prev.filter(id => id !== orgId));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const policyData = {
        ...formData,
        rate_limit: parseInt(formData.rate_limit),
        rate_per: parseInt(formData.rate_per),
        quota_max: formData.quota_max ? parseInt(formData.quota_max) : -1,
        quota_renewal_rate: parseInt(formData.quota_renewal_rate),
        target_organization_id: formData.target_organization_id || null,
        api_accesses: selectedApis,
        available_to_organizations: selectedOrganizations.length > 0 ? selectedOrganizations : []
      };

      const token = localStorage.getItem('token');
      const response = await fetch('/api/policies', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(policyData)
      });

      if (response.ok) {
        const result = await response.json();
        onPolicyCreated(result.data);
      } else {
        const errorData = await response.json().catch(() => ({}));
        onError(`Failed to create policy: ${errorData.message || response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to create policy:', error);
      onError('Network error while creating policy');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content large">
        <div className="modal-header">
          <h2>➕ Create New Policy</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="policy-form">
          {/* Basic Information */}
          <div className="form-section">
            <h3>Basic Information</h3>
            
            <div className="form-group">
              <label htmlFor="name">Policy Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g., Mobile App Access, Partner API Access"
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
                placeholder="Describe what this policy provides access to"
                rows="3"
              />
            </div>

            {userRole === 'super_admin' && organizations.length > 0 && (
              <div className="form-group">
                <label htmlFor="target_organization_id">Target Organization (Optional)</label>
                <select
                  id="target_organization_id"
                  name="target_organization_id"
                  value={formData.target_organization_id}
                  onChange={handleInputChange}
                >
                  <option value="">Same as owner organization</option>
                  {organizations.map(org => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
                <small>Super admins can create policies for other organizations</small>
              </div>
            )}
          </div>

          {/* API Selection */}
          <div className="form-section">
            <h3>API Access</h3>
            {formData.target_organization_id && (
              <p className="section-description">
                Showing APIs from: <strong>{organizations.find(org => org.id === formData.target_organization_id)?.name || 'Selected Organization'}</strong>
              </p>
            )}
            <div className="api-selection">
              {loadingApis ? (
                <p className="loading-apis">Loading APIs...</p>
              ) : availableApis.length === 0 ? (
                <p className="no-apis">
                  {formData.target_organization_id 
                    ? 'No APIs available in the selected organization. APIs must be created in that organization first.'
                    : 'No APIs available. Create APIs first to include them in policies.'
                  }
                </p>
              ) : (
                <div className="api-grid">
                  {availableApis.map(api => (
                    <div key={api.api_id} className="api-item">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedApis.some(a => a.api_id === api.api_id)}
                          onChange={(e) => handleApiSelection(api, e.target.checked)}
                        />
                        <div className="api-info">
                          <span className="api-name">{api.name}</span>
                          <span className="api-path">{api.proxy?.listen_path}</span>
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Organization Access - only for super admins */}
          {userRole === 'super_admin' && organizations.length > 0 && (
            <div className="form-section">
              <h3>Organization Access</h3>
              <p className="section-description">
                Select which organizations can use this policy when creating keys. 
                If none are selected, the policy will be available only to your organization.
              </p>
              <div className="organization-selection">
                <div className="org-grid">
                  {organizations.map(org => (
                    <div key={org.id} className="org-item">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedOrganizations.includes(org.id)}
                          onChange={(e) => handleOrganizationSelection(org.id, e.target.checked)}
                        />
                        <div className="org-info">
                          <span className="org-name">{org.display_name || org.name}</span>
                          <span className="org-domain">{org.domain}</span>
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Rate Limiting */}
          <div className="form-section">
            <h3>Rate Limiting</h3>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="rate_limit">Rate Limit (requests)</label>
                <input
                  type="number"
                  id="rate_limit"
                  name="rate_limit"
                  value={formData.rate_limit}
                  onChange={handleInputChange}
                  min="1"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="rate_per">Per (seconds)</label>
                <input
                  type="number"
                  id="rate_per"
                  name="rate_per"
                  value={formData.rate_per}
                  onChange={handleInputChange}
                  min="1"
                  required
                />
              </div>
            </div>
          </div>

          {/* Quota Settings */}
          <div className="form-section">
            <h3>Quota Settings</h3>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="quota_max">Max Requests</label>
                <input
                  type="number"
                  id="quota_max"
                  name="quota_max"
                  value={formData.quota_max}
                  onChange={handleInputChange}
                  min="0"
                  placeholder="Leave empty for unlimited"
                />
              </div>
              <div className="form-group">
                <label htmlFor="quota_renewal_rate">Renewal Period (seconds)</label>
                <input
                  type="number"
                  id="quota_renewal_rate"
                  name="quota_renewal_rate"
                  value={formData.quota_renewal_rate}
                  onChange={handleInputChange}
                  min="1"
                />
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading || !formData.name}
              className="btn btn-primary"
            >
              {loading ? 'Creating Policy...' : '➕ Create Policy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Policy Edit Modal Component (simplified for now)
const PolicyEditModal = ({ policy, onClose, onPolicyUpdated, onError }) => {
  const [formData, setFormData] = useState({
    name: policy.name,
    description: policy.description || '',
    is_active: policy.is_active
  });
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/policies/${policy.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        const result = await response.json();
        onPolicyUpdated(result.data);
      } else {
        const errorData = await response.json().catch(() => ({}));
        onError(`Failed to update policy: ${errorData.message || response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to update policy:', error);
      onError('Network error while updating policy');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>✏️ Edit Policy</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="policy-form">
          <div className="form-group">
            <label htmlFor="name">Policy Name *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
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
              rows="3"
            />
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="is_active"
                checked={formData.is_active}
                onChange={handleInputChange}
              />
              <span>Policy is active</span>
            </label>
          </div>

          <div className="form-actions">
            <button type="button" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading || !formData.name}
              className="btn btn-primary"
            >
              {loading ? 'Updating Policy...' : '✏️ Update Policy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PolicyManagement; 