import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import './PasswordReset.css';

const PasswordReset = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  
  // For password reset request
  const [email, setEmail] = useState('');
  
  // For password reset confirmation
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Check if we're in confirmation mode (token present)
  const isConfirmMode = !!token || new URLSearchParams(location.search).get('token');
  const resetToken = token || new URLSearchParams(location.search).get('token');

  // Set email from router state if provided (from force password reset)
  useEffect(() => {
    if (location.state?.email) {
      setEmail(location.state.email);
    }
  }, [location.state]);

  const handlePasswordResetRequest = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(data.message);
        setEmail('');
      } else {
        setError(data.message || 'Failed to request password reset');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordResetConfirm = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setMessage('');

    // Validation
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          token: resetToken, 
          password 
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(data.message);
        setTimeout(() => {
          navigate('/login', { 
            state: { message: 'Password reset successful! Please log in with your new password.' }
          });
        }, 2000);
      } else {
        setError(data.message || 'Failed to reset password');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getPasswordStrength = (password) => {
    if (password.length < 8) return { level: 0, text: 'Too short' };
    
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    
    if (score <= 2) return { level: 1, text: 'Weak' };
    if (score <= 3) return { level: 2, text: 'Fair' };
    if (score <= 4) return { level: 3, text: 'Good' };
    return { level: 4, text: 'Strong' };
  };

  const passwordStrength = getPasswordStrength(password);

  if (isConfirmMode) {
    return (
      <div className="password-reset-container">
        <div className="password-reset-card">
          <div className="password-reset-header">
            <h2>Reset Your Password</h2>
            <p>Enter your new password below</p>
          </div>

          {error && (
            <div className="alert alert-error">
              <span className="alert-icon">⚠️</span>
              {error}
            </div>
          )}

          {message && (
            <div className="alert alert-success">
              <span className="alert-icon">✅</span>
              {message}
            </div>
          )}

          <form onSubmit={handlePasswordResetConfirm} className="password-reset-form">
            <div className="form-group">
              <label htmlFor="password">New Password</label>
              <div className="password-input-group">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Enter new password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
              {password && (
                <div className={`password-strength password-strength-${passwordStrength.level}`}>
                  <div className="password-strength-bar">
                    <div 
                      className="password-strength-fill"
                      style={{ width: `${(passwordStrength.level / 4) * 100}%` }}
                    ></div>
                  </div>
                  <span className="password-strength-text">{passwordStrength.text}</span>
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Confirm new password"
                disabled={isLoading}
              />
              {confirmPassword && password !== confirmPassword && (
                <div className="password-mismatch">
                  Passwords do not match
                </div>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={isLoading || password !== confirmPassword || password.length < 8}
            >
              {isLoading ? (
                <>
                  <span className="spinner"></span>
                  Resetting Password...
                </>
              ) : (
                'Reset Password'
              )}
            </button>
          </form>

          <div className="password-reset-footer">
            <p>
              Remember your password?{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => navigate('/login')}
              >
                Back to Login
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Password reset request form
  return (
    <div className="password-reset-container">
      <div className="password-reset-card">
        <div className="password-reset-header">
          <h2>Reset Your Password</h2>
          <p>Enter your email address and we'll send you a link to reset your password</p>
        </div>

        {error && (
          <div className="alert alert-error">
            <span className="alert-icon">⚠️</span>
            {error}
          </div>
        )}

        {message && (
          <div className="alert alert-success">
            <span className="alert-icon">✅</span>
            {message}
          </div>
        )}

        <form onSubmit={handlePasswordResetRequest} className="password-reset-form">
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your email address"
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="spinner"></span>
                Sending Reset Link...
              </>
            ) : (
              'Send Reset Link'
            )}
          </button>
        </form>

        <div className="password-reset-footer">
          <p>
            Remember your password?{' '}
            <button
              type="button"
              className="link-button"
              onClick={() => navigate('/login')}
            >
              Back to Login
            </button>
          </p>
          <p>
            Don't have an account?{' '}
            <button
              type="button"
              className="link-button"
              onClick={() => navigate('/register')}
            >
              Sign up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default PasswordReset; 