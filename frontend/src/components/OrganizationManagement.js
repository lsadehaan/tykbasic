import React, { useState, useEffect } from 'react';
import '../styles/OrganizationManagement.css';

const OrganizationManagement = () => {
  const [organizations, setOrganizations] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Form states
  const [orgForm, setOrgForm] = useState({
    name: '',
    displayName: '',
    description: '',
    domain: '',
    autoAssignDomains: [],
    contactEmail: '',
    contactPhone: '',
    address: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: ''
    },
    settings: {
      require_admin_approval: true,
      require_email_verification: true,
      require_2fa: false,
      default_user_role: 'user'
    },
    defaultRateLimits: {
      allowance: 10000,
      rate: 1000,
      per: 60,
      quota_max: 100000,
      quota_renewal_rate: 3600
    }
  });

  const [newDomain, setNewDomain] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  
  // Confirmation dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    type: 'transfer', // 'transfer' or 'remove'
    title: '',
    message: '',
    confirmText: '',
    confirmAction: null,
    user: null,
    organization: null
  });

  useEffect(() => {
    fetchOrganizations();
    fetchUsers();
  }, []);

  const fetchOrganizations = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/organizations', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch organizations');
      }

      const data = await response.json();
      setOrganizations(data.organizations || []);
    } catch (error) {
      console.error('Fetch organizations error:', error);
      setError('Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Fetch users error:', error);
    }
  };

  const fetchOrganizationDetails = async (orgId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/organizations/${orgId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch organization details');
      }

      const data = await response.json();
      setSelectedOrg(data.organization);
    } catch (error) {
      console.error('Fetch organization details error:', error);
      setError('Failed to fetch organization details');
    }
  };

  const handleCreateOrganization = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/organizations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(orgForm)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create organization');
      }

      setSuccess('Organization created successfully');
      setShowCreateForm(false);
      resetForm();
      fetchOrganizations();
    } catch (error) {
      console.error('Create organization error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateOrganization = async (orgId, updates) => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/organizations/${orgId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to update organization');
      }

      setSuccess('Organization updated successfully');
      fetchOrganizations();
    } catch (error) {
      console.error('Update organization error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOrganization = async (orgId, orgName) => {
    if (!window.confirm(`Are you sure you want to delete organization "${orgName}"? This action cannot be undone.`)) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/organizations/${orgId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to delete organization');
      }

      setSuccess(`Organization "${orgName}" deleted successfully`);
      fetchOrganizations();
    } catch (error) {
      console.error('Delete organization error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUserToOrg = async (orgId) => {
    if (!selectedUserId) {
      setError('Please select a user');
      return;
    }

    // Find the selected user to get their current organization info
    const selectedUser = availableUsers.find(user => user.id === selectedUserId);
    const currentOrgName = selectedUser?.organization?.displayName || selectedUser?.organization?.name || 'Default';
    const targetOrgName = selectedOrg?.displayName || selectedOrg?.name;

    // Check if this is a transfer or just an addition
    const isTransfer = selectedUser?.organization?.id && selectedUser.organization.id !== orgId;

    // Show confirmation dialog
    setConfirmDialog({
      type: 'transfer',
      title: isTransfer ? 'Confirm User Transfer' : 'Confirm User Assignment',
      message: isTransfer 
        ? `This will move "${selectedUser.fullName}" from "${currentOrgName}" to "${targetOrgName}".`
        : `This will assign "${selectedUser.fullName}" to "${targetOrgName}".`,
      confirmText: isTransfer ? 'Transfer User' : 'Assign User',
      confirmAction: () => performUserTransfer(orgId, selectedUser, currentOrgName, targetOrgName, isTransfer),
      user: selectedUser,
      organization: selectedOrg
    });
    setShowConfirmDialog(true);
  };

  const performUserTransfer = async (orgId, selectedUser, currentOrgName, targetOrgName, isTransfer) => {
    setLoading(true);
    setError('');
    setSuccess('');
    setShowConfirmDialog(false);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/organizations/${orgId}/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId: selectedUser.id })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to add user to organization');
      }

      // Show success message with transfer information
      const successMessage = isTransfer
        ? `✅ User "${selectedUser.fullName}" successfully moved from "${currentOrgName}" to "${targetOrgName}"`
        : `✅ User "${selectedUser.fullName}" successfully assigned to "${targetOrgName}"`;
      
      setSuccess(successMessage);
      setSelectedUserId('');
      fetchOrganizations();
      fetchUsers();
      // Refresh organization details to show updated user list
      if (selectedOrg) {
        fetchOrganizationDetails(orgId);
      }
    } catch (error) {
      console.error('Add user to organization error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveUserFromOrg = async (orgId, userId, userEmail) => {
    // Show confirmation dialog for user removal
    const orgName = selectedOrg?.displayName || selectedOrg?.name || 'this organization';
    
    setConfirmDialog({
      type: 'remove',
      title: 'Confirm User Removal',
      message: `Are you sure you want to remove "${userEmail}" from "${orgName}"?`,
      confirmText: 'Remove User',
      confirmAction: () => performUserRemoval(orgId, userId, userEmail),
      user: { email: userEmail },
      organization: selectedOrg
    });
    setShowConfirmDialog(true);
  };

  const performUserRemoval = async (orgId, userId, userEmail) => {
    setLoading(true);
    setError('');
    setSuccess('');
    setShowConfirmDialog(false);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/organizations/${orgId}/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to remove user from organization');
      }

      setSuccess(`✅ User "${userEmail}" successfully removed from organization`);
      fetchOrganizations();
      fetchUsers();
      // Refresh organization details to show updated user list
      if (selectedOrg) {
        fetchOrganizationDetails(orgId);
      }
    } catch (error) {
      console.error('Remove user from organization error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const addDomain = () => {
    if (newDomain.trim() && !orgForm.autoAssignDomains.includes(newDomain.trim())) {
      setOrgForm({
        ...orgForm,
        autoAssignDomains: [...orgForm.autoAssignDomains, newDomain.trim()]
      });
      setNewDomain('');
    }
  };

  const removeDomain = (domainToRemove) => {
    setOrgForm({
      ...orgForm,
      autoAssignDomains: orgForm.autoAssignDomains.filter(domain => domain !== domainToRemove)
    });
  };

  const resetForm = () => {
    setOrgForm({
      name: '',
      displayName: '',
      description: '',
      domain: '',
      autoAssignDomains: [],
      contactEmail: '',
      contactPhone: '',
      address: {
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: ''
      },
      settings: {
        require_admin_approval: true,
        require_email_verification: true,
        require_2fa: false,
        default_user_role: 'user'
      },
      defaultRateLimits: {
        allowance: 10000,
        rate: 1000,
        per: 60,
        quota_max: 100000,
        quota_renewal_rate: 3600
      }
    });
    setNewDomain('');
  };

  const filteredOrganizations = organizations.filter(org => {
    const matchesSearch = org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         org.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         org.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'active' && org.isActive) ||
                         (statusFilter === 'inactive' && !org.isActive);
    
    return matchesSearch && matchesStatus;
  });

  // Get users not in any organization or available for reassignment
  const availableUsers = users.filter(user => 
    !selectedOrg?.users?.some(orgUser => orgUser.id === user.id)
  );

  if (loading && organizations.length === 0) {
    return <div className="loading">Loading organizations...</div>;
  }

  return (
    <div className="organization-management">
      <div className="organization-header">
        <h2>Organization Management</h2>
        <button 
          className="btn btn-primary"
          onClick={() => setShowCreateForm(true)}
          disabled={loading}
        >
          Create Organization
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Filters */}
      <div className="organization-filters">
        <div className="filter-group">
          <input
            type="text"
            placeholder="Search organizations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-group">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="status-filter"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Create Organization Form */}
      {showCreateForm && (
        <div className="modal-overlay">
          <div className="modal-content organization-form-modal">
            <div className="modal-header">
              <h3>Create New Organization</h3>
              <button 
                className="close-btn"
                onClick={() => {
                  setShowCreateForm(false);
                  resetForm();
                }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateOrganization} className="organization-form">
              <div className="form-section">
                <h4>Basic Information</h4>
                <div className="form-group">
                  <label htmlFor="name">Organization Name *</label>
                  <input
                    type="text"
                    id="name"
                    value={orgForm.name}
                    onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                    required
                    placeholder="e.g., acme-corp"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="displayName">Display Name</label>
                  <input
                    type="text"
                    id="displayName"
                    value={orgForm.displayName}
                    onChange={(e) => setOrgForm({ ...orgForm, displayName: e.target.value })}
                    placeholder="e.g., ACME Corporation"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="description">Description</label>
                  <textarea
                    id="description"
                    value={orgForm.description}
                    onChange={(e) => setOrgForm({ ...orgForm, description: e.target.value })}
                    placeholder="Organization description..."
                    rows="3"
                  />
                </div>
              </div>

              <div className="form-section">
                <h4>Auto-Assignment Domains</h4>
                <p className="form-help">
                  Users with these email domains will be automatically assigned to this organization.
                  Use * for wildcards (e.g., *.company.com)
                </p>
                
                <div className="domain-input-group">
                  <input
                    type="text"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    placeholder="e.g., company.com or *.company.com"
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addDomain())}
                  />
                  <button type="button" onClick={addDomain} disabled={!newDomain.trim()}>
                    Add Domain
                  </button>
                </div>

                <div className="domain-list">
                  {orgForm.autoAssignDomains.map((domain, index) => (
                    <div key={index} className="domain-tag">
                      <span>{domain}</span>
                      <button type="button" onClick={() => removeDomain(domain)}>×</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-section">
                <h4>Contact Information</h4>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="contactEmail">Contact Email</label>
                    <input
                      type="email"
                      id="contactEmail"
                      value={orgForm.contactEmail}
                      onChange={(e) => setOrgForm({ ...orgForm, contactEmail: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="contactPhone">Contact Phone</label>
                    <input
                      type="tel"
                      id="contactPhone"
                      value={orgForm.contactPhone}
                      onChange={(e) => setOrgForm({ ...orgForm, contactPhone: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h4>Organization Settings</h4>
                <div className="checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={orgForm.settings.require_admin_approval}
                      onChange={(e) => setOrgForm({
                        ...orgForm,
                        settings: { ...orgForm.settings, require_admin_approval: e.target.checked }
                      })}
                    />
                    Require admin approval for new users
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={orgForm.settings.require_email_verification}
                      onChange={(e) => setOrgForm({
                        ...orgForm,
                        settings: { ...orgForm.settings, require_email_verification: e.target.checked }
                      })}
                    />
                    Require email verification
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={orgForm.settings.require_2fa}
                      onChange={(e) => setOrgForm({
                        ...orgForm,
                        settings: { ...orgForm.settings, require_2fa: e.target.checked }
                      })}
                    />
                    Require two-factor authentication
                  </label>
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowCreateForm(false);
                    resetForm();
                  }}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Creating...' : 'Create Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Organizations List */}
      <div className="organizations-list">
        {filteredOrganizations.length === 0 ? (
          <div className="no-data">
            {searchTerm || statusFilter !== 'all' 
              ? 'No organizations match your filters'
              : 'No organizations found'
            }
          </div>
        ) : (
          filteredOrganizations.map(org => (
            <div key={org.id} className="organization-card">
              <div className="org-header">
                <div className="org-info">
                  <h3>{org.displayName || org.name}</h3>
                  <p className="org-name">ID: {org.name}</p>
                  {org.description && <p className="org-description">{org.description}</p>}
                  <div className={`org-status ${org.isActive ? 'active' : 'inactive'}`}>
                    {org.isActive ? 'Active' : 'Inactive'}
                  </div>
                </div>
                <div className="org-actions">
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      if (selectedOrg?.id === org.id) {
                        setSelectedOrg(null);
                      } else {
                        fetchOrganizationDetails(org.id);
                      }
                    }}
                  >
                    {selectedOrg?.id === org.id ? 'Hide Details' : 'View Details'}
                  </button>
                  {org.name !== 'default' && (
                    <button
                      className="btn btn-danger"
                      onClick={() => handleDeleteOrganization(org.id, org.name)}
                      disabled={loading}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              <div className="org-stats">
                <div className="stat">
                  <span className="stat-label">Users:</span>
                  <span className="stat-value">{org.userCount}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">APIs:</span>
                  <span className="stat-value">{org.apiCount}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Auto-Assign Domains:</span>
                  <span className="stat-value">{org.autoAssignDomains?.length || 0}</span>
                </div>
              </div>

              {org.autoAssignDomains && org.autoAssignDomains.length > 0 && (
                <div className="org-domains">
                  <strong>Auto-Assign Domains:</strong>
                  <div className="domain-tags">
                    {org.autoAssignDomains.map((domain, index) => (
                      <span key={index} className="domain-tag">{domain}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Expanded Details */}
              {selectedOrg?.id === org.id && (
                <div className="org-details">
                  <div className="org-detail-section">
                    <h4>Organization Users</h4>
                    {selectedOrg.users && selectedOrg.users.length > 0 ? (
                      <div className="user-list">
                        {selectedOrg.users.map(user => (
                          <div key={user.id} className="user-item">
                            <div className="user-info">
                              <span className="user-name">{user.fullName}</span>
                              <span className="user-email">{user.email}</span>
                              <span className={`user-role ${user.role}`}>{user.role}</span>
                            </div>
                            <button
                              className="btn btn-small btn-danger"
                              onClick={() => handleRemoveUserFromOrg(org.id, user.id, user.email)}
                              disabled={loading}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="no-users">No users in this organization</p>
                    )}

                    <div className="add-user-section">
                      <h5>Add User to Organization</h5>
                      <div className="add-user-form">
                        <select
                          value={selectedUserId}
                          onChange={(e) => setSelectedUserId(e.target.value)}
                        >
                          <option value="">Select a user...</option>
                          {availableUsers.map(user => (
                            <option key={user.id} value={user.id}>
                              {user.fullName} ({user.email})
                            </option>
                          ))}
                        </select>
                        <button
                          className="btn btn-primary"
                          onClick={() => handleAddUserToOrg(org.id)}
                          disabled={loading || !selectedUserId}
                        >
                          Add User
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="org-detail-section">
                    <h4>Contact Information</h4>
                    <div className="contact-info">
                      {org.contactEmail && (
                        <p><strong>Email:</strong> {org.contactEmail}</p>
                      )}
                      {org.contactPhone && (
                        <p><strong>Phone:</strong> {org.contactPhone}</p>
                      )}
                      {org.address && (
                        <div>
                          <strong>Address:</strong>
                          <div className="address">
                            {Object.values(org.address).filter(Boolean).join(', ') || 'Not provided'}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="org-detail-section">
                    <h4>Settings</h4>
                    <div className="settings-grid">
                      <div className="setting-item">
                        <strong>Admin Approval Required:</strong>
                        <span className={org.settings?.require_admin_approval ? 'enabled' : 'disabled'}>
                          {org.settings?.require_admin_approval ? 'Yes' : 'No'}
                        </span>
                      </div>
                      <div className="setting-item">
                        <strong>Email Verification Required:</strong>
                        <span className={org.settings?.require_email_verification ? 'enabled' : 'disabled'}>
                          {org.settings?.require_email_verification ? 'Yes' : 'No'}
                        </span>
                      </div>
                      <div className="setting-item">
                        <strong>2FA Required:</strong>
                        <span className={org.settings?.require_2fa ? 'enabled' : 'disabled'}>
                          {org.settings?.require_2fa ? 'Yes' : 'No'}
                        </span>
                      </div>
                      <div className="setting-item">
                        <strong>Default User Role:</strong>
                        <span>{org.settings?.default_user_role || 'user'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>{confirmDialog.title}</h3>
              <button 
                className="modal-close" 
                onClick={() => setShowConfirmDialog(false)}
                disabled={loading}
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <div className="confirm-dialog-content">
                {confirmDialog.type === 'transfer' && confirmDialog.user && (
                  <div className="transfer-details">
                    <div className="user-info">
                      <h4>👤 User Details</h4>
                      <p><strong>Name:</strong> {confirmDialog.user.fullName}</p>
                      <p><strong>Email:</strong> {confirmDialog.user.email}</p>
                      <p><strong>Current Role:</strong> {confirmDialog.user.role}</p>
                    </div>
                    {confirmDialog.organization && (
                      <div className="organization-info">
                        <h4>🏢 Target Organization</h4>
                        <p><strong>Name:</strong> {confirmDialog.organization.displayName || confirmDialog.organization.name}</p>
                        <p><strong>Current Users:</strong> {confirmDialog.organization.userCount}</p>
                        {confirmDialog.organization.description && (
                          <p><strong>Description:</strong> {confirmDialog.organization.description}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="confirm-message">
                  <p>{confirmDialog.message}</p>
                  {confirmDialog.type === 'transfer' && (
                    <div className="transfer-warning">
                      <p>⚠️ This action will immediately update the user's organization membership.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowConfirmDialog(false)}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn ${confirmDialog.type === 'remove' ? 'btn-danger' : 'btn-primary'}`}
                onClick={confirmDialog.confirmAction}
                disabled={loading}
              >
                {loading ? 'Processing...' : confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrganizationManagement; 