import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './LoginForm.css';

const LoginForm = ({ onSwitchToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!email || !password) {
      setError('Please fill in all fields');
      setLoading(false);
      return;
    }

    const result = await login(email, password);
    
    console.log('Login result:', result); // Debug log
    
    if (!result.success) {
      if (result.passwordResetRequired) {
        // Show password reset modal
        console.log('Showing password reset modal for:', result.email); // Debug log
        setResetEmail(result.email);
        setShowPasswordResetModal(true);
      } else {
        setError(result.error);
      }
    }
    
    setLoading(false);
  };

  const handlePasswordResetRedirect = () => {
    setShowPasswordResetModal(false);
    navigate('/password-reset', { state: { email: resetEmail } });
  };

  return (
    <div className="login-form-container">
      <div className="login-form">
        <div className="form-header">
          <h2>Welcome Back</h2>
          <p>Sign in to your TykBasic account</p>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@tykbasic.local"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          <button 
            type="submit" 
            className="submit-btn"
            disabled={loading}
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div className="form-footer">
          <p>
            <Link to="/password-reset" className="link-btn forgot-password">
              Forgot your password?
            </Link>
          </p>
          <p>
            Don't have an account?{' '}
            <button 
              type="button" 
              className="link-btn" 
              onClick={onSwitchToRegister}
            >
              Sign up here
            </button>
          </p>
        </div>

        <div className="demo-credentials">
          <p><strong>Demo Credentials:</strong></p>
          <p>Admin: admin@tykbasic.local / admin123!</p>
          <p>User: test@tykbasic.local / test123!</p>
        </div>
      </div>

      {/* Password Reset Required Modal */}
      {showPasswordResetModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Password Reset Required</h3>
            </div>
            <div className="modal-body">
              <p>Your administrator has required you to reset your password before you can log in.</p>
              <p>Please use the password reset process to create a new password.</p>
              <div className="modal-email">
                <strong>Email:</strong> {resetEmail}
              </div>
            </div>
            <div className="modal-actions">
              <button 
                className="btn btn-primary"
                onClick={handlePasswordResetRedirect}
              >
                Reset Password
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => setShowPasswordResetModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginForm; 