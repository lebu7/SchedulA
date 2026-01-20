import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom'; // ✅ Import useLocation
import ServiceList from './ServiceList';
import ServiceManager from './ServiceManager';
import AppointmentManager from './AppointmentManager';
import Settings from './Settings';
import './Dashboard.css';

function Dashboard({ user, setUser }) {
  const [activeTab, setActiveTab] = useState('overview');
  const location = useLocation(); // ✅ Hook to access navigation state

  // ✅ LISTEN FOR NAVIGATION STATE
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
      case 'settings':
        return <Settings user={user} setUser={setUser} />;
      case 'overview':
      default:
        return (
          <div className="dashboard-overview">
            <div className="left-column">
              <div className="card profile-card">
                <h3>Welcome, {user.name}</h3>
                <p><strong>Role:</strong> {user.user_type}</p>
                <p><strong>Email:</strong> {user.email}</p>
                {user.phone && <p><strong>Phone:</strong> {user.phone}</p>}
                {user.business_name && <p><strong>Business:</strong> {user.business_name}</p>}
              </div>

              <div className="card quick-actions">
                <h3>Quick Actions</h3>
                <div className="action-buttons">
                  <button className="btn btn-primary" onClick={() => setActiveTab('services')}>
                    {user.user_type === 'client' ? 'Find Services' : 'Manage Services'}
                  </button>
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