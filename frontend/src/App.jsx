import React, { useState, useEffect } from 'react';
import AuthForm from './components/AuthForm';
import ServiceManager from './components/ServiceManager';
import { authService } from './services/auth';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [connectionError, setConnectionError] = useState('');

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
    }
    checkBackendStatus();
  }, []);

  const checkBackendStatus = async () => {
    try {
      setBackendStatus('checking');
      setConnectionError('');
      const data = await authService.testConnection();
      setBackendStatus('connected');
    } catch (error) {
      setBackendStatus('error');
      setConnectionError(error.message);
    }
  };

  const handleAuthSuccess = (userData) => {
    setUser(userData);
    setShowAuth(false);
  };

  const handleLogout = () => {
    authService.logout();
    setUser(null);
    setConnectionError('');
  };

  const retryBackendConnection = () => {
    checkBackendStatus();
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>🚀 SchedulA</h1>
        <p>Nairobi Booking System</p>

        <div className="status-card">
          <h3>System Status</h3>
          <p>
            <strong>Backend:</strong> 
            <span className={`status ${backendStatus}`}>
              {backendStatus === 'connected' ? '✅ Connected' : 
               backendStatus === 'checking' ? '🔄 Checking...' : '❌ Not Connected'}
            </span>
            {backendStatus === 'error' && (
              <button onClick={retryBackendConnection} className="retry-btn">
                Retry
              </button>
            )}
          </p>
          <p><strong>Authentication:</strong> {user ? '✅ Logged In' : '🔲 Ready'}</p>
          
          {connectionError && (
            <div className="error-message">
              <p><strong>Error:</strong> {connectionError}</p>
            </div>
          )}
        </div>

        {backendStatus === 'connected' ? (
          <>
            {user ? (
              <div className="user-dashboard">
                <div className="user-info">
                  <h2>Welcome, {user.name}! 👋</h2>
                  <p>You are logged in as a <strong>{user.user_type}</strong></p>
                  {user.business_name && <p>Business: {user.business_name}</p>}
                  <button onClick={handleLogout} className="logout-btn">
                    Logout
                  </button>
                </div>

                {/* Show Service Manager for Providers */}
                {user.user_type === 'provider' && <ServiceManager />}

                {/* Show Client Dashboard for Clients */}
                {user.user_type === 'client' && (
                  <div className="client-dashboard">
                    <h3>🎯 Available Services</h3>
                    <p>Browse and book services from our providers.</p>
                    <div className="coming-soon">
                      <p>📅 Booking system coming soon!</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="auth-section">
                <button 
                  onClick={() => setShowAuth(true)}
                  className="auth-btn"
                >
                  Login / Register
                </button>
                <p className="auth-hint">
                  Register as a <strong>Service Provider</strong> to add services, 
                  or as a <strong>Client</strong> to book appointments.
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="error-message">
            <h3>Backend Connection Required</h3>
            <p>Please make sure the backend server is running.</p>
          </div>
        )}

        <div className="next-steps">
          <h3>Project Progress:</h3>
          <ul>
            <li>✅ Frontend setup (Vite + React)</li>
            <li>✅ Backend API (Express + Node.js)</li>
            <li>✅ User authentication system</li>
            <li>🔲 Service management</li>
            <li>🔲 Booking calendar</li>
            <li>🔲 SMS notifications</li>
            <li>🔲 AI no-show prediction</li>
          </ul>
        </div>
      </header>

      {showAuth && (
        <AuthForm 
          onAuthSuccess={handleAuthSuccess}
          onClose={() => setShowAuth(false)}
        />
      )}
    </div>
  );
}

export default App;