import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/auth';
import ServiceList from './ServiceList';
import ServiceManager from './ServiceManager';
import AppointmentManager from './AppointmentManager';
import Settings from './Settings';
import ProviderAnalytics from './ProviderAnalytics';
import BookingModal from './BookingModal';
import ReviewCarousel from './ReviewCarousel';
import {
  Calendar,
  Clock,
  User,
  DollarSign,
  Plus,
  Bell,
  RefreshCw,
  ChevronRight,
  Briefcase,
  Zap,
  Star,
  Heart,
  MapPin,
  List,
  BarChart2,
  TrendingUp,
  X,
} from 'lucide-react';
import './Dashboard.css';

// ✅ HELPER TO EXTRACT WALK-IN NAME
const getWalkInClientName = (notes) => {
  if (!notes) return 'Walk-In Client';
  const match = notes.match(/Walk-In Client: (.*?)(?: \||$)/);
  if (match && match[1]) return match[1].trim();
  return 'Walk-In Client';
};

function Dashboard({ user, setUser }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboardData, setDashboardData] = useState(null);
  const [providerReviews, setProviderReviews] = useState([]);

  // Favorites State
  const [favorites, setFavorites] = useState({ services: [], providers: [] });
  const [currentFavIndex, setCurrentFavIndex] = useState(0);
  const [currentProvIndex, setCurrentProvIndex] = useState(0);

  // Schedule Carousel State
  const [currentScheduleIndex, setCurrentScheduleIndex] = useState(0);

  // Booking State
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedService, setSelectedService] = useState(null);

  // Mobile Nav Drawer
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  // ---- Back/Forward tab correctness: push state on tab changes ----
  const setTabAndPush = (tabId, extraState = {}) => {
    setActiveTab(tabId);
    navigate('/dashboard', { state: { tab: tabId, ...extraState }, replace: false });
  };

  // Handle Tab Navigation & Target Scrolling (from navigation / notifications)
  useEffect(() => {
    if (!location.state) return;

    const { tab, targetId } = location.state;

    if (tab) setActiveTab(tab);

    if (targetId) {
      setTimeout(() => {
        const el = document.getElementById(`target-${targetId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [location.state]);

  // Listen for hamburger toggle from Header
  useEffect(() => {
    const onToggle = () => setMobileNavOpen((v) => !v);
    const onClose = () => setMobileNavOpen(false);

    window.addEventListener('toggleDashboardNav', onToggle);
    window.addEventListener('closeDashboardNav', onClose);
    return () => {
      window.removeEventListener('toggleDashboardNav', onToggle);
      window.removeEventListener('closeDashboardNav', onClose);
    };
  }, []);

  // Close drawer on tab change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeTab]);

  // ESC closes drawer
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Fetch Dashboard Data
  useEffect(() => {
    if (activeTab !== 'overview') return;

    api
      .get('/insights/summary')
      .then((res) => setDashboardData(res.data))
      .catch((err) => console.error('Dashboard Load Error:', err));

    if (user.user_type === 'provider') {
      api
        .get(`/reviews/provider/${user.id}`)
        .then((res) => setProviderReviews(res.data.reviews || []))
        .catch((err) => console.error('Reviews Load Error:', err));
    }

    if (user.user_type === 'client') {
      api
        .get('/favorites')
        .then((res) => setFavorites(res.data))
        .catch((err) => console.error('Favorites Load Error:', err));
    }
  }, [activeTab, user]);

  // Carousel Logic for Services
  useEffect(() => {
    if (favorites.services.length > 1) {
      const interval = setInterval(() => {
        setCurrentFavIndex((prev) => (prev + 1) % favorites.services.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [favorites.services]);

  // Carousel Logic for Providers
  useEffect(() => {
    if (favorites.providers.length > 2) {
      const interval = setInterval(() => {
        setCurrentProvIndex((prev) => (prev + 1) % favorites.providers.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [favorites.providers]);

  // Carousel Logic for Today's Schedule (Auto-advance every 10s)
  useEffect(() => {
    if (dashboardData?.today_schedule?.length > 2) {
      const interval = setInterval(() => {
        setCurrentScheduleIndex((prev) => {
          const nextIndex = prev + 2;
          return nextIndex >= dashboardData.today_schedule.length ? 0 : nextIndex;
        });
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [dashboardData?.today_schedule]);

  const getCategoryColor = (category) => {
    const cat = category?.toLowerCase() || '';
    if (cat.includes('salon')) return 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)';
    if (cat.includes('spa')) return 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)';
    if (cat.includes('barber')) return 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)';
    return 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
  };

  const handleBookService = (service) => {
    const serviceId = service.item_id || service.id;

    const serviceObj = {
      id: serviceId,
      service_id: serviceId,
      name: service.name,
      price: service.price,
      duration: service.duration,
      provider_id: service.provider_id,
      provider_name: service.provider_name || service.provider_real_name,
      business_name: service.business_name,
    };

    setSelectedService(serviceObj);
    setShowBookingModal(true);
  };

  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const handleAppointmentsTabClick = () => {
    setTabAndPush('appointments', { viewMode: 'list' });
  };

  const handleNextSchedule = () => {
    if (!dashboardData?.today_schedule) return;
    setCurrentScheduleIndex((prev) => {
      const nextIndex = prev + 2;
      return nextIndex >= dashboardData.today_schedule.length ? 0 : nextIndex;
    });
  };

  const tabs = useMemo(() => {
    const t = [
      { id: 'overview', label: 'Overview' },
      { id: 'analytics', label: 'Analytics', providerOnly: true },
      { id: 'services', label: 'Services' },
      {
        id: 'appointments',
        label: user.user_type === 'client' ? 'Schedule' : 'Appointments',
      },
      { id: 'settings', label: 'Settings' },
    ];
    return t.filter((x) => !x.providerOnly || user.user_type === 'provider');
  }, [user.user_type]);

  const UpdatesCard = ({ className = '' }) => (
    <div className={`sidebar-card ${className}`}>
      <h4>
        <Bell size={18} color="#64748b" /> Updates
      </h4>
      <div className="system-updates-list">
        <div className="update-item">
          <div className="dot"></div>
          <div>
            <strong>Platform Update</strong>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
              Improved calendar view coming soon.
            </p>
          </div>
        </div>
        <div className="update-item">
          <div className="dot" style={{ background: '#10b981' }}></div>
          <div>
            <strong>Tips</strong>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
              Complete your profile to attract more clients.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderOverview = () => (
    <div className="dashboard-overview">
      {/* ===== MAIN FEED ===== */}
      <div className="main-feed">
        <div className="welcome-section">
          <div className="welcome-text">
            <h1>
              {getTimeBasedGreeting()}, {user.name.split(' ')[0]}!
            </h1>
            <p>
              {user.user_type === 'provider'
                ? `You have ${dashboardData?.today_metrics?.count || 0} appointments scheduled for today.`
                : 'Ready to find your next great service?'}
            </p>
          </div>
          <button
            className="btn-primary-icon"
            onClick={() => {
              setTabAndPush('appointments', { viewMode: 'calendar' });
            }}
          >
            <Calendar size={18} />
            <span>View Calendar</span>
          </button>
        </div>

        {/* ✅ MOBILE: Client wants Favorite Services visible */}
        {user.user_type === 'client' && favorites.services.length > 0 && (
          <div className="section-block fade-in fav-services-mobile-ok">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '10px',
              }}
            >
              <h3>Favorite Services</h3>
              <div className="carousel-indicators">
                {favorites.services.map((_, idx) => (
                  <span
                    key={idx}
                    className={`indicator-dot ${idx === currentFavIndex ? 'active' : ''}`}
                    onClick={() => setCurrentFavIndex(idx)}
                  ></span>
                ))}
              </div>
            </div>

            <div
              className="favorite-service-card"
              style={{
                background: getCategoryColor(favorites.services[currentFavIndex].category),
              }}
            >
              {(() => {
                const s = favorites.services[currentFavIndex];
                return (
                  <div className="fav-service-content">
                    <div className="fav-icon-box">
                      <Star size={24} color="white" fill="white" />
                    </div>
                    <div className="fav-info">
                      <h4>{s.name}</h4>
                      <p>
                        {s.business_name || s.provider_name} • KES {s.price}
                      </p>
                    </div>
                    <button className="btn-book-fav" onClick={() => handleBookService(s)}>
                      Book Now
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ✅ MOBILE: Updates under banner ONLY for CLIENT (provider wants Updates last) */}
        {user.user_type === 'client' && <UpdatesCard className="updates-mobile-only" />}

        {/* --- PROVIDER VIEW --- */}
        {user.user_type === 'provider' && dashboardData && (
          <>
            {/* Pulse Grid (mobile hides bookings + next client via CSS, keeps revenue) */}
            <div className="pulse-grid">
              <div className="stat-card blue bookings-card">
                <div className="stat-icon">
                  <Calendar size={24} />
                </div>
                <div className="stat-info">
                  <span className="label">Today's Bookings</span>
                  <h3>{dashboardData.today_metrics?.count || 0}</h3>
                  {dashboardData.today_metrics?.pending > 0 && (
                    <span className="alert-text">
                      {dashboardData.today_metrics.pending} pending approval
                    </span>
                  )}
                </div>
              </div>

              <div className="stat-card green revenue-card">
                <div className="stat-icon">
                  <DollarSign size={24} />
                </div>
                <div className="stat-info">
                  <span className="label">Revenue Today</span>
                  <h3>KES {dashboardData.today_metrics?.today_revenue?.toLocaleString() || 0}</h3>
                </div>
              </div>

              <div className="stat-card purple next-client-card">
                <div className="stat-icon">
                  <User size={24} />
                </div>
                <div className="stat-info">
                  <span className="label">Next Client</span>
                  {dashboardData.next_client ? (
                    <>
                      <h4 style={{ margin: '4px 0 0', color: '#0f172a', fontSize: '1.1rem' }}>
                        {dashboardData.next_client.client_name}
                      </h4>
                      <small style={{ color: '#64748b', fontSize: '0.85rem' }}>
                        at{' '}
                        {new Date(dashboardData.next_client.appointment_date).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </small>
                    </>
                  ) : (
                    <span className="empty-text">No upcoming clients</span>
                  )}
                </div>
              </div>
            </div>

            {/* ✅ Provider wants Today's Schedule as SECOND on mobile */}
            <div className="section-block provider-schedule-second">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                }}
              >
                <h3>📅 Today's Schedule</h3>
                {dashboardData.today_schedule?.length > 2 && (
                  <button
                    onClick={handleNextSchedule}
                    className="btn-icon-only"
                    style={{
                      background: '#f1f5f9',
                      padding: '6px',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      border: '1px solid #e2e8f0',
                    }}
                    title="Next Appointments"
                  >
                    <ChevronRight size={18} color="#64748b" />
                  </button>
                )}
              </div>

              <div className="timeline-list">
                {dashboardData.today_schedule?.length > 0 ? (
                  dashboardData.today_schedule
                    .slice(currentScheduleIndex, currentScheduleIndex + 2)
                    .map((apt) => {
                      const isWalkIn =
                        apt.payment_reference && apt.payment_reference.startsWith('WALK-IN');
                      const displayName = isWalkIn ? getWalkInClientName(apt.notes) : apt.client_name;

                      return (
                        <div
                          key={apt.id}
                          id={`target-${apt.id}`}
                          className="timeline-item slide-in"
                          style={{ animation: 'fadeIn 0.3s ease-out' }}
                        >
                          <div className="time-col">
                            {new Date(apt.appointment_date).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                          <div className="details-col">
                            <strong>{displayName}</strong>
                            <span>
                              {apt.service_name} • {apt.duration} mins
                            </span>
                          </div>
                          <span className={`status-pill ${apt.status}`}>{apt.status}</span>
                        </div>
                      );
                    })
                ) : (
                  <div className="empty-card">
                    <Calendar size={40} style={{ marginBottom: '10px', opacity: 0.5 }} />
                    <p>No appointments for today yet.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Peak Hours & Service Popularity */}
            <div className="insights-grid">
              <div className="section-block insights-card">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BarChart2 size={18} color="#f59e0b" /> Peak Hours
                </h3>
                <div className="insights-inner">
                  {dashboardData.peak_hours?.length > 0 ? (
                    <div className="peak-bars">
                      {dashboardData.peak_hours.map((item, idx) => {
                        const max = Math.max(...dashboardData.peak_hours.map((i) => i.count));
                        const height = max ? (item.count / max) * 100 : 0;
                        return (
                          <div key={idx} className="peak-bar-col" title={`${item.count} bookings`}>
                            <div
                              className={`peak-bar ${idx === 0 ? 'primary' : ''}`}
                              style={{ height: `${height}px` }}
                            />
                            <span className="peak-label">{item.hour}:00</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="insights-empty">No data available yet</p>
                  )}
                </div>
              </div>

              <div className="section-block insights-card">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingUp size={18} color="#10b981" /> Top Services
                </h3>
                <div className="insights-inner insights-inner-min">
                  {dashboardData.top_services?.length > 0 ? (
                    <div className="top-services-list">
                      {dashboardData.top_services.slice(0, 3).map((svc, idx) => (
                        <div key={idx} className="top-service-row">
                          <span className="top-rank">#{idx + 1}</span>
                          <div className="top-service-main">
                            <div className="top-service-line">
                              <span className="top-service-name">{svc.name}</span>
                              <span className="top-service-count">{svc.booking_count} bookings</span>
                            </div>
                            <div className="top-progress-track">
                              <div
                                className={`top-progress-fill ${idx === 0 ? 'primary' : ''}`}
                                style={{
                                  width: `${
                                    dashboardData.top_services?.[0]?.booking_count
                                      ? (svc.booking_count / dashboardData.top_services[0].booking_count) * 100
                                      : 0
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="insights-empty">No completed bookings yet</p>
                  )}
                </div>
              </div>
            </div>

            {/* ✅ Provider wants Updates LAST on mobile */}
            <UpdatesCard className="updates-provider-mobile-bottom updates-mobile-provider-only" />
          </>
        )}

        {/* --- CLIENT VIEW (Cont.) --- */}
        {user.user_type === 'client' && dashboardData && (
          <>
            {dashboardData.next_appointment ? (
              <div className="up-next-card" id={`target-${dashboardData.next_appointment.id}`}>
                <div className="next-header">
                  <Clock size={16} /> Up Next
                </div>
                <div className="next-body">
                  <div className="date-box">
                    <span className="month">
                      {new Date(dashboardData.next_appointment.appointment_date).toLocaleString(
                        'default',
                        { month: 'short' }
                      )}
                    </span>
                    <span className="day">
                      {new Date(dashboardData.next_appointment.appointment_date).getDate()}
                    </span>
                  </div>
                  <div className="next-details">
                    <h3>{dashboardData.next_appointment.service_name}</h3>
                    <p>
                      with{' '}
                      {dashboardData.next_appointment.business_name ||
                        dashboardData.next_appointment.provider_name}
                    </p>
                    <div className="time-badge">
                      {new Date(dashboardData.next_appointment.appointment_date).toLocaleTimeString(
                        [],
                        { hour: '2-digit', minute: '2-digit' }
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-card clickable" onClick={() => setTabAndPush('services')}>
                <Plus size={40} style={{ marginBottom: '10px', opacity: 0.5 }} />
                <p>
                  No upcoming appointments. <strong>Book one now?</strong>
                </p>
              </div>
            )}

            {/* Book Again (hidden on mobile via CSS, feature not removed) */}
            {dashboardData.rebook_suggestions?.length > 0 && (
              <div className="section-block hide-mobile">
                <h3>Book Again</h3>
                <div className="rebook-grid">
                  {dashboardData.rebook_suggestions.map((s) => (
                    <div
                      key={s.id}
                      id={`target-${s.id}`}
                      className="rebook-card"
                      onClick={() => handleBookService(s)}
                    >
                      <div className="rebook-icon">
                        <RefreshCw size={20} />
                      </div>
                      <div className="rebook-info">
                        <h4>{s.name}</h4>
                        <small>{s.provider_name || s.provider_real_name}</small>
                      </div>
                      <button className="btn-icon-only">
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ===== SIDEBAR (hidden on mobile for overview) ===== */}
      <div className="sidebar-col">
        <div className="sidebar-card hide-mobile">
          <h4>
            <Zap size={18} color="#f59e0b" /> Quick Actions
          </h4>
          <div className="quick-actions-grid">
            <button onClick={() => setTabAndPush('services')}>
              <div className="icon-box blue">
                <Briefcase size={20} />
              </div>
              <span>{user.user_type === 'client' ? 'Find Services' : 'My Services'}</span>
            </button>

            <button onClick={handleAppointmentsTabClick}>
              <div className="icon-box purple">
                <List size={20} />
              </div>
              <span>{user.user_type === 'client' ? 'My Schedule' : 'Manage List'}</span>
            </button>

            {user.user_type === 'provider' && (
              <button onClick={() => setTabAndPush('analytics')}>
                <div className="icon-box green">
                  <DollarSign size={20} />
                </div>
                <span>Revenue</span>
              </button>
            )}

            <button onClick={() => setTabAndPush('settings')}>
              <div className="icon-box gray">
                <User size={20} />
              </div>
              <span>Profile</span>
            </button>
          </div>
        </div>

        {user.user_type === 'client' && favorites.providers.length > 0 && (
          <div className="sidebar-card hide-mobile">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem',
              }}
            >
              <h4>
                <Heart size={18} color="#ef4444" fill="#ef4444" /> Favorites
              </h4>
              {favorites.providers.length > 2 && (
                <div className="carousel-indicators mini">
                  {favorites.providers.map((_, idx) => (
                    <span
                      key={idx}
                      className={`indicator-dot ${idx === currentProvIndex ? 'active' : ''}`}
                      onClick={() => setCurrentProvIndex(idx)}
                    ></span>
                  ))}
                </div>
              )}
            </div>
            <div className="fav-providers-carousel">
              {(favorites.providers.length > 2
                ? [favorites.providers[currentProvIndex]]
                : favorites.providers
              ).map((p) => (
                <div
                  key={p.favorite_id}
                  className="fav-provider-item"
                  onClick={() => navigate(`/provider/${p.item_id}`)}
                >
                  <div className="fav-prov-avatar">
                    <User size={20} />
                  </div>
                  <div className="fav-prov-info">
                    <strong>{p.business_name || p.name}</strong>
                    <small>
                      <MapPin size={10} /> {p.suburb}
                    </small>
                  </div>
                  <ChevronRight size={16} color="#cbd5e1" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reviews carousel (hidden on mobile via CSS, feature not removed) */}
        {user.user_type === 'provider' && (
          <div className="sidebar-card hide-mobile">
            <h4>
              <Star size={18} color="#f59e0b" /> Recent Reviews
            </h4>
            <div style={{ marginTop: '10px' }}>
              <ReviewCarousel reviews={providerReviews} />
            </div>
          </div>
        )}

        {/* Desktop updates stays in sidebar */}
        <UpdatesCard className="updates-desktop-only" />
      </div>

      {showBookingModal && selectedService && (
        <BookingModal
          service={selectedService}
          user={user}
          onClose={() => setShowBookingModal(false)}
          onBookingSuccess={() => {
            setShowBookingModal(false);
            alert('Booking Successful!');
          }}
        />
      )}
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'services':
        return user.user_type === 'client' ? (
          <ServiceList user={user} />
        ) : (
          <ServiceManager user={user} />
        );
      case 'appointments':
        return <AppointmentManager user={user} />;
      case 'analytics':
        return user.user_type === 'provider' ? <ProviderAnalytics /> : null;
      case 'settings':
        return <Settings user={user} setUser={setUser} />;
      case 'overview':
      default:
        return renderOverview();
    }
  };

  const renderTabs = () =>
    tabs.map((tab) => (
      <button
        key={tab.id}
        className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
        onClick={() => {
          if (tab.id === 'appointments') handleAppointmentsTabClick();
          else setTabAndPush(tab.id);
        }}
      >
        {tab.label}
      </button>
    ));

  return (
    <div className="container">
      <div className="dashboard">
        {/* Desktop Tabs */}
        <div className="nav-container nav-desktop">
          <div className="dashboard-tabs">{renderTabs()}</div>
        </div>

        {/* Mobile Nav Drawer */}
        {mobileNavOpen && <div className="dash-nav-overlay" onClick={() => setMobileNavOpen(false)} />}

        <aside className={`dash-nav-drawer ${mobileNavOpen ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
          {/* <div className="dash-drawer-header">
            <strong>Menu</strong>
            <button className="dash-drawer-close" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">
              <X size={18} />
            </button>
          </div> */}

          <div className="dash-drawer-tabs">
            {tabs.map((t) => (
              <button
                key={t.id}
                className={`dash-drawer-item ${activeTab === t.id ? 'active' : ''}`}
                onClick={() => {
                  if (t.id === 'appointments') handleAppointmentsTabClick();
                  else setTabAndPush(t.id);
                  setMobileNavOpen(false);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </aside>

        <div className="dashboard-content">{renderContent()}</div>
      </div>
    </div>
  );
}

export default Dashboard;
