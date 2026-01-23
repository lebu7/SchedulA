import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom'; 
import api from '../services/auth';
import ServiceList from './ServiceList';
import ServiceManager from './ServiceManager';
import AppointmentManager from './AppointmentManager';
import Settings from './Settings';
import ProviderAnalytics from './ProviderAnalytics'; 
import { 
  Calendar, Clock, User, DollarSign, Plus, Bell, RefreshCw, 
  ChevronRight, Briefcase, Zap, Star, BarChart2
} from 'lucide-react';
import './Dashboard.css';

function Dashboard({ user, setUser }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboardData, setDashboardData] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Handle Tab Navigation via State
  useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(location.state.tab);
    }
  }, [location.state]);

  // Fetch Dashboard Data (Pulse/Upcoming)
  useEffect(() => {
    if (activeTab === 'overview') {
      api.get('/insights/summary')
        .then(res => setDashboardData(res.data))
        .catch(err => console.error("Dashboard Load Error:", err));
    }
  }, [activeTab, user]);

  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  /* -------------------------------------------
     OVERVIEW TAB CONTENT
  ------------------------------------------- */
  const renderOverview = () => (
    <div className="dashboard-overview">
      {/* LEFT COLUMN: Main Content */}
      <div className="main-feed">
        
        {/* 1. Welcome Header */}
        <div className="welcome-section">
          <div className="welcome-text">
            <h1>{getTimeBasedGreeting()}, {user.name.split(' ')[0]}!</h1>
            <p>
              {user.user_type === 'provider' 
                ? `You have ${dashboardData?.today_metrics?.count || 0} appointments scheduled for today.` 
                : "Ready to find your next great service?"}
            </p>
          </div>
          <button className="btn-primary-icon" onClick={() => setActiveTab(user.user_type === 'client' ? 'services' : 'appointments')}>
            {user.user_type === 'client' ? <Plus size={18} /> : <Calendar size={18} />}
            <span>{user.user_type === 'client' ? "Book New" : "View Calendar"}</span>
          </button>
        </div>

        {/* 2. PROVIDER: Business at a Glance */}
        {user.user_type === 'provider' && dashboardData && (
          <>
            {/* Pulse Row */}
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
                  {/* ✅ Fixed Revenue Display */}
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

            {/* Visual Schedule */}
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

        {/* 3. CLIENT: Discovery & Status */}
        {user.user_type === 'client' && dashboardData && (
          <>
            {/* Up Next Card */}
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

            {/* Rebook Suggestions */}
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

      {/* RIGHT COLUMN: Sidebar */}
      <div className="sidebar-col">
        
        {/* Quick Actions */}
        <div className="sidebar-card">
          <h4><Zap size={18} color="#f59e0b" /> Quick Actions</h4>
          <div className="quick-actions-grid">
            <button onClick={() => setActiveTab('services')}>
              <div className="icon-box blue"><Briefcase size={20} /></div>
              <span>{user.user_type === 'client' ? 'Find Services' : 'My Services'}</span>
            </button>
            <button onClick={() => setActiveTab('appointments')}>
              <div className="icon-box purple"><Calendar size={20} /></div>
              <span>Calendar</span>
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

        {/* System Updates / Notifications */}
        <div className="sidebar-card">
          <h4><Bell size={18} color="#64748b" /> Updates</h4>
          <div className="system-updates-list">
            <div className="update-item">
              <div className="dot"></div>
              <div>
                <strong>Platform Update</strong>
                <p style={{margin:0, fontSize:'0.8rem', color:'#94a3b8'}}>Improved calendar view coming soon.</p>
              </div>
            </div>
            <div className="update-item">
              <div className="dot" style={{background:'#10b981'}}></div>
              <div>
                <strong>Tips</strong>
                <p style={{margin:0, fontSize:'0.8rem', color:'#94a3b8'}}>Complete your profile to attract more clients.</p>
              </div>
            </div>
          </div>
        </div>

      </div>
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
        {/* ✅ FIXED TOP NAVIGATION */}
        <div className="nav-container">
          <div className="dashboard-tabs">
            <button 
              className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} 
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            
            {user.user_type === 'provider' && (
              <button 
                className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`} 
                onClick={() => setActiveTab('analytics')}
              >
                Analytics
              </button>
            )}

            <button 
              className={`tab-btn ${activeTab === 'services' ? 'active' : ''}`} 
              onClick={() => setActiveTab('services')}
            >
              Services
            </button>
            <button 
              className={`tab-btn ${activeTab === 'appointments' ? 'active' : ''}`} 
              onClick={() => setActiveTab('appointments')}
            >
              Appointments
            </button>
            <button 
              className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} 
              onClick={() => setActiveTab('settings')}
            >
              Settings
            </button>
          </div>
        </div>
        
        <div className="dashboard-content">{renderContent()}</div>
      </div>
    </div>
  );
}

export default Dashboard;