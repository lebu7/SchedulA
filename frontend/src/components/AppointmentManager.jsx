import React, { useEffect, useState } from "react";
import { appointmentsAPI } from "@/services/api";
import "@/components/AppointmentManager.css";

const statusColors = {
  scheduled: "#0ea5a4",
  completed: "#22c55e",
  cancelled: "#ef4444",
  "no-show": "#f59e0b",
  "reschedule-requested": "#3b82f6",
};

export default function AppointmentManager({ user }) {
  const isProvider = user?.user_type === "provider";
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAppointments = async () => {
    try {
      setLoading(true);
      const res = await appointmentsAPI.list();
      setAppointments(res.data || []);
    } catch {
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAppointments(); }, [user]);

  const onConfirm = async (id) => {
    await appointmentsAPI.update(id, { status: "completed" });
    loadAppointments();
  };

  const onReject = async (id) => {
    await appointmentsAPI.update(id, { status: "cancelled" });
    loadAppointments();
  };

  const onRequestReschedule = async (id) => {
    const dt = prompt("Enter new proposed date/time (YYYY-MM-DDTHH:MM)");
    const reason = prompt("Enter reason for reschedule");
    if (!dt) return;
    await appointmentsAPI.custom(`/appointments/${id}/reschedule`, { new_date: dt, notes: reason });
    loadAppointments();
  };

  const onAcceptReschedule = async (id) => {
    await appointmentsAPI.custom(`/appointments/${id}/accept-reschedule`, {});
    loadAppointments();
  };

  const onDeclineReschedule = async (id) => {
    await appointmentsAPI.custom(`/appointments/${id}/decline-reschedule`, {});
    loadAppointments();
  };

  const onDelete = async (id) => {
    await appointmentsAPI.remove(id);
    loadAppointments();
  };

  return (
    <div className="appointment-manager-page">
      <h2>{isProvider ? "📅 My Appointments" : "📋 My Bookings"}</h2>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="appointments-pane">
          {appointments.map((a) => (
            <div key={a.id} className="appointment-card">
              <div className="card-top">
                <div className="card-title">{a.service_name}</div>
                <div className="card-meta">
                  {a.duration_minutes} min • KES {a.price || "0"}
                </div>
              </div>
              <div className="card-body">
                {isProvider ? (
                  <div><strong>Client:</strong> {a.client_name}</div>
                ) : (
                  <div><strong>Provider:</strong> {a.provider_name}</div>
                )}
                <div><strong>When:</strong> {new Date(a.appointment_date).toLocaleString()}</div>
                <div>
                  <strong>Status:</strong>
                  <span className="status-pill" style={{background: statusColors[a.status] || "#ddd"}}>
                    {a.status}
                  </span>
                </div>
                {a.notes && <div className="muted">Notes: {a.notes}</div>}
              </div>

              <div className="card-actions">
                {isProvider ? (
                  <>
                    <button className="primary-btn" onClick={() => onConfirm(a.id)}>Confirm</button>
                    <button className="secondary-btn" onClick={() => onReject(a.id)}>Reject</button>
                    <button className="secondary-btn" onClick={() => onRequestReschedule(a.id)}>Request Reschedule</button>
                    <button className="secondary-btn" onClick={() => onDelete(a.id)}>Delete</button>
                  </>
                ) : (
                  <>
                    {a.status === "reschedule-requested" && (
                      <>
                        <button className="primary-btn" onClick={() => onAcceptReschedule(a.id)}>Accept Reschedule</button>
                        <button className="secondary-btn" onClick={() => onDeclineReschedule(a.id)}>Decline</button>
                      </>
                    )}
                    <button className="secondary-btn" onClick={() => onDelete(a.id)}>Delete</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
