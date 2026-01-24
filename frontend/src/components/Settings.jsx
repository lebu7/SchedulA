/* frontend/src/components/Settings.jsx */
import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom'; 
import api from '../services/auth';
import { MessageSquare, Bell, Clock, User, Briefcase } from 'lucide-react'; 
import './Settings.css';

// 🏙️ Nairobi Suburbs Data
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

const Settings = ({ user, setUser }) => {
  const location = useLocation(); 
  
  const [activeTab, setActiveTab] = useState(() => {
      const validTabs = ['profile', 'notifications', 'hours'];
      if (location.state?.subTab && validTabs.includes(location.state.subTab)) {
          return location.state.subTab;
      }
      return 'profile';
  });

  const [notifSubTab, setNotifSubTab] = useState('sms');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [hasChanges, setHasChanges] = useState(false); 

  const [profile, setProfile] = useState({ 
    name: '', 
    phone: '', 
    business_name: '', 
    gender: '', 
    dob: '',
    suburb: '',           
    business_address: '', 
    google_maps_link: '' 
  });

  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [passwordError, setPasswordError] = useState(''); 
  
  const [notifications, setNotifications] = useState({
    confirmation: true, acceptance: true, reminder: true, cancellation: true, receipt: true, new_request: true, refund: true 
  });

  const [inAppPrefs, setInAppPrefs] = useState({
    booking_alerts: true, system_updates: true, payment_alerts: true, reminders: true
  });
  
  const [hours, setHours] = useState({ 
    opening_time: '08:00', 
    closing_time: '18:00',
    is_open_sat: false,
    is_open_sun: false
  });

  useEffect(() => {
    if (user) {
      setProfile({ 
        name: user.name || '', 
        phone: user.phone || '', 
        business_name: user.business_name || '',
        gender: user.gender || '', 
        dob: user.dob ? user.dob.split('T')[0] : '',
        suburb: user.suburb || '',                 
        business_address: user.business_address || '', 
        google_maps_link: user.google_maps_link || ''
      });
      
      setHours({ 
        opening_time: user.opening_time || '08:00', 
        closing_time: user.closing_time || '18:00',
        is_open_sat: !!user.is_open_sat,
        is_open_sun: !!user.is_open_sun
      });

      if (user.notification_preferences) {
        let prefs = user.notification_preferences;
        if (typeof prefs === 'string') {
            try { prefs = JSON.parse(prefs); } catch (e) { prefs = {}; }
        }
        setNotifications(prev => ({ ...prev, ...prefs }));
        if (prefs.in_app) {
            setInAppPrefs(prev => ({ ...prev, ...prefs.in_app }));
        }
      }
      setHasChanges(false); 
    }
  }, [user]);

  // ✅ IMPROVED COMPARISON LOGIC
  useEffect(() => {
    if (!user) return;

    const profileChanged = 
      profile.name !== (user.name || '') ||
      profile.phone !== (user.phone || '') ||
      profile.business_name !== (user.business_name || '') ||
      profile.suburb !== (user.suburb || '') ||
      profile.business_address !== (user.business_address || '') ||
      profile.google_maps_link !== (user.google_maps_link || '');

    const hoursChanged = 
      hours.opening_time !== (user.opening_time || '08:00') ||
      hours.closing_time !== (user.closing_time || '18:00') ||
      hours.is_open_sat !== (!!user.is_open_sat) ||
      hours.is_open_sun !== (!!user.is_open_sun);

    setHasChanges(profileChanged || hoursChanged);
  }, [profile, hours, user]);

  useEffect(() => {
    const validTabs = ['profile', 'notifications', 'hours'];
    if (location.state?.subTab && validTabs.includes(location.state.subTab)) {
      setActiveTab(location.state.subTab);
    }
  }, [location.state]);

  // ✅ AUTOMATIC +254 HANDLER
  const handlePhoneChange = (e) => {
    let val = e.target.value;
    
    // If the field is empty or user tries to delete the prefix, reset to +254
    if (!val.startsWith('+254')) {
      val = '+254';
    }
    
    // Only allow digits after the prefix
    const prefix = '+254';
    const rest = val.slice(4).replace(/\D/g, '').slice(0, 9); // Limit to 9 digits after prefix
    
    setProfile({ ...profile, phone: prefix + rest });
    setHasChanges(true);
  };

  const showMsg = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 4000);
  };

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

    try {
      const res = await api.put('/auth/profile', profile);
      showMsg('success', 'Profile updated successfully!');
      
      const updatedUser = { ...user, ...res.data.user };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser)); 
      setHasChanges(false);
    } catch (err) { 
      const errMsg = err.response?.data?.errors?.[0]?.msg || err.response?.data?.error || 'Update failed';
      showMsg('error', errMsg); 
    }
    setLoading(false);
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError(''); 

    const validationError = checkPasswordRequirements(passwords.new);
    if (validationError) {
      setPasswordError(validationError);
      return;
    }

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

  const handleNotificationToggle = async (key) => {
    if (key === 'confirmation' || key === 'refund') return; 
    const newPrefs = { ...notifications, [key]: !notifications[key] };
    setNotifications(newPrefs);
    savePreferences({ ...newPrefs, in_app: inAppPrefs });
  };

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
      showMsg('error', 'Failed to save setting.');
    }
  };

  const handleBusinessInfoUpdate = async (e) => {
    e.preventDefault();

    if (!profile.suburb || !profile.business_address) {
        showMsg('error', 'Suburb and Business Address are compulsory.');
        return;
    }

    setLoading(true);
    try {
      await api.put('/auth/business-hours', hours);
      const profileRes = await api.put('/auth/profile', { ...profile, is_hours_update: true });
      
      showMsg('success', 'Business settings updated!');
      const updatedUser = { ...user, ...hours, ...profileRes.data.user };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setHasChanges(false);
    } catch (err) { 
      showMsg('error', err.response?.data?.error || 'Failed to update settings'); 
    }
    setLoading(false);
  };

  const smallInputStyle = { padding: '8px 10px', fontSize: '13px', height: 'auto' };

  return (
    <div className="settings-container">
      <h2>⚙️ Account Settings</h2>
      {message.text && <div className={`settings-alert ${message.type}`}>{message.text}</div>}

      <div className="settings-tabs">
        <button className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
            <User size={16} /> Profile
        </button>
        <button className={`tab-btn ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveTab('notifications')}>
            <Bell size={16} /> Notifications
        </button>
        {user?.user_type === 'provider' && (
          <button className={`tab-btn ${activeTab === 'hours' ? 'active' : ''}`} onClick={() => setActiveTab('hours')}>
              <Briefcase size={16} /> Business Info
          </button>
        )}
      </div>

      {activeTab === 'profile' && (
        <div className="settings-section profile-layout">
          <div className="profile-column">
            <h3>Personal Details</h3>
            <form onSubmit={handleProfileUpdate} className="settings-form">
              <div className="form-group">
                <label>Full Name</label>
                <input type="text" value={profile.name} onChange={e => { setProfile({...profile, name: e.target.value}); setHasChanges(true); }} required />
              </div>
              <div className="form-group">
                <label>Mobile Number</label>
                {/* ✅ UPDATED INPUT WITH PREFIX HANDLER */}
                <input 
                  type="tel" 
                  value={profile.phone} 
                  onChange={handlePhoneChange}
                  placeholder="+254XXXXXXXXX"
                  required 
                />
              </div>
              <div className="form-group">
                <label>Gender <small style={{color:'#888'}}>(Cannot be changed)</small></label>
                <select value={profile.gender} disabled style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed', color: '#6b7280' }}>
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
              <div className="form-group">
                <label>Date of Birth <small style={{color:'#888'}}>(Cannot be changed)</small></label>
                <input type="date" value={profile.dob} disabled style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed', color: '#6b7280' }} />
              </div>
              {user.user_type === 'provider' && (
                <div className="form-group">
                  <label>Business Name</label>
                  <input type="text" value={profile.business_name} onChange={e => { setProfile({...profile, business_name: e.target.value}); setHasChanges(true); }} />
                </div>
              )}
              <button type="submit" className="save-btn" disabled={loading || !hasChanges}>
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
                  style={passwordError ? { border: '1px solid red', backgroundColor: '#fff0f0' } : {}}
                />
                <div style={{ marginTop: '5px', fontSize: '0.85rem' }}>
                  {passwordError ? (
                    <span style={{ color: 'red', fontWeight: 'bold' }}>⚠️ {passwordError}</span>
                  ) : (
                    <span style={{ color: '#666' }}>Requirement: 8+ chars, Uppercase, Lowercase, Number & Symbol.</span>
                  )}
                </div>
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <input type="password" value={passwords.confirm} onChange={e => setPasswords({...passwords, confirm: e.target.value})} required />
              </div>
              <button type="submit" className="save-btn btn-secondary" disabled={loading}>Update Password</button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="settings-section">
          <div className="section-header-row">
              <div className="toggle-info">
                  <h3>Notification Preferences</h3>
                  <p className="section-desc">Manage how we keep you updated.</p>
              </div>
              <div className="pill-nav">
                  <button className={`pill-btn ${notifSubTab === 'sms' ? 'active' : ''}`} onClick={() => setNotifSubTab('sms')}>
                    <MessageSquare size={14} /> SMS
                  </button>
                  <button className={`pill-btn ${notifSubTab === 'in-app' ? 'active' : ''}`} onClick={() => setNotifSubTab('in-app')}>
                    <Bell size={14} /> In-App
                  </button>
              </div>
          </div>
          {notifSubTab === 'sms' && (
              <div className="notif-group fade-in">
                  <Toggle label="Booking Confirmation" desc="Sent immediately after booking." checked={true} disabled />
                  <Toggle label="Booking Accepted" desc="When provider confirms." checked={notifications.acceptance} onChange={() => handleNotificationToggle('acceptance')} />
                  <Toggle label="Reminders" desc="24 hours before appointment." checked={notifications.reminder} onChange={() => handleNotificationToggle('reminder')} />
                  <Toggle label="Cancellations" desc="If appointment is cancelled." checked={notifications.cancellation} onChange={() => handleNotificationToggle('cancellation')} />
                  <Toggle label="Payment Receipts" desc="Transaction confirmations." checked={notifications.receipt} onChange={() => handleNotificationToggle('receipt')} />
                  <Toggle label="Refund Notifications" desc="Sent when refunds are processed (Required)" checked={true} disabled />
                  {user.user_type === 'provider' && (
                    <Toggle label="New Requests" desc="Notifications for new client bookings." checked={notifications.new_request} onChange={() => handleNotificationToggle('new_request')} />
                  )}
              </div>
          )}
          {notifSubTab === 'in-app' && (
              <div className="notif-group fade-in">
                  <Toggle label="Booking Alerts" desc="New bookings and status changes." checked={inAppPrefs.booking_alerts} onChange={() => handleInAppToggle('booking_alerts')} />
                  <Toggle label="System Updates" desc="Important platform announcements." checked={inAppPrefs.system_updates} onChange={() => handleInAppToggle('system_updates')} />
                  <Toggle label="Payment Alerts" desc="Confirmations of deposits." checked={inAppPrefs.payment_alerts} onChange={() => handleInAppToggle('payment_alerts')} />
                  <Toggle label="Reminders" desc="In-app appointment reminders." checked={inAppPrefs.reminders} onChange={() => handleInAppToggle('reminders')} />
              </div>
          )}
        </div>
      )}

      {activeTab === 'hours' && (
        <div className="settings-section">
          <form onSubmit={handleBusinessInfoUpdate} className="settings-form">
             <div style={{marginBottom: '25px', paddingBottom: '20px', borderBottom: '1px dashed #e2e8f0'}}>
                <h4 style={{fontSize: '0.95rem', color: '#334155', marginBottom: '15px'}}>📍 Location (Required)</h4>
                <div style={{display:'flex', gap:'20px', marginBottom: '15px'}}>
                    <div className="form-group" style={{flex: 1}}>
                        <label>Suburb *</label>
                        <select value={profile.suburb} onChange={(e) => { setProfile(p => ({ ...p, suburb: e.target.value })); setHasChanges(true); }} className="suburb-dropdown" required>
                            <option value="">Select Suburb</option>
                            {Object.keys(NAIROBI_SUBURBS).sort().map(letter => (
                                <optgroup key={letter} label={letter}>
                                    {NAIROBI_SUBURBS[letter].map(sub => (<option key={sub} value={sub}>{sub}</option>))}
                                </optgroup>
                            ))}
                        </select>
                    </div>
                    <div className="form-group" style={{flex: 2}}>
                        <label>Business Address / Landmark *</label>
                        <input type="text" value={profile.business_address} onChange={e => { setProfile({...profile, business_address: e.target.value}); setHasChanges(true); }} placeholder="e.g. 2nd Floor, City Mall" style={smallInputStyle} required />
                    </div>
                </div>
                <div className="form-group">
                    <label>Google Maps Link <small style={{color:'#64748b'}}>(Optional)</small></label>
                    <input type="url" value={profile.google_maps_link} onChange={e => { setProfile({...profile, google_maps_link: e.target.value}); setHasChanges(true); }} placeholder="Paste link here" style={smallInputStyle} />
                </div>
             </div>
             <div style={{display: 'flex', gap: '30px', alignItems: 'flex-start'}}>
                <div style={{flex: 1}}>
                    <h4 style={{fontSize: '0.95rem', color: '#334155', marginBottom: '15px'}}>⏰ Mon-Fri Hours</h4>
                    <div className="form-group-row" style={{display:'flex', gap:'15px'}}>
                        <div className="form-group" style={{flex:1}}>
                            <label>Opening</label>
                            <input type="time" value={hours.opening_time} onChange={e => { setHours({...hours, opening_time: e.target.value}); setHasChanges(true); }} style={smallInputStyle} />
                        </div>
                        <div className="form-group" style={{flex:1}}>
                            <label>Closing</label>
                            <input type="time" value={hours.closing_time} onChange={e => { setHours({...hours, closing_time: e.target.value}); setHasChanges(true); }} style={smallInputStyle} />
                        </div>
                    </div>
                </div>
                <div style={{flex: 1.2, padding: '15px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0'}}>
                    <h5 style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px' }}>Weekend Operations</h5>
                    <Toggle label="Open on Saturdays" desc="Operate on Saturdays" checked={hours.is_open_sat} onChange={() => { setHours({...hours, is_open_sat: !hours.is_open_sat}); setHasChanges(true); }} />
                    <div style={{ height: '12px' }}></div>
                    <Toggle label="Open on Sundays" desc="Operate on Sundays" checked={hours.is_open_sun} onChange={() => { setHours({...hours, is_open_sun: !hours.is_open_sun}); setHasChanges(true); }} />
                </div>
             </div>
             <button type="submit" className="save-btn" style={{marginTop: '30px'}} disabled={loading || !hasChanges}>
                {loading ? 'Saving...' : 'Save All Changes'}
             </button>
          </form>
        </div>
      )}
    </div>
  );
};

const Toggle = ({ label, desc, checked, onChange, disabled }) => (
  <div className="toggle-row" style={{marginBottom: 0}}>
    <div className="toggle-info">
      <h4>{label} {disabled && <span style={{color:'#ef4444', fontSize:'11px', fontWeight:'600'}}>(Required)</span>}</h4>
      <p>{desc}</p>
    </div>
    <label className="switch">
      <input type="checkbox" checked={!!checked} onChange={onChange} disabled={disabled} />
      <span className="slider round"></span>
    </label>
  </div>
);

export default Settings;