import React, { useState, useEffect } from 'react';
import api from '../services/auth';
import './Settings.css';

const Settings = ({ user, setUser }) => {
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // States
  const [profile, setProfile] = useState({ name: '', phone: '', business_name: '' });
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  
  // ✅ ADDED: Refund toggles (default true)
  const [notifications, setNotifications] = useState({
    confirmation: true, 
    acceptance: true, 
    reminder: true, 
    cancellation: true, 
    receipt: true, 
    new_request: true,
    refund: true // Mandatory
  });
  
  const [hours, setHours] = useState({ opening_time: '08:00', closing_time: '18:00' });

  useEffect(() => {
    if (user) {
      setProfile({ 
        name: user.name || '', 
        phone: user.phone || '', 
        business_name: user.business_name || '' 
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
        setNotifications(prev => ({ ...prev, ...prefs }));
      }
    }
  }, [user]);

  const showMsg = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 4000);
  };

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
    if (passwords.new !== passwords.confirm) return showMsg('error', 'New passwords do not match');
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

  const handleNotificationToggle = async (key) => {
    if (key === 'confirmation' || key === 'refund') return; // Locked toggles
    
    const newPrefs = { ...notifications, [key]: !notifications[key] };
    setNotifications(newPrefs);

    try {
      await api.put('/auth/notifications', { preferences: newPrefs });
      
      const updatedUser = { ...user, notification_preferences: newPrefs };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      
    } catch (err) { 
      console.error('Failed to save prefs:', err.response?.data || err.message);
      setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
      showMsg('error', 'Failed to save setting. Try refreshing.');
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

  return (
    <div className="settings-container">
      <h2>⚙️ Account Settings</h2>
      {message.text && <div className={`settings-alert ${message.type}`}>{message.text}</div>}

      <div className="settings-tabs">
        <button className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>Profile</button>
        <button className={`tab-btn ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveTab('notifications')}>Notifications</button>
        {user?.user_type === 'provider' && (
          <button className={`tab-btn ${activeTab === 'hours' ? 'active' : ''}`} onClick={() => setActiveTab('hours')}>Business Hours</button>
        )}
      </div>

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
                <input type="password" value={passwords.new} onChange={e => setPasswords({...passwords, new: e.target.value})} required minLength={6} />
              </div>
              <div className="form-group">
                <label>Confirm New</label>
                <input type="password" value={passwords.confirm} onChange={e => setPasswords({...passwords, confirm: e.target.value})} required />
              </div>
              <button type="submit" className="save-btn btn-secondary" disabled={loading}>
                {loading ? 'Processing...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="settings-section">
          <h3>SMS Preferences</h3>
          <p className="section-desc">Toggle which SMS notifications you receive.</p>
          
          <Toggle label="Booking Confirmation" desc="Sent immediately after booking." checked={true} disabled />
          <Toggle label="Booking Accepted" desc="When provider confirms." checked={notifications.acceptance} onChange={() => handleNotificationToggle('acceptance')} />
          <Toggle label="Reminders" desc="24 hours before appointment." checked={notifications.reminder} onChange={() => handleNotificationToggle('reminder')} />
          <Toggle label="Cancellations" desc="If appointment is cancelled." checked={notifications.cancellation} onChange={() => handleNotificationToggle('cancellation')} />
          <Toggle label="Payment Receipts" desc="Transaction confirmations." checked={notifications.receipt} onChange={() => handleNotificationToggle('receipt')} />
          
          {/* ✅ ADDED: Refund Notification Toggle (Locked) */}
          <Toggle 
            label="Refund Notifications" 
            desc="Sent when refunds are processed (Required)" 
            checked={true} 
            disabled 
          />

          {user.user_type === 'provider' && (
             <>
               <Toggle label="New Requests" desc="Notifications for new client bookings." checked={notifications.new_request} onChange={() => handleNotificationToggle('new_request')} />
               {/* ✅ ADDED: Provider Refund Request Toggle (Locked) */}
               <Toggle 
                 label="Refund Requests" 
                 desc="When clients cancel and request refunds (Required)" 
                 checked={true} 
                 disabled 
               />
             </>
          )}
        </div>
      )}

      {activeTab === 'hours' && (
        <div className="settings-section">
          <h3>Business Hours</h3>
          <p className="section-desc">Set your operating hours to control availability.</p>
          <form onSubmit={handleHoursUpdate} style={{ maxWidth: '400px' }}>
             <div className="form-group">
               <label>Opening Time</label>
               <input type="time" value={hours.opening_time} onChange={e => setHours({...hours, opening_time: e.target.value})} />
             </div>
             <div className="form-group">
               <label>Closing Time</label>
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