import React, { useState, useEffect } from "react";
import api from "../services/auth";
import "./BookingModal.css"; // Reuse styling

function RescheduleModal({ appointment, onClose, onSuccess }) {
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Initialize with current appointment date? Optional.
  // Better to force them to pick.

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
          appointment.duration // Assuming duration is passed in appointment prop or we fetch it?
          // appointment object from list usually has duration
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
    // Assuming appointment object has service capacity, otherwise default 1.
    // Ideally we fetch service details, but let's assume passed prop or default 1 for now if unavailable.
    // Wait, the availability endpoint returns booked_slots. Capacity check is tricky on frontend without service capacity.
    // Let's assume capacity 1 for visualization or just show all and let backend reject if full.
    // Better: Backend check is definitive.

    while (current < end) {
      const timeString = current.toTimeString().slice(0, 5);
      
      const slotEndTime = new Date(current.getTime() + (duration || 30) * 60000);
      const timeStringEnd = slotEndTime.toTimeString().slice(0, 5);

      const overlapCount = bookedRanges.filter(booking => {
        return (timeString >= booking.start && timeString < booking.end) || 
               (timeStringEnd > booking.start && timeStringEnd <= booking.end) || 
               (timeString <= booking.start && timeStringEnd >= booking.end); 
      }).length;

      // We don't have capacity here easily without fetching service. 
      // We will show slots as available unless explicitly blocked by closed day.
      // Real check happens on submit.
      
      const isPast = new Date(selectedDate).toDateString() === now.toDateString() && current < now;

      generated.push({
        time: timeString,
        available: !isPast // && overlapCount < capacity (if we had it)
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
    today.setDate(today.getDate() + 1); // Earliest tomorrow? Or today? Let's say tomorrow to be safe or today if logic supports.
    return today.toISOString().split("T")[0];
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content booking-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Reschedule Appointment</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p><strong>Service:</strong> {appointment.service_name}</p>
          <p><strong>Current:</strong> {new Date(appointment.appointment_date).toLocaleString()}</p>
          <hr />

          <div className="form-group">
            <label>Select New Date</label>
            <input type="date" className="styled-input" value={selectedDate} onChange={(e) => { setSelectedDate(e.target.value); setSelectedTime(""); }} min={getMinDate()} />
          </div>

          <div className="form-group">
            <label>Select New Time</label>
            {loading ? <p>Loading slots...</p> : (
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
            {error && <p className="error-text">{error}</p>}
          </div>

          <button 
            className="btn btn-primary btn-block" 
            onClick={handleConfirm} 
            disabled={!selectedTime || saving}
          >
            {saving ? "Rescheduling..." : "Confirm New Time"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RescheduleModal;