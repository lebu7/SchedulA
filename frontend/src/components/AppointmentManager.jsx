import React, { useState, useEffect } from "react";
import { appointmentsAPI, servicesAPI } from "../services/api";
import ProviderProfile from "./ProviderProfile";
import "./AppointmentManager.css";

function AppointmentManager({ user }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Reschedule dialog
  const [showReschedule, setShowReschedule] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [newDate, setNewDate] = useState("");

  // Provider profile view when clicking provider from booking
  const [viewingProvider, setViewingProvider] = useState(null);

  useEffect(() => {
    loadAppointments();
  }, []);

  const loadAppointments = async () => {
    try {
      setLoading(true);
      const res = await appointmentsAPI.list();
      setAppointments(res.data || []);
    } catch (err) {
      console.error("Failed to fetch appointments:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this appointment?")) return;
    try {
      await appointmentsAPI.remove(id);
      await loadAppointments();
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete appointment");
    }
  };

  const openReschedule = (appt) => {
    setSelectedAppt(appt);
    setNewDate("");
    setShowReschedule(true);
  };

  const confirmReschedule = async () => {
    if (!newDate) {
      alert("Pick a new date");
      return;
    }
    try {
      await appointmentsAPI.update(selectedAppt.id, { appointment_date: newDate });
      setShowReschedule(false);
      setSelectedAppt(null);
      await loadAppointments();
    } catch (err) {
      console.error("Reschedule failed:", err);
      alert("Failed to reschedule");
    }
  };

  const handleRebook = async (appt) => {
    try {
      await appointmentsAPI.create({
        service_id: appt.service_id,
        appointment_date: new Date().toISOString(),
        client_notes: appt.notes || "",
      });
      alert("Rebooked");
      await loadAppointments();
    } catch (err) {
      console.error("Rebook failed:", err);
      alert("Failed to rebook");
    }
  };

  const changeStatus = async (appt, status) => {
    try {
      await appointmentsAPI.update(appt.id, { status });
      await loadAppointments();
    } catch (err) {
      console.error("Status update failed:", err);
      alert("Failed to update status");
    }
  };

  if (loading) return <p>Loading...</p>;

  // client view: two groups
  if (user.user_type === "client") {
    const pending = appointments.filter((a) => a.status === "scheduled");
    const completed = appointments.filter((a) => a.status !== "scheduled");

    return (
      <div className="appointment-manager">
        <h2>📋 My Bookings</h2>

        <section>
          <h3>⏳ Pending</h3>
          {pending.length === 0 ? <p>No pending bookings.</p> : (
            <div className="appointments-grid">
              {pending.map((appt) => (
                <div key={appt.id} className={`appointment-card ${appt.status || "scheduled"}`}>
                  <div>
                    <h4>{appt.service_name}</h4>
                    <p>Provider: <button className="link-btn" onClick={() => setViewingProvider(appt.provider_id)}>{appt.provider_name}</button></p>
                    <p>{new Date(appt.appointment_date).toLocaleString()}</p>
                    {appt.notes && <p>Notes: {appt.notes}</p>}
                  </div>
                  <div className="card-actions">
                    <button onClick={() => openReschedule(appt)}>✏️ Reschedule</button>
                    <button className="danger-btn" onClick={() => handleDelete(appt.id)}>❌ Cancel</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3>✅ Completed / Past</h3>
          {completed.length === 0 ? <p>No past bookings.</p> : (
            <div className="appointments-grid">
              {completed.map((appt) => (
                <div key={appt.id} className={`appointment-card ${appt.status || "completed"}`}>
                  <div>
                    <h4>{appt.service_name}</h4>
                    <p>Provider: <button className="link-btn" onClick={() => setViewingProvider(appt.provider_id)}>{appt.provider_name}</button></p>
                    <p>{new Date(appt.appointment_date).toLocaleString()}</p>
                    {appt.notes && <p>Notes: {appt.notes}</p>}
                  </div>
                  <div className="card-actions">
                    <button onClick={() => handleRebook(appt)}>🔄 Rebook</button>
                    <button className="danger-btn" onClick={() => handleDelete(appt.id)}>🗑 Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Reschedule dialog */}
        {showReschedule && selectedAppt && (
          <div className="dialog-backdrop">
            <div className="dialog">
              <h3>Reschedule {selectedAppt.service_name}</h3>
              <input type="datetime-local" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              <div className="dialog-actions">
                <button onClick={confirmReschedule}>Confirm</button>
                <button className="cancel-btn" onClick={() => setShowReschedule(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Provider profile */}
        {viewingProvider && <ProviderProfile providerId={viewingProvider} onBack={() => setViewingProvider(null)} onBook={() => {}} user={user} />}
      </div>
    );
  }

  // provider view
  return (
    <div className="appointment-manager">
      <h2>📅 My Appointments</h2>
      {appointments.length === 0 ? <p>No appointments yet.</p> : (
        <div className="appointments-grid">
          {appointments.map((appt) => (
            <div key={appt.id} className={`appointment-card ${appt.status || ""}`}>
              <div>
                <h4>{appt.service_name}</h4>
                <p>Client: {appt.client_name}</p>
                <p>{new Date(appt.appointment_date).toLocaleString()}</p>
                {appt.notes && <p>Notes: {appt.notes}</p>}
              </div>
              <div className="card-actions">
                <select value={appt.status} onChange={(e) => changeStatus(appt, e.target.value)}>
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="no-show">No-show</option>
                </select>
                <button className="danger-btn" onClick={() => handleDelete(appt.id)}>🗑 Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AppointmentManager;
