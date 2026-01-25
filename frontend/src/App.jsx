/* frontend/src/App.jsx */
import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import './App.css'

// ✅ 1. Import the Socket Context Provider
import { SocketProvider } from './contexts/SocketContext'

// Components
import Header from './components/Header'
import Login from './components/Login'
import Register from './components/Register'
import Dashboard from './components/Dashboard'
import ForgotPassword from './components/ForgotPassword'
import ProviderProfile from './components/ProviderProfile' 
// ✅ 3. Import the new Chat Widget
import ChatWidget from './components/ChatWidget'

// Services
import { authService } from './services/auth'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if user is logged in on app start
    const token = localStorage.getItem('token')
    if (token) {
      authService.getProfile()
        .then(userData => setUser(userData))
        .catch(() => {
          localStorage.removeItem('token')
          setUser(null)
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const handleLogin = (userData, token) => {
    localStorage.setItem('token', token)
    localStorage.setItem('userId', userData.id);
    setUser(userData)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    setUser(null)
  }

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  return (
    <Router>
      {/* ✅ 2. Wrap the application logic with SocketProvider */}
      <SocketProvider user={user}>
        <div className="App">
          <Header user={user} onLogout={handleLogout} />
          
          <main className="main-content">
            <Routes>
              <Route 
                path="/login" 
                element={
                  !user ? <Login onLogin={handleLogin} /> : <Navigate to="/dashboard" />
                } 
              />
              <Route 
                path="/register" 
                element={
                  !user ? <Register onLogin={handleLogin} /> : <Navigate to="/dashboard" />
                } 
              />
              
              <Route 
                path="/forgot-password" 
                element={
                  !user ? <ForgotPassword /> : <Navigate to="/dashboard" />
                } 
              />
              
              <Route 
                path="/provider/:id" 
                element={
                  user ? <ProviderProfile user={user} /> : <Navigate to="/login" />
                } 
              />
              
              <Route 
                path="/dashboard" 
                element={
                  user ? <Dashboard user={user} setUser={setUser} /> : <Navigate to="/login" />
                } 
              />
              
              <Route 
                path="/" 
                element={<Navigate to={user ? "/dashboard" : "/login"} />} 
              />
            </Routes>
          </main>

          {/* ✅ 4. ADD: Fixed Chat Widget (only shows when logged in) */}
          {user && <ChatWidget />}
        </div>
      </SocketProvider>
    </Router>
  )
}

export default App