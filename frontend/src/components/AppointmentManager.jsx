import React, { useState, useEffect } from 'react'
import api from '../services/auth'
import './AppointmentManager.css'

function AppointmentManager({ user }) {
  const [appointments, setAppointments] = useState({ pending: [], past: [] })
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)
  const [cancelling, setCancelling] = useState(null)

  // Fetch appointments immediately on component mount
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

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-KE', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusBadge = (status) => {
    const statusColors = {
      scheduled: 'blue',
      completed: 'green',
      cancelled: 'red',
      'no-show': 'orange'
    }
    return (
      <span className={`status-badge ${statusColors[status]}`}>
        {status.replace('-', ' ')}
      </span>
    )
  }

  const handleStatusUpdate = async (appointmentId, newStatus) => {
    setUpdating(appointmentId)
    try {
      // Simulate network delay for better UX
      await new Promise(resolve => setTimeout(resolve, 500))
      await api.put(`/appointments/${appointmentId}`, {
        status: newStatus
      })
      // Refresh appointments immediately after update
      await fetchAppointments()
    } catch (error) {
      console.error('Error updating appointment:', error)
      alert('Failed to update appointment status')
    } finally {
      setUpdating(null)
    }
  }

  const handleCancelAppointment = async (appointmentId) => {
    if (window.confirm('Are you sure you want to cancel this appointment?')) {
      setCancelling(appointmentId)
      try {
        // Simulate network delay for better UX
        await new Promise(resolve => setTimeout(resolve, 500))
        await api.put(`/appointments/${appointmentId}`, {
          status: 'cancelled'
        })
        // Refresh appointments immediately after cancellation
        await fetchAppointments()
      } catch (error) {
        console.error('Error cancelling appointment:', error)
        alert('Failed to cancel appointment')
      } finally {
        setCancelling(null)
      }
    }
  }

  const handleReschedule = async (appointmentId) => {
    // Placeholder for reschedule functionality
    alert('Reschedule functionality coming soon!')
  }

  const handleRebook = async (serviceId) => {
    // Placeholder for rebook functionality
    alert('Rebook functionality coming soon!')
  }

  if (loading) {
    return (
      <div className="appointment-manager">
        <div className="container">
          <div className="loading">Loading appointments...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="appointment-manager">
      <div className="container">
        <h2>My Appointments</h2>

        {user.user_type === 'client' ? (
          <>
            <div className="appointment-section">
              <h3>Upcoming Appointments ({appointments.pending?.length || 0})</h3>
              {appointments.pending?.length > 0 ? (
                <div className="appointments-list">
                  {appointments.pending.map(apt => (
                    <div key={apt.id} className="appointment-card card">
                      <div className="appointment-info">
                        <h4>{apt.service_name}</h4>
                        <p><strong>With:</strong> {apt.provider_name}</p>
                        <p><strong>When:</strong> {formatDate(apt.appointment_date)}</p>
                        <p><strong>Duration:</strong> {apt.duration} minutes</p>
                        <p><strong>Price:</strong> KES {apt.price}</p>
                        {apt.notes && <p><strong>Your Notes:</strong> {apt.notes}</p>}
                        {getStatusBadge(apt.status)}
                      </div>
                      <div className="appointment-actions">
                        <button 
                          className="btn btn-secondary"
                          onClick={() => handleReschedule(apt.id)}
                          disabled={updating === apt.id || cancelling === apt.id}
                        >
                          Reschedule
                        </button>
                        <button 
                          className="btn btn-danger"
                          onClick={() => handleCancelAppointment(apt.id)}
                          disabled={updating === apt.id || cancelling === apt.id}
                        >
                          {cancelling === apt.id ? (
                            <>
                              <span className="spinner"></span>
                              Cancelling...
                            </>
                          ) : (
                            'Cancel'
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-appointments">
                  <p>No upcoming appointments scheduled.</p>
                  <button 
                    className="btn btn-primary"
                    onClick={() => window.location.href = '/dashboard?tab=services'}
                  >
                    Browse Services
                  </button>
                </div>
              )}
            </div>

            <div className="appointment-section">
              <h3>Past Appointments ({appointments.past?.length || 0})</h3>
              {appointments.past?.length > 0 ? (
                <div className="appointments-list">
                  {appointments.past.map(apt => (
                    <div key={apt.id} className="appointment-card card">
                      <div className="appointment-info">
                        <h4>{apt.service_name}</h4>
                        <p><strong>With:</strong> {apt.provider_name}</p>
                        <p><strong>When:</strong> {formatDate(apt.appointment_date)}</p>
                        <p><strong>Duration:</strong> {apt.duration} minutes</p>
                        <p><strong>Price:</strong> KES {apt.price}</p>
                        {getStatusBadge(apt.status)}
                        {apt.notes && <p><strong>Your Notes:</strong> {apt.notes}</p>}
                      </div>
                      <div className="appointment-actions">
                        <button 
                          className="btn btn-primary"
                          onClick={() => handleRebook(apt.service_id)}
                        >
                          Rebook
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-appointments">
                  <p>No past appointments found.</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="appointment-section">
            <h3>All Appointments ({appointments.appointments?.length || 0})</h3>
            {appointments.appointments?.length > 0 ? (
              <div className="appointments-list">
                {appointments.appointments.map(apt => (
                  <div key={apt.id} className="appointment-card card">
                    <div className="appointment-info">
                      <h4>{apt.service_name}</h4>
                      <p><strong>Client:</strong> {apt.client_name}</p>
                      <p><strong>Phone:</strong> {apt.client_phone}</p>
                      <p><strong>When:</strong> {formatDate(apt.appointment_date)}</p>
                      <p><strong>Duration:</strong> {apt.duration} minutes</p>
                      <p><strong>Price:</strong> KES {apt.price}</p>
                      {getStatusBadge(apt.status)}
                      {apt.notes && <p><strong>Client Notes:</strong> {apt.notes}</p>}
                    </div>
                    <div className="appointment-actions">
                      <div className="status-control">
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
                        {updating === apt.id && (
                          <div className="updating-indicator">
                            <span className="spinner small"></span>
                            <span>Updating...</span>
                          </div>
                        )}
                      </div>
                      <button 
                        className="btn btn-secondary"
                        onClick={() => handleReschedule(apt.id)}
                        disabled={updating === apt.id}
                      >
                        Reschedule
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-appointments">
                <p>No appointments scheduled yet.</p>
                <p className="hint">When clients book your services, they will appear here.</p>
              </div>
            )}
          </div>
        )}

        {/* Quick Stats for Providers */}
        {user.user_type === 'provider' && appointments.appointments?.length > 0 && (
          <div className="appointment-stats card">
            <h4>Quick Stats</h4>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-number">{appointments.appointments.filter(a => a.status === 'scheduled').length}</span>
                <span className="stat-label">Scheduled</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">{appointments.appointments.filter(a => a.status === 'completed').length}</span>
                <span className="stat-label">Completed</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">{appointments.appointments.filter(a => a.status === 'cancelled').length}</span>
                <span className="stat-label">Cancelled</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">{appointments.appointments.filter(a => a.status === 'no-show').length}</span>
                <span className="stat-label">No Shows</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AppointmentManager