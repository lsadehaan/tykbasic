import React, { useState, useEffect } from 'react';
import './KeyCreationModal.css';

const KeyCreationModal = ({ isOpen, onClose, onKeyCreated }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    policy_id: '',
    expires: '' // Optional expiration
  });
  
  const [policies, setPolicies] = useState([]);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadPolicies();
    }
  }, [isOpen]);

  const loadPolicies = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/policies/available', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const policyList = data.data || [];
        setPolicies(policyList);
        console.log('📋 Loaded available policies for key creation:', policyList.length);
      } else {
        console.error('Failed to load policies:', response.statusText);
        setError('Failed to load available policies');
      }
    } catch (error) {
      console.error('Failed to load policies:', error);
      setError('Failed to load policies');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // When policy is selected, store the policy object for display
    if (name === 'policy_id') {
      const policy = policies.find(p => p.id === parseInt(value));
      setSelectedPolicy(policy);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Validation: require policy selection
      if (!formData.policy_id) {
        setError('Please select a policy for this key.');
        return;
      }

      const keyData = {
        name: formData.name,
        description: formData.description,
        policy_id: parseInt(formData.policy_id)
      };

      // Add expiration if specified
      if (formData.expires) {
        keyData.expires = new Date(formData.expires).getTime() / 1000;
      }

      console.log('🔑 Creating policy-based key with data:', keyData);

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
        console.log('✅ Policy-based key created:', result);
        
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
    setFormData({
      name: '',
      description: '',
      policy_id: '',
      expires: ''
    });
    setSelectedPolicy(null);
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

          {/* Policy Selection */}
          <div className="form-section">
            <h3>Access Policy</h3>
            <div className="policy-selection">
              {policies.length === 0 ? (
                <div className="no-policies">
                  <p>📝 No policies are available for your organization.</p>
                  <p>Contact your administrator to create access policies.</p>
                </div>
              ) : (
                <div className="form-group">
                  <label htmlFor="policy_id">Select Policy *</label>
                  <select
                    id="policy_id"
                    name="policy_id"
                    value={formData.policy_id}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">Choose a policy...</option>
                    {policies.map(policy => (
                      <option key={policy.id} value={policy.id}>
                        {policy.name} ({policy.api_count} APIs)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Policy Details */}
              {selectedPolicy && (
                <div className="policy-details">
                  <h4>Policy Details</h4>
                  <div className="policy-info">
                    <div className="policy-info-row">
                      <span className="label">Name:</span>
                      <span className="value">{selectedPolicy.name}</span>
                    </div>
                    {selectedPolicy.description && (
                      <div className="policy-info-row">
                        <span className="label">Description:</span>
                        <span className="value">{selectedPolicy.description}</span>
                      </div>
                    )}
                    <div className="policy-info-row">
                      <span className="label">API Access:</span>
                      <span className="value">{selectedPolicy.api_count} API(s)</span>
                    </div>
                    <div className="policy-info-row">
                      <span className="label">Rate Limit:</span>
                      <span className="value">
                        {selectedPolicy.rate_limit} requests per {selectedPolicy.rate_per} seconds
                      </span>
                    </div>
                    {selectedPolicy.quota_max > 0 && (
                      <div className="policy-info-row">
                        <span className="label">Quota:</span>
                        <span className="value">
                          {selectedPolicy.quota_max} requests per {Math.floor(selectedPolicy.quota_renewal_rate / 3600)} hour(s)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
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
                {/* Expiration */}
                <div className="advanced-subsection">
                  <h4>Key Expiration</h4>
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

                {/* Policy Information */}
                <div className="advanced-subsection">
                  <h4>About Policy-Based Keys</h4>
                  <div className="info-box">
                    <p>🔒 Policy-based keys inherit their access rights and rate limits from the selected policy.</p>
                    <p>📋 Policies are managed by administrators and define which APIs can be accessed and at what rates.</p>
                    <p>🔧 Contact your administrator if you need access to additional APIs or different rate limits.</p>
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
              disabled={loading || !formData.policy_id}
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