import React from 'react'

function Header({ user, onLogout }) {
  return (
    <header className="header">
      <div className="container">
        <div className="header-content">
          <h1>📅 Schedula</h1>
          <nav>
            {user ? (
              <div className="user-menu">
                <span>Welcome, {user.name}</span>
                <button onClick={onLogout} className="btn btn-secondary">
                  Logout
                </button>
              </div>
            ) : (
              <div className="auth-links">
                <a href="/login" className="btn btn-secondary">Login</a>
                <a href="/register" className="btn btn-primary">Register</a>
              </div>
            )}
          </nav>
        </div>
      </div>
    </header>
  )
}

export default Header