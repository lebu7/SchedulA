import React, { useState, useEffect } from "react";
import api from "../services/auth";
import BookingModal from "./BookingModal";
import "./AppointmentManager.css";

function AppointmentManager({ user }) {
  const [appointments, setAppointments] = useState({
    pending: [],
    scheduled: [],
    upcoming: [],
    past: [],
  });
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [activeTab, setActiveTab] = useState(
    user.user_type === "provider" ? "upcoming" : "pending"
  );
  const [showBooking, setShowBooking] = useState(false);
  const [rebookService, setRebookService] = useState(null);

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const response = await api.get("/appointments");
      console.log("✅ Loaded appointments:", response.data);
      setAppointments(response.data.appointments);
    } catch (error) {
      console.error("Error fetching appointments:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAppointment = async (id) => {
    if (window.confirm("Remove this appointment from your dashboard?")) {
      try {
        await api.delete(`/appointments/${id}`);
        await fetchAppointments();
        alert("Appointment deleted.");
      } catch {
        alert("Failed to delete appointment.");
      }
    }
  };

  const handleRebook = (apt) => {
    setRebookService({
      id: apt.service_id,
      name: apt.service_name,
      provider_name: apt.provider_name,
      duration: apt.duration,
      price: apt.price,
      opening_time: apt.opening_time || "08:00",
      closing_time: apt.closing_time || "18:00",
      rebook: true,
      old_appointment_id: apt.id,
    });
    setShowBooking(true);
  };

  const formatDate = (dateString) =>
    new Date(dateString).toLocaleString("en-KE", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const getStatusBadge = (status) => {
    const statusColors = {
      pending: "gray",
      scheduled: "blue",
      completed: "green",
      cancelled: "red",
      "no-show": "orange",
      rebooked: "purple",
    };
    return (
      <span className={`status-badge ${statusColors[status] || "gray"}`}>
        {status.replace("-", " ")}
      </span>
    );
  };

  const handleStatusUpdate = async (id, status) => {
    setUpdating(id);
    try {
      await api.put(`/appointments/${id}`, { status });
      await fetchAppointments();
    } finally {
      setUpdating(null);
    }
  };

  const handleCancelAppointment = async (id) => {
    if (window.confirm("Cancel this appointment?")) {
      setCancelling(id);
      try {
        await api.put(`/appointments/${id}`, { status: "cancelled" });
        await fetchAppointments();
      } finally {
        setCancelling(null);
      }
    }
  };

  const handleRebookSuccess = async () => {
    if (rebookService?.old_appointment_id) {
      try {
        await api.put(`/appointments/${rebookService.old_appointment_id}`, {
          status: "rebooked",
        });
      } catch (error) {
        console.error("Failed to mark old appointment as rebooked:", error);
      }
    }
    await fetchAppointments();
    setShowBooking(false);
  };

  // ✅ Render Add-ons visibly with styled badges
  const renderAddons = (apt) => {
    const selectedAddons =
      apt.addons ||
      apt.sub_services ||
      apt.selected_addons ||
      apt.addon_items ||
      [];

    if (!Array.isArray(selectedAddons) || selectedAddons.length === 0) {
      return <p className="no-addons-text">No add-ons selected.</p>;
    }

    return (
      <div className="addons-container">
        <h5 className="addons-heading">💅 Add-ons Selected</h5>
        <ul className="addon-list">
          {selectedAddons.map((addon) => (
            <li key={addon.id} className="addon-item">
              <span className="addon-name">{addon.name}</span>
              <span className="addon-price">
                + KES {addon.price ?? addon.additional_price}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const renderAppointmentsList = (list, type) => {
    if (!list || list.length === 0)
      return <div className="no-appointments">No {type} appointments.</div>;

    return (
      <div className="appointments-list">
        {list.map((apt) => (
          <div
            key={apt.id}
            className={`appointment-card ${
              apt.status === "pending" ? "highlight-pending" : ""
            }`}
          >
            <div className="appointment-info">
              <h4>{apt.service_name}</h4>

              {user.user_type === "client" ? (
                <p>
                  <strong>With:</strong> {apt.provider_name}
                </p>
              ) : (
                <p>
                  <strong>Client:</strong> {apt.client_name} ({apt.client_phone})
                </p>
              )}

              <p>
                <strong>When:</strong> {formatDate(apt.appointment_date)}
              </p>
              <p>
                <strong>Duration:</strong> {apt.duration} minutes
              </p>
              <p>
                <strong>Deposit:</strong> KES {apt.price}
              </p>

              {renderAddons(apt)}

              {/* ✅ Display visually styled total */}
              {(() => {
              const selectedAddons =
                apt.addons ||
                apt.sub_services ||
                apt.selected_addons ||
                apt.addon_items ||
                [];

              const addonsTotal = Array.isArray(selectedAddons)
                ? selectedAddons.reduce(
                    (sum, addon) => sum + Number(addon.price || addon.additional_price || 0),
                    0
                  )
                : 0;

              const total = Number(apt.price || 0) + addonsTotal;

              return (
                <div className="total-cost-box">
                  <span className="total-label">Total</span>
                  <span className="total-amount">
                    KES {total.toLocaleString()}
                  </span>
                </div>
              );
            })()}

              {getStatusBadge(apt.status)}
            </div>

            <div className="appointment-actions">
              {user.user_type === "client" ? (
                <>
                  {apt.status === "pending" && (
                    <button
                      className="btn btn-danger small-btn"
                      onClick={() => handleCancelAppointment(apt.id)}
                      disabled={cancelling === apt.id}
                    >
                      {cancelling === apt.id ? "Cancelling..." : "Cancel"}
                    </button>
                  )}

                  {["cancelled", "no-show"].includes(apt.status) && (
                    <div className="action-row">
                      <button
                        className="btn btn-primary small-btn"
                        onClick={() => handleRebook(apt)}
                      >
                        Rebook
                      </button>
                      <button
                        className="btn btn-danger small-btn"
                        onClick={() => handleDeleteAppointment(apt.id)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {apt.status === "pending" ? (
                    <div className="status-action-row">
                      <button
                        className="btn-status confirm"
                        onClick={() =>
                          handleStatusUpdate(apt.id, "scheduled")
                        }
                        disabled={updating === apt.id}
                      >
                        {updating === apt.id ? "Updating..." : "Confirm"}
                      </button>
                      <button
                        className="btn-status reject"
                        onClick={() =>
                          handleStatusUpdate(apt.id, "cancelled")
                        }
                        disabled={updating === apt.id}
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <div className="status-dropdown-container">
                      <select
                        value={apt.status}
                        onChange={(e) =>
                          handleStatusUpdate(apt.id, e.target.value)
                        }
                        disabled={updating === apt.id}
                        className="status-select"
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="no-show">No Show</option>
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading)
    return (
      <div className="appointment-manager">
        <div className="container">
          <div className="loading">Loading appointments...</div>
        </div>
      </div>
    );

  const tabs =
    user.user_type === "client"
      ? ["pending", "scheduled", "past"]
      : ["pending", "upcoming", "past"];

  return (
    <div className="appointment-manager">
      <div className="container">
        <h2>
          {user.user_type === "provider"
            ? "Manage Appointments"
            : "My Appointments"}
        </h2>

        <div className="tabs">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)} (
              {appointments[tab]?.length || 0})
            </button>
          ))}
        </div>

        <div className="tab-content">
          {renderAppointmentsList(appointments[activeTab], activeTab)}
        </div>

        {showBooking && (
          <BookingModal
            service={rebookService}
            user={user}
            onClose={() => setShowBooking(false)}
            onBookingSuccess={handleRebookSuccess}
          />
        )}
      </div>
    </div>
  );
}

export default AppointmentManager;
