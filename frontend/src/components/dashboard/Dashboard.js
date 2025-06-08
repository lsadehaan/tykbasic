import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import KeyCreationModal from './KeyCreationModal';
import KeySuccessModal from './KeySuccessModal';
import KeyManagement from '../KeyManagement';
import './Dashboard.css';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const [activeView, setActiveView] = useState('dashboard');
  const [tykStatus, setTykStatus] = useState({ status: 'checking', message: 'Checking...' });
  const [stats, setStats] = useState({
    apis: 0,
    keys: 0,
    policies: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdKeyData, setCreatedKeyData] = useState(null);

  useEffect(() => {
    checkTykGatewayStatus();
    loadDashboardStats();
  }, []);

  const checkTykGatewayStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/tyk/gateway/status', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setTykStatus({
          status: data.status === 'healthy' ? 'online' : 'offline',
          message: data.message,
          duration: data.duration
        });
      } else {
        setTykStatus({
          status: 'offline',
          message: 'Gateway not reachable'
        });
      }
    } catch (error) {
      console.error('Gateway status check failed:', error);
      setTykStatus({
        status: 'offline',
        message: 'Connection failed'
      });
    }
  };

  const loadDashboardStats = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Load APIs count
      const apisResponse = await fetch('/api/tyk/apis', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (apisResponse.ok) {
        const apisData = await apisResponse.json();
        // Tyk returns APIs as direct array in data field
        let apiCount = 0;
        if (apisData.data && Array.isArray(apisData.data)) {
          apiCount = apisData.data.length;
        } else if (apisData.data?.apis && Array.isArray(apisData.data.apis)) {
          apiCount = apisData.data.apis.length;
        }
        setStats(prev => ({ ...prev, apis: apiCount }));
        console.log('📊 API count updated:', apiCount);
      }

      // Load Keys count  
      const keysResponse = await fetch('/api/tyk/keys', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (keysResponse.ok) {
        const keysData = await keysResponse.json();
        // Tyk returns { keys: [...] } structure in data field
        let keyCount = 0;
        if (keysData.data?.keys && Array.isArray(keysData.data.keys)) {
          keyCount = keysData.data.keys.length;
        } else if (keysData.data && Array.isArray(keysData.data)) {
          keyCount = keysData.data.length;
        }
        setStats(prev => ({ ...prev, keys: keyCount }));
        console.log('📊 Key count updated:', keyCount);
      }

    } catch (error) {
      console.error('Failed to load dashboard stats:', error);
    }
  };

  const handleCreateKey = () => {
    setShowKeyModal(true);
  };

  const handleKeyCreated = (keyData, formData, selectedApis) => {
    console.log('🔑 Key created:', keyData);
    setCreatedKeyData({ keyData, formData, selectedApis });
    setShowSuccessModal(true);
    loadDashboardStats(); // Refresh key count
  };

  const handleManageKeys = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/tyk/keys', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('API Keys:', data);
        let keyCount = 0;
        if (data.data?.keys && Array.isArray(data.data.keys)) {
          keyCount = data.data.keys.length;
        } else if (data.data && Array.isArray(data.data)) {
          keyCount = data.data.length;
        }
        
        if (keyCount === 0) {
          alert('🔑 No API keys found yet.\n\n💡 Tip: Use "Create API Key" to generate your first key!');
        } else {
          alert(`🔑 Found ${keyCount} API key(s). Check console for full details.`);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(`Failed to fetch API keys: ${errorData.message || response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to manage keys:', error);
      setError('Network error while fetching keys');
    } finally {
      setLoading(false);
    }
  };



  const handleCreateAPI = () => {
    const timestamp = Date.now();
    const sampleAPI = {
      name: `Test API ${timestamp}`,
      api_id: `test-api-${timestamp}`,
      org_id: "default",
      definition: {
        location: "header",
        key: "Authorization"  // Support Bearer tokens
      },
      auth: {
        auth_header_name: "Authorization",  // Look for Authorization header
        use_param: false,
        use_cookie: false
      },
      use_keyless: false,
      proxy: {
        target_url: "https://httpbin.org",
        listen_path: `/test-api-${timestamp}/`,
        strip_listen_path: true
      },
      active: true,
      version_data: {
        not_versioned: true,
        versions: {
          "Default": {
            name: "Default",
            use_extended_paths: true
          }
        }
      }
    };

    createAPI(sampleAPI);
  };

  const createAPI = async (apiDefinition) => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/tyk/apis', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(apiDefinition)
      });

      if (response.ok) {
        const data = await response.json();
        console.log('🚀 API Created:', data);
        
        // Extract API info for better success message
        const apiInfo = data.data || {};
        const listenPath = apiInfo.proxy?.listen_path || apiDefinition.proxy?.listen_path;
        
        alert(`🚀 Success! API "${apiDefinition.name}" created successfully!\n\n` +
              `📍 Listen Path: ${listenPath}\n` +
              `🆔 API ID: ${apiInfo.api_id || apiDefinition.api_id}\n` +
              `🔄 Don't forget to reload the gateway to activate it!`);
        
        loadDashboardStats(); // Refresh stats
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(`Failed to create API: ${errorData.message || errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to create API:', error);
      setError('Network error while creating API');
    } finally {
      setLoading(false);
    }
  };

  const handleGatewayReload = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/tyk/gateway/reload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('🚀 Changes Deployed:', data);
        alert('🚀 Changes deployed successfully!\n\n✅ All API changes are now live and available.');
        checkTykGatewayStatus(); // Refresh status
        loadDashboardStats(); // Refresh stats after reload
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(`Failed to reload gateway: ${errorData.message || response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to reload gateway:', error);
      setError('Network error while reloading gateway');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
  };

  const renderContent = () => {
    switch (activeView) {
      case 'keys':
        return <KeyManagement />;
      case 'dashboard':
      default:
        return (
          <div className="dashboard-content">
            {error && (
              <div className="error-banner">
                <span>⚠️ {error}</span>
                <button onClick={() => setError(null)}>×</button>
              </div>
            )}

            <div className="dashboard-grid">
              <div className="card">
                <div className="card-header">
                  <h3>Account Information</h3>
                </div>
                <div className="card-content">
                  <div className="info-row">
                    <label>Email:</label>
                    <span>{user?.email}</span>
                  </div>
                  <div className="info-row">
                    <label>Role:</label>
                    <span className={`role-badge ${user?.role}`}>{user?.role}</span>
                  </div>
                  <div className="info-row">
                    <label>Status:</label>
                    <span className={`status-badge ${user?.status}`}>{user?.status}</span>
                  </div>
                  <div className="info-row">
                    <label>Organization:</label>
                    <span>{user?.organization?.displayName || 'Default'}</span>
                  </div>
                  <div className="info-row">
                    <label>Last Login:</label>
                    <span>{user?.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'First time'}</span>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3>Tyk Gateway Actions</h3>
                </div>
                <div className="card-content">
                  <div className="action-buttons">
                    <button 
                      className="action-btn primary" 
                      onClick={handleCreateAPI}
                      disabled={loading}
                    >
                      🚀 Create Test API
                    </button>
                    <button 
                      className="action-btn primary" 
                      onClick={handleCreateKey}
                      disabled={loading}
                    >
                      🔑 Create API Key
                    </button>
                    <button 
                      className="action-btn secondary" 
                      onClick={() => setActiveView('keys')}
                      disabled={loading}
                    >
                      👁️ Manage API Keys
                    </button>
                    <button 
                      className="action-btn secondary" 
                      onClick={handleGatewayReload}
                      disabled={loading}
                    >
                      🚀 Deploy Changes
                    </button>
                  </div>
                  {loading && <div className="loading-indicator">Processing...</div>}
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3>System Status</h3>
                  <button 
                    className="refresh-btn" 
                    onClick={checkTykGatewayStatus}
                    disabled={loading}
                  >
                    🔄
                  </button>
                </div>
                <div className="card-content">
                  <div className="status-items">
                    <div className="status-item">
                      <span className="status-label">Backend API</span>
                      <span className="status-indicator online">Online</span>
                    </div>
                    <div className="status-item">
                      <span className="status-label">Database</span>
                      <span className="status-indicator online">Connected</span>
                    </div>
                    <div className="status-item">
                      <span className="status-label">Tyk Gateway</span>
                      <span className={`status-indicator ${tykStatus.status}`}>
                        {tykStatus.status === 'online' ? 'Connected' : 
                         tykStatus.status === 'offline' ? 'Offline' : 'Checking...'}
                      </span>
                      {tykStatus.duration && (
                        <span className="status-detail">({tykStatus.duration}ms)</span>
                      )}
                    </div>
                    <div className="status-item">
                      <span className="status-label">Authentication</span>
                      <span className="status-indicator online">Active</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3>Gateway Statistics</h3>
                </div>
                <div className="card-content">
                  <div className="stats-grid">
                    <div className="stat-item">
                      <span className="stat-number">{stats.apis}</span>
                      <span className="stat-label">APIs</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-number">{stats.keys}</span>
                      <span className="stat-label">API Keys</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-number">{stats.policies}</span>
                      <span className="stat-label">Policies</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <div className="logo">
            <h1>TykBasic</h1>
          </div>
          <nav className="main-navigation">
            <button 
              className={`nav-btn ${activeView === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveView('dashboard')}
            >
              🏠 Dashboard
            </button>
            <button 
              className={`nav-btn ${activeView === 'keys' ? 'active' : ''}`}
              onClick={() => setActiveView('keys')}
            >
              🔑 API Keys
            </button>
            {user && ['super_admin', 'admin'].includes(user.role) && (
              <Link to="/admin" className="nav-btn admin-link">
                ⚙️ Admin
              </Link>
            )}
          </nav>
          <div className="user-info">
            <span className="welcome-text">
              Welcome, {user?.firstName} {user?.lastName}
            </span>
            <div className="user-menu">
              <span className="user-role">{user?.role}</span>
              <button onClick={handleLogout} className="logout-btn">
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        {renderContent()}
      </main>
      
      <KeyCreationModal 
        isOpen={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        onKeyCreated={handleKeyCreated}
      />
      
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
    </div>
  );
};

export default Dashboard; 