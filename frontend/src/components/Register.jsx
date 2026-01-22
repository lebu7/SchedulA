import React, { useState } from 'react'
import { authService } from '../services/auth'

function Register({ onLogin }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    gender: '', 
    dob: '',    
    user_type: 'client',
    business_name: ''
  })
  
  const [confirmPassword, setConfirmPassword] = useState('') 
  
  // 🆕 State for specific field errors
  const [passwordError, setPasswordError] = useState('')
  const [confirmPasswordError, setConfirmPasswordError] = useState('')
  const [dobError, setDobError] = useState('') // 🆕 Added for Age Check
  
  const [generalError, setGeneralError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
    
    // Clear errors immediately when user starts typing/fixing
    if (e.target.name === 'password') setPasswordError('')
    if (e.target.name === 'dob') setDobError('')
  }

  // 🔒 Password Validation Logic
  const checkPasswordRequirements = (password) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    if (password.length < minLength) return "Must be at least 8 characters long.";
    if (!hasUpperCase) return "Must contain at least one uppercase letter.";
    if (!hasLowerCase) return "Must contain at least one lowercase letter.";
    if (!hasNumber) return "Must contain at least one number.";
    if (!hasSymbol) return "Must contain at least one special symbol.";
    
    return null; 
  }

  // 🔞 Age Validation Logic
  const checkAgeRequirements = (dob) => {
    if (!dob) return null; // Wait for input
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    
    // Adjust age if birthday hasn't occurred yet this year
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    if (age < 18) {
      return "You must be at least 18 years old to register.";
    }
    return null;
  }

  // 🔴 Field Blur Handlers (Trigger validation immediately on exit)
  const handlePasswordBlur = () => {
    const errorMsg = checkPasswordRequirements(formData.password);
    setPasswordError(errorMsg || '');
  }

  const handleConfirmBlur = () => {
    if (confirmPassword && formData.password !== confirmPassword) {
      setConfirmPasswordError("Passwords do not match.");
    } else {
      setConfirmPasswordError("");
    }
  }

  const handleDobBlur = () => {
    const errorMsg = checkAgeRequirements(formData.dob);
    setDobError(errorMsg || '');
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setGeneralError('')
    setPasswordError('')
    setConfirmPasswordError('')
    setDobError('')

    // 1. Validate Password
    const pwdErr = checkPasswordRequirements(formData.password);
    if (pwdErr) {
      setPasswordError(pwdErr);
      setLoading(false);
      return;
    }

    // 2. Validate Confirm Password
    if (formData.password !== confirmPassword) {
      setConfirmPasswordError("Passwords do not match.");
      setLoading(false);
      return;
    }

    // 3. Validate Age
    const ageErr = checkAgeRequirements(formData.dob);
    if (ageErr) {
      setDobError(ageErr);
      setLoading(false);
      return;
    }

    try {
      const result = await authService.register(formData)
      onLogin(result.user, result.token)
    } catch (error) {
      setGeneralError(error.response?.data?.error || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  // Helper style for red borders
  const errorInputStyle = { border: '1px solid red', backgroundColor: '#fff0f0' };

  return (
    <div className="auth-container">
      <div className="card">
        <h2>Join Schedula</h2>
        {generalError && <div className="error-message">{generalError}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name: *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Email: *</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Password: *</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              onBlur={handlePasswordBlur}
              required
              style={passwordError ? errorInputStyle : {}}
            />
            <div style={{ marginTop: '5px', fontSize: '0.85rem' }}>
              {passwordError ? (
                <span style={{ color: 'red', fontWeight: 'bold' }}>⚠️ {passwordError}</span>
              ) : (
                <span style={{ color: '#666' }}>
                  Requirement: 8+ chars, Uppercase, Lowercase, Number & Symbol.
                </span>
              )}
            </div>
          </div>

          <div className="form-group">
            <label>Confirm Password: *</label>
            <input
              type="password"
              name="confirmPassword"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setConfirmPasswordError('');
              }}
              onBlur={handleConfirmBlur}
              required
              style={confirmPasswordError ? errorInputStyle : {}}
            />
            {confirmPasswordError && (
              <div style={{ color: 'red', fontSize: '0.85rem', marginTop: '5px', fontWeight: 'bold' }}>
                ⚠️ {confirmPasswordError}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Phone Number: *</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+254..."
              required
            />
          </div>

          <div className="form-group">
            <label>Date of Birth: *</label>
            <input
              type="date"
              name="dob"
              value={formData.dob}
              onChange={handleChange}
              onBlur={handleDobBlur} // 👈 Validation triggers here
              required
              style={dobError ? errorInputStyle : {}}
            />
            {/* Age Requirement / Warning Section */}
            <div style={{ marginTop: '5px', fontSize: '0.85rem' }}>
              {dobError ? (
                <span style={{ color: 'red', fontWeight: 'bold' }}>⚠️ {dobError}</span>
              ) : (
                <span style={{ color: '#666' }}>
                  Requirement: You must be at least 18 years old.
                </span>
              )}
            </div>
          </div>

          <div className="form-group">
            <label>Gender: *</label>
            <select
              name="gender"
              value={formData.gender}
              onChange={handleChange}
              required
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value="">Select Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>

          <div className="form-group">
            <label>I am a:</label>
            <select
              name="user_type"
              value={formData.user_type}
              onChange={handleChange}
              required
            >
              <option value="client">Client</option>
              <option value="provider">Service Provider</option>
            </select>
          </div>

          {formData.user_type === 'provider' && (
            <div className="form-group">
              <label>Business Name: *</label>
              <input
                type="text"
                name="business_name"
                value={formData.business_name}
                onChange={handleChange}
                required
              />
            </div>
          )}
          
          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? 'Creating Account...' : 'Register'}
          </button>
        </form>
        
        <p>
          Already have an account? <a href="/login">Login here</a>
        </p>
      </div>
    </div>
  )
}

export default Register