// src/components/AppointmentManager.jsx
import React, { useEffect, useState } from "react";
import { appointmentsAPI } from "@/services/api";
import "@/components/AppointmentManager.css";

const statusColors = {
  scheduled: "#0ea5a4",
  completed: "#22c55e",
  cancelled: "#ef4444",
  "no-show": "#f59e0b",
};

export default function AppointmentManager({ user }) {
  const isProvider = user?.user_type === "provider";
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Reschedule/edit state
  const [editingId, setEditingId] = useState(null);
  const [editedDate, setEditedDate] = useState("");
  const [editedStatus, setEditedStatus] = useState("");
  const [editedNotes, setEditedNotes] = useState("");

  const loadAppointments = async () => {
    try {
      setLoading(true);
      const res = await appointmentsAPI.list();
      setAppointments(res.data || []);
    } catch (err) {
      console.error("Failed to fetch appointments", err);
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAppointments();
    // eslint-disable-next-line
  }, [user]);

  const onStartEdit = (appt) => {
    setEditingId(appt.id);
    setEditedDate(appt.appointment_date ? appt.appointment_date.slice(0, 16) : "");
    setEditedStatus(appt.status);
    setEditedNotes(appt.notes || "");
  };

  const onSaveEdit = async () => {
    try {
      const payload = {};
      if (editedDate) payload.appointment_date = editedDate;
      if (editedStatus) payload.status = editedStatus;
      if (editedNotes !== undefined) payload.notes = editedNotes;
      await appointmentsAPI.update(editingId, payload);
      setEditingId(null);
      await loadAppointments();
    } catch (err) {
      console.error("Save failed", err);
      alert("Failed to save changes.");
    }
  };

  const onCancelAppointment = async (id) => {
    if (!confirm("Cancel this appointment?")) return;
    try {
      await appointmentsAPI.update(id, { status: "cancelled" });
      await loadAppointments();
    } catch (err) {
      console.error("Cancel failed", err);
      alert("Failed to cancel.");
    }
  };

  const onDelete = async (id) => {
    if (!confirm("Remove this appointment from your view?")) return;
    try {
      await appointmentsAPI.remove(id); // backend handles client_deleted/provider_deleted
      await loadAppointments();
    } catch (err) {
      console.error("Delete failed", err);
      alert("Failed to delete/hide appointment.");
    }
  };

  const onRebook = async (service_id) => {
    const dt = prompt("Enter new date/time (YYYY-MM-DDTHH:MM)");
    if (!dt) return;
    try {
      await appointmentsAPI.create({ service_id, appointment_date: dt });
      alert("Rebooked!");
      await loadAppointments();
    } catch (err) {
      console.error("Rebook failed", err);
      alert("Failed to rebook");
    }
  };

  // split pending / completed for client
  const pending = appointments.filter((a) => a.status === "scheduled");
  const completed = appointments.filter((a) => a.status !== "scheduled");

  return (
    <div className="appointment-manager-page">
      <h2>{isProvider ? "📅 My Appointments" : "📋 My Bookings"}</h2>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="appointments-pane">
          {/* CLIENT VIEW */}
          {!isProvider && (
            <>
              <section className="appointments-section">
                <h3>Pending</h3>
                <div className="cards-container">
                  {pending.length === 0 ? (
                    <div className="empty-state">No pending bookings</div>
                  ) : (
                    pending.map((a) => (
                      <div key={a.id} className="appointment-card scheduled">
                        <div className="card-top">
                          <div className="card-title">{a.service_name}</div>
                          <div className="card-meta">
                            {a.duration_minutes} min • KES {a.price || "0"}
                          </div>
                        </div>
                        <div className="card-body">
                          <div>
                            <strong>Provider:</strong> {a.provider_name} (
                            {a.business_name || "Independent"})
                          </div>
                          <div>
                            <strong>When:</strong>{" "}
                            {new Date(a.appointment_date).toLocaleString()}
                          </div>
                          {a.notes && <div className="muted">Notes: {a.notes}</div>}
                        </div>
                        <div className="card-actions">
                          <button
                            onClick={() => onStartEdit(a)}
                            className="secondary-btn"
                          >
                            Reschedule
                          </button>
                          <button
                            onClick={() => onCancelAppointment(a.id)}
                            className="secondary-btn"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="appointments-section">
                <h3>Completed / Past</h3>
                <div className="cards-container">
                  {completed.length === 0 ? (
                    <div className="empty-state">No past bookings</div>
                  ) : (
                    completed.map((a) => (
                      <div key={a.id} className={`appointment-card ${a.status || "completed"}`}>
                        <div className="card-top">
                          <div className="card-title">{a.service_name}</div>
                          <div className="card-meta">
                            {a.duration_minutes} min • KES {a.price || "0"}
                          </div>
                        </div>
                        <div className="card-body">
                          <div>
                            <strong>Provider:</strong> {a.provider_name}
                          </div>
                          <div>
                            <strong>When:</strong>{" "}
                            {new Date(a.appointment_date).toLocaleString()}
                          </div>
                          <div>
                            <strong>Status:</strong>{" "}
                            <span
                              className="status-pill"
                              style={{
                                background:
                                  statusColors[a.status || "completed"] || "#ddd",
                              }}
                            >
                              {a.status}
                            </span>
                          </div>
                          {a.notes && <div className="muted">Notes: {a.notes}</div>}
                        </div>
                        <div className="card-actions">
                          <button
                            onClick={() => onRebook(a.service_id)}
                            className="primary-btn"
                          >
                            Rebook
                          </button>
                          <button
                            onClick={() => onDelete(a.id)}
                            className="secondary-btn"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </>
          )}

          {/* PROVIDER VIEW */}
          {isProvider && (
            <section className="appointments-section provider-appointments">
              <div className="cards-container">
                {appointments.length === 0 ? (
                  <div className="empty-state">No appointments yet</div>
                ) : (
                  appointments.map((a) => (
                    <div key={a.id} className="appointment-card provider-card">
                      <div className="card-top">
                        <div className="card-title">{a.service_name}</div>
                        <div className="card-meta">
                          {a.duration_minutes} min • KES {a.price || "0"}
                        </div>
                      </div>
                      <div className="card-body">
                        <div>
                          <strong>Client:</strong> {a.client_name}{" "}
                          {a.client_phone ? `(${a.client_phone})` : ""}
                        </div>
                        <div>
                          <strong>When:</strong>{" "}
                          {new Date(a.appointment_date).toLocaleString()}
                        </div>
                        <div>
                          <strong>Notes:</strong> {a.notes || "—"}
                        </div>
                      </div>

                      <div className="card-actions provider-actions">
                        {editingId === a.id ? (
                          <>
                            <select
                              value={editedStatus}
                              onChange={(e) => setEditedStatus(e.target.value)}
                            >
                              <option value="scheduled">scheduled</option>
                              <option value="completed">completed</option>
                              <option value="cancelled">cancelled</option>
                              <option value="no-show">no-show</option>
                            </select>
                            <input
                              type="datetime-local"
                              value={editedDate}
                              onChange={(e) => setEditedDate(e.target.value)}
                            />
                            <button className="primary-btn" onClick={onSaveEdit}>
                              Save
                            </button>
                            <button
                              className="secondary-btn"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <span
                              className="status-pill"
                              style={{
                                background:
                                  statusColors[a.status || "scheduled"] || "#ddd",
                              }}
                            >
                              {a.status}
                            </span>
                            <button
                              className="secondary-btn"
                              onClick={() => onStartEdit(a)}
                            >
                              Edit
                            </button>
                            <button
                              className="secondary-btn"
                              onClick={() => onDelete(a.id)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
