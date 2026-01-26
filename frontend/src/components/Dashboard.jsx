/* frontend/src/components/Dashboard.jsx */
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom'; 
import api from '../services/auth';
import ServiceList from './ServiceList';
import ServiceManager from './ServiceManager';
import AppointmentManager from './AppointmentManager';
import Settings from './Settings';
import ProviderAnalytics from './ProviderAnalytics'; 
import BookingModal from './BookingModal'; 
import { 
  Calendar, Clock, User, DollarSign, Plus, Bell, RefreshCw, 
  ChevronRight, Briefcase, Zap, Star, Heart, MapPin, List
} from 'lucide-react';
import './Dashboard.css';

function Dashboard({ user, setUser }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboardData, setDashboardData] = useState(null);
  
  // ✅ Favorites State
  const [favorites, setFavorites] = useState({ services: [], providers: [] });
  const [currentFavIndex, setCurrentFavIndex] = useState(0);
  const [currentProvIndex, setCurrentProvIndex] = useState(0); 

  // ✅ Booking State
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedService, setSelectedService] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(location.state.tab);
    }
  }, [location.state]);

  useEffect(() => {
    if (activeTab === 'overview') {
      api.get('/insights/summary')
        .then(res => setDashboardData(res.data))
        .catch(err => console.error("Dashboard Load Error:", err));

      if (user.user_type === 'client') {
        api.get('/favorites')
          .then(res => setFavorites(res.data))
          .catch(err => console.error("Favorites Load Error:", err));
      }
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

  // Carousel Logic for Providers (if > 2)
  useEffect(() => {
    if (favorites.providers.length > 2) {
      const interval = setInterval(() => {
        setCurrentProvIndex((prev) => (prev + 1) % favorites.providers.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [favorites.providers]);

  // Helper for Category Colors
  const getCategoryColor = (category) => {
    const cat = category?.toLowerCase() || '';
    if (cat.includes('salon')) return 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)';
    if (cat.includes('spa')) return 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)';
    if (cat.includes('barber')) return 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)';
    return 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
  };

  const handleBookService = (service) => {
    const serviceObj = {
        id: service.item_id, 
        name: service.name,
        price: service.price,
        duration: service.duration,
        provider_id: service.provider_id,
        provider_name: service.provider_name,
        business_name: service.business_name
    };
    setSelectedService(serviceObj);
    setShowBookingModal(true);
  };

  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  const renderOverview = () => (
    <div className="dashboard-overview">
      <div className="main-feed">
        <div className="welcome-section">
          <div className="welcome-text">
            <h1>{getTimeBasedGreeting()}, {user.name.split(' ')[0]}!</h1>
            <p>
              {user.user_type === 'provider' 
                ? `You have ${dashboardData?.today_metrics?.count || 0} appointments scheduled for today.` 
                : "Ready to find your next great service?"}
            </p>
          </div>
          <button 
            className="btn-primary-icon" 
            onClick={() => {
              // We set the tab, but we also pass the view preference to the component
              setActiveTab('appointments');
              navigate('/dashboard', { state: { tab: 'appointments', viewMode: 'calendar' } });
            }}
          >
            <Calendar size={18} />
            <span>View Calendar</span>
          </button>
        </div>

        {user.user_type === 'client' && favorites.services.length > 0 && (
            <div className="section-block fade-in">
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'}}>
                    <h3>❤️ Favorite Services</h3>
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
                    style={{ background: getCategoryColor(favorites.services[currentFavIndex].category) }}
                >
                    {(() => {
                        const s = favorites.services[currentFavIndex];
                        return (
                            <div className="fav-service-content">
                                <div className="fav-icon-box"><Star size={24} color="white" fill="white" /></div>
                                <div className="fav-info">
                                    <h4>{s.name}</h4>
                                    <p>{s.business_name || s.provider_name} • KES {s.price}</p>
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

        {user.user_type === 'provider' && dashboardData && (
          <>
            <div className="pulse-grid">
              <div className="stat-card blue">
                <div className="stat-icon"><Calendar size={24} /></div>
                <div className="stat-info">
                  <span className="label">Today's Bookings</span>
                  <h3>{dashboardData.today_metrics?.count || 0}</h3>
                  {dashboardData.today_metrics?.pending > 0 && (
                    <span className="alert-text">{dashboardData.today_metrics.pending} pending approval</span>
                  )}
                </div>
              </div>

              <div className="stat-card green">
                <div className="stat-icon"><DollarSign size={24} /></div>
                <div className="stat-info">
                  <span className="label">Revenue Today</span>
                  <h3>KES {dashboardData.today_metrics?.today_revenue?.toLocaleString() || 0}</h3>
                </div>
              </div>

              <div className="stat-card purple">
                <div className="stat-icon"><User size={24} /></div>
                <div className="stat-info">
                  <span className="label">Next Client</span>
                  {dashboardData.next_client ? (
                    <>
                      <h4 style={{margin: '4px 0 0', color: '#0f172a', fontSize: '1.1rem'}}>{dashboardData.next_client.client_name}</h4>
                      <small style={{color: '#64748b', fontSize: '0.85rem'}}>
                        at {new Date(dashboardData.next_client.appointment_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </small>
                    </>
                  ) : (
                    <span className="empty-text">No upcoming clients</span>
                  )}
                </div>
              </div>
            </div>

            <div className="section-block">
              <h3>📅 Today's Schedule</h3>
              <div className="timeline-list">
                {dashboardData.today_schedule?.length > 0 ? (
                  dashboardData.today_schedule.map(apt => (
                    <div key={apt.id} className="timeline-item">
                      <div className="time-col">
                        {new Date(apt.appointment_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                      <div className="details-col">
                        <strong>{apt.client_name}</strong>
                        <span>{apt.service_name} • {apt.duration} mins</span>
                      </div>
                      <span className={`status-pill ${apt.status}`}>{apt.status}</span>
                    </div>
                  ))
                ) : (
                  <div className="empty-card">
                    <Calendar size={40} style={{marginBottom: '10px', opacity: 0.5}} />
                    <p>No appointments for today yet.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {user.user_type === 'client' && dashboardData && (
          <>
            {dashboardData.next_appointment ? (
              <div className="up-next-card">
                <div className="next-header">
                  <Clock size={16} /> Up Next
                </div>
                <div className="next-body">
                  <div className="date-box">
                    <span className="month">{new Date(dashboardData.next_appointment.appointment_date).toLocaleString('default', { month: 'short' })}</span>
                    <span className="day">{new Date(dashboardData.next_appointment.appointment_date).getDate()}</span>
                  </div>
                  <div className="next-details">
                    <h3>{dashboardData.next_appointment.service_name}</h3>
                    <p>with {dashboardData.next_appointment.business_name || dashboardData.next_appointment.provider_name}</p>
                    <div className="time-badge">
                      {new Date(dashboardData.next_appointment.appointment_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-card clickable" onClick={() => setActiveTab('services')}>
                <Plus size={40} style={{marginBottom: '10px', opacity: 0.5}} />
                <p>No upcoming appointments. <strong>Book one now?</strong></p>
              </div>
            )}

            {dashboardData.rebook_suggestions?.length > 0 && (
              <div className="section-block">
                <h3>🔄 Book Again</h3>
                <div className="rebook-grid">
                  {dashboardData.rebook_suggestions.map(s => (
                    <div key={s.id} className="rebook-card" onClick={() => navigate('/dashboard', { state: { tab: 'services', search: s.name } })}>
                      <div className="rebook-icon"><RefreshCw size={20} /></div>
                      <div className="rebook-info">
                        <h4>{s.name}</h4>
                        <small>{s.provider_name || s.provider_real_name}</small>
                      </div>
                      <button className="btn-icon-only"><ChevronRight size={18} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="sidebar-col">
        <div className="sidebar-card">
          <h4><Zap size={18} color="#f59e0b" /> Quick Actions</h4>
          <div className="quick-actions-grid">
            <button onClick={() => setActiveTab('services')}>
              <div className="icon-box blue"><Briefcase size={20} /></div>
              <span>{user.user_type === 'client' ? 'Find Services' : 'My Services'}</span>
            </button>
            <button onClick={() => setActiveTab('appointments')}>
              {/* ✅ CHANGED: Quick action icon to List for consistency */}
              <div className="icon-box purple"><List size={20} /></div>
              <span>{user.user_type === 'client' ? 'My Schedule' : 'Manage List'}</span>
            </button>
            {user.user_type === 'provider' && (
              <button onClick={() => setActiveTab('analytics')}>
                <div className="icon-box green"><DollarSign size={20} /></div>
                <span>Revenue</span>
              </button>
            )}
            <button onClick={() => setActiveTab('settings')}>
              <div className="icon-box gray"><User size={20} /></div>
              <span>Profile</span>
            </button>
          </div>
        </div>

        {user.user_type === 'client' && favorites.providers.length > 0 && (
            <div className="sidebar-card">
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem'}}>
                  <h4><Heart size={18} color="#ef4444" fill="#ef4444" /> Favorites</h4>
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
                    {(favorites.providers.length > 2 ? [favorites.providers[currentProvIndex]] : favorites.providers).map(p => (
                        <div key={p.favorite_id} className="fav-provider-item" onClick={() => navigate(`/provider/${p.item_id}`)}>
                            <div className="fav-prov-avatar"><User size={20} /></div>
                            <div className="fav-prov-info">
                                <strong>{p.business_name || p.name}</strong>
                                <small><MapPin size={10} /> {p.suburb}</small>
                            </div>
                            <ChevronRight size={16} color="#cbd5e1" />
                        </div>
                    ))}
                </div>
            </div>
        )}

        <div className="sidebar-card">
          <h4><Bell size={18} color="#64748b" /> Updates</h4>
          <div className="system-updates-list">
            <div className="update-item">
              <div className="dot"></div>
              <div>
                <strong>Platform Update</strong>
                <p style={{margin:0, fontSize:'0.75rem', color:'#94a3b8'}}>Improved calendar view coming soon.</p>
              </div>
            </div>
            <div className="update-item">
              <div className="dot" style={{background:'#10b981'}}></div>
              <div>
                <strong>Tips</strong>
                <p style={{margin:0, fontSize:'0.75rem', color:'#94a3b8'}}>Complete your profile to attract more clients.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showBookingModal && selectedService && (
        <BookingModal
            service={selectedService}
            user={user}
            onClose={() => setShowBookingModal(false)}
            onBookingSuccess={() => {
                setShowBookingModal(false);
                alert("Booking Successful!");
            }}
        />
      )}
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'services': return user.user_type === 'client' ? <ServiceList user={user} /> : <ServiceManager user={user} />;
      case 'appointments': return <AppointmentManager user={user} />;
      case 'analytics': return user.user_type === 'provider' ? <ProviderAnalytics /> : null;
      case 'settings': return <Settings user={user} setUser={setUser} />;
      case 'overview': default: return renderOverview();
    }
  };

  return (
    <div className="container">
      <div className="dashboard">
        <div className="nav-container">
          <div className="dashboard-tabs">
            <button className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
            {user.user_type === 'provider' && (
              <button className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>Analytics</button>
            )}
            <button className={`tab-btn ${activeTab === 'services' ? 'active' : ''}`} onClick={() => setActiveTab('services')}>Services</button>
            <button className={`tab-btn ${activeTab === 'appointments' ? 'active' : ''}`} onClick={() => setActiveTab('appointments')}>{user.user_type === 'client' ? 'Schedule' : 'Appointments'}</button>
            <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>Settings</button>
          </div>
        </div>
        <div className="dashboard-content">{renderContent()}</div>
      </div>
    </div>
  );
}

export default Dashboard;