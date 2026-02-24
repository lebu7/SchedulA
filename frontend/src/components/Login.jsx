/* frontend/src/components/Login.jsx */
import React, { useState } from 'react'
import { authService } from '../services/auth'
import { Eye, EyeOff } from 'lucide-react';

function Login({ onLogin }) {
  const [formData, setFormData] = useState({
    identifier: '',
    password: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = await authService.login(formData)
      onLogin(result.user, result.token)
    } catch (error) {
      setError(error.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="card">
        <h2>Login to Schedula</h2>
        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email or Phone Number:</label>
            <input
              type="text"
              name="identifier"
              value={formData.identifier}
              onChange={handleChange}
              placeholder="e.g. user@example.com or 07..."
              required
            />
          </div>

          <div className="form-group">
            <label>Password:</label>

            {/* show/hide password */}
            <div className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="toggle-password-btn"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <div style={{ textAlign: 'right', marginTop: '5px' }}>
              <a href="/forgot-password" style={{ fontSize: '0.85em', color: '#2563eb' }}>
                Forgot Password?
              </a>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p>
          Don't have an account? <a href="/register">Register here</a>
        </p>
      </div>
    </div>
  )
}

export default Login