import React, { useState, useEffect } from 'react'
import api from '../services/auth' // keep your existing api import path
import './BookingModal.css'

function BookingModal({ service, user, onClose, onBookingSuccess }) {
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [notes, setNotes] = useState('')
  const [booking, setBooking] = useState(false)
  const [error, setError] = useState('')
  const [serviceMeta, setServiceMeta] = useState(service || {})

  useEffect(() => {
    if (service) {
      setServiceMeta(service)
    }
  }, [service])

  const formatTimeDisplay = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number)
    const period = h >= 12 ? 'PM' : 'AM'
    const displayHours = h % 12 || 12
    return `${displayHours}:${m.toString().padStart(2, '0')} ${period}`
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedDate || !selectedTime) {
      setError('Please select both date and time')
      return
    }

    const appointmentDateTime = new Date(`${selectedDate}T${selectedTime}:00`)
    const now = new Date()
    if (appointmentDateTime <= now) {
      setError('Please select a future date and time')
      return
    }

    setBooking(true)
    setError('')
    try {
      const payload = {
        service_id: serviceMeta.id,
        appointment_date: appointmentDateTime.toISOString(),
        notes: notes.trim()
      }
      await api.post('/appointments', payload)
      onBookingSuccess && onBookingSuccess()
      onClose && onClose()
    } catch (err) {
      console.error('Booking error:', err)
      const serverMsg = err.response?.data?.error || 'Failed to book appointment.'
      setError(serverMsg)
    } finally {
      setBooking(false)
    }
  }

  const getMinDate = () => {
    const today = new Date()
    today.setDate(today.getDate() + 1)
    return today.toISOString().split('T')[0]
  }

  const getMaxDate = () => {
    const maxDate = new Date()
    maxDate.setDate(maxDate.getDate() + 30)
    return maxDate.toISOString().split('T')[0]
  }

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value)
    setSelectedTime('')
    setError('')
  }

  const handleTimeChange = (e) => {
    setSelectedTime(e.target.value)
    setError('')
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Book {serviceMeta.name}</h3>
          <button className="close-btn" onClick={onClose} disabled={booking}>
            ×
          </button>
        </div>

        <div className="service-info">
          <div className="service-detail">
            <span className="detail-label">Provider:</span>
            <span className="detail-value">{serviceMeta.provider_name}</span>
          </div>
          <div className="service-detail">
            <span className="detail-label">Duration:</span>
            <span className="detail-value">{serviceMeta.duration} minutes</span>
          </div>
          <div className="service-detail">
            <span className="detail-label">Price:</span>
            <span className="detail-value">KES {serviceMeta.price}</span>
          </div>
          <div className="service-detail">
            <span className="detail-label">Business hours:</span>
            <span className="detail-value">
              {serviceMeta.opening_time || '08:00'} - {serviceMeta.closing_time || '18:00'}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="booking-form">
          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}

          <div className="datetime-picker-container">
            <div className="picker-group">
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

            <div className="picker-group">
              <label htmlFor="appointment-time">Select Time *</label>
              <select
                id="appointment-time"
                value={selectedTime}
                onChange={handleTimeChange}
                required
                disabled={booking || !selectedDate}
                className="time-select"
              >
                <option value="">Choose a time</option>
                {selectedDate && Array.from({ length: 24 * 2 }).map((_, i) => {
                  const h = Math.floor(i / 2)
                  const m = (i % 2) * 30
                  const value = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
                  return (
                    <option key={value} value={value}>
                      {formatTimeDisplay(value)}
                    </option>
                  )
                })}
              </select>
            </div>
          </div>

          {selectedDate && selectedTime && (
            <div className="appointment-preview">
              <h4>Appointment Request</h4>
              <div className="preview-details">
                <div className="preview-item">
                  <span className="preview-label">Date:</span>
                  <span className="preview-value">
                    {new Date(selectedDate).toLocaleDateString('en-KE', {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </span>
                </div>
                <div className="preview-item">
                  <span className="preview-label">Time:</span>
                  <span className="preview-value">{formatTimeDisplay(selectedTime)}</span>
                </div>
                <div className="preview-item">
                  <span className="preview-label">Duration:</span>
                  <span className="preview-value">{serviceMeta.duration} minutes</span>
                </div>
                <div className="preview-item total">
                  <span className="preview-label">Total:</span>
                  <span className="preview-value">KES {serviceMeta.price}</span>
                </div>
              </div>
              <small style={{ color: '#555' }}>
                This request will be <strong>pending</strong> until your provider confirms.
              </small>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="appointment-notes">Additional Notes (Optional)</label>
            <textarea
              id="appointment-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special requirements for the provider..."
              rows="2"
              disabled={booking}
              maxLength="200"
            />
            <small className="field-hint">{notes.length}/200 characters</small>
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
                  Sending request...
                </>
              ) : (
                'Send Request'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default BookingModal
