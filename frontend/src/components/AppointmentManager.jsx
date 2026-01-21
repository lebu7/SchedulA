import React, { useState, useEffect } from "react";
import { PaystackButton } from "react-paystack";
import { useLocation } from "react-router-dom"; 
import api from "../services/auth";
import BookingModal from "./BookingModal";
import RescheduleModal from "./RescheduleModal";
import { Receipt, AlertTriangle, CheckCircle, Info, Calendar, Clock, Lock, Unlock } from "lucide-react"; // 🧠 Added Icons
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

/* 🧠 Helper: AI Risk Badge Logic */
const getRiskBadge = (riskScore) => {
  if (riskScore === undefined || riskScore === null) return null;
  
  const score = Number(riskScore);
  
  if (score < 0.3) {
    return (
      <span className="risk-badge low" title="Low probability of No-Show">
        <CheckCircle size={14} /> Low Risk
      </span>
    );
  } else if (score < 0.7) {
    return (
      <span className="risk-badge medium" title="Moderate probability of No-Show">
        <Info size={14} /> Medium Risk
      </span>
    );
  } else {
    return (
      <span className="risk-badge high" title="High probability of No-Show">
        <AlertTriangle size={14} /> High Risk ({(score * 100).toFixed(0)}%)
      </span>
    );
  }
};

/* 💳 Printable Payment Info Modal */
function PaymentInfoModal({ payment, onClose }) {
  if (!payment) return null;

  const printReceipt = () => {
    const total = Number(payment.total_price ?? payment.price ?? 0);
    const paid = Number(payment.amount_paid ?? payment.payment_amount ?? 0);
    const pending = Math.max(total - paid, 0);

    let statusLabel = "Balance Due";
    let statusColor = "#475569"; 
    let statusBg = "#f1f5f9";    

    if (payment.payment_status === "paid" || pending === 0) {
      statusLabel = "Fully Paid";
      statusColor = "#15803d";   
      statusBg = "#dcfce7";
    } else if (payment.payment_status === "deposit-paid") {
      statusLabel = "Deposit Paid";
      statusColor = "#9a3412";   
      statusBg = "#fff7ed";
    } else if (payment.payment_status === "refunded") {
      statusLabel = "Refunded";
      statusColor = "#b91c1c";
      statusBg = "#fee2e2";
    }

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
            .status-banner { background: ${statusBg}; color: ${statusColor}; padding: 12px; text-align: center; font-weight: 700; border-radius: 8px; margin-bottom: 30px; text-transform: uppercase; font-size: 13px; letter-spacing: 0.5px; }
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
            <div class="row"><span class="label">Service</span><span class="value">${payment.service_name || payment.service}</span></div>
            <div class="row"><span class="label">Provider</span><span class="value">${payment.provider_name || payment.provider}</span></div>
            <div class="row"><span class="label">Date</span><span class="value">${new Date(payment.appointment_date).toLocaleString("en-KE")}</span></div>
            <div class="row"><span class="label">Reference</span><span class="value">${payment.payment_reference || "N/A"}</span></div>
            <div class="divider"></div>
            <div class="financials">
              <div class="fin-row"><span class="label">Total Billed</span><span class="value">KES ${total.toLocaleString()}</span></div>
              <div class="fin-row"><span class="label">Total Paid</span><span class="value">KES ${paid.toLocaleString()}</span></div>
              <div class="fin-row total" style="color: ${pending > 0 ? '#dc2626' : '#15803d'}"><span>Balance Due</span><span>KES ${pending.toLocaleString()}</span></div>
            </div>
            <div class="footer">Thank you for choosing <strong>${payment.provider_name || "SchedulA"}</strong>.<br/>Please retain this receipt for your records.</div>
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
          <p><strong>Ref:</strong> {payment.payment_reference || "—"}</p>
          <p><strong>Status:</strong> 
            <span className={`payment-status ${payment.payment_status === 'paid' ? 'paid' : payment.payment_status === 'deposit-paid' ? 'deposit-paid' : payment.payment_status === 'refunded' ? 'refunded' : 'unpaid'}`}>
              {payment.payment_status === 'paid' ? 'Fully Paid' : payment.payment_status === 'deposit-paid' ? 'Deposit Paid' : payment.payment_status === 'refunded' ? 'Refunded' : 'Unpaid'}
            </span>
          </p>
          <div style={{ borderTop: "1px dashed #e2e8f0", margin: "8px 0" }}></div>
          <p><strong>Total Billed:</strong> KES {total.toLocaleString()}</p>
          <p><strong>Total Paid:</strong> <span style={{ color: "#16a34a", fontWeight: "bold" }}>KES {paid.toLocaleString()}</span></p>
          <p><strong>Balance:</strong> <span style={{ color: pending > 0 ? "#b91c1c" : "#15803d", fontWeight: "bold" }}> KES {pending.toLocaleString()}</span></p>
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
  const location = useLocation(); 
  const [appointments, setAppointments] = useState({
    pending: [],
    scheduled: [],
    upcoming: [],
    past: [],
  });
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState(() => {
    if (location.state?.subTab) return location.state.subTab;
    return user.user_type === "provider" ? "upcoming" : "pending";
  });

  const [updating, setUpdating] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  
  // Status Filter (History)
  const [historyFilter, setHistoryFilter] = useState("all"); 
  // Date Filter (History)
  const [dateFilter, setDateFilter] = useState("all"); 

  // 🆕 DEV MODE: Allow modifying future appointments for testing
  const [isDevMode, setIsDevMode] = useState(false);

  const [showBooking, setShowBooking] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false); 
  const [rebookService, setRebookService] = useState(null);
  const [rescheduleApt, setRescheduleApt] = useState(null); 
  const [processingPayment, setProcessingPayment] = useState(null); 

  useEffect(() => {
    fetchAppointments();
  }, []);

  useEffect(() => {
    if (!loading && location.state?.targetId) {
      const targetId = parseInt(location.state.targetId);
      const inPending = appointments.pending?.some(a => a.id === targetId);
      if (inPending) {
        setActiveTab("pending");
        return;
      }
      const upcomingList = user.user_type === "client" ? appointments.scheduled : appointments.upcoming;
      const inUpcoming = upcomingList?.some(a => a.id === targetId);
      if (inUpcoming) {
        setActiveTab(user.user_type === "client" ? "scheduled" : "upcoming");
        return;
      }
      const inHistory = appointments.past?.some(a => a.id === targetId);
      if (inHistory) {
        setActiveTab("history");
        setHistoryFilter("all"); 
        return;
      }
    }
  }, [loading, appointments, location.state, user.user_type]);

  useEffect(() => {
    if (!loading && location.state?.targetId) {
      setTimeout(() => {
        const element = document.getElementById(`apt-${location.state.targetId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('highlight-target'); 
          setTimeout(() => element.classList.remove('highlight-target'), 2000);
        }
      }, 700); 
    }
  }, [loading, activeTab, location.state]);

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const response = await api.get("/appointments");
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

  const handleReschedule = (apt) => {
    setRescheduleApt(apt);
    setShowReschedule(true);
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

  const handleStatusUpdate = async (id, status, notes = null) => {
    setUpdating(id);
    try {
      const payload = { status };
      if (notes) payload.notes = notes; 
      await api.put(`/appointments/${id}`, payload);
      await fetchAppointments();
    } finally {
      setUpdating(null);
    }
  };

  const handleReject = async (id) => {
    const reason = window.prompt("Reason for rejection (optional):");
    if (reason === null) return; 
    await handleStatusUpdate(id, "cancelled", reason);
  };

  const handleCancelAppointment = async (id) => {
    if (window.confirm("Cancel this appointment? Refund request will be sent.")) {
      setCancelling(id);
      try {
        await api.put(`/appointments/${id}`, { status: "cancelled" });
        await fetchAppointments();
        alert("Appointment cancelled. Refund request sent to provider.");
      } finally {
        setCancelling(null);
      }
    }
  };

  const handleProviderRefund = async (appointmentId) => {
    if (!window.confirm("Process refund for this cancelled appointment?")) return;
    setUpdating(appointmentId);
    try {
      const res = await api.post(`/appointments/${appointmentId}/process-refund`);
      alert('✅ ' + res.data.message);
      await fetchAppointments();
    } catch (error) {
      alert('❌ ' + (error.response?.data?.error || 'Refund failed'));
    } finally {
      setUpdating(null);
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

  const handleRescheduleSuccess = async () => {
      await fetchAppointments();
      setShowReschedule(false);
  };

  const handlePaystackSuccess = async (response, apt, paidAmount) => {
    setProcessingPayment(apt.id);
    try {
      await api.put(`/appointments/${apt.id}/pay-balance`, {
        payment_reference: response.reference,
        amount_paid: paidAmount 
      });
      alert("✅ Payment processed successfully!");
      await fetchAppointments();
    } catch (error) {
      console.error("Payment update failed:", error);
      alert("Payment succeeded but failed to update system. Please contact support.");
    } finally {
      setProcessingPayment(null);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed': return <span className="status-badge green">✅ Completed</span>;
      case 'cancelled': return <span className="status-badge red">❌ Cancelled</span>;
      case 'no-show': return <span className="status-badge orange">🚫 No Show</span>;
      case 'rebooked': return <span className="status-badge purple">🔄 Rebooked</span>;
      default: return null;
    }
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

  // 🆕 Helper Function to Render Single Card (Reusable for split sections)
  const renderAppointmentCard = (apt, type) => {
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

     const paystackConfig = {
       reference: (new Date()).getTime().toString(),
       email: user.email || "client@example.com",
       amount: pending * 100, 
       publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
       currency: "KES",
       metadata: {
         appointment_id: apt.id,
         service: apt.service_name,
         provider: apt.provider_name
       }
     };

     const handleStatusChange = (e) => {
       const newStatus = e.target.value;
       if (newStatus === 'completed' && pending > 0) {
         alert(`⚠️ Cannot mark as Completed.\n\nBalance Due: KES ${pending.toLocaleString()}\n\nPlease process the payment first.`);
         return; 
       }
       handleStatusUpdate(apt.id, newStatus);
     };

     // 🛑 Future Restriction Logic
     const isFuture = new Date(apt.appointment_date) > new Date();
     // If it's a future appointment AND we are NOT in dev mode, disable actions
     const actionsDisabled = isFuture && !isDevMode;

     return (
        <div
            key={apt.id}
            id={`apt-${apt.id}`} 
            className={`appointment-card ${
            apt.status === "pending" ? "highlight-pending" : ""
            } ${location.state?.targetId == apt.id ? "highlight-target" : ""}`}
        >
            <div className="appointment-info">
            {type === 'history' && getStatusBadge(apt.status)}

            {apt.refund_status && (
                <div className={`refund-status-badge ${apt.refund_status}`}>
                {apt.refund_status === 'completed' && '✅ Refunded'}
                {apt.refund_status === 'processing' && '⏳ Refund Processing'}
                {apt.refund_status === 'pending' && '⏰ Refund Pending'}
                {apt.refund_status === 'failed' && '❌ Refund Failed'}
                </div>
            )}

            <h4>{apt.service_name}</h4>

            {user.user_type === "client" ? (
                <p><strong>With:</strong> {apt.provider_name}</p>
            ) : (
                <div>
                <p><strong>Client:</strong> {apt.client_name} ({apt.client_phone})</p>
                {(apt.status === 'pending' || apt.status === 'scheduled') && (
                    <div style={{ marginTop: '5px', marginBottom: '8px' }}>
                        {getRiskBadge(apt.no_show_risk)}
                    </div>
                )}
                </div>
            )}

            <p><strong>When:</strong> {formatDate(apt.appointment_date)}</p>
            <p><strong>Duration:</strong> {apt.duration} minutes</p>

            {apt.status === 'cancelled' && apt.notes && (
                <p className="cancellation-reason" style={{ color: '#dc2626', fontSize: '13px', fontStyle: 'italic', marginTop: '6px' }}>
                <strong>Note:</strong> {apt.notes}
                </p>
            )}

            <div className="payment-details">
                <p className="payment-line">
                <strong>Deposit (30%):</strong> KES {deposit.toLocaleString()}
                </p>

                <p className="payment-line">
                <strong>Amount Paid:</strong> KES {paid.toLocaleString()}

                {(paid > 0 || apt.payment_status === 'paid' || apt.payment_status === 'deposit-paid' || apt.payment_status === 'refunded') && (
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

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                <p style={{ color: pending > 0 ? "#b30000" : "#007b55", margin: 0 }}>
                    <strong>Balance:</strong> KES {pending.toLocaleString()}
                </p>

                {pending > 0 && apt.status !== 'cancelled' && apt.status !== 'no-show' && apt.payment_status !== 'refunded' && (
                    <PaystackButton
                        {...paystackConfig}
                        text={processingPayment === apt.id ? "Processing..." : (user.user_type === 'client' ? "Pay Balance" : "Process Payment")}
                        className={`small-btn ${user.user_type === 'client' ? 'btn-primary' : 'btn-secondary'}`}
                        onSuccess={(res) => handlePaystackSuccess(res, apt, pending)}
                        onClose={() => console.log("Payment cancelled")}
                        style={{
                        background: user.user_type === 'client' ? "#16a34a" : "#4f46e5", 
                        border: "none", 
                        marginLeft: "10px", 
                        fontSize: "12px", 
                        padding: "6px 10px", 
                        cursor: "pointer", 
                        color: "white", 
                        borderRadius: "6px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px"
                        }}
                    >
                    </PaystackButton>
                )}
                </div>
            </div>

            {renderAddons(apt)}

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
            </div>

            <div className="appointment-actions">
            {user.user_type === "client" ? (
                <>
                {/* Client Actions (Same as before) */}
                {(apt.status === "pending" || apt.status === "scheduled") && !apt.refund_status && ( 
                    <>
                        <button className="btn btn-primary small-btn" onClick={() => handleReschedule(apt)}>Reschedule</button>
                        <button className="btn btn-danger small-btn" onClick={() => handleCancelAppointment(apt.id)} disabled={cancelling === apt.id}>Cancel</button>
                    </>
                )}

                {["cancelled", "no-show", "completed", "rebooked"].includes(apt.status) && (
                    <div className="action-row">
                    {apt.status === 'cancelled' && (
                        <button className="btn btn-primary small-btn" onClick={() => handleRebook(apt)}>Rebook</button>
                    )}
                    <button className="btn btn-danger small-btn" onClick={() => handleDeleteAppointment(apt.id)}>Delete</button>
                    </div>
                )}
                </>
            ) : (
                <>
                {/* Provider Actions */}
                {apt.status === "pending" && type === "pending" && (
                    <div className="status-action-row">
                    <button className="btn-status confirm" onClick={() => handleStatusUpdate(apt.id, "scheduled")} disabled={updating === apt.id}>{updating === apt.id ? "..." : "Confirm"}</button>
                    <button className="btn-status reject" onClick={() => handleReject(apt.id)} disabled={updating === apt.id}>Reject</button>
                    </div>
                )}

                {apt.status === 'cancelled' && apt.refund_status === 'pending' && (
                    <button
                    className="btn btn-success small-btn"
                    onClick={() => handleProviderRefund(apt.id)}
                    disabled={updating === apt.id}
                    style={{ marginTop: '10px', width: '100%', backgroundColor: '#10b981' }}
                    >
                    {updating === apt.id ? "Processing..." : "💰 Process Refund"}
                    </button>
                )}

                {type === "upcoming" && apt.status === "scheduled" && (
                    <div className="status-dropdown-container">
                    {/* 🔒 Future Restriction: Disable dropdown if in future unless dev mode is on */}
                    <div style={{display:'flex', alignItems:'center', gap:'8px', width:'100%'}}>
                        {actionsDisabled && <Clock size={16} color="#94a3b8" title="Available when appointment time reached" />}
                        <select
                            value={apt.status}
                            onChange={handleStatusChange} 
                            disabled={updating === apt.id || actionsDisabled}
                            className={`status-select ${actionsDisabled ? 'disabled-select' : ''}`}
                            title={actionsDisabled ? "Actions disabled for future appointments (Enable Test Mode to override)" : ""}
                        >
                            <option value="scheduled">Scheduled</option>
                            <option value="completed">{pending > 0 ? "🔒 Completed (Pay Balance First)" : "Completed"}</option>
                            <option value="cancelled">Cancelled</option>
                            <option value="no-show">No Show</option>
                        </select>
                    </div>
                    {actionsDisabled && <small style={{color:'#94a3b8', fontSize:'11px', marginTop:'4px', display:'block'}}>Action available on date</small>}
                    </div>
                )}

                {type === "history" && (
                    <div className="action-row">
                    <button className="btn btn-danger small-btn" onClick={() => handleDeleteAppointment(apt.id)}>Delete</button>
                    </div>
                )}
                </>
            )}
            </div>
        </div>
    );
  };

  const renderAppointmentsList = (list, type) => {
    let displayList = list || [];

    // Filter Logic for History
    if (type === 'history') {
      displayList = appointments.past || [];
      if (historyFilter === 'completed') displayList = displayList.filter(apt => apt.status === 'completed');
      else if (historyFilter === 'cancelled') displayList = displayList.filter(apt => apt.status === 'cancelled' || apt.status === 'no-show');

      const now = new Date();
      if (dateFilter === 'this_year') displayList = displayList.filter(apt => new Date(apt.appointment_date).getFullYear() === now.getFullYear());
      else if (dateFilter === 'this_month') displayList = displayList.filter(apt => new Date(apt.appointment_date).getFullYear() === now.getFullYear() && new Date(apt.appointment_date).getMonth() === now.getMonth());
      else if (dateFilter === 'last_3_months') {
        const d = new Date(); d.setDate(d.getDate() - 90);
        displayList = displayList.filter(apt => new Date(apt.appointment_date) >= d);
      }
    }

    // 🧠 LOGIC: Split Upcoming Tab for Providers (Due vs Future)
    if (type === 'upcoming' && user.user_type === 'provider') {
        const now = new Date();
        const dueAppointments = displayList.filter(apt => new Date(apt.appointment_date) <= now);
        const futureAppointments = displayList.filter(apt => new Date(apt.appointment_date) > now);

        return (
            <div className="appointments-split-view">
                {/* 1. Due / Overdue Section */}
                <div className="section-block">
                    <h3 className="section-title warning">
                        <AlertTriangle size={18} /> Actions Due / Pending
                    </h3>
                    {dueAppointments.length === 0 ? (
                        <p className="no-data-text">No pending appointments due right now.</p>
                    ) : (
                        <div className="appointments-list">
                            {dueAppointments.map(apt => renderAppointmentCard(apt, type))}
                        </div>
                    )}
                </div>

                <div className="section-divider"></div>

                {/* 2. Future Section with Toggle */}
                <div className="section-block">
                    <div className="section-header-row" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
                        <h3 className="section-title info">
                            <Calendar size={18} /> Future Appointments
                        </h3>
                        
                        {/* 🛠️ Dev Mode Toggle */}
                        <label className="dev-mode-toggle" title="Enable to test actions on future appointments">
                            <input 
                                type="checkbox" 
                                checked={isDevMode} 
                                onChange={(e) => setIsDevMode(e.target.checked)} 
                            />
                            <span className="toggle-label">
                                {isDevMode ? <Unlock size={14} color="#16a34a"/> : <Lock size={14} color="#64748b"/>}
                                Test Mode
                            </span>
                        </label>
                    </div>

                    {futureAppointments.length === 0 ? (
                        <p className="no-data-text">No upcoming future appointments.</p>
                    ) : (
                        <div className="appointments-list">
                            {futureAppointments.map(apt => renderAppointmentCard(apt, type))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Default Render for other tabs
    if (!displayList || displayList.length === 0)
      return <div className="no-appointments">No appointments found matching your filters.</div>;

    return (
      <div className="appointments-list">
        {displayList.map((apt) => renderAppointmentCard(apt, type))}
      </div>
    );
  };

  if (loading) return <div className="loading">Loading appointments...</div>;

  const tabs = user.user_type === "client" 
    ? ["pending", "scheduled", "history"] 
    : ["pending", "upcoming", "history"];

  return (
    <div className="appointment-manager">
      <div className="container">
        <h2>
          {user.user_type === "provider" ? "Manage Appointments" : "My Appointments"}
        </h2>

        <div className="tabs">
          {tabs.map((tab) => {
            const count = tab === 'history' ? appointments.past?.length : appointments[tab]?.length;
            return (
                <button
                key={tab}
                className={`tab-btn ${activeTab === tab ? "active" : ""}`}
                onClick={() => setActiveTab(tab)}
                >
                {tab.charAt(0).toUpperCase() + tab.slice(1)} ({count || 0})
                </button>
            )
          })}
        </div>

        {activeTab === 'history' && (
          <div className="history-filters" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            {/* Status Pills */}
            <div className="status-filters">
              <button className={`filter-pill ${historyFilter === 'all' ? 'active' : ''}`} onClick={() => setHistoryFilter('all')}>All Status</button>
              <button className={`filter-pill ${historyFilter === 'completed' ? 'active' : ''}`} onClick={() => setHistoryFilter('completed')}>Completed</button>
              <button className={`filter-pill ${historyFilter === 'cancelled' ? 'active' : ''}`} onClick={() => setHistoryFilter('cancelled')}>Cancelled</button>
            </div>

            {/* Date Filter Dropdown */}
            <div className="date-filter-container" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Calendar size={18} color="#64748b" />
                <select 
                    value={dateFilter} 
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="date-select"
                    style={{
                        padding: '6px 12px',
                        borderRadius: '20px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#fff',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        outline: 'none'
                    }}
                >
                    <option value="all">All Time</option>
                    <option value="this_year">📅 This Year ({new Date().getFullYear()})</option>
                    <option value="this_month">📅 This Month</option>
                    <option value="last_3_months">⏳ Last 3 Months</option>
                </select>
            </div>
          </div>
        )}

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

        {showReschedule && (
          <RescheduleModal 
            appointment={rescheduleApt} 
            onClose={() => setShowReschedule(false)} 
            onSuccess={handleRescheduleSuccess} 
          />
        )}

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