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

  useEffect(() => {
    if (selectedDate) {
      fetchAvailableSlots()
    }
  }, [selectedDate])

  const fetchAvailableSlots = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/appointments/available/${service.id}?date=${selectedDate}`)
      setAvailableSlots(response.data.booked_slots || [])
    } catch (error) {
      console.error('Error fetching available slots:', error)
      setAvailableSlots([])
    } finally {
      setLoading(false)
    }
  }

  const generateTimeSlots = () => {
    const slots = []
    const startHour = 8 // 8 AM
    const endHour = 18 // 6 PM
    
    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 30) { // 30-minute intervals
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
        const slotDateTime = `${selectedDate}T${timeString}`
        
        // Check if slot is booked
        const isBooked = availableSlots.some(slot => {
          const slotStart = new Date(slot.start)
          const slotEnd = new Date(slot.end)
          const proposedStart = new Date(slotDateTime)
          const proposedEnd = new Date(proposedStart.getTime() + service.duration * 60000)
          
          return proposedStart < slotEnd && proposedEnd > slotStart
        })

        if (!isBooked) {
          slots.push(timeString)
        }
      }
    }
    return slots
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!selectedDate || !selectedTime) {
      setError('Please select both date and time')
      return
    }

    const appointmentDateTime = `${selectedDate}T${selectedTime}`
    
    setBooking(true)
    setError('')

    try {
      await api.post('/appointments', {
        service_id: service.id,
        appointment_date: appointmentDateTime,
        notes: notes
      })
      
      onBookingSuccess()
      onClose()
    } catch (error) {
      console.error('Error booking appointment:', error)
      setError(error.response?.data?.error || 'Failed to book appointment. Please try again.')
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

  const timeSlots = selectedDate ? generateTimeSlots() : []

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
        </div>

        <form onSubmit={handleSubmit} className="booking-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label>Select Date *</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={getMinDate()}
              max={getMaxDate()}
              required
            />
          </div>

          <div className="form-group">
            <label>Select Time *</label>
            {loading ? (
              <div className="loading">Loading available times...</div>
            ) : selectedDate && timeSlots.length > 0 ? (
              <select
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                required
              >
                <option value="">Choose a time</option>
                {timeSlots.map(time => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            ) : selectedDate ? (
              <div className="no-slots">No available time slots for this date</div>
            ) : (
              <div className="select-date">Please select a date first</div>
            )}
          </div>

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