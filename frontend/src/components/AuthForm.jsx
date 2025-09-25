import React, { useState } from 'react';
import { authAPI } from '../services/api';
import { authService } from '../services/auth';

const AuthForm = ({ onSuccess, onClose }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    user_type: 'client',
    phone: '',
    business_name: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let response;
      
      if (isLogin) {
        response = await authAPI.login({
          email: formData.email,
          password: formData.password
        });
      } else {
        response = await authAPI.register(formData);
      }

      if (response.success) {
        authService.setAuth(response.token, response.user);
        onSuccess(response.user);
      } else {
        setError(response.error || 'Authentication failed');
      }
      
    } catch (error) {
      setError(error.response?.data?.error || error.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setFormData(prev => ({
      ...prev,
      password: '' // Clear password when switching
    }));
  };

  return (
    <div className="auth-modal-overlay">
      <div className="auth-modal">
        <div className="auth-header">
          <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {error && (
          <div className="error-message">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {!isLogin && (
            <>
              <div className="form-group">
                <input
                  type="text"
                  name="name"
                  placeholder="Full Name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <select
                  name="user_type"
                  value={formData.user_type}
                  onChange={handleChange}
                  required
                  disabled={loading}
                >
                  <option value="client">I want to book services (Client)</option>
                  <option value="provider">I want to offer services (Provider)</option>
                </select>
              </div>

              <div className="form-group">
                <input
                  type="tel"
                  name="phone"
                  placeholder="Phone Number"
                  value={formData.phone}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              {formData.user_type === 'provider' && (
                <div className="form-group">
                  <input
                    type="text"
                    name="business_name"
                    placeholder="Business Name (Optional)"
                    value={formData.business_name}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
              )}
            </>
          )}

          <div className="form-group">
            <input
              type="email"
              name="email"
              placeholder="Email Address"
              value={formData.email}
              onChange={handleChange}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              required
              disabled={loading}
              minLength="6"
            />
          </div>

          <button 
            type="submit" 
            className="auth-submit-btn"
            disabled={loading}
          >
            {loading ? '⏳ Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button type="button" className="link-btn" onClick={switchMode} disabled={loading}>
              {isLogin ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>

        {isLogin && (
          <div className="demo-accounts">
            <p><strong>Demo Accounts:</strong></p>
            <p>Provider: salon@nairobi.com / provider123</p>
            <p>Client: client@example.com / client123</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthForm;