import React, { useState, useEffect } from 'react';
import AuthForm from './components/AuthForm';
import ServiceManager from './components/ServiceManager';
import BookingCalendar from './components/BookingCalendar';
import { authService } from './services/auth';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [activeTab, setActiveTab] = useState('services');

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
      console.log('User found in storage:', currentUser);
    }
    checkBackendStatus();
  }, []);

  const checkBackendStatus = async () => {
    try {
      setBackendStatus('checking');
      console.log('Checking backend connection...');
      const data = await authService.testConnection();
      setBackendStatus('connected');
      console.log('Backend status: Connected', data);
    } catch (error) {
      setBackendStatus('error');
      console.error('Backend status: Error', error.message);
    }
  };

  const handleAuthSuccess = (userData) => {
    console.log('Authentication successful:', userData);
    setUser(userData);
    setShowAuth(false);
  };

  const handleLogout = () => {
    authService.logout();
    setUser(null);
    setActiveTab('services');
  };

  const retryConnection = () => {
    checkBackendStatus();
  };

  // Show loading screen while checking connection
  if (backendStatus === 'checking') {
    return (
      <div className="App">
        <div className="loading-screen">
          <h1>🚀 SchedulA</h1>
          <p>Connecting to backend server...</p>
          <div className="spinner"></div>
          <p><small>Testing: https://fuzzy-engine-pgppr769gr7f645-5000.app.github.dev</small></p>
        </div>
      </div>
    );
  }

  // Show error screen if backend is not connected
  if (backendStatus === 'error') {
    return (
      <div className="App">
        <div className="error-screen">
          <h1>🚀 SchedulA</h1>
          <div className="error-content">
            <h2>Backend Connection Failed</h2>
            <p>The frontend cannot connect to the backend server.</p>
            
            <div className="connection-details">
              <h3>Connection Details:</h3>
              <p><strong>Frontend:</strong> {window.location.origin}</p>
              <p><strong>Backend:</strong> https://fuzzy-engine-pgppr769gr7f645-5000.app.github.dev</p>
            </div>

            <div className="error-steps">
              <h3>To fix this:</h3>
              <ol>
                <li>Make sure the backend is running on port 5000</li>
                <li>Check that port 5000 is set to <strong>Public</strong> in Codespaces</li>
                <li>Try opening the backend URL directly:
                  <br />
                  <a href="https://fuzzy-engine-pgppr769gr7f645-5000.app.github.dev" target="_blank" rel="noopener noreferrer">
                    https://fuzzy-engine-pgppr769gr7f645-5000.app.github.dev
                  </a>
                </li>
                <li>If the link above works, click "Retry Connection" below</li>
              </ol>
            </div>
            
            <div className="test-buttons">
              <button onClick={() => window.open('https://fuzzy-engine-pgppr769gr7f645-5000.app.github.dev', '_blank')} className="test-btn">
                🔗 Test Backend URL
              </button>
              <button onClick={retryConnection} className="retry-btn">
                🔄 Retry Connection
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main application - Backend is connected!
  return (
    <div className="App">
      <header className="App-header">
        <h1>🚀 SchedulA</h1>
        <p>Nairobi Booking System</p>

        <div className="status-bar">
          <span className="status connected">✅ Backend Connected</span>
          {user && (
            <span className={`user-type ${user.user_type}`}>
              {user.user_type.toUpperCase()}
            </span>
          )}
        </div>
      </header>

      <main className="App-main">
        {!user ? (
          <div className="welcome-screen">
            <div className="welcome-content">
              <h2>Welcome to SchedulA! 🎉</h2>
              <p>Backend connection established successfully!</p>
              <button onClick={() => setShowAuth(true)} className="cta-button">
                Get Started
              </button>
              
              <div className="feature-grid">
                <div className="feature">
                  <h3>👥 For Clients</h3>
                  <p>Book appointments easily</p>
                </div>
                <div className="feature">
                  <h3>💼 For Providers</h3>
                  <p>Manage your services</p>
                </div>
              </div>

              <div className="demo-accounts">
                <h4>Demo Accounts:</h4>
                <p><strong>Provider:</strong> beauty@salon.com / provider123</p>
                <p><strong>Client:</strong> client@example.com / client123</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="dashboard">
            <div className="user-info">
              <h2>Welcome, {user.name}! 👋</h2>
              <p>You are logged in as a <strong>{user.user_type}</strong></p>
              {user.business_name && <p>Business: {user.business_name}</p>}
              <button onClick={handleLogout} className="logout-btn">Logout</button>
            </div>

            <nav className="dashboard-nav">
              <button 
                className={activeTab === 'services' ? 'active' : ''}
                onClick={() => setActiveTab('services')}
              >
                {user.user_type === 'provider' ? 'My Services' : 'Browse Services'}
              </button>
              <button 
                className={activeTab === 'bookings' ? 'active' : ''}
                onClick={() => setActiveTab('bookings')}
              >
                {user.user_type === 'provider' ? 'Appointments' : 'Book Appointment'}
              </button>
            </nav>

            <div className="dashboard-content">
              {activeTab === 'services' && (
                user.user_type === 'provider' ? (
                  <ServiceManager />
                ) : (
                  <div className="services-browse">
                    <h3>Available Services</h3>
                    <p>Service browsing feature coming soon!</p>
                  </div>
                )
              )}

              {activeTab === 'bookings' && (
                user.user_type === 'client' ? (
                  <BookingCalendar />
                ) : (
                  <div className="appointments-view">
                    <h3>My Appointments</h3>
                    <p>Appointment management coming soon!</p>
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </main>

      {showAuth && (
        <AuthForm 
          onAuthSuccess={handleAuthSuccess}
          onClose={() => setShowAuth(false)}
        />
      )}

      <footer className="App-footer">
        <p>SchedulA &copy; 2024 - Backend: Port 5000 | Frontend: Port 3000</p>
      </footer>
    </div>
  );
}

export default App;