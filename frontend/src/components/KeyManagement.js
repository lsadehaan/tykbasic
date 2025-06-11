import React, { useState, useEffect } from 'react';
import '../styles/KeyManagement.css';
import KeyCreationModal from './dashboard/KeyCreationModal';
import KeySuccessModal from './dashboard/KeySuccessModal';

const KeyManagement = () => {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdKeyData, setCreatedKeyData] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/tyk/keys', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch keys');
      }

      const data = await response.json();
      console.log('🔍 Raw keys response from backend:', data);
      console.log('🔍 data.data type:', typeof data.data);
      console.log('🔍 data.data structure:', JSON.stringify(data.data, null, 2));
      
      // Handle different possible response structures from Tyk
      let keysArray = [];
      if (data.data) {
        if (Array.isArray(data.data)) {
          keysArray = data.data;
          console.log('🔍 Case 1: data.data is array, length:', keysArray.length);
        } else if (data.data.keys && Array.isArray(data.data.keys)) {
          keysArray = data.data.keys;
          console.log('🔍 Case 2: data.data.keys is array, length:', keysArray.length);
        } else if (typeof data.data === 'object' && data.data !== null) {
          // Check if it's an object with key IDs as properties
          const dataKeys = Object.keys(data.data);
          console.log('🔍 Case 3: data.data is object with keys:', dataKeys);
          
          if (dataKeys.length > 0) {
            // Convert object with key IDs as properties to array
            keysArray = Object.entries(data.data).map(([keyId, keyData]) => {
              console.log('🔍 Processing key:', keyId, 'data:', keyData);
              return {
                key_hash: keyId,
                alias: keyData.alias || keyData.meta?.description || `Key ${keyId.substring(0, 8)}...`,
                ...keyData
              };
            });
            console.log('🔍 Converted object to array, length:', keysArray.length);
          }
        } else {
          console.log('🔍 Case 4: Unknown data structure');
        }
      } else {
        console.log('🔍 No data.data found');
      }
      
      console.log('🔑 Final processed keys array:', keysArray);
      if (keysArray.length > 0) {
        console.log('🔑 Sample key structure:', keysArray[0]);
      }
      setKeys(keysArray);
    } catch (err) {
      console.error('Error fetching keys:', err);
      setError(err.message);
      setKeys([]); // Ensure we always have an array
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteKey = async (key) => {
    try {
      const token = localStorage.getItem('token');
      const keyHash = key.key_hash || key.hash || key.keyId;
      
      console.log('🗑️ Attempting to delete key:', { key, keyHash });
      
      if (!keyHash) {
        throw new Error('No key hash found for deletion');
      }
      
      const response = await fetch(`/api/tyk/keys/${keyHash}?hashed=true`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to delete key');
      }

      // Remove from local state
      setKeys(keys.filter(k => {
        const kHash = k.key_hash || k.hash || k.keyId;
        return kHash !== keyHash;
      }));
      setShowDeleteConfirm(false);
      setKeyToDelete(null);
      console.log('✅ Key deleted successfully');
    } catch (err) {
      console.error('Error deleting key:', err);
      setError(err.message);
    }
  };

  const handleToggleKeyStatus = async (key) => {
    try {
      const token = localStorage.getItem('token');
      const keyHash = key.key_hash || key.hash || key.keyId;
      
      console.log('🔄 Attempting to toggle key status:', { key, keyHash, currentActive: key.active });
      
      if (!keyHash) {
        throw new Error('No key hash found for status update');
      }
      
      // In Tyk, the field that controls active status is 'is_inactive'
      // If key is currently active (active !== false), we want to deactivate it (is_inactive = true)
      const newIsInactive = key.active !== false; // If currently active, set is_inactive to true
      
      // Prepare the key data - only send essential fields to avoid conflicts
      const updatedKeyData = {
        allowance: key.allowance || 1000,
        rate: key.rate || 100,
        per: key.per || 60,
        expires: key.expires || 0,
        quota_max: key.quota_max || -1,
        quota_renews: key.quota_renews || 1,
        quota_remaining: key.quota_remaining || key.quota_max || -1,
        quota_renewal_rate: key.quota_renewal_rate || 60,
        access_rights: key.access_rights || {},
        org_id: key.org_id || "default",
        meta: key.meta || {},
        is_inactive: newIsInactive
      };

      console.log('🔄 Sending update with is_inactive:', newIsInactive);

      const response = await fetch(`/api/tyk/keys/${keyHash}?hashed=true`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedKeyData)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to update key status');
      }

      // Update local state - set active to opposite of is_inactive
      setKeys(keys.map(k => {
        const kHash = k.key_hash || k.hash || k.keyId;
        return kHash === keyHash ? { ...k, active: !newIsInactive, is_inactive: newIsInactive } : k;
      }));

      console.log(`✅ Key ${!newIsInactive ? 'activated' : 'deactivated'} successfully`);
    } catch (err) {
      console.error('Error updating key status:', err);
      setError(err.message);
    }
  };

  const handleKeyCreated = (keyData, formData, selectedApis) => {
    console.log('🔑 Key created:', keyData);
    setCreatedKeyData({ keyData, formData, selectedApis });
    setShowSuccessModal(true);
    fetchKeys(); // Refresh the list
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      console.log('Copied to clipboard');
    });
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp * 1000); // Convert Unix timestamp
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const formatQuota = (quota) => {
    if (!quota) return 'No limit';
    const { remaining, renewal_rate } = quota;
    return `${remaining || 0} remaining (resets every ${renewal_rate || 0} seconds)`;
  };

  const filteredAndSortedKeys = (Array.isArray(keys) ? keys : [])
    .filter(key => {
      const matchesSearch = searchTerm === '' || 
        (key.alias && key.alias.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (key.key_hash && key.key_hash.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesStatus = filterStatus === 'all' || 
        (filterStatus === 'active' && key.active !== false) ||
        (filterStatus === 'inactive' && key.active === false);
      
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const aVal = a[sortBy] || 0;
      const bVal = b[sortBy] || 0;
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

  if (loading) {
    return (
      <div className="key-management">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading API keys...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="key-management">
      <div className="key-management-header">
        <div className="header-content">
          <h1>API Key Management</h1>
          <p>Manage and monitor your API keys and access tokens</p>
          <div className="security-notice">
            <span className="notice-icon">🔐</span>
            <span className="notice-text">
              <strong>Security Note:</strong> API keys are only shown once during creation. 
              Save them securely - if lost, you'll need to generate new ones.
            </span>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            ➕ Create API Key
          </button>
          <button className="btn btn-secondary" onClick={fetchKeys}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
          <button className="error-close" onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="key-management-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search keys by name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        
        <div className="filter-controls">
          <select 
            value={filterStatus} 
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Keys</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
          
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            className="sort-select"
          >
            <option value="created_at">Created Date</option>
            <option value="last_updated">Last Updated</option>
            <option value="alias">Name</option>
            <option value="rate">Rate Limit</option>
          </select>
          
          <button 
            className="sort-order-btn"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      <div className="keys-summary">
        <div className="summary-stat">
          <span className="summary-label">Total Keys:</span>
          <span className="summary-value">{Array.isArray(keys) ? keys.length : 0}</span>
        </div>
        <div className="summary-stat">
          <span className="summary-label">Active:</span>
          <span className="summary-value">{Array.isArray(keys) ? keys.filter(k => k.active !== false).length : 0}</span>
        </div>
        <div className="summary-stat">
          <span className="summary-label">Inactive:</span>
          <span className="summary-value">{Array.isArray(keys) ? keys.filter(k => k.active === false).length : 0}</span>
        </div>
        <div className="summary-stat">
          <span className="summary-label">Showing:</span>
          <span className="summary-value">{filteredAndSortedKeys.length}</span>
        </div>
      </div>

      {filteredAndSortedKeys.length === 0 ? (
                  <div className="empty-state">
          <div className="empty-icon">🔑</div>
          <h3>No API keys found</h3>
          <p>
            {searchTerm || filterStatus !== 'all' 
              ? 'Try adjusting your search or filter criteria'
              : 'API keys will appear here once created via the Tyk Gateway API'
            }
          </p>
          <small style={{ display: 'block', marginTop: '1rem', color: '#7f8c8d' }}>
            💡 Remember: API keys are only shown in full during creation. Save them securely!
          </small>
        </div>
      ) : (
        <div className="keys-grid">
          {filteredAndSortedKeys.map((key, index) => (
            <div key={key.key_hash || index} className="key-card">
              <div className="key-card-header">
                              <div className="key-title">
                <h3>
                  {key.alias || 
                   key.meta?.description || 
                   key.display_name ||
                   (key.key_hash ? `API Key ${key.key_hash.substring(0, 8)}` : 
                    key.id ? `API Key ${key.id.substring(0, 8)}` :
                    key.key ? `API Key ${key.key.substring(0, 8)}` :
                    `API Key ${index + 1}`)}
                </h3>
                <span className={`status-badge ${key.active !== false ? 'active' : 'inactive'}`}>
                  {key.active !== false ? 'Active' : 'Inactive'}
                </span>
              </div>
                <div className="key-actions">
                  <button 
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      setSelectedKey(key);
                      setShowDetails(true);
                    }}
                  >
                    👁️ Details
                  </button>
                  <button 
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleToggleKeyStatus(key)}
                  >
                    {key.active !== false ? '⏸️ Disable' : '▶️ Enable'}
                  </button>
                  <button 
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      setKeyToDelete(key);
                      setShowDeleteConfirm(true);
                    }}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>

              <div className="key-card-content">
                <div className="key-info-grid">
                  <div className="key-info-item">
                    <label>Key Hash (ID):</label>
                    <div className="key-value-with-copy">
                      <code className="key-hash">
                        {key.key_hash || key.hash || key.keyId || 'Unknown'}
                      </code>
                      <button 
                        className="copy-btn"
                        onClick={() => copyToClipboard(key.key_hash || key.hash || key.keyId || '')}
                        title="Copy key hash to clipboard"
                      >
                        📋
                      </button>
                    </div>
                    <small className="key-hash-note">
                      🔒 This is the secure hash identifier. The actual API key was provided only once during creation.
                    </small>
                  </div>

                  <div className="key-info-item">
                    <label>Rate Limit:</label>
                    <span>{key.rate || 0} requests per {key.per || 60} seconds</span>
                  </div>

                  <div className="key-info-item">
                    <label>Quota:</label>
                    <span>{formatQuota(key.quota)}</span>
                  </div>

                  <div className="key-info-item">
                    <label>Created:</label>
                    <span>{formatDate(key.created_at)}</span>
                  </div>

                  <div className="key-info-item">
                    <label>Access Policy:</label>
                    <span>
                      {key.apply_policies && key.apply_policies.length > 0
                        ? key.apply_policies.length === 1 
                          ? `Policy: ${key.apply_policies[0]}` 
                          : `${key.apply_policies.length} Policies`
                        : key.access_rights 
                        ? `Legacy: ${Object.keys(key.access_rights).length} APIs`
                        : 'No access configured'
                      }
                    </span>
                  </div>

                  <div className="key-info-item">
                    <label>Organization:</label>
                    <span>{key.org_id || 'default'}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Key Details Modal */}
      {showDetails && selectedKey && (
        <div className="modal-overlay" onClick={() => setShowDetails(false)}>
          <div className="modal-content key-details-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>API Key Details</h2>
              <button className="modal-close" onClick={() => setShowDetails(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="key-details-grid">
                <div className="detail-section">
                  <h3>Basic Information</h3>
                  <div className="detail-item">
                    <label>Name:</label>
                    <span>{selectedKey.alias || 'Unnamed Key'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Key Hash (ID):</label>
                    <div className="key-value-with-copy">
                      <code>{selectedKey.key_hash}</code>
                      <button onClick={() => copyToClipboard(selectedKey.key_hash)} title="Copy hash to clipboard">📋</button>
                    </div>
                    <small className="hash-explanation">
                      This hash serves as the unique identifier for validation purposes.
                    </small>
                  </div>
                  <div className="detail-item">
                    <label>Status:</label>
                    <span className={`status-badge ${selectedKey.active !== false ? 'active' : 'inactive'}`}>
                      {selectedKey.active !== false ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="detail-item">
                    <label>Organization:</label>
                    <span>{selectedKey.org_id || 'default'}</span>
                  </div>
                </div>

                <div className="detail-section">
                  <h3>Rate Limiting</h3>
                  <div className="detail-item">
                    <label>Rate:</label>
                    <span>{selectedKey.rate || 0} requests</span>
                  </div>
                  <div className="detail-item">
                    <label>Per:</label>
                    <span>{selectedKey.per || 60} seconds</span>
                  </div>
                  <div className="detail-item">
                    <label>Allowance:</label>
                    <span>{selectedKey.allowance || 0}</span>
                  </div>
                </div>

                <div className="detail-section">
                  <h3>Quota Information</h3>
                  {selectedKey.quota ? (
                    <>
                      <div className="detail-item">
                        <label>Max Requests:</label>
                        <span>{selectedKey.quota.max || 'Unlimited'}</span>
                      </div>
                      <div className="detail-item">
                        <label>Remaining:</label>
                        <span>{selectedKey.quota.remaining || 0}</span>
                      </div>
                      <div className="detail-item">
                        <label>Renewal Rate:</label>
                        <span>Every {selectedKey.quota.renewal_rate || 0} seconds</span>
                      </div>
                    </>
                  ) : (
                    <p>No quota limits configured</p>
                  )}
                </div>

                <div className="detail-section">
                  <h3>Access Policies & API Rights</h3>
                  {selectedKey.apply_policies && selectedKey.apply_policies.length > 0 ? (
                    <div className="policies-list">
                      <h4>Applied Policies:</h4>
                      {selectedKey.apply_policies.map((policyId, index) => (
                        <div key={index} className="policy-item">
                          <code>{policyId}</code>
                        </div>
                      ))}
                    </div>
                  ) : selectedKey.access_rights && Object.keys(selectedKey.access_rights).length > 0 ? (
                    <div className="legacy-access">
                      <h4>Legacy API Access Rights:</h4>
                      {Object.entries(selectedKey.access_rights).map(([apiId, rights]) => (
                        <div key={apiId} className="api-access-item">
                          <strong>{rights.api_name || apiId}</strong>
                          <div className="access-details">
                            <span>Versions: {rights.versions?.join(', ') || 'All'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>No access policies or API rights configured</p>
                  )}
                </div>

                <div className="detail-section">
                  <h3>Timestamps</h3>
                  <div className="detail-item">
                    <label>Created:</label>
                    <span>{formatDate(selectedKey.created_at)}</span>
                  </div>
                  <div className="detail-item">
                    <label>Last Updated:</label>
                    <span>{formatDate(selectedKey.last_updated)}</span>
                  </div>
                  {selectedKey.expires && (
                    <div className="detail-item">
                      <label>Expires:</label>
                      <span>{formatDate(selectedKey.expires)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn btn-secondary"
                onClick={() => handleToggleKeyStatus(selectedKey)}
              >
                {selectedKey.active !== false ? 'Disable Key' : 'Enable Key'}
              </button>
              <button 
                className="btn btn-danger"
                onClick={() => {
                  setKeyToDelete(selectedKey);
                  setShowDetails(false);
                  setShowDeleteConfirm(true);
                }}
              >
                Delete Key
              </button>
              <button className="btn btn-primary" onClick={() => setShowDetails(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Key Creation Modal */}
      <KeyCreationModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onKeyCreated={handleKeyCreated}
      />

      {/* Key Success Modal */}
      <KeySuccessModal
        isOpen={showSuccessModal}
        onClose={() => {
          setShowSuccessModal(false);
          setCreatedKeyData(null);
        }}
        keyData={createdKeyData?.keyData}
        formData={createdKeyData?.formData}
        selectedApis={createdKeyData?.selectedApis || []}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && keyToDelete && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirm Delete</h2>
              <button className="modal-close" onClick={() => setShowDeleteConfirm(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="delete-warning">
                <div className="warning-icon">⚠️</div>
                <h3>Are you sure you want to delete this API key?</h3>
                <p>
                  <strong>{keyToDelete.alias || 'Unnamed Key'}</strong><br/>
                  Key Hash: <code>{keyToDelete.key_hash}</code>
                </p>
                <p className="warning-text">
                  This action cannot be undone. Applications using this key will lose access immediately.
                </p>
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-danger" 
                onClick={() => handleDeleteKey(keyToDelete)}
              >
                Delete Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KeyManagement; 