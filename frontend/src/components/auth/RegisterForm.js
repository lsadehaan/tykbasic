import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './LoginForm.css'; // Reuse the same styles

const RegisterForm = ({ onSwitchToLogin }) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({
    score: 0,
    feedback: [],
    isValid: false
  });
  const { register } = useAuth();

  // Password strength validation function
  const validatePasswordStrength = (password) => {
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /\d/.test(password),
      special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    };

    const feedback = [];
    let score = 0;

    if (!checks.length) feedback.push('Must be at least 8 characters long');
    else score += 1;

    if (!checks.uppercase) feedback.push('Must contain at least one uppercase letter');
    else score += 1;

    if (!checks.lowercase) feedback.push('Must contain at least one lowercase letter');
    else score += 1;

    if (!checks.number) feedback.push('Must contain at least one number');
    else score += 1;

    if (!checks.special) feedback.push('Must contain at least one special character');
    else score += 1;

    // Additional strength checks
    if (password.length >= 12) score += 1;
    if (password.length >= 16) score += 1;

    const isValid = score >= 4; // Must meet first 4 basic requirements

    return {
      score,
      feedback,
      isValid,
      strength: score < 2 ? 'Very Weak' : 
                score < 4 ? 'Weak' : 
                score < 5 ? 'Good' : 
                score < 6 ? 'Strong' : 'Very Strong'
    };
  };

  // Update password strength when password changes
  useEffect(() => {
    if (formData.password) {
      setPasswordStrength(validatePasswordStrength(formData.password));
    } else {
      setPasswordStrength({ score: 0, feedback: [], isValid: false });
    }
  }, [formData.password]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    // Enhanced validation
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.password) {
      setError('Please fill in all fields');
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    // Re-validate password strength at submission time to avoid race conditions
    const currentPasswordValidation = validatePasswordStrength(formData.password);
    console.log('Password validation at submit:', currentPasswordValidation);
    
    if (!currentPasswordValidation.isValid) {
      setError(`Password does not meet security requirements: ${currentPasswordValidation.feedback.join(', ')}`);
      setLoading(false);
      return;
    }

    const result = await register(
      formData.email, 
      formData.password, 
      formData.firstName, 
      formData.lastName
    );
    
    if (result.success) {
      setSuccess(result.message);
      // Clear form
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: ''
      });
    } else {
      setError(result.error);
    }
    
    setLoading(false);
  };

  const getStrengthColor = (strength) => {
    switch (strength) {
      case 'Very Weak': return '#ff4757';
      case 'Weak': return '#ff6b35';
      case 'Good': return '#ffa502';
      case 'Strong': return '#2ed573';
      case 'Very Strong': return '#1e90ff';
      default: return '#ddd';
    }
  };

  return (
    <div className="login-form-container">
      <div className="login-form">
        <div className="form-header">
          <h2>Create Account</h2>
          <p>Join TykBasic today</p>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {success && (
          <div className="success-message">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="firstName">First Name</label>
              <input
                type="text"
                id="firstName"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                placeholder="John"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="lastName">Last Name</label>
              <input
                type="text"
                id="lastName"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                placeholder="Doe"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="john@company.com"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Create a secure password"
              required
            />
            
            {/* Password Strength Indicator */}
            {formData.password && (
              <div className="password-strength-container">
                <div className="password-strength-bar">
                  <div 
                    className="password-strength-fill"
                    style={{
                      width: `${(passwordStrength.score / 7) * 100}%`,
                      backgroundColor: getStrengthColor(passwordStrength.strength),
                      height: '4px',
                      borderRadius: '2px',
                      transition: 'all 0.3s ease'
                    }}
                  ></div>
                </div>
                <div className="password-strength-text" style={{
                  fontSize: '12px',
                  color: getStrengthColor(passwordStrength.strength),
                  fontWeight: '500',
                  marginTop: '4px'
                }}>
                  Strength: {passwordStrength.strength}
                </div>
                
                {/* Password Requirements */}
                {passwordStrength.feedback.length > 0 && (
                  <div className="password-requirements" style={{
                    fontSize: '12px',
                    color: '#666',
                    marginTop: '8px',
                    padding: '8px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '4px',
                    border: '1px solid #e9ecef'
                  }}>
                    <div style={{ fontWeight: '500', marginBottom: '4px' }}>Password Requirements:</div>
                    <ul style={{ margin: 0, paddingLeft: '16px' }}>
                      {passwordStrength.feedback.map((req, index) => (
                        <li key={index} style={{ color: '#dc3545' }}>{req}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Re-enter your password"
              required
            />
            {formData.confirmPassword && formData.password !== formData.confirmPassword && (
              <div style={{
                fontSize: '12px',
                color: '#dc3545',
                marginTop: '4px'
              }}>
                Passwords do not match
              </div>
            )}
          </div>

          <button 
            type="submit" 
            className="submit-btn"
            disabled={loading || !passwordStrength.isValid || formData.password !== formData.confirmPassword}
            style={{
              opacity: (loading || !passwordStrength.isValid || formData.password !== formData.confirmPassword) ? 0.6 : 1
            }}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div className="form-footer">
          <p>
            Already have an account?{' '}
            <button 
              type="button" 
              className="link-btn" 
              onClick={onSwitchToLogin}
            >
              Sign in here
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterForm; 