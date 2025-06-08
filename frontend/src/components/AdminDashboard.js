import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Dashboard data
  const [statistics, setStatistics] = useState(null);
  const [users, setUsers] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [emailWhitelist, setEmailWhitelist] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  // Pagination and filtering
  const [usersPage, setUsersPage] = useState(1);
  const [userFilters, setUserFilters] = useState({
    search: '',
    role: '',
    status: ''
  });

  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);

  // Email whitelist form state
  const [newPattern, setNewPattern] = useState('');
  const [newDescription, setNewDescription] = useState('');

  // Email configuration state
  const [emailConfig, setEmailConfig] = useState({
    service: 'gmail', // gmail, smtp, sendgrid, mailgun, brevo
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    fromEmail: '',
    fromName: 'TykBasic',
    enabled: false
  });

  // useEffect must be before any early returns
  useEffect(() => {
    if (user && ['super_admin', 'admin'].includes(user.role)) {
      if (activeTab === 'dashboard') {
        fetchStatistics();
      } else if (activeTab === 'users') {
        fetchUsers(usersPage, userFilters);
      } else if (activeTab === 'pending') {
        fetchPendingUsers();
      } else if (activeTab === 'whitelist') {
        fetchEmailWhitelist();
      } else if (activeTab === 'settings') {
        fetchEmailConfig();
      }
    }
  }, [activeTab, usersPage, userFilters, user, token]);

  // Check if user is admin (early return after useEffect)
  if (!user || !['super_admin', 'admin'].includes(user.role)) {
    return (
      <div className="admin-access-denied">
        <h2>Access Denied</h2>
        <p>You don't have permission to access the admin dashboard.</p>
      </div>
    );
  }

  const fetchStatistics = async () => {
    try {
      const response = await fetch('/api/admin/statistics', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStatistics(data.statistics);
      }
    } catch (err) {
      console.error('Failed to fetch statistics:', err);
    }
  };

  const fetchUsers = async (page = 1, filters = {}) => {
    try {
      const params = new URLSearchParams({
        page,
        limit: 20,
        ...filters
      });

      const response = await fetch(`/api/admin/users?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const fetchPendingUsers = async () => {
    try {
      const response = await fetch('/api/admin/pending-users', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setPendingUsers(data.pendingUsers);
      }
    } catch (err) {
      console.error('Failed to fetch pending users:', err);
    }
  };

  const fetchEmailWhitelist = async () => {
    try {
      const response = await fetch('/api/admin/email-whitelist', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setEmailWhitelist(data.patterns);
      }
    } catch (err) {
      console.error('Failed to fetch email whitelist:', err);
    }
  };

  const approveUser = async (pendingUserId, role = 'user') => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`/api/admin/pending-users/${pendingUserId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(`User approved successfully with role: ${role}`);
        fetchPendingUsers();
        fetchUsers();
        fetchStatistics();
      } else {
        setError(data.message || 'Failed to approve user');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const rejectUser = async (pendingUserId, reason = '') => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`/api/admin/pending-users/${pendingUserId}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('User registration rejected');
        fetchPendingUsers();
        fetchStatistics();
      } else {
        setError(data.message || 'Failed to reject user');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const addEmailPattern = async (pattern, description) => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/admin/email-whitelist', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pattern, description })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Email pattern added successfully');
        fetchEmailWhitelist();
      } else {
        setError(data.message || 'Failed to add email pattern');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEmailConfig = async () => {
    try {
      const response = await fetch('/api/admin/email-config', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setEmailConfig(data.config || emailConfig);
      }
    } catch (err) {
      console.error('Failed to fetch email config:', err);
    }
  };

  const saveEmailConfig = async () => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/admin/email-config', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailConfig)
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Email configuration saved successfully');
      } else {
        setError(data.message || 'Failed to save email configuration');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const testEmailConfig = async () => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/admin/email-config/test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          ...emailConfig, 
          testEmail: user.email 
        })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Test email sent successfully! Check your inbox.');
      } else {
        setError(data.message || 'Failed to send test email');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const updateUser = async (userId, updates) => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('User updated successfully');
        fetchUsers(usersPage, userFilters);
        setShowUserModal(false);
        setSelectedUser(null);
      } else {
        setError(data.message || 'Failed to update user');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderDashboard = () => (
    <div className="admin-section">
      <h2>System Overview</h2>
      {statistics ? (
        <div className="stats-grid">
          <div className="stat-card">
            <h3>Users</h3>
            <div className="stat-number">{statistics.users.total}</div>
            <div className="stat-detail">
              {statistics.users.active} active, {statistics.users.inactive} inactive
            </div>
          </div>
          <div className="stat-card">
            <h3>Pending Approvals</h3>
            <div className="stat-number">{statistics.users.pending}</div>
            <div className="stat-detail">Awaiting admin approval</div>
          </div>
          <div className="stat-card">
            <h3>Organizations</h3>
            <div className="stat-number">{statistics.organizations.total}</div>
            <div className="stat-detail">Total organizations</div>
          </div>
          <div className="stat-card">
            <h3>Recent Activity</h3>
            <div className="stat-number">{statistics.activity.recentLogins}</div>
            <div className="stat-detail">
              {statistics.activity.failedLogins} failed attempts (24h)
            </div>
          </div>
        </div>
      ) : (
        <div className="loading">Loading statistics...</div>
      )}
    </div>
  );

  const renderUsers = () => (
    <div className="admin-section">
      <div className="section-header">
        <h2>User Management</h2>
        <div className="filters">
          <input
            type="text"
            placeholder="Search users..."
            value={userFilters.search}
            onChange={(e) => setUserFilters({...userFilters, search: e.target.value})}
          />
          <select
            value={userFilters.role}
            onChange={(e) => setUserFilters({...userFilters, role: e.target.value})}
          >
            <option value="">All Roles</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
          <select
            value={userFilters.status}
            onChange={(e) => setUserFilters({...userFilters, status: e.target.value})}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="users-table">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td>{user.fullName}</td>
                <td>{user.email}</td>
                <td>
                  <span className={`role-badge role-${user.role}`}>
                    {user.role.replace('_', ' ')}
                  </span>
                </td>
                <td>
                  <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                </td>
                <td>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      setSelectedUser(user);
                      setShowUserModal(true);
                    }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderPendingUsers = () => (
    <div className="admin-section">
      <h2>Pending User Approvals</h2>
      {pendingUsers.length === 0 ? (
        <div className="no-data">No pending user approvals</div>
      ) : (
        <div className="pending-users-grid">
          {pendingUsers.map(user => (
            <div key={user.id} className="pending-user-card">
              <div className="user-info">
                <h3>{user.fullName}</h3>
                <p>{user.email}</p>
                <p>Organization: {user.organization?.displayName || 'Default'}</p>
                <p>Requested: {new Date(user.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="user-actions">
                <select 
                  className="role-select"
                  defaultValue="user"
                  id={`role-${user.id}`}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  {user.role === 'super_admin' && <option value="super_admin">Super Admin</option>}
                </select>
                <button
                  className="btn btn-success"
                  onClick={() => {
                    const role = document.getElementById(`role-${user.id}`).value;
                    approveUser(user.id, role);
                  }}
                  disabled={isLoading}
                >
                  Approve
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => rejectUser(user.id)}
                  disabled={isLoading}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderEmailWhitelist = () => {
    const handleAddPattern = () => {
      if (newPattern.trim()) {
        addEmailPattern(newPattern.trim(), newDescription.trim());
        setNewPattern('');
        setNewDescription('');
      }
    };

    return (
      <div className="admin-section">
        <h2>Email Whitelist Management</h2>
        
        <div className="add-pattern-form">
          <h3>Add New Pattern</h3>
          <div className="form-group">
            <input
              type="text"
              placeholder="Email pattern (e.g., *@company.com)"
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
            <button
              className="btn btn-primary"
              onClick={handleAddPattern}
              disabled={!newPattern.trim() || isLoading}
            >
              Add Pattern
            </button>
          </div>
        </div>

        <div className="patterns-list">
          {emailWhitelist.length === 0 ? (
            <div className="no-data">No email patterns configured</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Pattern</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {emailWhitelist.map(pattern => (
                  <tr key={pattern.id}>
                    <td><code>{pattern.pattern}</code></td>
                    <td>{pattern.description || '-'}</td>
                    <td>
                      <span className={`status-badge ${pattern.isActive ? 'active' : 'inactive'}`}>
                        {pattern.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{new Date(pattern.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button className="btn btn-sm btn-secondary">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="admin-section">
      <h2>Email Configuration</h2>
      
      <div className="settings-form">
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={emailConfig.enabled}
              onChange={(e) => setEmailConfig({...emailConfig, enabled: e.target.checked})}
            />
            Enable Email Sending
          </label>
        </div>

        <div className="form-group">
          <label>Email Service</label>
          <select
            value={emailConfig.service}
            onChange={(e) => setEmailConfig({...emailConfig, service: e.target.value})}
          >
            <option value="gmail">Gmail</option>
            <option value="smtp">Custom SMTP</option>
            <option value="sendgrid">SendGrid</option>
            <option value="mailgun">Mailgun</option>
            <option value="brevo">Brevo (Sendinblue)</option>
          </select>
        </div>

        {emailConfig.service === 'gmail' && (
          <>
            <div className="email-service-info">
              <h4>Gmail Setup Instructions:</h4>
              <ol>
                <li>Enable 2-Factor Authentication on your Gmail account</li>
                <li>Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">App Passwords</a></li>
                <li>Generate an app password for "Mail"</li>
                <li>Use your Gmail email and the app password below</li>
              </ol>
            </div>
            
            <div className="form-group">
              <label>Gmail Address</label>
              <input
                type="email"
                value={emailConfig.username}
                onChange={(e) => setEmailConfig({...emailConfig, username: e.target.value})}
                placeholder="your-email@gmail.com"
              />
            </div>

            <div className="form-group">
              <label>App Password</label>
              <input
                type="password"
                value={emailConfig.password}
                onChange={(e) => setEmailConfig({...emailConfig, password: e.target.value})}
                placeholder="Your Gmail app password"
              />
            </div>
          </>
        )}

        {emailConfig.service === 'smtp' && (
          <>
            <div className="form-group">
              <label>SMTP Host</label>
              <input
                type="text"
                value={emailConfig.host}
                onChange={(e) => setEmailConfig({...emailConfig, host: e.target.value})}
                placeholder="smtp.your-provider.com"
              />
            </div>

            <div className="form-group">
              <label>SMTP Port</label>
              <input
                type="number"
                value={emailConfig.port}
                onChange={(e) => setEmailConfig({...emailConfig, port: parseInt(e.target.value)})}
                placeholder="587"
              />
            </div>

            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={emailConfig.secure}
                  onChange={(e) => setEmailConfig({...emailConfig, secure: e.target.checked})}
                />
                Use SSL/TLS
              </label>
            </div>

            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={emailConfig.username}
                onChange={(e) => setEmailConfig({...emailConfig, username: e.target.value})}
                placeholder="SMTP username"
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={emailConfig.password}
                onChange={(e) => setEmailConfig({...emailConfig, password: e.target.value})}
                placeholder="SMTP password"
              />
            </div>
          </>
        )}

        {(emailConfig.service === 'sendgrid' || emailConfig.service === 'mailgun' || emailConfig.service === 'brevo') && (
          <>
            <div className="email-service-info">
              <h4>{emailConfig.service.charAt(0).toUpperCase() + emailConfig.service.slice(1)} Setup:</h4>
              <p>Get your API key from your {emailConfig.service} dashboard and enter it below.</p>
              {emailConfig.service === 'brevo' && <p><a href="https://www.brevo.com/" target="_blank" rel="noopener noreferrer">Sign up for Brevo</a> - 300 emails/day free</p>}
              {emailConfig.service === 'sendgrid' && <p><a href="https://sendgrid.com/" target="_blank" rel="noopener noreferrer">Sign up for SendGrid</a> - 100 emails/day free</p>}
              {emailConfig.service === 'mailgun' && <p><a href="https://www.mailgun.com/" target="_blank" rel="noopener noreferrer">Sign up for Mailgun</a> - 100 emails/day free</p>}
            </div>

            <div className="form-group">
              <label>API Key</label>
              <input
                type="password"
                value={emailConfig.password}
                onChange={(e) => setEmailConfig({...emailConfig, password: e.target.value})}
                placeholder={`Your ${emailConfig.service} API key`}
              />
            </div>
          </>
        )}

        <div className="form-group">
          <label>From Email</label>
          <input
            type="email"
            value={emailConfig.fromEmail}
            onChange={(e) => setEmailConfig({...emailConfig, fromEmail: e.target.value})}
            placeholder="noreply@yourdomain.com"
          />
        </div>

        <div className="form-group">
          <label>From Name</label>
          <input
            type="text"
            value={emailConfig.fromName}
            onChange={(e) => setEmailConfig({...emailConfig, fromName: e.target.value})}
            placeholder="TykBasic"
          />
        </div>

        <div className="settings-actions">
          <button
            className="btn btn-primary"
            onClick={saveEmailConfig}
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : 'Save Configuration'}
          </button>
          
          <button
            className="btn btn-secondary"
            onClick={testEmailConfig}
            disabled={isLoading || !emailConfig.enabled}
          >
            {isLoading ? 'Testing...' : 'Send Test Email'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>Admin Dashboard</h1>
        <div className="admin-user-info">
          Welcome, {user.firstName} ({user.role.replace('_', ' ')})
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <span className="alert-icon">⚠️</span>
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          <span className="alert-icon">✅</span>
          {success}
        </div>
      )}

      <div className="admin-tabs">
        <button
          className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          className={`tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          Users
        </button>
        <button
          className={`tab ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          Pending Approvals
          {pendingUsers.length > 0 && (
            <span className="tab-badge">{pendingUsers.length}</span>
          )}
        </button>
        <button
          className={`tab ${activeTab === 'whitelist' ? 'active' : ''}`}
          onClick={() => setActiveTab('whitelist')}
        >
          Email Whitelist
        </button>
        <button
          className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'users' && renderUsers()}
        {activeTab === 'pending' && renderPendingUsers()}
        {activeTab === 'whitelist' && renderEmailWhitelist()}
        {activeTab === 'settings' && renderSettings()}
      </div>

      {/* User Edit Modal */}
      {showUserModal && selectedUser && (
        <UserEditModal
          user={selectedUser}
          onClose={() => {
            setShowUserModal(false);
            setSelectedUser(null);
          }}
          onUpdate={updateUser}
          currentUserRole={user.role}
          isLoading={isLoading}
        />
      )}
    </div>
  );
};

// User Edit Modal Component
const UserEditModal = ({ user, onClose, onUpdate, currentUserRole, isLoading }) => {
  const [formData, setFormData] = useState({
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    role: user.role || 'user',
    isActive: user.isActive !== undefined ? user.isActive : true,
    resetFailedAttempts: false,
    forcePasswordReset: false
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onUpdate(user.id, formData);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>Edit User: {user.email}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>First Name</label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({...formData, firstName: e.target.value})}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Last Name</label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData({...formData, lastName: e.target.value})}
              required
            />
          </div>
          
          {currentUserRole === 'super_admin' && (
            <div className="form-group">
              <label>Role</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({...formData, role: e.target.value})}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
          )}
          
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
              />
              Account Active
            </label>
          </div>
          
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={formData.resetFailedAttempts}
                onChange={(e) => setFormData({...formData, resetFailedAttempts: e.target.checked})}
              />
              Reset Failed Login Attempts
            </label>
          </div>
          
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={formData.forcePasswordReset}
                onChange={(e) => setFormData({...formData, forcePasswordReset: e.target.checked})}
              />
              Force Password Reset on Next Login
            </label>
          </div>
          
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? 'Updating...' : 'Update User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminDashboard; 