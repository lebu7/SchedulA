import React, { useState, useEffect } from 'react'
import api from '../services/auth'
import './AppointmentManager.css'

function AppointmentManager({ user }) {
  const [appointments, setAppointments] = useState({ pending: [], past: [] })
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)

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
      setUpdating(appointmentId)
      try {
        await api.put(`/appointments/${appointmentId}`, {
          status: 'cancelled'
        })
        // Refresh appointments immediately after cancellation
        await fetchAppointments()
      } catch (error) {
        console.error('Error cancelling appointment:', error)
        alert('Failed to cancel appointment')
      } finally {
        setUpdating(null)
      }
    }
  }

  if (loading) {
    return <div className="loading">Loading appointments...</div>
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
                        {getStatusBadge(apt.status)}
                      </div>
                      <div className="appointment-actions">
                        <button 
                          className="btn btn-secondary"
                          disabled={updating === apt.id}
                        >
                          Reschedule
                        </button>
                        <button 
                          className="btn btn-danger"
                          onClick={() => handleCancelAppointment(apt.id)}
                          disabled={updating === apt.id}
                        >
                          {updating === apt.id ? 'Cancelling...' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-appointments">
                  <p>No upcoming appointments scheduled.</p>
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
                        {getStatusBadge(apt.status)}
                        {apt.notes && <p><strong>Notes:</strong> {apt.notes}</p>}
                      </div>
                      <div className="appointment-actions">
                        <button className="btn btn-primary">Rebook</button>
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
                      {updating === apt.id && <span className="updating-text">Updating...</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-appointments">
                <p>No appointments scheduled yet.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default AppointmentManager