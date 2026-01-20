import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import './App.css'

// Components
import Header from './components/Header'
import Login from './components/Login'
import Register from './components/Register'
import Dashboard from './components/Dashboard'

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
            
            {/* ✅ FIX: Pass 'setUser' here so Dashboard can update the profile */}
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
      </div>
    </Router>
  )
}

export default App