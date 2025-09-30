import React, { useState, useEffect } from 'react'
import api from '../services/auth'
import './BookingModal.css'

function BookingModal({ service, user, onClose, onBookingSuccess }) {
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [notes, setNotes] = useState('')
  const [availableSlots, setAvailableSlots] = useState([])
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
      // Use a simpler endpoint that just returns the provider's appointments
      const response = await api.get(`/appointments?provider_id=${service.provider_id}`)
      const providerAppointments = response.data.appointments || []
      setAvailableSlots(providerAppointments)
      generateTimeSlots(providerAppointments)
    } catch (error) {
      console.error('Error fetching available slots:', error)
      setError('Failed to load available time slots. Please try again.')
      setAvailableSlots([])
      generateTimeSlots([])
    } finally {
      setLoading(false)
    }
  }

  const generateTimeSlots = (appointments) => {
    const slots = []
    const startHour = 8 // 8 AM
    const endHour = 18 // 6 PM
    
    // Filter appointments for the selected date
    const dayAppointments = appointments.filter(apt => {
      const aptDate = new Date(apt.appointment_date).toISOString().split('T')[0]
      return aptDate === selectedDate && apt.status === 'scheduled'
    })

    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 30) { // 30-minute intervals
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
        const slotDateTime = `${selectedDate}T${timeString}:00`
        
        // Check if slot conflicts with existing appointments
        const isBooked = dayAppointments.some(apt => {
          const aptStart = new Date(apt.appointment_date)
          const aptEnd = new Date(aptStart.getTime() + apt.duration * 60000)
          const slotStart = new Date(slotDateTime)
          const slotEnd = new Date(slotStart.getTime() + service.duration * 60000)
          
          return slotStart < aptEnd && slotEnd > aptStart
        })

        slots.push({
          time: timeString,
          available: !isBooked
        })
      }
    }
    setTimeSlots(slots)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!selectedDate || !selectedTime) {
      setError('Please select both date and time')
      return
    }

    const appointmentDateTime = `${selectedDate}T${selectedTime}:00`
    
    setBooking(true)
    setError('')

    try {
      const response = await api.post('/appointments', {
        service_id: service.id,
        appointment_date: appointmentDateTime,
        notes: notes
      })
      
      onBookingSuccess()
      onClose()
    } catch (error) {
      console.error('Error booking appointment:', error)
      const errorMessage = error.response?.data?.error || 'Failed to book appointment. Please try again.'
      setError(errorMessage)
      
      // If it's a conflict error, refresh available slots
      if (errorMessage.includes('conflict') || errorMessage.includes('not available')) {
        fetchAvailableSlots()
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
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3>Book {service.name}</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="service-info">
          <p><strong>Provider:</strong> {service.provider_name}</p>
          <p><strong>Duration:</strong> {service.duration} minutes</p>
          <p><strong>Price:</strong> KES {service.price}</p>
          {service.business_name && <p><strong>Business:</strong> {service.business_name}</p>}
        </div>

        <form onSubmit={handleSubmit} className="booking-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label>Select Date *</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value)
                setSelectedTime('')
              }}
              min={getMinDate()}
              max={getMaxDate()}
              required
            />
            <small className="field-hint">Select a date between tomorrow and 30 days from now</small>
          </div>

          {selectedDate && (
            <div className="form-group">
              <label>Select Time *</label>
              <p className="selected-date-info">Available times for {formatDisplayDate(selectedDate)}</p>
              
              {loading ? (
                <div className="time-slots-loading">
                  <span className="spinner"></span>
                  Loading available times...
                </div>
              ) : (
                <div className="time-slots-grid">
                  {timeSlots.map(slot => (
                    <button
                      key={slot.time}
                      type="button"
                      className={`time-slot ${selectedTime === slot.time ? 'selected' : ''} ${!slot.available ? 'disabled' : ''}`}
                      onClick={() => slot.available && setSelectedTime(slot.time)}
                      disabled={!slot.available}
                    >
                      {slot.time}
                    </button>
                  ))}
                </div>
              )}
              
              {timeSlots.length > 0 && !timeSlots.some(slot => slot.available) && (
                <div className="no-slots">
                  No available time slots for {formatDisplayDate(selectedDate)}. Please select another date.
                </div>
              )}
            </div>
          )}

          <div className="form-group">
            <label>Additional Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special requirements or notes for the provider..."
              rows="3"
            />
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