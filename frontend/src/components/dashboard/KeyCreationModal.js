import React, { useState, useEffect } from 'react';
import './KeyCreationModal.css';

const KeyCreationModal = ({ isOpen, onClose, onKeyCreated }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    org_id: 'default',
    rate: 1000,
    per: 60,
    allowance: 1000,
    quota_max: '',
    quota_renewal_rate: 3600,
    expires: '' // Optional expiration
  });
  
  const [apis, setApis] = useState([]);
  const [selectedApis, setSelectedApis] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadApis();
    }
  }, [isOpen]);

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
        const apiList = data.data || [];
        setApis(apiList);
        console.log('📋 Loaded APIs for key creation:', apiList.length);
      }
    } catch (error) {
      console.error('Failed to load APIs:', error);
      setError('Failed to load APIs');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleApiSelection = (api, isSelected) => {
    if (isSelected) {
      setSelectedApis(prev => [...prev, api]);
    } else {
      setSelectedApis(prev => prev.filter(a => a.api_id !== api.api_id));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Validation: require at least one API to be selected
      if (selectedApis.length === 0) {
        setError('Please select at least one API to grant access to.');
        return;
      }

      // Build access rights from selected APIs
      const accessRights = {};
      selectedApis.forEach(api => {
        accessRights[api.api_id] = {
          api_id: api.api_id,
          api_name: api.name,
          versions: ["Default"]
        };
      });

      const keyData = {
        name: formData.name,
        description: formData.description,
        org_id: formData.org_id,
        allowance: parseInt(formData.allowance),
        rate: parseInt(formData.rate),
        per: parseInt(formData.per),
        access_rights: accessRights
      };

      // Add quota settings if provided
      if (formData.quota_max && parseInt(formData.quota_max) > 0) {
        keyData.quota_max = parseInt(formData.quota_max);
        keyData.quota_renewal_rate = parseInt(formData.quota_renewal_rate) || 3600;
      }

      // Add expiration if specified
      if (formData.expires) {
        keyData.expires = new Date(formData.expires).getTime() / 1000;
      }

      console.log('🔑 Creating key with data:', keyData);

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
        console.log('✅ Key created:', result);
        
        onKeyCreated(result.data, formData, selectedApis);
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
    setFormData({
      name: '',
      description: '',
      org_id: 'default',
      rate: 1000,
      per: 60,
      allowance: 1000,
      quota_max: '',
      quota_renewal_rate: 3600,
      expires: ''
    });
    setSelectedApis([]);
    setShowAdvanced(false);
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
          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}

          {/* Basic Information */}
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

          {/* API Selection */}
          <div className="form-section">
            <h3>API Access</h3>
            <div className="api-selection">
              {apis.length === 0 ? (
                <p className="no-apis">No APIs available. Create an API first!</p>
              ) : (
                apis.map(api => (
                  <div key={api.api_id} className="api-item">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedApis.some(a => a.api_id === api.api_id)}
                        onChange={(e) => handleApiSelection(api, e.target.checked)}
                      />
                      <span className="api-name">{api.name}</span>
                      <span className="api-path">{api.proxy?.listen_path}</span>
                    </label>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Advanced Settings - Expandable */}
          <div className="form-section">
            <div className="advanced-header" onClick={() => setShowAdvanced(!showAdvanced)}>
              <h3>Advanced Settings</h3>
              <span className={`expand-icon ${showAdvanced ? 'expanded' : ''}`}>▼</span>
            </div>
            
            {showAdvanced && (
              <div className="advanced-content">
                {/* Rate Limiting */}
                <div className="advanced-subsection">
                  <h4>Rate Limiting</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="rate">Rate Limit (requests)</label>
                      <input
                        type="number"
                        id="rate"
                        name="rate"
                        value={formData.rate}
                        onChange={handleInputChange}
                        min="1"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="per">Per (seconds)</label>
                      <input
                        type="number"
                        id="per"
                        name="per"
                        value={formData.per}
                        onChange={handleInputChange}
                        min="1"
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="allowance">Allowance (burst capacity)</label>
                    <input
                      type="number"
                      id="allowance"
                      name="allowance"
                      value={formData.allowance}
                      onChange={handleInputChange}
                      min="1"
                      required
                    />
                    <small>Number of requests that can be made in a burst</small>
                  </div>
                </div>

                {/* Quota Settings */}
                <div className="advanced-subsection">
                  <h4>Quota Settings</h4>
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

                {/* Expiration */}
                <div className="advanced-subsection">
                  <h4>Expiration</h4>
                  <div className="form-group">
                    <label htmlFor="expires">Expires At</label>
                    <input
                      type="datetime-local"
                      id="expires"
                      name="expires"
                      value={formData.expires}
                      onChange={handleInputChange}
                    />
                    <small>Leave empty for no expiration</small>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="form-actions">
            <button type="button" onClick={handleClose} disabled={loading}>
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading || selectedApis.length === 0}
              className="primary"
            >
              {loading ? 'Creating Key...' : '🔑 Create Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default KeyCreationModal; 