import React, { useState, useEffect } from 'react'
import api from '../services/auth'
import BookingModal from './BookingModal'
import './AppointmentManager.css'

function AppointmentManager({ user }) {
  const [appointments, setAppointments] = useState({ pending: [], scheduled: [], upcoming: [], past: [] })
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [activeTab, setActiveTab] = useState('pending')
  const [showBooking, setShowBooking] = useState(false)
  const [rebookService, setRebookService] = useState(null)

  useEffect(() => {
    fetchAppointments()
  }, [])

  const fetchAppointments = async () => {
    try {
      setLoading(true)
      const response = await api.get('/appointments')
      setAppointments(response.data.appointments)
    } catch (error) {
      console.error('Error fetching appointments:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteAppointment = async (id) => {
    if (window.confirm('Remove this appointment from your dashboard?')) {
      try {
        await api.delete(`/appointments/${id}`)
        await fetchAppointments()
        alert('Appointment deleted.')
      } catch {
        alert('Failed to delete appointment.')
      }
    }
  }

  const handleRebook = (apt) => {
    setRebookService({
      id: apt.service_id,
      name: apt.service_name,
      provider_name: apt.provider_name,
      duration: apt.duration,
      price: apt.price,
      opening_time: apt.opening_time || '08:00',
      closing_time: apt.closing_time || '18:00',
      rebook: true
    })
    setShowBooking(true)
  }

  const formatDate = (dateString) =>
    new Date(dateString).toLocaleString('en-KE', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

  const getStatusBadge = (status) => {
    const statusColors = {
      pending: 'gray',
      scheduled: 'blue',
      completed: 'green',
      cancelled: 'red',
      'no-show': 'orange'
    }
    return (
      <span className={`status-badge ${statusColors[status] || 'gray'}`}>
        {status.replace('-', ' ')}
      </span>
    )
  }

  const handleStatusUpdate = async (id, status) => {
    setUpdating(id)
    try {
      await api.put(`/appointments/${id}`, { status })
      await fetchAppointments()
    } finally {
      setUpdating(null)
    }
  }

  const handleCancelAppointment = async (id) => {
    if (window.confirm('Cancel this appointment?')) {
      setCancelling(id)
      try {
        await api.put(`/appointments/${id}`, { status: 'cancelled' })
        await fetchAppointments()
      } finally {
        setCancelling(null)
      }
    }
  }

  const renderAppointmentsList = (list, type) => {
    if (!list || list.length === 0)
      return <div className="no-appointments">No {type} appointments.</div>

    return (
      <div className="appointments-list">
        {list.map((apt) => (
          <div
            key={apt.id}
            className={`appointment-card card ${apt.status === 'pending' ? 'highlight-pending' : ''}`}
          >
            <div className="appointment-info">
              <h4>{apt.service_name}</h4>
              {user.user_type === 'client' ? (
                <>
                  <p><strong>With:</strong> {apt.provider_name}</p>
                  <p><strong>When:</strong> {formatDate(apt.appointment_date)}</p>
                  <p><strong>Duration:</strong> {apt.duration} minutes</p>
                  <p><strong>Price:</strong> KES {apt.price}</p>
                  {getStatusBadge(apt.status)}
                </>
              ) : (
                <>
                  <p><strong>Client:</strong> {apt.client_name} ({apt.client_phone})</p>
                  <p><strong>When:</strong> {formatDate(apt.appointment_date)}</p>
                  <p><strong>Duration:</strong> {apt.duration} minutes</p>
                  <p><strong>Price:</strong> KES {apt.price}</p>
                  {getStatusBadge(apt.status)}
                </>
              )}
            </div>

            <div className="appointment-actions">
              {user.user_type === 'client' ? (
                <>
                  {apt.status === 'pending' && (
                    <button
                      className="btn btn-danger small-btn"
                      onClick={() => handleCancelAppointment(apt.id)}
                      disabled={cancelling === apt.id}
                    >
                      {cancelling === apt.id ? 'Cancelling...' : 'Cancel'}
                    </button>
                  )}

                  {/* Rebook only for cancelled or no-show */}
                  {['cancelled', 'no-show'].includes(apt.status) && (
                    <>
                      <div className="action-row">
                        <button
                          className="btn btn-primary small-btn"
                          onClick={() => handleRebook(apt)}
                        >
                          Rebook
                        </button>
                        <button
                          className="btn btn-danger small-btn"
                          onClick={() => handleDeleteAppointment(apt.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}

                  {/* Completed only shows delete */}
                  {apt.status === 'completed' && (
                    <button
                      className="btn btn-danger small-btn"
                      onClick={() => handleDeleteAppointment(apt.id)}
                    >
                      Delete
                    </button>
                  )}
                </>
              ) : (
                <>
                  {apt.status === 'pending' ? (
                    <>
                      <button
                        className="btn btn-primary small-btn"
                        onClick={() => handleStatusUpdate(apt.id, 'scheduled')}
                      >
                        Confirm
                      </button>
                      <button
                        className="btn btn-danger small-btn"
                        onClick={() => handleStatusUpdate(apt.id, 'cancelled')}
                      >
                        Reject
                      </button>
                    </>
                  ) : ['completed', 'cancelled', 'no-show'].includes(apt.status) ? (
                    <>
                      <p className="hint">Status locked</p>
                      <button
                        className="btn btn-danger small-btn"
                        onClick={() => handleDeleteAppointment(apt.id)}
                      >
                        Delete
                      </button>
                    </>
                  ) : (
                    <select
                      value={apt.status}
                      onChange={(e) => handleStatusUpdate(apt.id, e.target.value)}
                      disabled={updating === apt.id}
                      className="status-select"
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="no-show">No Show</option>
                    </select>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (loading)
    return (
      <div className="appointment-manager">
        <div className="container">
          <div className="loading">Loading appointments...</div>
        </div>
      </div>
    )

  const tabs =
    user.user_type === 'client'
      ? ['pending', 'scheduled', 'past']
      : ['pending', 'upcoming', 'past']

  return (
    <div className="appointment-manager">
      <div className="container">
        <h2>My Appointments</h2>

        <div className="tabs">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)} ({appointments[tab]?.length || 0})
            </button>
          ))}
        </div>

        <div className="tab-content">
          {renderAppointmentsList(appointments[activeTab], activeTab)}
        </div>

        {showBooking && (
          <BookingModal
            service={rebookService}
            user={user}
            onClose={() => setShowBooking(false)}
            onBookingSuccess={() => {
              fetchAppointments()
              setShowBooking(false)
            }}
          />
        )}
      </div>
    </div>
  )
}

export default AppointmentManager
