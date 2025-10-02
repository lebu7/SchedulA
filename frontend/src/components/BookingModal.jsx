import React, { useState, useEffect } from 'react'
import api from '../service/auth' // keep your existing api import path
import './BookingModal.css'

function BookingModal({ service, user, onClose, onBookingSuccess }) {
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [booking, setBooking] = useState(false)
  const [error, setError] = useState('')
  const [timeSlots, setTimeSlots] = useState([])
  const [bookedRanges, setBookedRanges] = useState([])
  const [serviceMeta, setServiceMeta] = useState(service || {})

  useEffect(() => {
    // ensure we have the latest service metadata (opening/closing/is_closed/slot_interval)
    if (service) {
      setServiceMeta(service)
    }
  }, [service])

  useEffect(() => {
    if (selectedDate) {
      fetchAvailabilityForDate(selectedDate)
    } else {
      setTimeSlots([])
      setSelectedTime('')
      setBookedRanges([])
    }
  }, [selectedDate, serviceMeta])

  // Use the backend availability endpoint which returns booked_slots for a date
  const fetchAvailabilityForDate = async (dateStr) => {
    try {
      setLoading(true)
      setError('')
      // API endpoint: GET /api/appointments/available/:serviceId?date=YYYY-MM-DD
      const response = await api.get(`/appointments/available/${serviceMeta.id}?date=${dateStr}`)
      const { booked_slots = [], service: svc } = response.data || {}
      // service returned includes duration and provider info and opening/closing if available
      setBookedRanges(booked_slots.map(bs => ({
        start: new Date(bs.start),
        end: new Date(bs.end)
      })))
      // if response includes opening_time/closing_time/slot_interval, merge
      if (svc) {
        setServiceMeta(prev => ({ ...prev, ...svc }))
      }
      // generate slots using the metadata
      generateTimeSlots(dateStr, booked_slots, svc)
    } catch (err) {
      console.error('Error fetching availability:', err)
      setError('Failed to load available time slots. Please try again.')
      // still attempt to generate slots with serviceMeta defaults
      generateTimeSlots(dateStr, [], serviceMeta)
    } finally {
      setLoading(false)
    }
  }

  // Parse HH:MM strings to Date objects on the selected date
  const parseTimeOnDate = (dateString, timeStr) => {
    // dateString: YYYY-MM-DD, timeStr: "08:00" or "08:30"
    const dtStr = `${dateString}T${timeStr}:00`
    return new Date(dtStr)
  }

  const generateTimeSlots = (dateString, bookedSlotsFromServer = [], svc = {}) => {
    // svc may include opening_time, closing_time, slot_interval, duration
    const opening_time = svc.opening_time || serviceMeta.opening_time || '08:00'
    const closing_time = svc.closing_time || serviceMeta.closing_time || '18:00'
    const slot_interval = svc.slot_interval || serviceMeta.slot_interval || 30
    const duration = svc.duration || serviceMeta.duration || 60
    const is_closed = (svc.is_closed !== undefined) ? svc.is_closed : (serviceMeta.is_closed || 0)

    // If service is flagged closed, no slots
    if (Number(is_closed) === 1) {
      setTimeSlots([])
      return
    }

    // convert bookedSlotsFromServer to ranges of Date objects
    const bookedRangesLocal = (bookedSlotsFromServer || []).map(bs => ({
      start: new Date(bs.start),
      end: new Date(bs.end)
    }))

    // compute start and end Date for the day
    const dayStart = parseTimeOnDate(dateString, opening_time)
    const dayEnd = parseTimeOnDate(dateString, closing_time)

    // Validate that opening < closing
    if (!(dayStart < dayEnd)) {
      setTimeSlots([])
      return
    }

    const slots = []
    const slotIntervalMs = slot_interval * 60000
    const durationMs = duration * 60000

    // Generate slots at every slot_interval minutes between dayStart and (dayEnd - duration)
    for (let t = dayStart.getTime(); t + durationMs <= dayEnd.getTime(); t += slotIntervalMs) {
      const slotStart = new Date(t)
      const slotEnd = new Date(t + durationMs)

      // check overlap with booked ranges
      const overlaps = bookedRangesLocal.some(br => {
        return slotStart < br.end && slotEnd > br.start
      })

      slots.push({
        time: slotStart.toTimeString().slice(0,5), // "HH:MM"
        displayTime: formatTimeDisplay(slotStart.toTimeString().slice(0,5)),
        available: !overlaps
      })
    }

    setTimeSlots(slots)
  }

  const formatTimeDisplay = (timeStringOrDate) => {
    let hours, minutes
    if (typeof timeStringOrDate === 'string') {
      const [h, m] = timeStringOrDate.split(':').map(Number)
      hours = h; minutes = m
    } else if (timeStringOrDate instanceof Date) {
      hours = timeStringOrDate.getHours()
      minutes = timeStringOrDate.getMinutes()
    } else {
      const [h, m] = (''+timeStringOrDate).split(':').map(Number)
      hours = h; minutes = m
    }
    const period = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedDate || !selectedTime) {
      setError('Please select both date and time')
      return
    }

    // Validate selected date/time is in the future
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
      const response = await api.post('/appointments', payload)
      onBookingSuccess && onBookingSuccess()
      onClose && onClose()
    } catch (err) {
      console.error('Booking error:', err)
      const serverMsg = err.response?.data?.error || 'Failed to book appointment. Try another time.'
      setError(serverMsg)
      // If conflict, refresh availability
      if (/conflict|not available|Time slot/i.test(serverMsg)) {
        await fetchAvailabilityForDate(selectedDate)
        setSelectedTime('')
      }
    } finally {
      setBooking(false)
    }
  }

  const getMinDate = () => {
    const today = new Date()
    today.setDate(today.getDate() + 1) // book from tomorrow by default
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

  // Derived values
  const availableTimeSlots = timeSlots.filter(s => s.available)
  const hasAvailableSlots = availableTimeSlots.length > 0
  const isServiceClosed = Number(serviceMeta.is_closed || 0) === 1

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
            <span className="detail-value">{serviceMeta.opening_time || '08:00'} - {serviceMeta.closing_time || '18:00'}</span>
          </div>
          {isServiceClosed && (
            <div className="service-detail">
              <span className="detail-label">Status:</span>
              <span className="detail-value" style={{ color: '#b91c1c', fontWeight: 700 }}>Closed by provider</span>
            </div>
          )}
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
                disabled={booking || isServiceClosed}
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
                disabled={booking || !selectedDate || loading || isServiceClosed || !hasAvailableSlots}
                className="time-select"
              >
                <option value="">{loading ? 'Loading available times...' : (isServiceClosed ? 'Service closed' : 'Choose a time')}</option>
                {!loading && hasAvailableSlots && (
                  availableTimeSlots.map(slot => (
                    <option key={slot.time} value={slot.time}>
                      {slot.displayTime}
                    </option>
                  ))
                )}
                {!loading && selectedDate && !hasAvailableSlots && (
                  <option disabled>No available times</option>
                )}
              </select>
              <small className="field-hint">
                {selectedDate && !loading && (
                  hasAvailableSlots 
                    ? `${availableTimeSlots.length} time slots available`
                    : 'No available time slots'
                )}
              </small>
            </div>
          </div>

          {selectedDate && selectedTime && (
            <div className="appointment-preview">
              <h4>Appointment Details</h4>
              <div className="preview-details">
                <div className="preview-item">
                  <span className="preview-label">Date:</span>
                  <span className="preview-value">{new Date(selectedDate).toLocaleDateString('en-KE', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
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
            </div>
          )}

          <div className="form-group">
            <label htmlFor="appointment-notes">Additional Notes (Optional)</label>
            <textarea
              id="appointment-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special requirements or notes for the provider..."
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
              disabled={booking || !selectedDate || !selectedTime || isServiceClosed}
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
