/* frontend/src/components/Register.jsx */
import React, { useState } from 'react'
import { authService } from '../services/auth'
import { Briefcase, MapPin, Check, Eye, EyeOff } from 'lucide-react';

// Nairobi Suburbs Data
const NAIROBI_SUBURBS = {
  A: ["Airbase"],
  B: ["Baba Dogo"],
  C: ["California", "Chokaa", "Clay City"],
  D: ["Dagoretti", "Dandora", "Donholm"],
  E: ["Eastleigh"],
  G: ["Gikomba/Kamukunji", "Githurai"],
  H: ["Huruma"],
  I: ["Imara Daima", "Industrial Area"],
  J: ["Jamhuri"],
  K: ["Kabiro", "Kahawa", "Kahawa West", "Kamulu", "Kangemi", "Kariobangi", "Kasarani", "Kawangware", "Kayole", "Kiamaiko", "Kibra", "Kileleshwa", "Kitisuru", "Komarock"],
  L: ["Landimawe", "Langata", "Lavington", "Lucky Summer"],
  M: ["Makadara", "Makongeni", "Maringo/Hamza", "Mathare Hospital", "Mathare North", "Mbagathi Way", "Mlango Kubwa", "Mombasa Road", "Mountain View", "Mowlem", "Muthaiga", "Mwiki"],
  N: ["Nairobi South", "Nairobi West", "Njiru"],
  P: ["Pangani", "Parklands/Highridge", "Pumwani"],
  R: ["Ridgeways", "Roysambu", "Ruai", "Ruaraka", "Runda"],
  S: ["Saika", "South B", "South C"],
  T: ["Thome"],
  U: ["Umoja", "Upperhill", "Utalii", "Utawala"],
  W: ["Westlands", "Woodley/Kenyatta Golf Course"],
  Z: ["Zimmerman", "Ziwani/Kariokor"]
};

function Register({ onLogin }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    gender: '',
    dob: '',
    user_type: 'client',
    business_name: '',
    suburb: '',
    business_address: '',
    google_maps_link: ''
  })

  const [confirmPassword, setConfirmPassword] = useState('')

  const [showPw, setShowPw] = useState({
    password: false,
    confirm: false,
  });

  // Validation States
  const [passwordError, setPasswordError] = useState('')
  const [confirmPasswordError, setConfirmPasswordError] = useState('')
  const [dobError, setDobError] = useState('')
  const [generalError, setGeneralError] = useState('')
  const [loading, setLoading] = useState(false)

  // Modal State
  const [showProviderModal, setShowProviderModal] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === 'user_type') {
      setFormData({ ...formData, user_type: value });
      if (value === 'provider') {
        setShowProviderModal(true);
      }
    } else {
      setFormData({ ...formData, [name]: value });
    }

    if (name === 'password') setPasswordError('')
    if (name === 'dob') setDobError('')
  }

  // Password Validation
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

  // Age Validation
  const checkAgeRequirements = (dob) => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    if (age < 18) return "You must be at least 18 years old to register.";
    return null;
  }

  // Field Blur Handlers
  const handlePasswordBlur = () => setPasswordError(checkPasswordRequirements(formData.password) || '');
  const handleConfirmBlur = () => setConfirmPasswordError(confirmPassword && formData.password !== confirmPassword ? "Passwords do not match." : "");
  const handleDobBlur = () => setDobError(checkAgeRequirements(formData.dob) || '');

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setGeneralError('')
    setPasswordError('')
    setConfirmPasswordError('')
    setDobError('')

    // Standard Validations
    const pwdErr = checkPasswordRequirements(formData.password);
    if (pwdErr) { setPasswordError(pwdErr); setLoading(false); return; }
    if (formData.password !== confirmPassword) { setConfirmPasswordError("Passwords do not match."); setLoading(false); return; }
    const ageErr = checkAgeRequirements(formData.dob);
    if (ageErr) { setDobError(ageErr); setLoading(false); return; }

    // Provider Validation (updated): Business Name + Suburb + Business Address required
    if (formData.user_type === 'provider') {
      if (!formData.business_name || !formData.suburb || !formData.business_address) {
        setGeneralError("Please enter your Business Details (Business Name, Suburb, and Business Address are required).");
        setShowProviderModal(true);
        setLoading(false);
        return;
      }
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

  // Styles
  const errorInputStyle = { border: '1px solid red', backgroundColor: '#fff0f0' };

  // Modal Style (Inline for simplicity within this component)
  const modalOverlayStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
  };
  const modalContentStyle = {
    backgroundColor: 'white', padding: '25px', borderRadius: '12px', width: '90%', maxWidth: '420px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)', animation: 'slideIn 0.2s ease-out'
  };

  return (
    <div className="auth-container">
      <div className="card">
        <h2>Join Schedula</h2>
        {generalError && <div className="error-message">{generalError}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name: *</label>
            <input type="text" name="name" value={formData.name} onChange={handleChange} required />
          </div>

          <div className="form-group">
            <label>Email: *</label>
            <input type="email" name="email" value={formData.email} onChange={handleChange} required />
          </div>

          <div className="form-group">
            <label>Password: *</label>

            {/* Show/hide password */}
            <div className="password-field">
              <input
                type={showPw.password ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={handleChange}
                onBlur={handlePasswordBlur}
                required
                style={passwordError ? errorInputStyle : {}}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="toggle-password-btn"
                onClick={() => setShowPw(p => ({ ...p, password: !p.password }))}
                aria-label={showPw.password ? "Hide password" : "Show password"}
                title={showPw.password ? "Hide password" : "Show password"}
              >
                {showPw.password ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <div style={{ marginTop: '5px', fontSize: '0.85rem' }}>
              {passwordError ? <span style={{ color: 'red', fontWeight: 'bold' }}>⚠️ {passwordError}</span> : <span style={{ color: '#666' }}>Requirement: 8+ chars, Uppercase, Lowercase, Number & Symbol.</span>}
            </div>
          </div>

          <div className="form-group">
            <label>Confirm Password: *</label>

            {/* Show/hide confirm */}
            <div className="password-field">
              <input
                type={showPw.confirm ? "text" : "password"}
                name="confirmPassword"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setConfirmPasswordError(''); }}
                onBlur={handleConfirmBlur}
                required
                style={confirmPasswordError ? errorInputStyle : {}}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="toggle-password-btn"
                onClick={() => setShowPw(p => ({ ...p, confirm: !p.confirm }))}
                aria-label={showPw.confirm ? "Hide confirm password" : "Show confirm password"}
                title={showPw.confirm ? "Hide password" : "Show password"}
              >
                {showPw.confirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {confirmPasswordError && <div style={{ color: 'red', fontSize: '0.85rem', marginTop: '5px', fontWeight: 'bold' }}>⚠️ {confirmPasswordError}</div>}
          </div>

          <div className="form-group">
            <label>Phone Number: *</label>
            <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="+254..." required />
          </div>

          <div className="form-group">
            <label>Date of Birth: *</label>
            <input type="date" name="dob" value={formData.dob} onChange={handleChange} onBlur={handleDobBlur} required style={dobError ? errorInputStyle : {}} />
            <div style={{ marginTop: '5px', fontSize: '0.85rem' }}>
              {dobError ? <span style={{ color: 'red', fontWeight: 'bold' }}>⚠️ {dobError}</span> : <span style={{ color: '#666' }}>Requirement: You must be at least 18 years old.</span>}
            </div>
          </div>

          <div className="form-group">
            <label>Gender: *</label>
            <select name="gender" value={formData.gender} onChange={handleChange} required style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}>
              <option value="">Select Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>

          <div className="form-group">
            <label>I am a:</label>
            <select name="user_type" value={formData.user_type} onChange={handleChange} required style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #3b82f6', fontWeight: 'bold', color: '#1e3a8a' }}>
              <option value="client">Client</option>
              <option value="provider">Service Provider</option>
            </select>
          </div>

          {/* Edit Button if Provider details exist but modal closed */}
          {formData.user_type === 'provider' && (
            <div style={{ marginBottom: '20px', padding: '10px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontWeight: 'bold', color: '#1e40af', fontSize: '0.9rem', display: 'block' }}>{formData.business_name || "Business Name Missing"}</span>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{formData.suburb || "Location not set"}</span>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{formData.business_address || "Business address missing"}</span>
              </div>
              <button type="button" onClick={() => setShowProviderModal(true)} style={{ background: 'white', border: '1px solid #bfdbfe', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', color: '#2563eb' }}>
                Edit Details
              </button>
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Creating Account...' : 'Register'}
          </button>
        </form>

        <p>Already have an account? <a href="/login">Login here</a></p>
      </div>

      {/* PROVIDER DETAILS MODAL */}
      {showProviderModal && (
        <div style={modalOverlayStyle} onClick={() => { if (formData.business_name) setShowProviderModal(false); }}>
          {/* Click outside closes ONLY if data entered */}
          <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, color: '#1e293b' }}>🏢 Business Details</h3>
              {formData.business_name && <button type="button" onClick={() => setShowProviderModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>×</button>}
            </div>

            <div className="form-group">
              <label>Business Name *</label>
              <div style={{ position: 'relative' }}>
                <Briefcase size={16} style={{ position: 'absolute', top: '12px', left: '10px', color: '#94a3b8' }} />
                <input type="text" name="business_name" value={formData.business_name} onChange={handleChange} placeholder="e.g. Jane's Spa" style={{ paddingLeft: '35px' }} autoFocus required />
              </div>
            </div>

            <div className="form-group">
              <label>Suburb *</label>
              <select
                name="suburb"
                value={formData.suburb}
                onChange={(e) => setFormData({ ...formData, suburb: e.target.value })}
                style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
                required
              >
                <option value="">Select Suburb</option>
                {Object.keys(NAIROBI_SUBURBS).sort().map(letter => (
                  <optgroup key={letter} label={letter}>
                    {NAIROBI_SUBURBS[letter].map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Business Address / Landmark *</label>
              <div style={{ position: 'relative' }}>
                <MapPin size={16} style={{ position: 'absolute', top: '12px', left: '10px', color: '#94a3b8' }} />
                <input
                  type="text"
                  name="business_address"
                  value={formData.business_address}
                  onChange={handleChange}
                  placeholder="e.g. 1st Floor, City Mall"
                  style={{ paddingLeft: '35px' }}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Google Maps Link <small style={{ color: '#999' }}>(Optional)</small></label>
              <input type="url" name="google_maps_link" value={formData.google_maps_link} onChange={handleChange} placeholder="https://maps.google.com/..." />
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (!formData.business_name) return alert("Business Name is required");
                if (!formData.suburb) return alert("Suburb is required");
                if (!formData.business_address) return alert("Business Address is required");
                setShowProviderModal(false);
              }}
              style={{ width: '100%', marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Check size={18} /> Save & Continue
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Register