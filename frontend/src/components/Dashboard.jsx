import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom'; 
import ServiceList from './ServiceList';
import ServiceManager from './ServiceManager';
import AppointmentManager from './AppointmentManager';
import Settings from './Settings';
import ProviderAnalytics from './ProviderAnalytics'; 
import './Dashboard.css';

function Dashboard({ user, setUser }) {
  const [activeTab, setActiveTab] = useState('overview');
  const location = useLocation(); 

  // ✅ LISTEN FOR NAVIGATION STATE (e.g. from Header Edit Profile)
  useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(location.state.tab);
    }
  }, [location.state]);

  const renderContent = () => {
    switch (activeTab) {
      case 'services':
        return user.user_type === 'client' ? <ServiceList user={user} /> : <ServiceManager user={user} />;
      case 'appointments':
        return <AppointmentManager user={user} />;
      case 'analytics': 
        return user.user_type === 'provider' ? <ProviderAnalytics /> : null;
      case 'settings':
        return <Settings user={user} setUser={setUser} />;
      case 'overview':
      default:
        return (
          <div className="dashboard-overview">
            <div className="left-column">
              
              {/* ✅ CLEAN WELCOME CARD (Details now in Header Popup) */}
              <div className="card welcome-card">
                <div className="welcome-content">
                  <h2>Welcome back, {user.name.split(' ')[0]}! 👋</h2>
                  <p className="welcome-sub">
                    {user.user_type === 'client' 
                      ? "Ready to book your next appointment?" 
                      : "Here is what's happening with your business today."}
                  </p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="card quick-actions">
                <h3>Quick Actions</h3>
                <div className="action-buttons">
                  <button className="btn btn-primary" onClick={() => setActiveTab('services')}>
                    {user.user_type === 'client' ? 'Find Services' : 'Manage Services'}
                  </button>
                  
                  {user.user_type === 'provider' && (
                    <button className="btn btn-secondary" onClick={() => setActiveTab('analytics')}>
                      View Analytics
                    </button>
                  )}

                  <button className="btn btn-secondary" onClick={() => setActiveTab('appointments')}>
                    Appointments
                  </button>
                  <button className="btn btn-secondary" onClick={() => setActiveTab('settings')}>
                    Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="container">
      <div className="dashboard">
        <div className="dashboard-tabs">
          <button className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
          
          {user.user_type === 'provider' && (
            <button className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>Analytics</button>
          )}

          <button className={`tab-btn ${activeTab === 'services' ? 'active' : ''}`} onClick={() => setActiveTab('services')}>Services</button>
          <button className={`tab-btn ${activeTab === 'appointments' ? 'active' : ''}`} onClick={() => setActiveTab('appointments')}>Appointments</button>
          <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>Settings</button>
        </div>
        <div className="dashboard-content">{renderContent()}</div>
      </div>
    </div>
  );
}

export default Dashboard;