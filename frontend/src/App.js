import React from 'react';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>🚀 TykBasic</h1>
        <p>Streamlined Tyk Gateway Management</p>
        <div className="status-panel">
          <div className="status-item">
            <h3>🎯 Setup Complete!</h3>
            <p>Your TykBasic frontend is running</p>
          </div>
          <div className="status-item">
            <h3>🔗 Next Steps</h3>
            <ul>
              <li>Backend API routes (in progress)</li>
              <li>Authentication system</li>
              <li>Dashboard components</li>
              <li>Tyk Gateway integration</li>
            </ul>
          </div>
          <div className="status-item">
            <h3>🔧 Development Info</h3>
            <p>Frontend: <code>http://localhost:3000</code></p>
            <p>Backend: <code>http://localhost:3001</code></p>
            <p>Database: <code>data/tykbasic.sqlite</code></p>
          </div>
        </div>
        <div className="coming-soon">
          <p>✨ Full dashboard coming soon!</p>
          <p>Login: <code>admin@tykbasic.local / admin123!</code></p>
        </div>
      </header>
    </div>
  );
}

export default App; 