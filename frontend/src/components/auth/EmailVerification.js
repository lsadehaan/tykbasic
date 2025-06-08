import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './LoginForm.css'; // Reuse the same styles

const EmailVerification = () => {
  const [status, setStatus] = useState('verifying'); // verifying, success, error
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    
    if (!token) {
      setStatus('error');
      setError('No verification token provided.');
      return;
    }

    verifyEmail(token);
  }, [searchParams]);

  const verifyEmail = async (token) => {
    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token })
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('success');
        setMessage(data.message);
        
        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate('/login', { 
            state: { 
              message: 'Email verified successfully! You can now log in.',
              verified: true 
            } 
          });
        }, 3000);
      } else {
        setStatus('error');
        setError(data.message || 'Email verification failed.');
      }
    } catch (err) {
      console.error('Email verification error:', err);
      setStatus('error');
      setError('An error occurred during email verification. Please try again.');
    }
  };

  const handleGoToLogin = () => {
    navigate('/login', { 
      state: { 
        message: status === 'success' ? 'Email verified successfully! You can now log in.' : null
      } 
    });
  };

  const handleResendVerification = () => {
    // This would trigger a new verification email
    // For now, we'll just redirect to registration
    navigate('/register', { 
      state: { 
        message: 'Please complete registration again to receive a new verification email.'
      } 
    });
  };

  return (
    <div className="login-form-container">
      <div className="login-form">
        <div className="form-header">
          <h2>Email Verification</h2>
          <p>
            {status === 'verifying' && 'Verifying your email address...'}
            {status === 'success' && 'Email Verified Successfully!'}
            {status === 'error' && 'Verification Failed'}
          </p>
        </div>

        {status === 'verifying' && (
          <div className="verification-loading">
            <div className="loading-spinner" style={{
              width: '40px',
              height: '40px',
              border: '4px solid #f3f4f6',
              borderTop: '4px solid #3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '20px auto'
            }}></div>
            <p style={{ textAlign: 'center', color: '#666' }}>
              Please wait while we verify your email address...
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="success-content">
            <div className="success-icon" style={{
              fontSize: '48px',
              color: '#10b981',
              textAlign: 'center',
              marginBottom: '20px'
            }}>
              ✅
            </div>
            <div className="success-message" style={{
              backgroundColor: '#d1fae5',
              border: '1px solid #a7f3d0',
              color: '#065f46',
              padding: '12px',
              borderRadius: '6px',
              marginBottom: '20px'
            }}>
              {message}
            </div>
            <div style={{
              textAlign: 'center',
              color: '#666',
              marginBottom: '20px'
            }}>
              You will be redirected to the login page in a few seconds...
            </div>
            <button 
              onClick={handleGoToLogin}
              className="submit-btn"
              style={{
                width: '100%',
                backgroundColor: '#10b981',
                borderColor: '#10b981'
              }}
            >
              Continue to Login
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="error-content">
            <div className="error-icon" style={{
              fontSize: '48px',
              color: '#ef4444',
              textAlign: 'center',
              marginBottom: '20px'
            }}>
              ❌
            </div>
            <div className="error-message" style={{
              backgroundColor: '#fee2e2',
              border: '1px solid #fca5a5',
              color: '#991b1b',
              padding: '12px',
              borderRadius: '6px',
              marginBottom: '20px'
            }}>
              {error}
            </div>
            
            <div className="error-actions">
              <button 
                onClick={handleGoToLogin}
                className="submit-btn"
                style={{
                  width: '100%',
                  marginBottom: '10px'
                }}
              >
                Go to Login
              </button>
              <button 
                onClick={handleResendVerification}
                className="link-btn"
                style={{
                  width: '100%',
                  textAlign: 'center',
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: 'transparent',
                  color: '#6b7280'
                }}
              >
                Request New Verification Email
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default EmailVerification; 