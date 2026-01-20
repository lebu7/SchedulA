import React, { useState, useEffect } from "react";
import api from "../services/auth";
import "./BookingModal.css"; // Reuse existing styles

function RescheduleModal({ appointment, onClose, onSuccess }) {
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedDate) {
      fetchAvailability();
    }
  }, [selectedDate]);

  const fetchAvailability = async () => {
    setLoading(true);
    setSlots([]);
    setSelectedTime("");
    setError("");

    try {
      const res = await api.get(`/appointments/providers/${appointment.provider_id}/availability`, {
        params: { date: selectedDate }
      });

      if (res.data.is_closed) {
        setError(`Provider is closed on this day.`);
      } else {
        generateTimeSlots(
          res.data.opening_time, 
          res.data.closing_time, 
          res.data.booked_slots || [],
          appointment.duration
        );
      }
    } catch (err) {
      setError("Could not load availability.");
    }
    setLoading(false);
  };

  const generateTimeSlots = (openTime, closeTime, bookedRanges, duration) => {
    const generated = [];
    const [openH, openM] = openTime.split(':').map(Number);
    const [closeH, closeM] = closeTime.split(':').map(Number);
    
    let current = new Date();
    current.setHours(openH, openM, 0, 0);
    
    const end = new Date();
    end.setHours(closeH, closeM, 0, 0);

    const now = new Date(); 

    while (current < end) {
      const timeString = current.toTimeString().slice(0, 5);
      
      const slotEndTime = new Date(current.getTime() + (duration || 30) * 60000);
      const timeStringEnd = slotEndTime.toTimeString().slice(0, 5);

      const overlapCount = bookedRanges.filter(booking => {
        return (timeString >= booking.start && timeString < booking.end) || 
               (timeStringEnd > booking.start && timeStringEnd <= booking.end) || 
               (timeString <= booking.start && timeStringEnd >= booking.end); 
      }).length;
      
      const isPast = new Date(selectedDate).toDateString() === now.toDateString() && current < now;

      generated.push({
        time: timeString,
        available: !isPast 
      });

      current.setMinutes(current.getMinutes() + 30);
    }
    setSlots(generated);
  };

  const handleConfirm = async () => {
    if (!selectedDate || !selectedTime) return;
    setSaving(true);
    
    const newDateTime = new Date(`${selectedDate}T${selectedTime}:00`).toISOString();

    try {
      await api.put(`/appointments/${appointment.id}`, {
        appointment_date: newDateTime
      });
      alert("Appointment rescheduled successfully!");
      onSuccess();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to reschedule.");
    } finally {
      setSaving(false);
    }
  };

  const getMinDate = () => {
    const today = new Date();
    today.setDate(today.getDate() + 1); 
    return today.toISOString().split("T")[0];
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content booking-modal" onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className="modal-header">
          <div>
            <h3>Reschedule Appointment</h3>
            <span className="subtitle">Select a new date and time</span>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {/* BODY */}
        <div className="modal-body">
          <div className="service-quick-info">
            <div className="info-pill">
              <i className="fa fa-calendar"></i> 
              Current: {new Date(appointment.appointment_date).toLocaleString()}
            </div>
            <div className="info-pill">
              <i className="fa fa-clock-o"></i> 
              {appointment.duration} mins
            </div>
          </div>

          <div className="booking-form">
            <div className="form-group">
              <label>Select New Date</label>
              <input 
                type="date" 
                className="styled-input" 
                value={selectedDate} 
                onChange={(e) => { setSelectedDate(e.target.value); setSelectedTime(""); }} 
                min={getMinDate()} 
              />
            </div>

            <div className="form-group">
              <label>Select New Time</label>
              {loading ? (
                <p className="hint">Loading availability...</p>
              ) : !selectedDate ? (
                <p className="hint">Please select a date first.</p>
              ) : (
                <div className="time-grid">
                  {slots.map((slot) => (
                    <button 
                      key={slot.time} 
                      type="button" 
                      className={`time-slot ${selectedTime === slot.time ? 'selected' : ''}`} 
                      disabled={!slot.available} 
                      onClick={() => setSelectedTime(slot.time)}
                    >
                      {slot.time}
                    </button>
                  ))}
                </div>
              )}
              {error && <p className="hint error">{error}</p>}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="modal-footer">
          <button className="btn btn-text" onClick={onClose} disabled={saving}>Cancel</button>
          <div className="pay-btn-wrapper">
            <button 
              className="btn btn-primary btn-block" 
              onClick={handleConfirm} 
              disabled={!selectedTime || saving}
            >
              {saving ? "Updating..." : "Confirm New Time"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RescheduleModal;