import React, { useState } from 'react';
import './KeySuccessModal.css';

const KeySuccessModal = ({ isOpen, onClose, keyData, formData, selectedApis }) => {
  const [copiedField, setCopiedField] = useState(null);

  if (!isOpen || !keyData) return null;

  // Extract key information
  const keyValue = keyData.key || keyData.keyId || 'Generated';
  const keyHash = keyData.key_hash || keyData.hash || 'N/A';
  const status = keyData.status || 'unknown';

  const copyToClipboard = async (text, fieldName) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const testApiPath = selectedApis.length > 0 ? selectedApis[0].proxy?.listen_path : '/your-api-path/';
  const gatewayUrl = 'http://localhost:8080';

  const curlExample = `curl -H "Authorization: ${keyValue}" \\
     ${gatewayUrl}${testApiPath}get`;

  const httpExample = `GET ${testApiPath}get HTTP/1.1
Host: localhost:8080
Authorization: ${keyValue}
Content-Type: application/json`;

  return (
    <div className="modal-overlay">
      <div className="modal-content key-success-modal">
        <div className="modal-header">
          <h2>🎉 API Key Created Successfully!</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="key-success-content">
          <div className="success-message">
            <p>✅ Your API key has been created and is ready to use!</p>
          </div>

          <div className="key-details">
            <div className="detail-section">
              <h3>🔐 API Key Information</h3>
              
              <div className="copy-field">
                <label>API Key (Use this for authentication):</label>
                <div className="copy-input-group">
                  <input 
                    type="text" 
                    value={keyValue} 
                    readOnly 
                    className="copy-input"
                  />
                  <button 
                    className="copy-btn"
                    onClick={() => copyToClipboard(keyValue, 'key')}
                  >
                    {copiedField === 'key' ? '✓ Copied!' : '📋 Copy'}
                  </button>
                </div>
              </div>

              <div className="copy-field">
                <label>Key Hash (Internal ID):</label>
                <div className="copy-input-group">
                  <input 
                    type="text" 
                    value={keyHash} 
                    readOnly 
                    className="copy-input"
                  />
                  <button 
                    className="copy-btn"
                    onClick={() => copyToClipboard(keyHash, 'hash')}
                  >
                    {copiedField === 'hash' ? '✓ Copied!' : '📋 Copy'}
                  </button>
                </div>
              </div>
            </div>

            <div className="detail-section">
              <h3>⚙️ Configuration</h3>
              <div className="config-grid">
                <div className="config-item">
                  <span className="config-label">Rate Limit:</span>
                  <span className="config-value">{formData.rate} requests / {formData.per} seconds</span>
                </div>
                <div className="config-item">
                  <span className="config-label">Quota:</span>
                  <span className="config-value">{formData.allowance} total requests</span>
                </div>
                <div className="config-item">
                  <span className="config-label">Organization:</span>
                  <span className="config-value">{formData.org_id}</span>
                </div>
                <div className="config-item">
                  <span className="config-label">APIs Accessible:</span>
                  <span className="config-value">{selectedApis.length} API(s)</span>
                </div>
                <div className="config-item">
                  <span className="config-label">Status:</span>
                  <span className="config-value status-active">{status}</span>
                </div>
              </div>
            </div>

            <div className="detail-section">
              <h3>🔗 API Access</h3>
              <div className="api-list">
                {selectedApis.map(api => (
                  <div key={api.api_id} className="api-access-item">
                    <span className="api-name">{api.name}</span>
                    <span className="api-path">{api.proxy?.listen_path}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="detail-section">
              <h3>🧪 Usage Examples</h3>
              
              <div className="example-section">
                <h4>cURL Command:</h4>
                <div className="copy-field">
                  <div className="copy-input-group">
                    <textarea 
                      value={curlExample}
                      readOnly 
                      className="copy-textarea"
                      rows="2"
                    />
                    <button 
                      className="copy-btn"
                      onClick={() => copyToClipboard(curlExample, 'curl')}
                    >
                      {copiedField === 'curl' ? '✓ Copied!' : '📋 Copy'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="example-section">
                <h4>HTTP Request:</h4>
                <div className="copy-field">
                  <div className="copy-input-group">
                    <textarea 
                      value={httpExample}
                      readOnly 
                      className="copy-textarea"
                      rows="4"
                    />
                    <button 
                      className="copy-btn"
                      onClick={() => copyToClipboard(httpExample, 'http')}
                    >
                      {copiedField === 'http' ? '✓ Copied!' : '📋 Copy'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="important-note">
              <h4>⚠️ Important Notes:</h4>
              <ul>
                <li>🔐 <strong>Keep this API key secure</strong> - treat it like a password</li>
                <li>🚀 <strong>Deploy changes</strong> to activate the key if you created new APIs</li>
                <li>📊 <strong>Monitor usage</strong> to track rate limits and quotas</li>
                <li>🔄 <strong>Test the endpoints</strong> to ensure everything works correctly</li>
              </ul>
            </div>
          </div>

          <div className="modal-actions">
            <button onClick={onClose} className="btn primary">
              Got it! 🎉
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KeySuccessModal; 