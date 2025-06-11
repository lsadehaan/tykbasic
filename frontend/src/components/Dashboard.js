import React, { useState, useEffect } from 'react';
import '../styles/Dashboard.css';
import KeyCreationModal from './dashboard/KeyCreationModal';
import KeySuccessModal from './KeySuccessModal';

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalAPIs: 0,
    totalKeys: 0,
    activeKeys: 0,
    totalUsers: 1
  });
  const [apis, setApis] = useState([]);
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showKeySuccess, setShowKeySuccess] = useState(false);
  const [newKeyData, setNewKeyData] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const [apisResponse, keysResponse] = await Promise.all([
        fetch('/api/tyk/apis', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/tyk/keys', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (!apisResponse.ok || !keysResponse.ok) {
        throw new Error('Failed to fetch data');
      }

      const apisData = await apisResponse.json();
      const keysData = await keysResponse.json();

      setApis(apisData.data || []);
      setKeys(keysData.data || []);
      
      // Update stats
      setStats({
        totalAPIs: apisData.data?.length || 0,
        totalKeys: keysData.data?.length || 0,
        activeKeys: keysData.data?.filter(key => key.active !== false).length || 0,
        totalUsers: 1
      });

      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGatewayReload = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/tyk/gateway/reload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to deploy changes');
      }

      console.log('✅ Changes deployed successfully');
      // Refresh data after deployment
      setTimeout(fetchData, 1000);
    } catch (err) {
      console.error('Error deploying changes:', err);
      setError(err.message);
    }
  };

  const handleKeyCreated = (keyData) => {
    setNewKeyData(keyData);
    setShowKeyModal(false);
    setShowKeySuccess(true);
    fetchData(); // Refresh the dashboard
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="dashboard">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="header-content">
          <h1>TykBasic Dashboard</h1>
          <p>Last updated: {lastRefresh.toLocaleTimeString()}</p>
        </div>
        <div className="header-actions">
          <button 
            className="btn btn-secondary"
            onClick={fetchData}
            disabled={loading}
          >
            🔄 Refresh
          </button>
          <button 
            className="btn btn-primary"
            onClick={handleGatewayReload}
          >
            🚀 Deploy Changes
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

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <h3>Total APIs</h3>
            <span className="stat-icon">🔗</span>
          </div>
          <div className="stat-value">{stats.totalAPIs}</div>
          <div className="stat-description">Active API endpoints</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>API Keys</h3>
            <span className="stat-icon">🔑</span>
          </div>
          <div className="stat-value">{stats.totalKeys}</div>
          <div className="stat-description">{stats.activeKeys} active</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Users</h3>
            <span className="stat-icon">👥</span>
          </div>
          <div className="stat-value">{stats.totalUsers}</div>
          <div className="stat-description">Registered users</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Status</h3>
            <span className="stat-icon">✅</span>
          </div>
          <div className="stat-value">Online</div>
          <div className="stat-description">Gateway operational</div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-card">
          <div className="card-header">
            <h2>API Management</h2>
            <button className="btn btn-sm btn-outline">
              ➕ New API
            </button>
          </div>
          <div className="card-content">
            {apis.length === 0 ? (
              <div className="empty-state">
                <p>No APIs configured</p>
                <p className="empty-description">Create your first API to get started</p>
              </div>
            ) : (
              <div className="api-list">
                {apis.slice(0, 5).map((api, index) => (
                  <div key={api.api_id || index} className="api-item">
                    <div className="api-info">
                      <h4>{api.name || 'Unnamed API'}</h4>
                      <p className="api-url">{api.proxy?.target_url || 'No target URL'}</p>
                    </div>
                    <div className="api-status">
                      <span className={`status-badge ${api.active ? 'active' : 'inactive'}`}>
                        {api.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                ))}
                {apis.length > 5 && (
                  <div className="show-more">
                    <button className="btn btn-sm btn-link">
                      View all {apis.length} APIs →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-card">
          <div className="card-header">
            <h2>API Keys</h2>
            <button 
              className="btn btn-sm btn-primary"
              onClick={() => setShowKeyModal(true)}
            >
              ➕ New Key
            </button>
          </div>
          <div className="card-content">
            {keys.length === 0 ? (
              <div className="empty-state">
                <p>No API keys created</p>
                <p className="empty-description">Create your first API key to enable access</p>
              </div>
            ) : (
              <div className="key-list">
                {keys.slice(0, 5).map((key, index) => (
                  <div key={key.key_hash || index} className="key-item">
                    <div className="key-info">
                      <h4>{key.alias || `Key ${index + 1}`}</h4>
                      <p className="key-hash">Hash: {key.key_hash || 'Unknown'}</p>
                    </div>
                    <div className="key-stats">
                      <span className="key-rate">
                        {key.rate || 0}/{key.per || 60}s
                      </span>
                      <span className={`status-badge ${key.active !== false ? 'active' : 'inactive'}`}>
                        {key.active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                ))}
                {keys.length > 5 && (
                  <div className="show-more">
                    <button className="btn btn-sm btn-link">
                      View all {keys.length} keys →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <h2>Quick Actions</h2>
        <div className="action-grid">
          <button className="action-card" onClick={() => setShowKeyModal(true)}>
            <div className="action-icon">🔑</div>
            <div className="action-title">Create API Key</div>
            <div className="action-description">Generate a new API key for client access</div>
          </button>
          
          <button className="action-card">
            <div className="action-icon">🔗</div>
            <div className="action-title">New API</div>
            <div className="action-description">Configure a new API endpoint</div>
          </button>
          
          <button className="action-card" onClick={handleGatewayReload}>
            <div className="action-icon">🚀</div>
            <div className="action-title">Deploy Changes</div>
            <div className="action-description">Apply configuration changes to gateway</div>
          </button>
          
          <button className="action-card">
            <div className="action-icon">📊</div>
            <div className="action-title">View Analytics</div>
            <div className="action-description">Check API usage and performance</div>
          </button>
        </div>
      </div>

      {/* Modals */}
      {showKeyModal && (
        <KeyCreationModal
          isOpen={showKeyModal}
          onClose={() => setShowKeyModal(false)}
          onKeyCreated={handleKeyCreated}
          apis={apis}
        />
      )}

      {showKeySuccess && newKeyData && (
        <KeySuccessModal
          isOpen={showKeySuccess}
          onClose={() => setShowKeySuccess(false)}
          keyData={newKeyData}
          apis={apis}
        />
      )}
    </div>
  );
};

export default Dashboard; 