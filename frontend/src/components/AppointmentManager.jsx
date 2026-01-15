import React, { useState, useEffect } from "react";
import api from "../services/auth";
import BookingModal from "./BookingModal";
import { Receipt } from "lucide-react"; // receipt icon
import "./AppointmentManager.css";

// ===== Helper: make sure addons are an ARRAY =====
const parseAddons = (apt) => {
  let selectedAddons =
    apt?.addons || apt?.addon_items || apt?.sub_services || [];

  if (typeof selectedAddons === "string") {
    try {
      selectedAddons = JSON.parse(selectedAddons);
    } catch (e) {
      console.warn("Failed to parse addons JSON for appointment", apt.id, e);
      selectedAddons = [];
    }
  }

  if (!Array.isArray(selectedAddons)) selectedAddons = [];
  return selectedAddons;
};

/* 💳 Printable Payment Info Modal */
function PaymentInfoModal({ payment, onClose }) {
  if (!payment) return null;

  const printReceipt = () => {
    // 1. Calculate correct values for the receipt
    const total = Number(payment.total_price ?? payment.price ?? 0);
    const paid = Number(payment.amount_paid ?? payment.payment_amount ?? 0);
    const pending = Math.max(total - paid, 0);

    // 2. Determine Status Label & Colors for the PDF
    let statusLabel = "Balance Due";
    let statusColor = "#475569"; // Slate Gray
    let statusBg = "#f1f5f9";    // Slate 100

    if (payment.payment_status === "paid" || pending === 0) {
      statusLabel = "Fully Paid";
      statusColor = "#15803d";   // Green
      statusBg = "#dcfce7";
    } else if (payment.payment_status === "deposit-paid") {
      statusLabel = "Deposit Paid";
      statusColor = "#9a3412";   // Orange
      statusBg = "#fff7ed";
    }

    // 3. Generate Professional HTML
    const newWindow = window.open("", "_blank");
    newWindow.document.write(`
      <html>
        <head>
          <title>Receipt - ${payment.service_name}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; background-color: #f8fafc; color: #333; }
            .receipt-box { background: white; border: 1px solid #e2e8f0; padding: 40px; border-radius: 16px; max-width: 500px; margin: auto; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
            
            .header { text-align: center; margin-bottom: 30px; }
            .header h1 { margin: 0; color: #0f172a; font-size: 22px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; }
            .header p { margin: 8px 0 0; color: #64748b; font-size: 14px; }
            
            .status-banner { 
              background: ${statusBg}; 
              color: ${statusColor}; 
              padding: 12px; 
              text-align: center; 
              font-weight: 700; 
              border-radius: 8px; 
              margin-bottom: 30px; 
              text-transform: uppercase; 
              font-size: 13px;
              letter-spacing: 0.5px;
            }

            .row { display: flex; justify-content: space-between; margin-bottom: 14px; font-size: 14px; }
            .label { color: #64748b; font-weight: 500; }
            .value { color: #0f172a; font-weight: 600; text-align: right; }
            
            .divider { border-bottom: 2px dashed #e2e8f0; margin: 25px 0; }
            
            .financials { background: #f8fafc; padding: 20px; border-radius: 12px; }
            .fin-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
            .fin-row.total { margin-top: 15px; border-top: 1px solid #cbd5e1; padding-top: 15px; font-size: 16px; font-weight: 700; }
            
            .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #94a3b8; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="receipt-box">
            <div class="header">
              <h1>Payment Receipt</h1>
              <p>${new Date().toLocaleString("en-KE", { dateStyle: "full", timeStyle: "short" })}</p>
            </div>

            <div class="status-banner">${statusLabel}</div>

            <div class="row">
              <span class="label">Service</span>
              <span class="value">${payment.service_name || payment.service}</span>
            </div>
            <div class="row">
              <span class="label">Provider</span>
              <span class="value">${payment.provider_name || payment.provider}</span>
            </div>
            <div class="row">
              <span class="label">Date</span>
              <span class="value">${new Date(payment.appointment_date).toLocaleString("en-KE")}</span>
            </div>
            <div class="row">
              <span class="label">Reference</span>
              <span class="value">${payment.payment_reference || "N/A"}</span>
            </div>

            <div class="divider"></div>

            <div class="financials">
              <div class="fin-row">
                <span class="label">Amount Paid</span>
                <span class="value">KES ${paid.toLocaleString()}</span>
              </div>
              <div class="fin-row" style="color: ${pending > 0 ? '#dc2626' : '#15803d'}">
                <span class="label">Balance Due</span>
                <span class="value">KES ${pending.toLocaleString()}</span>
              </div>
              <div class="fin-row total">
                <span>Total Amount</span>
                <span>KES ${total.toLocaleString()}</span>
              </div>
            </div>

            <div class="footer">
              Thank you for choosing <strong>${payment.provider_name || "SchedulA"}</strong>.<br/>
              Please retain this receipt for your records.
            </div>
          </div>
        </body>
      </html>
    `);
    newWindow.document.close();
    newWindow.print();
  };

  const total = Number(payment.total_price ?? payment.price ?? 0);
  const paid = Number(payment.amount_paid ?? payment.payment_amount ?? 0);
  const pending = Math.max(total - paid, 0);

  return (
    <div className="payment-modal-overlay" onClick={onClose}>
      <div className="payment-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>💳 Payment Receipt</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div id="receipt-content" className="receipt-body">
          <p><strong>Service:</strong> {payment.service_name || payment.service}</p>
          <p><strong>Provider:</strong> {payment.provider_name || payment.provider}</p>
          <p><strong>Date:</strong> {new Date(payment.appointment_date).toLocaleString("en-KE")}</p>
          <p><strong>Reference:</strong> {payment.payment_reference || "—"}</p>
          
          <p>
            <strong>Status:</strong> 
            <span className={`payment-status ${
              payment.payment_status === 'paid' ? 'paid' : 
              payment.payment_status === 'deposit-paid' ? 'deposit-paid' : 'unpaid'
            }`}>
              {payment.payment_status === 'paid' ? 'Fully Paid' : 
               payment.payment_status === 'deposit-paid' ? 'Deposit Paid' : ''}
            </span>
          </p>

          <div style={{ borderTop: "1px dashed #e2e8f0", margin: "8px 0" }}></div>

          <p><strong>Amount Paid:</strong> KES {paid.toLocaleString()}</p>
          <p><strong>Pending Amount:</strong> 
            <span style={{ color: pending > 0 ? "#b91c1c" : "#15803d", fontWeight: "bold" }}>
              {" "}KES {pending.toLocaleString()}
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

  // ✅ Updated to support Notes (e.g., rejection reason)
  const handleStatusUpdate = async (id, status, notes = null) => {
    setUpdating(id);
    try {
      const payload = { status };
      if (notes) payload.notes = notes; // Add notes if provided

      await api.put(`/appointments/${id}`, payload);
      await fetchAppointments();
    } finally {
      setUpdating(null);
    }
  };

  const handleReject = async (id) => {
    const reason = window.prompt("Reason for rejection (optional):");
    if (reason === null) return; // Cancelled
    await handleStatusUpdate(id, "cancelled", reason);
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

  // ✅ Helper for badges in Past tab
  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed': return <span className="status-badge green">✅ Completed</span>;
      case 'cancelled': return <span className="status-badge red">❌ Cancelled</span>;
      case 'no-show': return <span className="status-badge orange">🚫 No Show</span>;
      case 'rebooked': return <span className="status-badge purple">🔄 Rebooked</span>;
      default: return null;
    }
  };

  const renderAppointmentsList = (list, type) => {
    if (type === "past") {
      const pastStatuses = ["completed", "cancelled", "no-show", "rebooked"];
      list = list.filter((apt) => pastStatuses.includes(apt.status));
    }

    if (!list || list.length === 0)
      return <div className="no-appointments">No {type} appointments.</div>;

    const calculateTotals = (apt) => {
      const selectedAddons = parseAddons(apt);
      const addonsTotal = selectedAddons.reduce(
        (sum, addon) => sum + Number(addon.price ?? addon.additional_price ?? 0),
        0
      );
      const basePrice = Number(apt.price ?? ((apt.total_price ?? 0) - addonsTotal) ?? 0);
      const total = Number(apt.total_price ?? basePrice + addonsTotal);
      const deposit = Number(apt.deposit_amount ?? Math.round(total * 0.3));
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
              {/* ✅ Status Indicator for Past Appointments */}
              {type === 'past' && getStatusBadge(apt.status)}

              <h4>{apt.service_name}</h4>

              {user.user_type === "client" ? (
                <p><strong>With:</strong> {apt.provider_name}</p>
              ) : (
                <p><strong>Client:</strong> {apt.client_name} ({apt.client_phone})</p>
              )}

              <p><strong>When:</strong> {formatDate(apt.appointment_date)}</p>
              <p><strong>Duration:</strong> {apt.duration} minutes</p>

              {/* ✅ Show Reason if Cancelled (Client view) */}
              {apt.status === 'cancelled' && apt.notes && (
                <p className="cancellation-reason" style={{ color: '#dc2626', fontSize: '13px', fontStyle: 'italic', marginTop: '6px' }}>
                  <strong>Note:</strong> {apt.notes}
                </p>
              )}

              {/* 💳 Payment Details */}
              {(() => {
                const { total, deposit, paid, pending } = calculateTotals(apt);

                return (
                  <div className="payment-details">
                    <p className="payment-line">
                      <strong>Deposit (30%):</strong> KES {deposit.toLocaleString()}
                    </p>

                    <p className="payment-line">
                      <strong>Amount Paid:</strong> KES {paid.toLocaleString()}

                      {(paid > 0 || apt.payment_status === 'paid' || apt.payment_status === 'deposit-paid') && (
                        <span 
                          className="receipt-wrapper" 
                          onClick={(e) => {
                            e.stopPropagation(); 
                            setSelectedPayment(apt);
                          }}
                          title="View Payment Receipt"
                          style={{ 
                            display: "inline-flex", 
                            alignItems: "center", 
                            marginLeft: "12px", 
                            cursor: "pointer", 
                            color: "#16a34a", 
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

              {/* Total Box */}
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

            {/* ✅ ACTION BUTTONS */}
            <div className="appointment-actions">
              {user.user_type === "client" ? (
                <>
                  {/* Cancel Pending */}
                  {apt.status === "pending" && (
                    <button
                      className="btn btn-danger small-btn"
                      onClick={() => handleCancelAppointment(apt.id)}
                      disabled={cancelling === apt.id}
                    >
                      {cancelling === apt.id ? "Cancelling..." : "Cancel"}
                    </button>
                  )}

                  {/* Rebook/Delete Past (Including Cancelled) */}
                  {["cancelled", "no-show", "completed", "rebooked"].includes(apt.status) && (
                    <div className="action-row">
                      {/* 🔄 Rebook ONLY for Cancelled */}
                      {apt.status === 'cancelled' && (
                        <button
                          className="btn btn-primary small-btn"
                          onClick={() => handleRebook(apt)}
                        >
                          Rebook
                        </button>
                      )}
                      
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
                  {/* Provider: Pending Controls with Reject Reason */}
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
                        onClick={() => handleReject(apt.id)} 
                        disabled={updating === apt.id}
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  {/* Provider: Update Status */}
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

                  {/* Provider: Past Controls */}
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