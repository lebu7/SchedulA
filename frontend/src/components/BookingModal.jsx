import React, { useState, useEffect } from "react";
import api from "../services/auth";
import "./BookingModal.css";

function BookingModal({ service, user, onClose, onBookingSuccess }) {
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [notes, setNotes] = useState("");
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState("");
  const [serviceMeta, setServiceMeta] = useState(service || {});
  const [availability, setAvailability] = useState(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // ✅ used for auto-refresh

  // ✅ Keep service info updated
  useEffect(() => {
    if (service) setServiceMeta(service);
  }, [service]);

  // ✅ Add default rebook note
  useEffect(() => {
    if (service && service.rebook) {
      setNotes(`Rebooking for ${service.name}`);
    }
  }, [service]);

  // ✅ Fetch provider availability when date changes or refreshKey updates
  useEffect(() => {
    const fetchAvailability = async () => {
      if (!serviceMeta?.provider_id || !selectedDate) return;
      setLoadingAvailability(true);
      try {
        const res = await api.get(
          `/appointments/providers/${serviceMeta.provider_id}/availability?date=${selectedDate}`
        );
        setAvailability(res.data);
      } catch (err) {
        console.error("Error fetching provider availability:", err);
        setAvailability(null);
      } finally {
        setLoadingAvailability(false);
      }
    };
    fetchAvailability();
  }, [selectedDate, serviceMeta, refreshKey]);

  const formatTimeDisplay = (timeStr) => {
    const [h, m] = timeStr.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const displayHours = h % 12 || 12;
    return `${displayHours}:${m.toString().padStart(2, "0")} ${period}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDate || !selectedTime) {
      setError("Please select both date and time");
      return;
    }

    if (availability?.is_closed) {
      setError(
        availability.closed_reason
          ? `Provider is closed on this date: ${availability.closed_reason}`
          : "Provider is closed on this date."
      );
      return;
    }

    const appointmentDateTime = new Date(`${selectedDate}T${selectedTime}:00`);
    const now = new Date();
    if (appointmentDateTime <= now) {
      setError("Please select a future date and time");
      return;
    }

    setBooking(true);
    setError("");

    try {
      const payload = {
        service_id: serviceMeta.id,
        appointment_date: appointmentDateTime.toISOString(),
        notes: notes.trim(),
      };

      if (serviceMeta.rebook && serviceMeta.old_appointment_id) {
        payload.rebook_from = serviceMeta.old_appointment_id;
      }

      await api.post("/appointments", payload);
      if (onBookingSuccess) onBookingSuccess();
      if (onClose) onClose();

      // ✅ Auto-refresh availability after successful booking
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      console.error("Booking error:", err);
      const msg = err.response?.data?.error || "Failed to book appointment.";
      setError(msg);
    } finally {
      setBooking(false);
    }
  };

  const getMinDate = () => {
    const today = new Date();
    today.setDate(today.getDate() + 1);
    return today.toISOString().split("T")[0];
  };

  const getMaxDate = () => {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    return maxDate.toISOString().split("T")[0];
  };

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
    setSelectedTime("");
    setError("");
    setAvailability(null);
  };

  const handleTimeChange = (e) => {
    setSelectedTime(e.target.value);
    setError("");
  };

  const generateTimeSlots = () => {
    const open =
      availability?.opening_time || serviceMeta.opening_time || "08:00";
    const close =
      availability?.closing_time || serviceMeta.closing_time || "18:00";
    const [openH, openM] = open.split(":").map(Number);
    const [closeH, closeM] = close.split(":").map(Number);
    const slots = [];
    let h = openH;
    let m = openM;
    while (h < closeH || (h === closeH && m <= closeM)) {
      const value = `${h.toString().padStart(2, "0")}:${m
        .toString()
        .padStart(2, "0")}`;
      slots.push(value);
      m += 30;
      if (m >= 60) {
        m = 0;
        h++;
      }
    }
    return slots;
  };

  const isClosed = availability?.is_closed;
  const closedReason = availability?.closed_reason;
  const isGloballyClosed = serviceMeta?.is_closed && !availability;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {serviceMeta.rebook ? "Rebook" : "Book"} {serviceMeta.name}
          </h3>
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
        </div>

        <form onSubmit={handleSubmit} className="booking-form">
          {error && <div className="error-message">⚠️ {error}</div>}
          {isGloballyClosed && (
            <div className="error-message">
              🚫 This provider has closed their business temporarily.
            </div>
          )}

          <div className="form-row">
            {/* DATE PICKER */}
            <div className="form-group">
              <label>Select Date *</label>
              <input
                type="date"
                value={selectedDate}
                onChange={handleDateChange}
                min={getMinDate()}
                max={getMaxDate()}
                disabled={booking || isGloballyClosed}
              />
              {loadingAvailability && <small>Checking availability...</small>}
              {selectedDate && isClosed && (
                <small className="warning-text">
                  🚫 Provider closed
                  {closedReason ? `: ${closedReason}` : ""}.
                </small>
              )}
            </div>

            {/* TIME PICKER */}
            <div className="form-group">
              <label>Select Time *</label>
              <select
                value={selectedTime}
                onChange={handleTimeChange}
                disabled={
                  booking ||
                  !selectedDate ||
                  loadingAvailability ||
                  isClosed ||
                  isGloballyClosed
                }
              >
                <option value="">
                  {!selectedDate
                    ? "Select a date first"
                    : isClosed || isGloballyClosed
                    ? "Provider closed"
                    : "Choose a time"}
                </option>
                {!isClosed &&
                  !isGloballyClosed &&
                  selectedDate &&
                  generateTimeSlots().map((time) => (
                    <option key={time} value={time}>
                      {formatTimeDisplay(time)}
                    </option>
                  ))}
              </select>

              {availability &&
                !isClosed &&
                selectedDate &&
                availability.opening_time && (
                  <small>
                    Business hours: {availability.opening_time} -{" "}
                    {availability.closing_time}
                  </small>
                )}
            </div>
          </div>

          {selectedDate && selectedTime && !isClosed && !isGloballyClosed && (
            <div className="appointment-preview">
              <h4>Appointment Summary</h4>
              <div className="preview-details">
                <div className="preview-item">
                  <span className="preview-label">Date:</span>
                  <span className="preview-value">
                    {new Date(selectedDate).toLocaleDateString("en-KE", {
                      weekday: "short",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <div className="preview-item">
                  <span className="preview-label">Time:</span>
                  <span className="preview-value">
                    {formatTimeDisplay(selectedTime)}
                  </span>
                </div>
                <div className="preview-item total">
                  <span className="preview-label">Total:</span>
                  <span className="preview-value">
                    KES {serviceMeta.price}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="form-group full-width">
            <label>Additional Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows="2"
              disabled={booking || isGloballyClosed}
              maxLength="200"
              placeholder="Any special requirements..."
            />
            <small className="field-hint">{notes.length}/200 characters</small>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                booking ||
                !selectedDate ||
                !selectedTime ||
                isClosed ||
                isGloballyClosed ||
                loadingAvailability
              }
            >
              {booking ? (
                <>
                  <span className="spinner"></span> Sending request...
                </>
              ) : (
                serviceMeta.rebook ? "Confirm Rebook" : "Send Request"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default BookingModal;
