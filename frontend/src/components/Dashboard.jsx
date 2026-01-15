import React, { useState, useEffect } from 'react'
import ServiceList from './ServiceList'
import ServiceManager from './ServiceManager'
import AppointmentManager from './AppointmentManager'
import api from '../services/auth'
import './Dashboard.css'

function Dashboard({ user }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [businessHours, setBusinessHours] = useState({
    opening_time: user?.opening_time || '08:00',
    closing_time: user?.closing_time || '18:00'
  })
  const [savingHours, setSavingHours] = useState(false)

  useEffect(() => {
    if (user.user_type === 'provider') {
      fetchHours()
    }
  }, [])

const fetchHours = async () => {
  try {
    const res = await api.get(`/appointments/providers/${user.id}/availability`, {
      params: { date: new Date().toISOString().split('T')[0] }
    })
    setBusinessHours({
      opening_time: res.data.opening_time || '08:00',
      closing_time: res.data.closing_time || '18:00'
    })
  } catch (err) {
    console.error('Error fetching business hours:', err)
  }
}

const handleSaveBusinessHours = async () => {
  try {
    setSavingHours(true);
    await api.put('/auth/business-hours', businessHours);
    alert('✅ Business hours updated successfully!');
    await fetchHours(); // refresh after save
  } catch (err) {
    console.error('Error updating business hours:', err);
    alert('❌ Failed to update business hours');
  } finally {
    setSavingHours(false);
  }
};

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
            {/* LEFT COLUMN: Profile + Quick Actions */}
            <div className="left-column">
              <div className="card profile-card">
                <h3>Your Profile</h3>
                <p><strong>Email:</strong> {user.email}</p>
                <p><strong>Role:</strong> {user.user_type}</p>
                {user.phone && <p><strong>Phone:</strong> {user.phone}</p>}
                {user.business_name && <p><strong>Business:</strong> {user.business_name}</p>}
              </div>

              <div className="card quick-actions">
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

            {/* RIGHT COLUMN: Small Business Hours Card (for providers only) */}
            {user.user_type === 'provider' && (
              <div className="card business-hours-card">
                <h4>Business Hours</h4>
                <div className="hours-fields">
                  <label>
                    Open:
                    <input
                      type="time"
                      value={businessHours.opening_time}
                      onChange={(e) =>
                        setBusinessHours((prev) => ({
                          ...prev,
                          opening_time: e.target.value
                        }))
                      }
                    />
                  </label>
                  <label>
                    Close:
                    <input
                      type="time"
                      value={businessHours.closing_time}
                      onChange={(e) =>
                        setBusinessHours((prev) => ({
                          ...prev,
                          closing_time: e.target.value
                        }))
                      }
                    />
                  </label>
                </div>
                <button
                  className="btn btn-small btn-primary"
                  onClick={handleSaveBusinessHours}
                  disabled={savingHours}
                >
                  {savingHours ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
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

        <div className="dashboard-content">{renderContent()}</div>
      </div>
    </div>
  )
}

export default Dashboard
