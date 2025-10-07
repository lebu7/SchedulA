import React, { useState } from 'react'
import ServiceList from './ServiceList'
import ServiceManager from './ServiceManager'
import AppointmentManager from './AppointmentManager'
import './Dashboard.css'

function Dashboard({ user }) {
  const [activeTab, setActiveTab] = useState('overview')

  const renderContent = () => {
    switch (activeTab) {
      case 'services':
        return user.user_type === 'client' ? (
          <ServiceList user={user} />
        ) : (
          <ServiceManager user={user} />
        )
      case 'appointments':
        return <AppointmentManager user={user} />
      case 'overview':
      default:
        return (
          <div className="dashboard-overview">
            <div className="card">
              <h3>Your Profile</h3>
              <p><strong>Email:</strong> {user.email}</p>
              <p><strong>Role:</strong> {user.user_type}</p>
              {user.phone && <p><strong>Phone:</strong> {user.phone}</p>}
              {user.business_name && <p><strong>Business:</strong> {user.business_name}</p>}
            </div>

            <div className="card">
              <h3>Quick Actions</h3>
              {user.user_type === 'client' ? (
                <div className="action-buttons">
                  <button 
                    className="btn btn-primary"
                    onClick={() => setActiveTab('services')}
                  >
                    Find Services
                  </button>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => setActiveTab('appointments')}
                  >
                    My Appointments
                  </button>
                </div>
              ) : (
                <div className="action-buttons">
                  <button 
                    className="btn btn-primary"
                    onClick={() => setActiveTab('services')}
                  >
                    Manage Services
                  </button>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => setActiveTab('appointments')}
                  >
                    View Appointments
                  </button>
                </div>
              )}
            </div>
          </div>
        )
    }
  }

  return (
    <div className="container">
      <div className="dashboard">
        <h2>Welcome, {user.name}!</h2>
        
        <div className="dashboard-tabs">
          <button 
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button 
            className={`tab-btn ${activeTab === 'services' ? 'active' : ''}`}
            onClick={() => setActiveTab('services')}
          >
            {user.user_type === 'client' ? 'Find Services' : 'My Services'}
          </button>
          <button 
            className={`tab-btn ${activeTab === 'appointments' ? 'active' : ''}`}
            onClick={() => setActiveTab('appointments')}
          >
            Appointments
          </button>
        </div>

        <div className="dashboard-content">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}

export default Dashboard