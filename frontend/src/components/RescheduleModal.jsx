import React, { useState, useEffect } from "react";
import api from "../services/auth";
import "./BookingModal.css"; // Reuse existing styles

function RescheduleModal({ appointment, onClose, onSuccess }) {
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false); // 🔒 Lock state for double-submit prevention

  // ✅ (19) Stop background scroll when modal is open
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;

    // Prevent layout shift when scrollbar disappears
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0)
      document.body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchAvailability();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const fetchAvailability = async () => {
    setLoading(true);
    setSlots([]);
    setSelectedTime("");
    setError("");

    try {
      const res = await api.get(
        `/appointments/providers/${appointment.provider_id}/availability`,
        {
          params: { date: selectedDate },
        }
      );

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
    if (!openTime || !closeTime) {
      setSlots([]);
      return;
    }

    const [openH, openM] = openTime.split(":").map(Number);
    const [closeH, closeM] = closeTime.split(":").map(Number);

    // ✅ Base time generation on the selected date (prevents wrong-day times)
    const current = new Date(selectedDate);
    current.setHours(openH, openM, 0, 0);

    const end = new Date(selectedDate);
    end.setHours(closeH, closeM, 0, 0);

    const now = new Date();

    while (current < end) {
      const timeString = current.toTimeString().slice(0, 5);

      const slotEndTime = new Date(
        current.getTime() + (duration || 30) * 60000
      );
      const timeStringEnd = slotEndTime.toTimeString().slice(0, 5);

      // Respect booked ranges (keeps existing behavior but actually uses the data)
      const overlapCount = (bookedRanges || []).filter((booking) => {
        return (
          (timeString >= booking.start && timeString < booking.end) ||
          (timeStringEnd > booking.start && timeStringEnd <= booking.end) ||
          (timeString <= booking.start && timeStringEnd >= booking.end)
        );
      }).length;

      const isToday =
        new Date(selectedDate).toDateString() === now.toDateString();
      const isPast = isToday && current.getTime() < now.getTime();

      generated.push({
        time: timeString,
        available: overlapCount === 0 && !isPast,
        status: overlapCount > 0 ? "booked" : isPast ? "past" : "open",
      });

      current.setMinutes(current.getMinutes() + 30);
    }

    setSlots(generated);
  };

  const safeClose = () => {
    try {
      onClose?.();
    } catch (e) {
      // ignore
    }
  };

  const safeSuccess = async () => {
    try {
      await onSuccess?.();
    } catch (e) {
      // ✅ Even if refresh fails, we already closed the modal.
      console.warn("onSuccess failed:", e);
    }
  };

  const handleConfirm = async () => {
    if (!selectedDate || !selectedTime) return;

    setSaving(true);

    const newDateTime = new Date(
      `${selectedDate}T${selectedTime}:00`
    ).toISOString();

    try {
      await api.put(`/appointments/${appointment.id}`, {
        appointment_date: newDateTime,
      });

      alert("Appointment rescheduled successfully!");

      // ✅ Close FIRST (so UI always closes), then refresh in the background
      safeClose();
      await safeSuccess();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to reschedule.");
      setSaving(false);
    }
  };

  // ✅ Reject handler (closes modal ONLY if the reject update succeeded)
  const handleRejectReschedule = async () => {
    if (saving) return;

    // Try common field names (use whichever you set from backend)
    const oldDateISO =
      appointment?.old_appointment_date ||
      appointment?.original_appointment_date ||
      appointment?.previous_appointment_date ||
      appointment?.old_appointment_date_iso ||
      null;

    const oldStatus =
      appointment?.old_status || appointment?.previous_status || null;

    if (!oldDateISO) {
      alert(
        "Cannot reject reschedule: missing original appointment time from the server."
      );
      return;
    }

    const confirmReject = window.confirm(
      "Reject this reschedule request and revert to the original appointment time?"
    );
    if (!confirmReject) return;

    setSaving(true);

    try {
      await api.put(`/appointments/${appointment.id}`, {
        appointment_date: oldDateISO,
        ...(oldStatus ? { status: oldStatus } : {}),
        notes: appointment?.notes || null,
      });

      alert("Reschedule rejected. Appointment reverted to the original time.");

      // ✅ Close FIRST (so it always closes if API succeeded)
      safeClose();
      await safeSuccess();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to reject reschedule.");
      setSaving(false);
    }
  };

  const getMinDate = () => {
    const today = new Date();
    today.setDate(today.getDate() + 1);
    return today.toISOString().split("T")[0];
  };

  // ✅ Only show Reject button when backend provided an "old/original" date to revert to
  const canRejectReschedule = !!(
    appointment?.old_appointment_date ||
    appointment?.original_appointment_date ||
    appointment?.previous_appointment_date ||
    appointment?.old_appointment_date_iso
  );

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!saving) onClose?.();
      }}
    >
      <div
        className="modal-content booking-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div
          className="modal-header booking-modal-header"
          style={{
            // ✅ (18) Colored header for Reschedule
            background: "linear-gradient(180deg, #fff7ed 0%, #ffffff 85%)",
            borderBottom: "1px solid #fed7aa",
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>Reschedule Appointment</h3>
            <span className="subtitle">Select a new date and time</span>
          </div>

          {/* ✅ (17) Close button stays in top-right of this modal (and disabled while saving) */}
          <button
            className="close-btn"
            onClick={() => {
              if (!saving) onClose?.();
            }}
            disabled={saving}
            aria-label="Close reschedule modal"
            title={saving ? "Please wait..." : "Close"}
          >
            ×
          </button>
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
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedTime("");
                }}
                min={getMinDate()}
                disabled={saving}
              />
            </div>

            <div className="form-group">
              <label>Select New Time</label>

              {loading ? (
                <p className="hint">Loading availability...</p>
              ) : !selectedDate ? (
                <p className="hint">Please select a date first.</p>
              ) : slots.length === 0 ? (
                <p className="hint error">{error || "No slots available."}</p>
              ) : (
                <div className="time-grid">
                  {slots.map((slot) => (
                    <button
                      key={slot.time}
                      type="button"
                      className={`time-slot ${
                        selectedTime === slot.time ? "selected" : ""
                      }`}
                      disabled={!slot.available || saving}
                      onClick={() => setSelectedTime(slot.time)}
                      title={
                        slot.status === "booked"
                          ? "Slot is already booked"
                          : slot.status === "past"
                          ? "Time has already passed"
                          : ""
                      }
                    >
                      {slot.status === "booked"
                        ? "Booked"
                        : slot.status === "past"
                        ? "Past"
                        : slot.time}
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
          <button
            type="button"
            className="btn btn-text"
            onClick={() => {
              if (!saving) onClose?.();
            }}
            disabled={saving}
          >
            Cancel
          </button>

          {canRejectReschedule && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleRejectReschedule();
              }}
              disabled={saving}
              style={{ marginLeft: "8px" }}
              title="Reject and revert to the original appointment time"
            >
              {saving ? "Updating..." : "Reject Reschedule"}
            </button>
          )}

          <div className="pay-btn-wrapper">
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleConfirm();
              }}
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
