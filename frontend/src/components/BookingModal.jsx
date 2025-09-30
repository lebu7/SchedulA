import React, { useState, useEffect } from 'react'
import api from '../services/auth'
import './BookingModal.css'

function BookingModal({ service, user, onClose, onBookingSuccess }) {
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [booking, setBooking] = useState(false)
  const [error, setError] = useState('')
  const [timeSlots, setTimeSlots] = useState([])

  useEffect(() => {
    if (selectedDate) {
      fetchAvailableSlots()
    } else {
      setTimeSlots([])
      setSelectedTime('')
    }
  }, [selectedDate])

  const fetchAvailableSlots = async () => {
    try {
      setLoading(true)
      setError('')
      
      // Get all appointments to check availability
      let providerAppointments = []
      
      try {
        // Try to get appointments for this specific provider
        const response = await api.get('/appointments')
        if (response.data && response.data.appointments) {
          providerAppointments = Array.isArray(response.data.appointments) 
            ? response.data.appointments.filter(apt => 
                apt.provider_id === service.provider_id && apt.status === 'scheduled'
              )
            : []
        }
      } catch (apiError) {
        console.log('Appointments API failed:', apiError)
        // If we can't get appointments, assume no conflicts
        providerAppointments = []
      }
      
      generateTimeSlots(providerAppointments)
    } catch (error) {
      console.error('Error in fetchAvailableSlots:', error)
      setError('Failed to load available time slots. Please try again.')
      generateTimeSlots([])
    } finally {
      setLoading(false)
    }
  }

  const generateTimeSlots = (providerAppointments) => {
    const slots = []
    const startHour = 8 // 8 AM
    const endHour = 18 // 6 PM
    
    // Filter appointments for the selected date
    const dayAppointments = providerAppointments.filter(apt => {
      try {
        const aptDate = new Date(apt.appointment_date).toISOString().split('T')[0]
        return aptDate === selectedDate
      } catch (error) {
        return false
      }
    })

    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 30) { // 30-minute intervals
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
        const slotDateTime = `${selectedDate}T${timeString}:00`
        
        // Check if slot conflicts with existing appointments
        const isBooked = dayAppointments.some(apt => {
          try {
            const aptStart = new Date(apt.appointment_date)
            const aptDuration = apt.duration || 60 // Default to 60 minutes if not provided
            const aptEnd = new Date(aptStart.getTime() + aptDuration * 60000)
            const slotStart = new Date(slotDateTime)
            const slotEnd = new Date(slotStart.getTime() + service.duration * 60000)
            
            // Check for overlap
            return slotStart < aptEnd && slotEnd > aptStart
          } catch (error) {
            console.error('Error checking appointment conflict:', error)
            return false
          }
        })

        slots.push({
          time: timeString,
          available: !isBooked,
          displayTime: formatTimeDisplay(timeString)
        })
      }
    }
    setTimeSlots(slots)
  }

  const formatTimeDisplay = (timeString) => {
    const [hours, minutes] = timeString.split(':').map(Number)
    const period = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    return `${displayHours}:${minutes.toString().padStart(2, '0')}`
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!selectedDate || !selectedTime) {
      setError('Please select both date and time')
      return
    }

    // Validate selected date is not in the past
    const selectedDateTime = new Date(`${selectedDate}T${selectedTime}`)
    const now = new Date()
    if (selectedDateTime <= now) {
      setError('Please select a future date and time')
      return
    }

    const appointmentDateTime = `${selectedDate}T${selectedTime}:00`
    
    setBooking(true)
    setError('')

    try {
      const response = await api.post('/appointments', {
        service_id: service.id,
        appointment_date: appointmentDateTime,
        notes: notes.trim()
      })
      
      onBookingSuccess()
      onClose()
    } catch (error) {
      console.error('Error booking appointment:', error)
      const errorMessage = error.response?.data?.error || 'Failed to book appointment. Please try again.'
      setError(errorMessage)
      
      // If it's a conflict error, refresh available slots
      if (errorMessage.includes('conflict') || errorMessage.includes('not available') || errorMessage.includes('Time slot')) {
        await fetchAvailableSlots()
        setSelectedTime('')
      }
    } finally {
      setBooking(false)
    }
  }

  const getMinDate = () => {
    const today = new Date()
    today.setDate(today.getDate() + 1) // Can only book from tomorrow
    return today.toISOString().split('T')[0]
  }

  const getMaxDate = () => {
    const maxDate = new Date()
    maxDate.setDate(maxDate.getDate() + 30) // Can book up to 30 days in advance
    return maxDate.toISOString().split('T')[0]
  }

  const formatDisplayDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-KE', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value)
    setSelectedTime('')
    setError('')
  }

  const handleTimeSelect = (time) => {
    setSelectedTime(time)
    setError('')
  }

  const availableTimeSlots = timeSlots.filter(slot => slot.available)
  const hasAvailableSlots = availableTimeSlots.length > 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Book {service.name}</h3>
          <button className="close-btn" onClick={onClose} disabled={booking}>
            ×
          </button>
        </div>

        <div className="service-info">
          <div className="service-detail">
            <span className="detail-label">Provider:</span>
            <span className="detail-value">{service.provider_name}</span>
          </div>
          <div className="service-detail">
            <span className="detail-label">Duration:</span>
            <span className="detail-value">{service.duration} minutes</span>
          </div>
          <div className="service-detail">
            <span className="detail-label">Price:</span>
            <span className="detail-value">KES {service.price}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="booking-form">
          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="appointment-date">Select Date *</label>
            <input
              id="appointment-date"
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              min={getMinDate()}
              max={getMaxDate()}
              required
              disabled={booking}
              className="date-input"
            />
            <small className="field-hint">
              Available from {getMinDate()} to {getMaxDate()}
            </small>
          </div>

          {selectedDate && (
            <div className="form-group">
              <label>Select Time *</label>
              <div className="selected-date-info">
                {formatDisplayDate(selectedDate)}
              </div>
              
              {loading ? (
                <div className="time-slots-loading">
                  <span className="spinner"></span>
                  Checking availability...
                </div>
              ) : (
                <>
                  <div className="time-slots-container">
                    {timeSlots.length > 0 ? (
                      <div className="time-slots-grid">
                        {timeSlots.map(slot => (
                          <button
                            key={slot.time}
                            type="button"
                            className={`time-slot ${selectedTime === slot.time ? 'selected' : ''} ${!slot.available ? 'disabled' : ''}`}
                            onClick={() => slot.available && handleTimeSelect(slot.time)}
                            disabled={!slot.available || booking}
                          >
                            {slot.displayTime}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="no-time-slots">
                        No time slots available
                      </div>
                    )}
                  </div>
                  
                  {!hasAvailableSlots && !loading && timeSlots.length > 0 && (
                    <div className="no-slots-message">
                      All time slots are booked for this date
                    </div>
                  )}
                  
                  {hasAvailableSlots && (
                    <div className="slots-summary">
                      <small>
                        {availableTimeSlots.length} slots available
                      </small>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="appointment-notes">Additional Notes (Optional)</label>
            <textarea
              id="appointment-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special requirements or notes..."
              rows="2"
              disabled={booking}
              maxLength="200"
            />
            <small className="field-hint">
              {notes.length}/200 characters
            </small>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={booking}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={booking || !selectedDate || !selectedTime}
            >
              {booking ? (
                <>
                  <span className="spinner"></span>
                  Booking...
                </>
              ) : (
                'Confirm Booking'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default BookingModal