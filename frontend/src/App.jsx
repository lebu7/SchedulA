// frontend/src/components/AppointmentManager.jsx
import React, { useState, useEffect } from "react";
import { appointmentsAPI, servicesAPI } from "../services/api";
import "./AppointmentManager.css";

function AppointmentManager({ user }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showDialog, setShowDialog] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [newDate, setNewDate] = useState("");

  useEffect(() => {
    loadAppointments();
  }, []);

  const loadAppointments = async () => {
    try {
      setLoading(true);
      const data = await appointmentsAPI.list();
      setAppointments(data.data || []);
    } catch (err) {
      console.error("Failed to load appointments:", err);
    } finally {
      setLoading(false);
    }
  };

  // --------- Actions ----------
  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this appointment?"))
      return;
    try {
      await appointmentsAPI.remove(id);
      loadAppointments();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handleReschedule = (appt) => {
    setSelectedAppt(appt);
    setNewDate("");
    setShowDialog(true);
  };

  const confirmReschedule = async () => {
    if (!newDate) {
      alert("Pick a new date and time");
      return;
    }
    try {
      await appointmentsAPI.update(selectedAppt.id, {
        appointment_date: newDate,
      });
      setShowDialog(false);
      setSelectedAppt(null);
      loadAppointments();
    } catch (err) {
      console.error("Reschedule failed:", err);
    }
  };

  const handleRebook = async (appt) => {
    try {
      await appointmentsAPI.create({
        service_id: appt.service_id,
        appointment_date: new Date().toISOString(),
        notes: appt.notes || "",
      });
      loadAppointments();
    } catch (err) {
      console.error("Rebook failed:", err);
    }
  };

  const handleStatusChange = async (appt, status) => {
    try {
      await appointmentsAPI.update(appt.id, { status });
      loadAppointments();
    } catch (err) {
      console.error("Status update failed:", err);
    }
  };

  // --------- Renders ----------
  if (loading) return <p>Loading appointments...</p>;

  if (user.user_type === "client") {
    const pending = appointments.filter((a) => a.status === "scheduled");
    const completed = appointments.filter((a) =>
      ["completed", "cancelled", "no-show"].includes(a.status)
    );

    return (
      <div className="appointment-manager">
        <h2>📅 My Bookings</h2>

        <section>
          <h3>⏳ Pending</h3>
          {pending.length === 0 ? (
            <p>No pending bookings.</p>
          ) : (
            <div className="appointments-grid">
              {pending.map((appt) => (
                <div key={appt.id} className="appointment-card">
                  <h4>{appt.service_name}</h4>
                  <p>
                    With {appt.provider_name} ({appt.business_name || "Independent"})
                  </p>
                  <p>{new Date(appt.appointment_date).toLocaleString()}</p>
                  {appt.notes && <p>Notes: {appt.notes}</p>}

                  <div className="card-actions">
                    <button onClick={() => handleReschedule(appt)}>
                      ✏️ Reschedule
                    </button>
                    <button
                      className="danger-btn"
                      onClick={() => handleDelete(appt.id)}
                    >
                      ❌ Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3>✅ Completed / Past</h3>
          {completed.length === 0 ? (
            <p>No past bookings.</p>
          ) : (
            <div className="appointments-grid">
              {completed.map((appt) => (
                <div key={appt.id} className="appointment-card past">
                  <h4>{appt.service_name}</h4>
                  <p>
                    With {appt.provider_name} ({appt.business_name || "Independent"})
                  </p>
                  <p>{new Date(appt.appointment_date).toLocaleString()}</p>
                  {appt.notes && <p>Notes: {appt.notes}</p>}

                  <div className="card-actions">
                    <button onClick={() => handleRebook(appt)}>🔄 Rebook</button>
                    <button
                      className="danger-btn"
                      onClick={() => handleDelete(appt.id)}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Reschedule Dialog */}
        {showDialog && selectedAppt && (
          <div className="dialog-backdrop">
            <div className="dialog">
              <h3>Reschedule {selectedAppt.service_name}</h3>
              <input
                type="datetime-local"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
              <div className="dialog-actions">
                <button onClick={confirmReschedule}>Confirm</button>
                <button onClick={() => setShowDialog(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------- Provider View --------
  return (
    <div className="appointment-manager">
      <h2>📅 My Appointments</h2>
      {appointments.length === 0 ? (
        <p>No appointments yet.</p>
      ) : (
        <div className="appointments-grid">
          {appointments.map((appt) => (
            <div key={appt.id} className="appointment-card">
              <h4>{appt.service_name}</h4>
              <p>Client: {appt.client_name}</p>
              <p>{new Date(appt.appointment_date).toLocaleString()}</p>
              {appt.notes && <p>Notes: {appt.notes}</p>}

              <div className="card-actions">
                <select
                  value={appt.status}
                  onChange={(e) => handleStatusChange(appt, e.target.value)}
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="no-show">No-Show</option>
                </select>
                <button
                  className="danger-btn"
                  onClick={() => handleDelete(appt.id)}
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AppointmentManager;
