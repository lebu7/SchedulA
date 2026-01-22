/* frontend/src/components/ForgotPassword.jsx */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function ForgotPassword() {
  const [step, setStep] = useState(1); // 1: Request OTP, 2: Verify & Reset
  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    otp: '',
    newPassword: '',
    confirmNewPassword: ''
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0); // For 2-minute countdown
  const navigate = useNavigate();

  // Timer logic
  useEffect(() => {
    let interval;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRequestOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await axios.post(`${API_URL}/auth/forgot-password`, {
        email: formData.email,
        phone: formData.phone
      });
      setMessage('OTP sent to your phone. Valid for 1 minute.');
      setStep(2);
      setResendTimer(120); // 2 minutes cooldown
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    if (formData.newPassword !== formData.confirmNewPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    // Basic password strength check (same as register)
    if (formData.newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      setLoading(false);
      return;
    }

    try {
      await axios.post(`${API_URL}/auth/reset-password`, {
        email: formData.email,
        phone: formData.phone,
        otp: formData.otp,
        newPassword: formData.newPassword
      });
      setMessage('Password reset successfully! Redirecting to login...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="card">
        <h2>Forgot Password</h2>
        
        {/* Messages */}
        {error && <div className="error-message">{error}</div>}
        {message && <div className="success-message">{message}</div>}

        {step === 1 && (
          <form onSubmit={handleRequestOTP}>
            <p className="instruction-text">
              Enter your registered email and phone number to receive a reset code.
            </p>
            <div className="form-group">
              <label>Email:</label>
              <input 
                type="email" 
                name="email" 
                value={formData.email} 
                onChange={handleChange} 
                required 
              />
            </div>
            <div className="form-group">
              <label>Phone Number:</label>
              <input 
                type="tel" 
                name="phone" 
                value={formData.phone} 
                onChange={handleChange} 
                placeholder="+254..." 
                required 
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleResetPassword}>
            <p className="instruction-text">
              Enter the 6-digit code sent to your phone and your new password.
            </p>
            <div className="form-group">
              <label>Enter OTP:</label>
              <input 
                type="text" 
                name="otp" 
                value={formData.otp} 
                onChange={handleChange} 
                required 
                placeholder="6-digit code" 
                className="otp-input"
              />
            </div>
            <div className="form-group">
              <label>New Password:</label>
              <input 
                type="password" 
                name="newPassword" 
                value={formData.newPassword} 
                onChange={handleChange} 
                required 
                minLength="8" 
              />
            </div>
            <div className="form-group">
              <label>Confirm Password:</label>
              <input 
                type="password" 
                name="confirmNewPassword" 
                value={formData.confirmNewPassword} 
                onChange={handleChange} 
                required 
                minLength="8" 
              />
            </div>
            
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>

            <div className="resend-container">
              {resendTimer > 0 ? (
                <span className="timer-text">
                  Resend code in {Math.floor(resendTimer / 60)}:{(resendTimer % 60).toString().padStart(2, '0')}
                </span>
              ) : (
                <button 
                  type="button" 
                  onClick={handleRequestOTP} 
                  className="btn-link"
                >
                  Resend Code
                </button>
              )}
            </div>
          </form>
        )}

        <p className="back-link">
          <a href="/login">Back to Login</a>
        </p>
      </div>
    </div>
  );
}

export default ForgotPassword;