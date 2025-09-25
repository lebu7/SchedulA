import React, { useState, useEffect } from 'react';
import AuthForm from './components/AuthForm';
import ServiceManager from './components/ServiceManager';
import AppointmentManager from './components/AppointmentManager';
import { authService, setupAuthListener } from './services/auth';
import { healthCheck } from './services/api';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [activeTab, setActiveTab] = useState('services');

  useEffect(() => {
    // Initial auth state
    const currentUser = authService.getCurrentUser();
    if (currentUser) setUser(currentUser);

    // Check backend connection
    checkBackendConnection();

    // Auth change listener
    const removeListener = setupAuthListener(() => {
      const updatedUser = authService.getCurrentUser();
      setUser(updatedUser);
    });
    return removeListener;
  }, []);

  const checkBackendConnection = async () => {
    try {
      setBackendStatus('checking');
      await healthCheck();
      setBackendStatus('connected');
    } catch (error) {
      setBackendStatus('error');
      console.error('Backend connection failed:', error);
    }
  };

  const handleAuthSuccess = (userData) => {
    setUser(userData);
    setShowAuth(false);
  };

  const handleLogout = () => {
    authService.clearAuth();
    setUser(null);
    setActiveTab('services');
  };

  const handleRetryConnection = () => {
    checkBackendConnection();
  };

  // Render loading while backend is checked
  if (backendStatus === 'checking') {
    return (
      <div className="app-loading">
        <div className="loading-content">
          <h1>🚀 SchedulA</h1>
          <p>Connecting to server...</p>
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  // Render connection error screen
  if (backendStatus === 'error') {
    return (
      <div className="app-error">
        <div className="error-content">
          <h1>🚀 SchedulA</h1>
          <h2>Connection Issue</h2>
          <p>Unable to connect to the backend server.</p>

          <div className="error-actions">
            <button onClick={handleRetryConnection} className="retry-btn">
              🔄 Retry Connection
            </button>
          </div>

          <div className="error-help">
            <h3>To resolve this:</h3>
            <ol>
              <li>Ensure the backend server is running on port 5000</li>
              <li>Check that port 5000 is accessible</li>
              <li>Refresh the page after starting the server</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  // Main app
  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="header-title">
            <h1>🚀 SchedulA</h1>
            <p>Nairobi Service Booking System</p>
          </div>
          <div className="header-status">
            <span className="status-badge connected">✅ Connected</span>
            {user && (
              <span className={`user-badge ${user.user_type}`}>
                {user.user_type.toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
        {!user ? (
          // Welcome screen
          <div className="welcome-screen">
            <div className="welcome-content">
              <div className="welcome-hero">
                <h2>Book Services in Nairobi</h2>
                <p>Connect with the best service providers in Nairobi</p>
                <div className="welcome-actions">
                  <button
                    onClick={() => setShowAuth(true)}
                    className="cta-button"
                  >
                    Get Started
                  </button>
                </div>
              </div>

              <div className="features-grid">
                <div className="feature-card">
                  <h3>👥 For Clients</h3>
                  <ul>
                    <li>Book appointments easily</li>
                    <li>Discover local services</li>
                    <li>Manage your bookings</li>
                  </ul>
                </div>
                <div className="feature-card">
                  <h3>💼 For Providers</h3>
                  <ul>
                    <li>Manage your services</li>
                    <li>Accept bookings online</li>
                    <li>Grow your business</li>
                  </ul>
                </div>
              </div>

              <div className="demo-info">
                <h4>Quick Start with Demo Accounts:</h4>
                <div className="demo-accounts">
                  <div><strong>Provider:</strong> salon@nairobi.com / provider123</div>
                  <div><strong>Client:</strong> client@example.com / client123</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Dashboard
          <div className="dashboard">
            {/* User Info */}
            <div className="user-info-card">
              <div className="user-details">
                <h2>Welcome, {user.name}! 👋</h2>
                <p>You are logged in as a <strong>{user.user_type}</strong></p>
                {user.business_name && <p>Business: {user.business_name}</p>}
              </div>
              <button onClick={handleLogout} className="logout-btn">
                Logout
              </button>
            </div>

            {/* Navigation */}
            <nav className="dashboard-nav">
              <button
                className={activeTab === 'services' ? 'active' : ''}
                onClick={() => setActiveTab('services')}
              >
                {user.user_type === 'provider' ? 'My Services' : 'Find Services'}
              </button>
              <button
                className={activeTab === 'bookings' ? 'active' : ''}
                onClick={() => setActiveTab('bookings')}
              >
                {user.user_type === 'provider' ? 'Appointments' : 'My Bookings'}
              </button>
            </nav>

            {/* Tab Content */}
            <div className="dashboard-content">
              {activeTab === 'services' ? (
                <ServiceManager />
              ) : (
                <AppointmentManager user={user} />
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>SchedulA &copy; 2024 - Making Nairobi's services accessible to everyone</p>
      </footer>

      {/* Auth Modal */}
      {showAuth && (
        <AuthForm
          onSuccess={handleAuthSuccess}
          onClose={() => setShowAuth(false)}
        />
      )}
    </div>
  );
}

export default App;
