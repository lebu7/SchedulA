/* frontend/src/components/Header.jsx */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/auth';
import NotificationCenter from './NotificationCenter';
import { 
  LogOut, User, X, Edit, Phone, Calendar, 
  Briefcase, Clock 
} from 'lucide-react';
import './Header.css';

function Header({ user, onLogout }) {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [userStats, setUserStats] = useState({ total_services: 0, total_staff: 0, upcoming_services: 0 });

  useEffect(() => {
    if (!user) return;
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, [user]);

  const fetchStats = async () => {
    try {
      const res = await api.get('/insights/summary');
      if (res.data) setUserStats(res.data);
    } catch (err) { console.error(err); }
  };

  const getAvatar = () => {
    if (!user) return null;
    const gender = user.gender?.toLowerCase();
    let avatarClass =
      "header-avatar" +
      (gender === 'male' ? " male" : gender === 'female' ? " female" : "");

    return (
      <div
        className={avatarClass}
        onClick={() => setShowModal(true)}
        title="View Profile"
      >
        <User size={20} color="#fff" />
      </div>
    );
  };

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

              <NotificationCenter />

              {/* User Profile */}
              <div className="user-info">
                <span className="user-name">
                  {user.name.split(' ')[0]}
                  <small>({user.user_type})</small>
                </span>
                {getAvatar()}
              </div>

              <button onClick={onLogout} className="btn-logout">
                <LogOut size={18} />
                <span>Logout</span>
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
            <button className="close-btn" onClick={() => setShowModal(false)}>
              <X size={24} />
            </button>

            <div className="modal-header">
              <div className={`modal-avatar ${user.gender?.toLowerCase() === 'female' ? 'female' : 'male'}`}>
                <User size={40} color="#fff" />
              </div>
              <h3>{user.name}</h3>
              <span className="user-email">{user.email}</span>
              <button
                className="edit-profile-btn"
                onClick={() => {
                  setShowModal(false);
                  navigate('/dashboard', { state: { tab: 'settings' } });
                }}
              >
                <Edit size={14} /> Edit Profile
              </button>
            </div>

            <div className="profile-details-grid">
              <div className="detail-item">
                <span className="label">Phone</span>
                <div className="value"><Phone size={14} /> {user.phone || 'N/A'}</div>
              </div>

              <div className="detail-item">
                <span className="label">Gender</span>
                <div className="value"><User size={14} /> {user.gender || 'N/A'}</div>
              </div>

              <div className="detail-item">
                <span className="label">Birth Date</span>
                <div className="value">
                  <Calendar size={14} /> {user.dob ? new Date(user.dob).toLocaleDateString() : 'N/A'}
                </div>
              </div>

              {user.business_name && (
                <div className="detail-item">
                  <span className="label">Business</span>
                  <div className="value"><Briefcase size={14} /> {user.business_name}</div>
                </div>
              )}
            </div>

            <div className="modal-stats">
              {user.user_type === 'provider' ? (
                <>
                  <div className="modal-stat-box">
                    <h4>{userStats.total_services || 0}</h4>
                    <span>Services</span>
                  </div>
                  <div className="modal-stat-box">
                    <h4>{userStats.total_staff || 0}</h4>
                    <span>Staff</span>
                  </div>
                </>
              ) : (
                <div className="modal-stat-box" style={{ width: '100%', flex: 'none' }}>
                  <h4>{userStats.upcoming_services || 0}</h4>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                    <Clock size={12} color="#64748b" />
                    <span>Upcoming Services</span>
                  </div>
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
