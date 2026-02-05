import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import api from '../services/auth';
import NotificationCenter from './NotificationCenter';
import { LogOut, User, X, Edit, Phone, Calendar, Briefcase, Clock, Menu } from 'lucide-react';
import './Header.css';

function Header({ user, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [showModal, setShowModal] = useState(false);
  const [userStats, setUserStats] = useState({
    total_services: 0,
    total_staff: 0,
    upcoming_services: 0,
  });

  // ✅ Mobile dropdown ONLY
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileBtnRef = useRef(null);

  // ✅ portal coords
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 210 });

  useEffect(() => {
    if (!user) return;
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Close mobile dropdown on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const fetchStats = async () => {
    try {
      const res = await api.get('/insights/summary');
      if (res.data) setUserStats(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const getAvatarClass = () => {
    const gender = user?.gender?.toLowerCase();
    return 'header-avatar' + (gender === 'male' ? ' male' : gender === 'female' ? ' female' : '');
  };

  const openDashboardMenu = () => {
    window.dispatchEvent(new CustomEvent('toggleDashboardNav'));
  };

  // ✅ Mobile: open same profile modal as desktop
  const openProfileModalFromMobile = () => {
    setIsMobileMenuOpen(false);
    setShowModal(true);
  };

  const handleLogout = () => {
    setIsMobileMenuOpen(false);
    onLogout?.();
  };

  // ✅ Update portal position (and clamp to viewport)
  const updateMobileMenuPosition = () => {
    if (!mobileBtnRef.current) return;

    const rect = mobileBtnRef.current.getBoundingClientRect();
    const width = 210;
    const padding = 10;

    let left = rect.right - width; // align right edges
    left = Math.max(padding, Math.min(left, window.innerWidth - width - padding));

    const top = rect.bottom + 12;

    setMenuPos({ top, left, width });
  };

  // ✅ when menu opens, position it
  useLayoutEffect(() => {
    if (!isMobileMenuOpen) return;
    updateMobileMenuPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileMenuOpen]);

  // ✅ keep positioned on scroll/resize
  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const onScroll = () => updateMobileMenuPosition();
    const onResize = () => updateMobileMenuPosition();

    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileMenuOpen]);

  // ✅ outside click close (works with portal)
  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const onPointerDown = (e) => {
      // if clicked avatar button => ignore (toggle handles)
      if (mobileBtnRef.current && mobileBtnRef.current.contains(e.target)) return;

      // if clicked inside dropdown => ignore
      const dropdown = document.getElementById('mobile-user-dropdown-portal');
      if (dropdown && dropdown.contains(e.target)) return;

      setIsMobileMenuOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [isMobileMenuOpen]);

  const toggleMobileMenu = (e) => {
    e.stopPropagation();
    setIsMobileMenuOpen((v) => !v);
  };

  return (
    <>
      <header className="header">
        <div className="container header-content">
          {/* Mobile hamburger (left) */}
          {user ? (
            <button className="mobile-menu-btn" onClick={openDashboardMenu} aria-label="Open menu">
              <Menu size={20} />
            </button>
          ) : (
            <div className="mobile-menu-spacer" />
          )}

          <div className="logo-section">
            <Link to="/" style={{ textDecoration: 'none' }}>
              <h1>📅 Schedula</h1>
            </Link>
          </div>

          {user ? (
            <div className="user-menu">
              <NotificationCenter />

              {/* ✅ DESKTOP: name + avatar (avatar opens profile modal) */}
              <div className="user-info desktop-only">
                <span className="user-name" title="View Profile">
                  {user.name.split(' ')[0]}
                  <small>({user.user_type})</small>
                </span>

                <button
                  type="button"
                  className={getAvatarClass()}
                  onClick={() => setShowModal(true)}
                  title="View Profile"
                  aria-label="Open profile"
                >
                  <User size={20} color="#fff" />
                </button>
              </div>

              {/* ✅ MOBILE: avatar opens portal dropdown */}
              <div className="mobile-user-area">
                <button
                  ref={mobileBtnRef}
                  type="button"
                  className={getAvatarClass()}
                  onClick={toggleMobileMenu}
                  title="Account"
                  aria-label="Open account menu"
                >
                  <User size={20} color="#fff" />
                </button>
              </div>

              {/* ✅ DESKTOP LOGOUT BUTTON (RESTORED) */}
              <button onClick={onLogout} className="btn-logout desktop-only">
                <LogOut size={18} />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <div className="auth-links">
              <Link to="/login" className="btn btn-outline">
                Login
              </Link>
              <Link to="/register" className="btn btn-primary">
                Register
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* ✅ MOBILE DROPDOWN PORTAL */}
      {isMobileMenuOpen &&
        createPortal(
          <div
            id="mobile-user-dropdown-portal"
            className="mobile-user-dropdown-portal"
            style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
            role="menu"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="mobile-user-header">
              <div className="mobile-user-title">{user?.name?.split(' ')[0]}</div>
              <div className="mobile-user-sub">({user?.user_type})</div>
            </div>

            {/* ✅ Profile opens same modal as desktop */}
            <button type="button" className="mobile-user-item" onClick={openProfileModalFromMobile} role="menuitem">
              <User size={16} />
              <span>Profile</span>
            </button>

            <button type="button" className="mobile-user-item danger" onClick={handleLogout} role="menuitem">
              <LogOut size={16} />
              <span>Logout</span>
            </button>
          </div>,
          document.body
        )}

      {/* ✅ Profile Modal */}
      {showModal && user && (
        <div className="modal-overlay" onPointerDown={() => setShowModal(false)}>
          <div className="modal-content profile-modal" onPointerDown={(e) => e.stopPropagation()}>
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
                  navigate('/dashboard', { state: { tab: 'settings', subTab: 'profile' } });
                }}
              >
                <Edit size={14} /> Edit Profile
              </button>
            </div>

            <div className="profile-details-grid">
              <div className="detail-item">
                <span className="label">Phone</span>
                <div className="value">
                  <Phone size={14} /> {user.phone || 'N/A'}
                </div>
              </div>

              <div className="detail-item">
                <span className="label">Gender</span>
                <div className="value">
                  <User size={14} /> {user.gender || 'N/A'}
                </div>
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
                  <div className="value">
                    <Briefcase size={14} /> {user.business_name}
                  </div>
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
