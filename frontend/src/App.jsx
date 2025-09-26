// frontend/src/App.jsx
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
  const [activeTab, setActiveTab] = useState("services");

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) setUser(currentUser);

    checkBackendConnection();

    const removeListener = setupAuthListener(() => {
      const updatedUser = authService.getCurrentUser();
      setUser(updatedUser);
    });
    return removeListener;
  }, []);

  const checkBackendConnection = async () => {
    try {
      setBackendStatus("checking");
      await healthCheck();
      setBackendStatus("connected");
    } catch (error) {
      setBackendStatus("error");
      console.error("Backend connection failed:", error);
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

  const handleRetryConnection = () => {
    checkBackendConnection();
  };

  // Connection check screens
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
          <button onClick={handleRetryConnection} className="retry-btn">
            🔄 Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // ----------------- Main App -----------------
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

      <main className="app-main">
        {!user ? (
          // Guest welcome
          <div className="welcome-screen">
            <h2>Book Services in Nairobi</h2>
            <button onClick={() => setShowAuth(true)} className="cta-button">
              Get Started
            </button>
          </div>
        ) : (
          <div className="dashboard">
            {/* User info */}
            <div className="user-info-card">
              <div className="user-details">
                <h2>Welcome, {user.name}! 👋</h2>
                <p>You are logged in as <strong>{user.user_type}</strong></p>
                {user.business_name && <p>Business: {user.business_name}</p>}
              </div>
              <button onClick={handleLogout} className="logout-btn">
                Logout
              </button>
            </div>

            {/* Navigation */}
            <nav className="dashboard-nav">
              {user.user_type === "client" && (
                <>
                  <button
                    className={activeTab === "services" ? "active" : ""}
                    onClick={() => setActiveTab("services")}
                  >
                    Find Services
                  </button>
                  <button
                    className={activeTab === "bookings" ? "active" : ""}
                    onClick={() => setActiveTab("bookings")}
                  >
                    My Bookings
                  </button>
                </>
              )}

              {user.user_type === "provider" && (
                <>
                  <button
                    className={activeTab === "services" ? "active" : ""}
                    onClick={() => setActiveTab("services")}
                  >
                    My Services
                  </button>
                  <button
                    className={activeTab === "bookings" ? "active" : ""}
                    onClick={() => setActiveTab("bookings")}
                  >
                    Appointments
                  </button>
                </>
              )}
            </nav>

            {/* Tab Content */}
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
        <p>SchedulA © 2024 - Nairobi's Service Booking System</p>
      </footer>

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
