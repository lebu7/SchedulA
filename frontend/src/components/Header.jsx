/* frontend/src/components/Header.jsx */
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import api from '../services/auth';
import { 
  LogOut, User, Bell, CheckCircle, X, Edit, Phone, Calendar, 
  Briefcase, CheckCheck, Clock 
} from 'lucide-react';
import './Header.css';

function Header({ user, onLogout }) {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userStats, setUserStats] = useState({ total_services: 0, total_staff: 0, upcoming_services: 0 });

  const notifRef = useRef(null);      // Ref for the bell icon/wrapper
  const dropdownRef = useRef(null);   // ✅ New Ref for the portal dropdown

  // Fetch data loop
  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    fetchStats();
    const interval = setInterval(() => {
      fetchNotifications();
      fetchStats();
    }, 15000);
    return () => clearInterval(interval);
  }, [user]);

  // ✅ FIXED: Click Outside Handler for Portal
  useEffect(() => {
    const handleClickOutside = (e) => {
      // Close ONLY if click is outside Bell Wrapper AND outside Dropdown
      if (
        notifRef.current && !notifRef.current.contains(e.target) && 
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setShowNotifications(false);
      }
    };

    if (showNotifications) {
        document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showNotifications]);

  const fetchStats = async () => {
    try {
      const res = await api.get('/insights/summary');
      if (res.data) setUserStats(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unread_count || 0);
    } catch (err) { console.error(err); }
  };

  const markAsRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) { console.error(err); }
  };

  const markAllRead = async () => {
    try {
      await api.put('/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch (err) { console.error(err); }
  };

  // ✅ UPDATED: Async handler to ensure markAsRead fires
  const handleNotificationClick = async (notif) => {
    // 1. Mark read immediately (Optimistic Update handled in markAsRead)
    if (!notif.is_read) {
        await markAsRead(notif.id);
    }
    
    // 2. Close dropdown
    setShowNotifications(false);

    // 3. Determine Navigation
    let navState = { tab: 'overview' };
    const title = notif.title || '';
    const type = notif.type;

    if (['booking', 'new_request', 'reschedule'].includes(type)) navState = { tab: 'appointments', subTab: 'pending', targetId: notif.reference_id };
    else if (['cancellation', 'refund', 'refund_request'].includes(type)) navState = { tab: 'appointments', subTab: 'history', targetId: notif.reference_id };
    else if (['payment', 'receipt', 'acceptance'].includes(type)) navState = { tab: 'appointments', subTab: 'upcoming', targetId: notif.reference_id };
    else if (type === 'system') {
      if (title.toLowerCase().includes('service')) navState = { tab: 'services', targetId: notif.reference_id };
      else if (title.toLowerCase().includes('profile')) navState = { tab: 'settings', subTab: 'profile' };
      else if (title.toLowerCase().includes('hours') || title.toLowerCase().includes('location')) navState = { tab: 'settings', subTab: 'hours' };
      else navState = { tab: 'settings', subTab: 'notifications' };
    }

    // 4. Navigate
    navigate('/dashboard', { replace: true, state: navState });
  };

  const getAvatar = () => {
    if (!user) return null;
    const gender = user.gender?.toLowerCase();
    let avatarClass = "header-avatar" + (gender === 'male' ? " male" : gender === 'female' ? " female" : "");
    return <div className={avatarClass} onClick={() => setShowModal(true)} title="View Profile"><User size={20} color="#fff" /></div>;
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return 'Just now';
    try {
      const date = new Date(dateStr);
      const diff = Math.floor((new Date() - date) / 1000);
      if (diff < 60) return 'Just now';
      const mins = Math.floor(diff / 60); if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60); if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24); if (days === 1) return 'Yesterday';
      if (days < 7) return `${days}d ago`;
      return date.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
    } catch { return 'Recently'; }
  };

  // Dynamic position state
  const [dropdownStyle, setDropdownStyle] = useState({});

  useEffect(() => {
    if (showNotifications && notifRef.current) {
        const rect = notifRef.current.getBoundingClientRect();
        setDropdownStyle({
            position: 'absolute',
            top: `${rect.bottom + window.scrollY + 10}px`, // 10px offset
            right: `${window.innerWidth - rect.right}px`,  // Align right
            zIndex: 9999
        });
    }
  }, [showNotifications]);

  return (
    <>
      <header className="header">
        <div className="container header-content">
          <div className="logo-section">
            <Link to="/" style={{ textDecoration: 'none' }}>
              <h1>📅 Schedula</h1>
            </Link>
          </div>

          {user ? (
            <div className="user-menu">
              {/* Notifications Bell */}
              <div className="notification-wrapper" ref={notifRef}>
                <div 
                    className="notification-icon" 
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowNotifications(prev => !prev);
                    }}
                >
                  <Bell size={20} color="#64748b" />
                  {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
                </div>

                {/* Render Dropdown via Portal */}
                {showNotifications && createPortal(
                  <div 
                    className="notification-dropdown" 
                    style={dropdownStyle}
                    ref={dropdownRef} // ✅ Attached Ref here
                    onMouseDown={(e) => e.stopPropagation()} // Stop click-through
                  >
                    <div className="notif-header">
                      <h4>Notifications</h4>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {unreadCount > 0 && (
                            <span 
                                className="mark-read-text" 
                                onClick={(e) => {
                                    e.stopPropagation(); 
                                    markAllRead();
                                }}
                            >
                                <CheckCheck size={14} /> Mark all
                            </span>
                        )}
                        <span onClick={() => setShowNotifications(false)} className="close-notif"><X size={16}/></span>
                      </div>
                    </div>

                    <div className="notif-list">
                      {notifications.length === 0 ? <div className="empty-state">No new notifications</div> :
                        notifications.map(notif => (
                          <div 
                            key={notif.id} 
                            className={`notif-item ${!notif.is_read ? 'unread' : ''}`} 
                            onClick={() => handleNotificationClick(notif)}
                          >
                            {(notif.type === 'system' || notif.title.includes('Welcome')) ? <CheckCircle size={18} className="notif-icon green" /> : <Bell size={18} className="notif-icon blue" />}
                            <div className="notif-text">
                              <p className="notif-title">{notif.title}</p>
                              <p className="notif-message">{notif.message}</p>
                              <p className="notif-time">{timeAgo(notif.created_at)}</p>
                            </div>
                            {!notif.is_read && <div className="unread-dot"></div>}
                          </div>
                        ))}
                    </div>

                    <div className="notif-footer" onClick={() => {
                      setShowNotifications(false);
                      navigate('/dashboard', { state: { tab: 'settings', subTab: 'notifications' } });
                    }}>Manage Settings</div>
                  </div>,
                  document.body
                )}
              </div>

              {/* User Profile */}
              <div className="user-info">
                <span className="user-name">{user.name.split(' ')[0]} <small>({user.user_type})</small></span>
                {getAvatar()}
              </div>

              <button onClick={onLogout} className="btn-logout">
                <LogOut size={18} /><span>Logout</span>
              </button>
            </div>
          ) : (
            <div className="auth-links">
              <Link to="/login" className="btn btn-outline">Login</Link>
              <Link to="/register" className="btn btn-primary">Register</Link>
            </div>
          )}
        </div>
      </header>

      {/* Profile Modal */}
      {showModal && user && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content profile-modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowModal(false)}><X size={24} /></button>
            <div className="modal-header">
              <div className={`modal-avatar ${user.gender?.toLowerCase() === 'female' ? 'female' : 'male'}`}>
                <User size={40} color="#fff" />
              </div>
              <h3>{user.name}</h3>
              <span className="user-email">{user.email}</span>
              <button className="edit-profile-btn" onClick={() => { setShowModal(false); navigate('/dashboard', { state: { tab: 'settings' } }); }}>
                <Edit size={14} /> Edit Profile
              </button>
            </div>
            <div className="profile-details-grid">
              <div className="detail-item"><span className="label">Phone</span><div className="value"><Phone size={14} /> {user.phone || 'N/A'}</div></div>
              <div className="detail-item"><span className="label">Gender</span><div className="value"><User size={14} /> {user.gender || 'N/A'}</div></div>
              <div className="detail-item"><span className="label">Birth Date</span><div className="value"><Calendar size={14} /> {user.dob ? new Date(user.dob).toLocaleDateString() : 'N/A'}</div></div>
              {user.business_name && <div className="detail-item"><span className="label">Business</span><div className="value"><Briefcase size={14} /> {user.business_name}</div></div>}
            </div>
            <div className="modal-stats">
              {user.user_type === 'provider' ? (
                <>
                  <div className="modal-stat-box"><h4>{userStats.total_services || 0}</h4><span>Services</span></div>
                  <div className="modal-stat-box"><h4>{userStats.total_staff || 0}</h4><span>Staff</span></div>
                </>
              ) : (
                <div className="modal-stat-box" style={{ width: '100%', flex: 'none' }}>
                  <h4>{userStats.upcoming_services || 0}</h4>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}><Clock size={12} color="#64748b" /><span>Upcoming Services</span></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Header;