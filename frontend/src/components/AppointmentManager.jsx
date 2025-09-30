import React, { useState, useEffect } from 'react'
import api from '../services/auth'
import './AppointmentManager.css'

function AppointmentManager({ user }) {
  const [appointments, setAppointments] = useState({ pending: [], past: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAppointments()
  }, [])

  const fetchAppointments = async () => {
    try {
      const response = await api.get('/appointments')
      setAppointments(response.data.appointments)
    } catch (error) {
      console.error('Error fetching appointments:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString()
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
        {status}
      </span>
    )
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
              <h3>Upcoming Appointments</h3>
              {appointments.pending?.length > 0 ? (
                <div className="appointments-list">
                  {appointments.pending.map(apt => (
                    <div key={apt.id} className="appointment-card card">
                      <div className="appointment-info">
                        <h4>{apt.service_name}</h4>
                        <p>With: {apt.provider_name}</p>
                        <p>When: {formatDate(apt.appointment_date)}</p>
                        <p>Duration: {apt.duration} minutes</p>
                        <p>Price: ${apt.price}</p>
                        {getStatusBadge(apt.status)}
                      </div>
                      <div className="appointment-actions">
                        <button className="btn btn-secondary">Reschedule</button>
                        <button className="btn btn-danger">Cancel</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p>No upcoming appointments.</p>
              )}
            </div>

            <div className="appointment-section">
              <h3>Past Appointments</h3>
              {appointments.past?.length > 0 ? (
                <div className="appointments-list">
                  {appointments.past.map(apt => (
                    <div key={apt.id} className="appointment-card card">
                      <div className="appointment-info">
                        <h4>{apt.service_name}</h4>
                        <p>With: {apt.provider_name}</p>
                        <p>When: {formatDate(apt.appointment_date)}</p>
                        {getStatusBadge(apt.status)}
                      </div>
                      <div className="appointment-actions">
                        <button className="btn btn-primary">Rebook</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p>No past appointments.</p>
              )}
            </div>
          </>
        ) : (
          <div className="appointment-section">
            <h3>All Appointments</h3>
            {appointments.appointments?.length > 0 ? (
              <div className="appointments-list">
                {appointments.appointments.map(apt => (
                  <div key={apt.id} className="appointment-card card">
                    <div className="appointment-info">
                      <h4>{apt.service_name}</h4>
                      <p>Client: {apt.client_name}</p>
                      <p>Phone: {apt.client_phone}</p>
                      <p>When: {formatDate(apt.appointment_date)}</p>
                      <p>Duration: {apt.duration} minutes</p>
                      {getStatusBadge(apt.status)}
                    </div>
                    <div className="appointment-actions">
                      <select 
                        value={apt.status}
                        onChange={async (e) => {
                          try {
                            await api.put(`/appointments/${apt.id}`, {
                              status: e.target.value
                            })
                            fetchAppointments()
                          } catch (error) {
                            console.error('Error updating appointment:', error)
                          }
                        }}
                        className="status-select"
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="no-show">No Show</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>No appointments yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default AppointmentManager