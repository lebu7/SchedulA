import React, { useState, useEffect } from "react";
import AuthForm from "./components/AuthForm";
import ServiceManager from "./components/ServiceManager";
import AppointmentManager from "./components/AppointmentManager";
import { authService, setupAuthListener } from "./services/auth";
import { healthCheck } from "./services/api";
import "./App.css";

function App() {
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [backendStatus, setBackendStatus] = useState("checking");
  const [activeTab, setActiveTab] = useState("services"); // default tab

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) setUser(currentUser);

    checkBackendConnection();

    const remove = setupAuthListener(() => {
      const updated = authService.getCurrentUser();
      setUser(updated);
    });

    return remove;
  }, []);

  const checkBackendConnection = async () => {
    try {
      setBackendStatus("checking");
      await healthCheck();
      setBackendStatus("connected");
    } catch (err) {
      setBackendStatus("error");
      console.error("Backend connection failed:", err);
    }
  };

  const handleAuthSuccess = (userData) => {
    setUser(userData);
    setShowAuth(false);
  };

  const handleLogout = () => {
    authService.clearAuth();
    setUser(null);
    setActiveTab("services");
  };

  if (backendStatus === "checking") {
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

  if (backendStatus === "error") {
    return (
      <div className="app-error">
        <div className="error-content">
          <h1>🚀 SchedulA</h1>
          <h2>Connection Issue</h2>
          <p>Unable to connect to the backend server.</p>
          <div className="error-actions">
            <button onClick={checkBackendConnection} className="retry-btn">
              🔄 Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
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

      <main className="app-main">
        {!user ? (
          <div className="welcome-screen">
            <div className="welcome-content">
              <div className="welcome-hero">
                <h2>Book Services in Nairobi</h2>
                <p>Connect with the best local service providers</p>
                <div className="welcome-actions">
                  <button onClick={() => setShowAuth(true)} className="cta-button">
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
            </div>
          </div>
        ) : (
          <div className="dashboard">
            <div className="user-info-card">
              <div className="user-details">
                <h2>Welcome, {user.name}! 👋</h2>
                <p>You are logged in as a <strong>{user.user_type}</strong></p>
                {user.business_name && <p>Business: {user.business_name}</p>}
              </div>
              <div>
                <button onClick={handleLogout} className="logout-btn">Logout</button>
              </div>
            </div>

            <nav className="dashboard-nav">
              {user.user_type === "client" && (
                <>
                  <button className={activeTab === "services" ? "active" : ""} onClick={() => setActiveTab("services")}>Find Services</button>
                  <button className={activeTab === "bookings" ? "active" : ""} onClick={() => setActiveTab("bookings")}>My Bookings</button>
                </>
              )}

              {user.user_type === "provider" && (
                <>
                  <button className={activeTab === "services" ? "active" : ""} onClick={() => setActiveTab("services")}>My Services</button>
                  <button className={activeTab === "bookings" ? "active" : ""} onClick={() => setActiveTab("bookings")}>Appointments</button>
                </>
              )}
            </nav>

            <div className="dashboard-content">
              {activeTab === "services" ? (
                <ServiceManager user={user} />
              ) : (
                <AppointmentManager user={user} />
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>SchedulA &copy; 2024 - Nairobi</p>
      </footer>

      {showAuth && <AuthForm onSuccess={handleAuthSuccess} onClose={() => setShowAuth(false)} />}
    </div>
  );
}

export default App;
