import React, { useState, useEffect } from 'react'
import api from '../services/auth'
import './AppointmentManager.css'

function AppointmentManager({ user }) {
  const [appointments, setAppointments] = useState({ pending: [], past: [], appointments: [] })
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)
  const [cancelling, setCancelling] = useState(null)

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

  const handleStatusUpdate = async (appointmentId, newStatus) => {
    setUpdating(appointmentId)
    try {
      await new Promise(resolve => setTimeout(resolve, 500))
      await api.put(`/appointments/${appointmentId}`, { status: newStatus })
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
        await new Promise(resolve => setTimeout(resolve, 500))
        await api.put(`/appointments/${appointmentId}`, { status: 'cancelled' })
        await fetchAppointments()
      } catch (error) {
        console.error('Error cancelling appointment:', error)
        alert('Failed to cancel appointment')
      } finally {
        setCancelling(null)
      }
    }
  }

  const handleReschedule = (appointmentId) => {
    alert('Reschedule functionality coming soon!')
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
            {/* Pending Requests */}
            <div className="appointment-section">
              <h3>Pending Requests ({appointments.pending?.length || 0})</h3>
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
                        {getStatusBadge(apt.status)}
                        {apt.notes && <p><strong>Your Notes:</strong> {apt.notes}</p>}
                      </div>
                      <div className="appointment-actions">
                        <button
                          className="btn btn-danger"
                          onClick={() => handleCancelAppointment(apt.id)}
                          disabled={cancelling === apt.id}
                        >
                          {cancelling === apt.id ? 'Cancelling...' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-appointments">No pending requests.</div>
              )}
            </div>

            {/* Past */}
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
                        {getStatusBadge(apt.status)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-appointments">No past appointments.</div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Provider View */}
            <div className="appointment-section">
              <h3>Client Requests ({appointments.appointments?.length || 0})</h3>
              {appointments.appointments?.length > 0 ? (
                <div className="appointments-list">
                  {appointments.appointments.map(apt => (
                    <div key={apt.id} className={`appointment-card card ${apt.status === 'pending' ? 'highlight-pending' : ''}`}>
                      <div className="appointment-info">
                        <h4>{apt.service_name}</h4>
                        <p><strong>Client:</strong> {apt.client_name} ({apt.client_phone})</p>
                        <p><strong>When:</strong> {formatDate(apt.appointment_date)}</p>
                        {getStatusBadge(apt.status)}
                        {apt.notes && <p><strong>Notes:</strong> {apt.notes}</p>}
                      </div>
                      <div className="appointment-actions">
                        {apt.status === 'pending' ? (
                          <>
                            <button
                              className="btn btn-primary"
                              onClick={() => handleStatusUpdate(apt.id, 'scheduled')}
                              disabled={updating === apt.id}
                            >
                              Confirm
                            </button>
                            <button
                              className="btn btn-danger"
                              onClick={() => handleStatusUpdate(apt.id, 'cancelled')}
                              disabled={updating === apt.id}
                            >
                              Reject
                            </button>
                            <button
                              className="btn btn-secondary"
                              onClick={() => handleReschedule(apt.id)}
                              disabled={updating === apt.id}
                            >
                              Reschedule
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
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-appointments">No client bookings yet.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default AppointmentManager
