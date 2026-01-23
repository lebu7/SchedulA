import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom'; 
import api from '../services/auth';
import { MessageSquare, Bell, Clock, User, Briefcase } from 'lucide-react'; 
import './Settings.css';

const Settings = ({ user, setUser }) => {
  const location = useLocation(); 
  
  // ✅ FIX: Initialize active tab with validation (prevents loading 'pending' or 'appointments' tabs from stale state)
  const [activeTab, setActiveTab] = useState(() => {
      const validTabs = ['profile', 'notifications', 'hours'];
      // Only use the subTab from state if it belongs to Settings
      if (location.state?.subTab && validTabs.includes(location.state.subTab)) {
          return location.state.subTab;
      }
      return 'profile';
  });

  // 🆕 Sub-tab state for Notifications (SMS vs In-App)
  const [notifSubTab, setNotifSubTab] = useState('sms');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Profile States
  const [profile, setProfile] = useState({ 
    name: '', 
    phone: '', 
    business_name: '', 
    gender: '', 
    dob: '' 
  });
  
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [passwordError, setPasswordError] = useState(''); 
  
  // SMS Preferences (Existing)
  const [notifications, setNotifications] = useState({
    confirmation: true, 
    acceptance: true, 
    reminder: true, 
    cancellation: true, 
    receipt: true, 
    new_request: true,
    refund: true 
  });

  // 🧠 In-App Preferences (New State)
  const [inAppPrefs, setInAppPrefs] = useState({
    booking_alerts: true,
    system_updates: true,
    payment_alerts: true,
    reminders: true
  });
  
  const [hours, setHours] = useState({ opening_time: '08:00', closing_time: '18:00' });

  // Sync state with User prop
  useEffect(() => {
    if (user) {
      setProfile({ 
        name: user.name || '', 
        phone: user.phone || '', 
        business_name: user.business_name || '',
        gender: user.gender || '', 
        dob: user.dob ? user.dob.split('T')[0] : '' 
      });
      setHours({ 
        opening_time: user.opening_time || '08:00', 
        closing_time: user.closing_time || '18:00' 
      });

      if (user.notification_preferences) {
        let prefs = user.notification_preferences;
        if (typeof prefs === 'string') {
            try { prefs = JSON.parse(prefs); } catch (e) { prefs = {}; }
        }
        // Merge SMS defaults
        setNotifications(prev => ({ ...prev, ...prefs }));
        
        // Merge In-App defaults if they exist in the JSON
        if (prefs.in_app) {
            setInAppPrefs(prev => ({ ...prev, ...prefs.in_app }));
        }
      }
    }
  }, [user]);

  // ✅ LISTEN: Also update if location state changes while mounted (with validation)
  useEffect(() => {
    const validTabs = ['profile', 'notifications', 'hours'];
    if (location.state?.subTab && validTabs.includes(location.state.subTab)) {
      setActiveTab(location.state.subTab);
    }
  }, [location.state]);

  const showMsg = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 4000);
  };

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

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);

    let formattedPhone = profile.phone.trim();
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '+254' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('254')) {
      formattedPhone = '+' + formattedPhone;
    }

    try {
      const res = await api.put('/auth/profile', { ...profile, phone: formattedPhone });
      showMsg('success', 'Profile updated successfully!');
      
      setProfile(prev => ({ ...prev, phone: formattedPhone }));
      const updatedUser = { ...user, ...res.data.user };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser)); 
    } catch (err) { 
      console.error(err);
      const errMsg = err.response?.data?.errors?.[0]?.msg || err.response?.data?.error || 'Update failed';
      showMsg('error', errMsg); 
    }
    setLoading(false);
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError(''); 

    // 1. Validate Password Strength
    const validationError = checkPasswordRequirements(passwords.new);
    if (validationError) {
      setPasswordError(validationError);
      return;
    }

    // 2. Validate Match
    if (passwords.new !== passwords.confirm) {
      showMsg('error', 'New passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await api.put('/auth/password', { currentPassword: passwords.current, newPassword: passwords.new });
      showMsg('success', 'Password changed successfully');
      setPasswords({ current: '', new: '', confirm: '' });
    } catch (err) { 
      showMsg('error', err.response?.data?.error || 'Failed to change password'); 
    }
    setLoading(false);
  };

  // Toggle SMS Settings
  const handleNotificationToggle = async (key) => {
    if (key === 'confirmation' || key === 'refund') return; 
    
    const newPrefs = { ...notifications, [key]: !notifications[key] };
    setNotifications(newPrefs);
    savePreferences({ ...newPrefs, in_app: inAppPrefs });
  };

  // Toggle In-App Settings
  const handleInAppToggle = async (key) => {
    const newInApp = { ...inAppPrefs, [key]: !inAppPrefs[key] };
    setInAppPrefs(newInApp);
    const mergedPrefs = { ...notifications, in_app: newInApp };
    savePreferences(mergedPrefs);
  };

  const savePreferences = async (prefs) => {
    try {
        await api.put('/auth/notifications', { preferences: prefs });
        const updatedUser = { ...user, notification_preferences: prefs };
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
    } catch (err) { 
      console.error('Failed to save prefs:', err.response?.data || err.message);
      showMsg('error', 'Failed to save setting.');
    }
  };

  const handleHoursUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.put('/auth/business-hours', hours);
      showMsg('success', 'Business hours updated!');
      const updatedUser = { ...user, ...hours };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    } catch (err) { 
      showMsg('error', err.response?.data?.error || 'Failed to update hours'); 
    }
    setLoading(false);
  };

  // Helper style for red borders
  const errorInputStyle = { border: '1px solid red', backgroundColor: '#fff0f0' };

  return (
    <div className="settings-container">
      <h2>⚙️ Account Settings</h2>
      {message.text && <div className={`settings-alert ${message.type}`}>{message.text}</div>}

      {/* MAIN TAB NAVIGATION */}
      <div className="settings-tabs">
        <button className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
            <User size={16} /> Profile
        </button>
        <button className={`tab-btn ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveTab('notifications')}>
            <Bell size={16} /> Notifications
        </button>
        {user?.user_type === 'provider' && (
          <button className={`tab-btn ${activeTab === 'hours' ? 'active' : ''}`} onClick={() => setActiveTab('hours')}>
              <Briefcase size={16} /> Business Hours
          </button>
        )}
      </div>

      {/* === PROFILE TAB === */}
      {activeTab === 'profile' && (
        <div className="settings-section profile-layout">
          <div className="profile-column">
            <h3>Personal Details</h3>
            <form onSubmit={handleProfileUpdate} className="settings-form">
              <div className="form-group">
                <label>Full Name</label>
                <input type="text" value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Mobile Number</label>
                <input type="tel" value={profile.phone} onChange={e => setProfile({...profile, phone: e.target.value})} placeholder="0712345678" required />
                <small style={{color: '#666', display: 'block', marginTop: '5px'}}>We will format this to +254 automatically.</small>
              </div>

              {/* ✅ GENDER FIELD (DISABLED) */}
              <div className="form-group">
                <label>Gender <small style={{color:'#888'}}>(Cannot be changed)</small></label>
                <select 
                  value={profile.gender} 
                  disabled 
                  style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed', color: '#6b7280' }}
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>

              {/* ✅ DOB FIELD (DISABLED) */}
              <div className="form-group">
                <label>Date of Birth <small style={{color:'#888'}}>(Cannot be changed)</small></label>
                <input 
                  type="date" 
                  value={profile.dob} 
                  disabled 
                  style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed', color: '#6b7280' }}
                />
              </div>

              {user.user_type === 'provider' && (
                <div className="form-group">
                  <label>Business Name</label>
                  <input type="text" value={profile.business_name} onChange={e => setProfile({...profile, business_name: e.target.value})} />
                </div>
              )}
              <button type="submit" className="save-btn" disabled={loading}>
                {loading ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </form>
          </div>

          <div className="profile-column password-column">
            <h3>Change Password</h3>
            <form onSubmit={handlePasswordChange} className="settings-form">
              <div className="form-group">
                <label>Current Password</label>
                <input type="password" value={passwords.current} onChange={e => setPasswords({...passwords, current: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>New Password</label>
                <input 
                  type="password" 
                  value={passwords.new} 
                  onChange={e => {
                    setPasswords({...passwords, new: e.target.value});
                    if (passwordError) setPasswordError('');
                  }} 
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
                <label>Confirm New Password</label>
                <input type="password" value={passwords.confirm} onChange={e => setPasswords({...passwords, confirm: e.target.value})} required />
              </div>
              <button type="submit" className="save-btn btn-secondary" disabled={loading}>
                {loading ? 'Processing...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* === NOTIFICATIONS TAB === */}
      {activeTab === 'notifications' && (
        <div className="settings-section">
          <div className="section-header-row">
              <h3>Notification Preferences</h3>
              
              <div className="pill-nav">
                  <button 
                    className={`pill-btn ${notifSubTab === 'sms' ? 'active' : ''}`}
                    onClick={() => setNotifSubTab('sms')}
                  >
                    <MessageSquare size={14} /> SMS
                  </button>
                  <button 
                    className={`pill-btn ${notifSubTab === 'in-app' ? 'active' : ''}`}
                    onClick={() => setNotifSubTab('in-app')}
                  >
                    <Bell size={14} /> In-App
                  </button>
              </div>
          </div>

          {notifSubTab === 'sms' && (
              <div className="notif-group fade-in">
                  <p className="section-desc">Manage text messages sent to your phone.</p>
                  
                  <Toggle label="Booking Confirmation" desc="Sent immediately after booking." checked={true} disabled />
                  <Toggle label="Booking Accepted" desc="When provider confirms." checked={notifications.acceptance} onChange={() => handleNotificationToggle('acceptance')} />
                  <Toggle label="Reminders" desc="24 hours before appointment." checked={notifications.reminder} onChange={() => handleNotificationToggle('reminder')} />
                  <Toggle label="Cancellations" desc="If appointment is cancelled." checked={notifications.cancellation} onChange={() => handleNotificationToggle('cancellation')} />
                  <Toggle label="Payment Receipts" desc="Transaction confirmations." checked={notifications.receipt} onChange={() => handleNotificationToggle('receipt')} />
                  
                  <Toggle label="Refund Notifications" desc="Sent when refunds are processed (Required)" checked={true} disabled />

                  {user.user_type === 'provider' && (
                    <>
                      <Toggle label="New Requests" desc="Notifications for new client bookings." checked={notifications.new_request} onChange={() => handleNotificationToggle('new_request')} />
                      <Toggle label="Refund Requests" desc="When clients cancel and request refunds (Required)" checked={true} disabled />
                    </>
                  )}
              </div>
          )}

          {notifSubTab === 'in-app' && (
              <div className="notif-group fade-in">
                  <p className="section-desc">Control what appears in your notification bell.</p>
                  
                  <Toggle 
                    label="Booking Alerts" 
                    desc="New bookings, status changes, and approvals." 
                    checked={inAppPrefs.booking_alerts} 
                    onChange={() => handleInAppToggle('booking_alerts')} 
                  />
                  <Toggle 
                    label="System Updates" 
                    desc="Important platform announcements and maintenance." 
                    checked={inAppPrefs.system_updates} 
                    onChange={() => handleInAppToggle('system_updates')} 
                  />
                  <Toggle 
                    label="Payment Alerts" 
                    desc="Confirmations of deposits and balance payments." 
                    checked={inAppPrefs.payment_alerts} 
                    onChange={() => handleInAppToggle('payment_alerts')} 
                  />
                  <Toggle 
                    label="In-App Reminders" 
                    desc="Pop-up reminders when you are online." 
                    checked={inAppPrefs.reminders} 
                    onChange={() => handleInAppToggle('reminders')} 
                  />
              </div>
          )}
        </div>
      )}

      {/* === BUSINESS HOURS TAB === */}
      {activeTab === 'hours' && (
        <div className="settings-section">
          <h3>Business Hours</h3>
          <p className="section-desc">Set your operating hours to control availability.</p>
          <form onSubmit={handleHoursUpdate} style={{ maxWidth: '400px' }}>
             <div className="form-group">
               <label>Opening Time <Clock size={14} style={{marginLeft:'5px', color:'#666'}} /></label>
               <input type="time" value={hours.opening_time} onChange={e => setHours({...hours, opening_time: e.target.value})} />
             </div>
             <div className="form-group">
               <label>Closing Time <Clock size={14} style={{marginLeft:'5px', color:'#666'}} /></label>
               <input type="time" value={hours.closing_time} onChange={e => setHours({...hours, closing_time: e.target.value})} />
             </div>
             <button type="submit" className="save-btn" disabled={loading}>Save Business Hours</button>
          </form>
        </div>
      )}
    </div>
  );
};

const Toggle = ({ label, desc, checked, onChange, disabled }) => (
  <div className="toggle-row">
    <div>
      <h4>{label} {disabled && <span style={{color:'#ef4444', fontSize:'0.75em', fontWeight:'600'}}>(Required)</span>}</h4>
      <p>{desc}</p>
    </div>
    <label className="switch">
      <input type="checkbox" checked={!!checked} onChange={onChange} disabled={disabled} />
      <span className="slider round"></span>
    </label>
  </div>
);

export default Settings;