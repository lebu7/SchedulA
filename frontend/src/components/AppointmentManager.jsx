import React, { useState, useEffect } from "react";
import api from "../services/auth";
import BookingModal from "./BookingModal";
import { Receipt } from "lucide-react"; // receipt icon
import "./AppointmentManager.css";

// ===== Helper: make sure addons are an ARRAY (handles JSON string stored in DB) =====
const parseAddons = (apt) => {
  let selectedAddons =
    apt?.addons || apt?.addon_items || apt?.sub_services || [];

  // If the DB returned a JSON string (common with SQLite TEXT column), parse it
  if (typeof selectedAddons === "string") {
    try {
      selectedAddons = JSON.parse(selectedAddons);
    } catch (e) {
      console.warn("Failed to parse addons JSON for appointment", apt.id, e);
      selectedAddons = [];
    }
  }

  // Ensure we return an array
  if (!Array.isArray(selectedAddons)) selectedAddons = [];
  return selectedAddons;
};

/* 💳 Printable Payment Info Modal */
function PaymentInfoModal({ payment, onClose }) {
  if (!payment) return null;

  const printReceipt = () => {
    const printContents = document.getElementById("receipt-content").innerHTML;
    const newWindow = window.open("", "_blank");
    newWindow.document.write(`
      <html>
        <head>
          <title>Payment Receipt - ${payment.service_name || "Service"}</title>
          <style>
            body { font-family: 'Segoe UI', sans-serif; margin: 40px; color: #222; }
            .receipt-box { border: 1px solid #ddd; padding: 30px; border-radius: 12px; max-width: 600px; margin: auto; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            .receipt-header { text-align: center; margin-bottom: 20px; }
            .receipt-header h2 { color: #444; margin: 0; }
            .divider { border-bottom: 1px dashed #aaa; margin: 20px 0; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .info-row strong { color: #444; }
            .amount { font-size: 1.2em; font-weight: bold; color: #007b55; }
            .footer-note { text-align: center; font-size: 0.85em; color: #555; margin-top: 25px; }
          </style>
        </head>
        <body>
          <div class="receipt-box">
            <div class="receipt-header">
              <h2>Payment Receipt</h2>
              <p>${new Date().toLocaleString("en-KE", { dateStyle: "full", timeStyle: "short" })}</p>
            </div>

            <div class="divider"></div>

            <div class="info-row"><strong>Service:</strong> <span>${payment.service_name || payment.service || "—"}</span></div>
            <div class="info-row"><strong>Provider:</strong> <span>${payment.provider_name || payment.provider || "—"}</span></div>
            <div class="info-row"><strong>Appointment Date:</strong> <span>${new Date(payment.appointment_date).toLocaleString("en-KE")}</span></div>
            <div class="info-row"><strong>Payment Status:</strong> <span>${payment.payment_status === "paid" ? "✅ PAID" : "❌ UNPAID"}</span></div>
            <div class="info-row"><strong>Payment Reference:</strong> <span>${payment.payment_reference || "—"}</span></div>

            <div class="divider"></div>

            <div class="info-row"><strong>Amount Paid:</strong> <span class="amount">KES ${Number(payment.amount_paid || payment.payment_amount || 0).toLocaleString()}</span></div>
            <div class="info-row"><strong>Pending Amount:</strong> <span class="amount" style="color:#b30000;">KES ${Math.max((payment.total_price ?? payment.price ?? 0) - (payment.amount_paid ?? 0), 0).toLocaleString()}</span></div>

            <div class="divider"></div>

            <div class="footer-note">
              Thank you for booking with <strong>${payment.provider_name || "our service"}</strong>.<br/>
              Please keep this receipt for your records.
            </div>
          </div>
        </body>
      </html>
    `);
    newWindow.document.close();
    newWindow.print();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content wide-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>💳 Payment Receipt</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div id="receipt-content" className="modal-body receipt-body">
          <p><strong>Service:</strong> {payment.service_name || payment.service}</p>
          <p><strong>Provider:</strong> {payment.provider_name || payment.provider}</p>
          <p><strong>Appointment Date:</strong> {new Date(payment.appointment_date).toLocaleString("en-KE")}</p>
          <p><strong>Payment Reference:</strong> {payment.payment_reference || "—"}</p>
          <p><strong>Status:</strong> {payment.payment_status === "paid"
                                        ? "✅ Fully Paid"
                                        : payment.payment_status === "deposit-paid"
                                        ? "🟡 Deposit Paid"
                                        : "❌ Unpaid"
                                      }</p>
          <p><strong>Amount Paid:</strong> KES {Number(payment.amount_paid || payment.payment_amount || 0).toLocaleString()}</p>
          <p><strong>Pending Amount:</strong> 
            <span style={{ color: "#b30000" }}>
              {" "}KES {Math.max((payment.total_price ?? payment.price ?? 0) - (payment.amount_paid ?? 0), 0).toLocaleString()}
            </span>
          </p>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={printReceipt}>🖨️ Print Receipt</button>
        </div>
      </div>
    </div>
  );
}

/* ===============================
   MAIN APPOINTMENT MANAGER
=============================== */
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
  const [selectedPayment, setSelectedPayment] = useState(null);
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

  const renderAddons = (apt) => {
    const selectedAddons = parseAddons(apt);

    if (!Array.isArray(selectedAddons) || selectedAddons.length === 0) {
      return <p className="no-addons-text">No add-ons selected.</p>;
    }

    return (
      <div className="addons-container">
        <h5 className="addons-heading">💅 Add-ons Selected</h5>
        <ul className="addon-list">
          {selectedAddons.map((addon, idx) => (
            <li key={addon.id ?? idx} className="addon-item">
              <span className="addon-name">{addon.name}</span>
              <span className="addon-price">
                + KES {Number(addon.price ?? addon.additional_price ?? 0).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const renderAppointmentsList = (list, type) => {
    // ✅ Filter past correctly (no scheduled items)
    if (type === "past") {
      const pastStatuses = ["completed", "cancelled", "no-show", "rebooked"];
      list = list.filter((apt) => pastStatuses.includes(apt.status));
    }

    if (!list || list.length === 0)
      return <div className="no-appointments">No {type} appointments.</div>;

      const calculateTotals = (apt) => {
        // parseAddons handles JSON string or array
        const selectedAddons = parseAddons(apt);

        const addonsTotal = selectedAddons.reduce(
          (sum, addon) => sum + Number(addon.price ?? addon.additional_price ?? 0),
          0
        );

        // base price should come from apt.price (service base). Fallback to total_price-addonsTotal if missing.
        const basePrice = Number(apt.price ?? ((apt.total_price ?? 0) - addonsTotal) ?? 0);

        // total: prefer stored total_price (backend sets it), otherwise base + addons
        const total = Number(apt.total_price ?? basePrice + addonsTotal);

        // deposit: prefer stored deposit_amount; otherwise compute 30% of total
        const deposit = Number(apt.deposit_amount ?? Math.round(total * 0.3));

        // amount paid: backend stores amount_paid (or payment_amount). fallback zero
        const paid = Number(apt.amount_paid ?? apt.payment_amount ?? 0);

        const pending = Math.max(total - paid, 0);

        return { basePrice, addonsTotal, total, deposit, paid, pending, selectedAddons };
      };

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
                <p><strong>With:</strong> {apt.provider_name}</p>
              ) : (
                <p><strong>Client:</strong> {apt.client_name} ({apt.client_phone})</p>
              )}

              <p><strong>When:</strong> {formatDate(apt.appointment_date)}</p>
              <p><strong>Duration:</strong> {apt.duration} minutes</p>

              {/* 💳 Deposit, Payment Info & Receipt */}
              {(() => {
                const { basePrice, addonsTotal, total, deposit, paid, pending } = calculateTotals(apt);

                return (
                  <div className="payment-details">
                    <p className="payment-line">
                      <strong>Deposit (30%):</strong> KES {deposit.toLocaleString()}
                    </p>

                    <p className="payment-line">
                      <strong>Amount Paid:</strong> KES {paid.toLocaleString()}

                      {/* Show Green Receipt Icon if ANY amount has been paid */}
                      {(paid > 0 || apt.payment_status === 'paid' || apt.payment_status === 'deposit-paid') && (
                        <span 
                          className="receipt-wrapper" 
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent card click
                            setSelectedPayment(apt);
                          }}
                          title="View Payment Receipt"
                          style={{ 
                            display: "inline-flex", 
                            alignItems: "center", 
                            marginLeft: "12px", 
                            cursor: "pointer",
                            color: "#16a34a", // Green color
                            fontWeight: "600",
                            fontSize: "0.9em"
                          }}
                        >
                          <Receipt size={18} style={{ marginRight: "4px" }} />
                          Receipt
                        </span>
                      )}
                    </p>

                    <div className="info-row"><strong>Total Amount:</strong>
                      <span className="amount">KES {total.toLocaleString()}</span>
                    </div>

                    <p style={{ color: pending > 0 ? "#b30000" : "#007b55" }}>
                      <strong>Pending Amount:</strong> KES {pending.toLocaleString()}
                    </p>
                  </div>
                );
              })()}

              {renderAddons(apt)}

              {/* Total (base + add-ons) */}
              {(() => {
                const { basePrice, addonsTotal, total } = calculateTotals(apt);
                return (
                  <div className="total-cost-box">
                    <div className="total-row">
                      <span>Base Price:</span>
                      <strong>KES {basePrice.toLocaleString()}</strong>
                    </div>

                    <div className="total-row">
                      <span>Add-ons:</span>
                      <strong>+ KES {addonsTotal.toLocaleString()}</strong>
                    </div>

                    <div className="total-divider" />

                    <div className="total-row total-final">
                      <span>Total:</span>
                      <strong>KES {total.toLocaleString()}</strong>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* ✅ ACTION BUTTONS (kept same) */}
            <div className="appointment-actions">
              {user.user_type === "client" ? (
                <>
                  {/* 🕓 Cancel pending */}
                  {apt.status === "pending" && (
                    <button
                      className="btn btn-danger small-btn"
                      onClick={() => handleCancelAppointment(apt.id)}
                      disabled={cancelling === apt.id}
                    >
                      {cancelling === apt.id ? "Cancelling..." : "Cancel"}
                    </button>
                  )}

                  {/* ♻️ Rebook/Delete past */}
                  {["cancelled", "no-show", "completed"].includes(apt.status) && (
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
                  {/* ✅ Provider pending controls */}
                  {apt.status === "pending" && type === "pending" && (
                    <div className="status-action-row">
                      <button
                        className="btn-status confirm"
                        onClick={() => handleStatusUpdate(apt.id, "scheduled")}
                        disabled={updating === apt.id}
                      >
                        {updating === apt.id ? "Updating..." : "Confirm"}
                      </button>
                      <button
                        className="btn-status reject"
                        onClick={() => handleStatusUpdate(apt.id, "cancelled")}
                        disabled={updating === apt.id}
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  {/* 📅 Upcoming controls */}
                  {type === "upcoming" && apt.status === "scheduled" && (
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

                  {/* 🗑 Past delete */}
                  {type === "past" && (
                    <div className="action-row">
                      <button
                        className="btn btn-danger small-btn"
                        onClick={() => handleDeleteAppointment(apt.id)}
                      >
                        Delete
                      </button>
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

        {/* 💳 Payment Info Modal */}
        {selectedPayment && (
          <PaymentInfoModal
            payment={selectedPayment}
            onClose={() => setSelectedPayment(null)}
          />
        )}
      </div>
    </div>
  );
}

export default AppointmentManager;