/* frontend/src/components/AppointmentManager.jsx */
import React, { useState, useEffect, useMemo } from "react";
import { PaystackButton } from "react-paystack";
import { useLocation } from "react-router-dom"; 
import api from "../services/auth";
import BookingModal from "./BookingModal";
import RescheduleModal from "./RescheduleModal";
import CalendarView from "./CalendarView"; 
// ✅ ADDED: Chat Button (No ChatModal import needed anymore)
import ChatButton from './ChatButton';
import { 
  Receipt, AlertTriangle, CheckCircle, Info, Calendar, Clock, Lock, Unlock,
  Search, ArrowUpDown, Filter, X, UserPlus, CheckSquare, List 
} from "lucide-react"; 
import "./AppointmentManager.css";

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

function PaymentInfoModal({ payment, user, onClose }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (payment?.id) {
      setLoading(true);
      api.get(`/appointments/${payment.id}/transactions`)
        .then((res) => {
          const raw = res.data.transactions || [];
          const unique = raw.filter((tx, index, self) =>
            index === self.findIndex((t) => t.reference === tx.reference)
          );
          setTransactions(unique);
        })
        .catch((err) => console.error("Failed to load transactions", err))
        .finally(() => setLoading(false));
    }
  }, [payment]);

  if (!payment) return null;

  const printReceipt = () => {
    const total = Number(payment.total_price ?? payment.price ?? 0);
    const paid = Number(payment.amount_paid ?? payment.payment_amount ?? 0);
    const pending = Math.max(total - paid, 0);

    const providerName = user.user_type === 'provider' 
        ? (user.business_name || user.name) 
        : (payment.provider_name || payment.provider);

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

    let transactionHtml = "";
    if (transactions.length > 0) {
        transactionHtml = transactions.map((tx, idx) => {
            let label = "Payment";
            if (tx.type === 'refund') label = "Refund";
            else if (idx === 0) label = "Deposit"; 
            else if (idx === 1) label = "Balance";

            return `
            <div style="margin-bottom: 10px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 8px;">
                <div class="fin-row sub-transaction" style="font-weight: 600; color: #334155;">
                    <span>${idx + 1}. ${label} <span style="font-weight: 400; font-size: 11px; color: #64748b;">(${new Date(tx.created_at).toLocaleDateString()})</span></span>
                    <span style="color: ${tx.type === 'refund' ? '#dc2626' : '#1e293b'}">
                        ${tx.type === 'refund' ? '-' : ''}KES ${Number(tx.amount).toLocaleString()}
                    </span>
                </div>
                <div style="font-size: 11px; color: #64748b; font-family: monospace; margin-top: 2px;">
                    Ref: ${tx.reference}
                </div>
            </div>`;
        }).join('');
    } else {
        transactionHtml = `
            <div class="fin-row">
                <span>Transaction Ref</span>
                <span>${payment.payment_reference || "N/A"}</span>
            </div>
        `;
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
            .fin-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 14px; }
            .fin-row.total { margin-top: 15px; border-top: 2px solid #cbd5e1; padding-top: 15px; font-size: 16px; font-weight: 700; }
            .sub-transaction { font-size: 13px; }
            .history-header { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; margin: 15px 0 10px 0; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px; }
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
            <div class="row"><span class="label">Provider</span><span class="value">${providerName}</span></div>
            <div class="row"><span class="label">Client</span><span class="value">${payment.client_name || "N/A"}</span></div>
            <div class="row"><span class="label">Date</span><span class="value">${new Date(payment.appointment_date).toLocaleString("en-KE")}</span></div>
            
            <div class="divider"></div>
            
            <div class="financials">
              <div class="fin-row"><span class="label">Total Billed</span><span class="value">KES ${total.toLocaleString()}</span></div>
              
              <div class="history-header">Payment History</div>
              ${transactionHtml}
              
              <div class="fin-row total">
                <span>Total Paid</span>
                <span style="color: #15803d">KES ${paid.toLocaleString()}</span>
              </div>
              ${pending > 0 ? `<div class="fin-row total" style="color: #dc2626; border-top: none; margin-top: 5px;"><span>Balance Due</span><span>KES ${pending.toLocaleString()}</span></div>` : ''}
            </div>
            
            <div class="footer">Thank you for choosing <strong>${providerName}</strong>.<br/>Please retain this receipt for your records.</div>
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
          <p><strong>Provider:</strong> {user.user_type === 'provider' ? (user.business_name || user.name) : (payment.provider_name || payment.provider)}</p>
          <p><strong>Date:</strong> {new Date(payment.appointment_date).toLocaleString("en-KE")}</p>
          
          <div style={{ borderTop: "1px dashed #e2e8f0", margin: "12px 0" }}></div>
          
          {loading ? (
             <p style={{fontSize: '0.85em', color: '#94a3b8', fontStyle: 'italic', padding: '10px 0'}}>Loading history...</p>
          ) : transactions.length > 0 ? (
             <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', margin: '15px 0', border: '1px solid #f1f5f9' }}>
                <h5 style={{ fontSize: '0.75em', textTransform: 'uppercase', color: '#64748b', marginBottom: '8px', letterSpacing: '0.5px' }}>Transaction History</h5>
                {transactions.map((tx, i) => (
                    <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: i < transactions.length -1 ? '1px dashed #e2e8f0' : 'none', paddingBottom: '4px' }}>
                        <div style={{display:'flex', flexDirection: 'column'}}>
                            <span style={{fontSize: '0.85em', fontWeight: '600', color: '#334155'}}>
                                {tx.type === 'refund' ? 'Refund' : (i === 0 ? "Deposit" : "Balance")}
                            </span>
                            <span style={{fontSize: '0.75em', color: '#94a3b8', fontFamily: 'monospace'}}>Ref: {tx.reference.replace(/^ref_/i, '')}</span>
                        </div>
                        <span style={{fontSize: '0.85em', fontWeight: '700', color: tx.type === 'refund' ? '#dc2626' : '#15803d'}}>
                           {tx.type === 'refund' ? '-' : ''}KES {Number(tx.amount).toLocaleString()}
                        </span>
                    </div>
                ))}
             </div>
          ) : (
             <p><strong>Ref:</strong> {payment.payment_reference || "—"}</p>
          )}

          <p><strong>Status:</strong> 
            <span className={`payment-status ${payment.payment_status === 'paid' ? 'paid' : payment.payment_status === 'deposit-paid' ? 'deposit-paid' : payment.payment_status === 'refunded' ? 'refunded' : 'unpaid'}`}>
              {payment.payment_status === 'paid' ? 'Fully Paid' : payment.payment_status === 'deposit-paid' ? 'Deposit Paid' : payment.payment_status === 'refunded' ? 'Refunded' : 'Unpaid'}
            </span>
          </p>
          
          <div style={{ borderTop: "1px dashed #e2e8f0", margin: "12px 0" }}></div>
          
          <p><strong>Total Billed:</strong> KES {total.toLocaleString()}</p>
          <p><strong>Total Paid:</strong> <span style={{ color: "#16a34a", fontWeight: "bold" }}>KES {paid.toLocaleString()}</span></p>
          <p><strong>Balance:</strong> <span style={{ color: pending > 0 ? "#b91c1c" : "#15803d", fontWeight: "bold" }}> KES {pending.toLocaleString()}</span></p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={printReceipt} disabled={loading}>🖨️ Print Receipt</button>
        </div>
      </div>
    </div>
  );
}

function AppointmentManager({ user }) {
  const location = useLocation(); 
  const [appointments, setAppointments] = useState({
    pending: [],
    scheduled: [],
    upcoming: [],
    past: [],
  });
  const [loading, setLoading] = useState(true);
  
  const [viewMode, setViewMode] = useState('list'); // 🆕 'list' or 'calendar'

  const [activeTab, setActiveTab] = useState(() => {
    if (location.state?.subTab) return location.state.subTab;
    return user.user_type === "provider" ? "upcoming" : "pending";
  });

  const [upcomingSubTab, setUpcomingSubTab] = useState("due");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState("date-desc");

  const [updating, setUpdating] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  
  const [historyFilter, setHistoryFilter] = useState("all"); 
  const [dateFilter, setDateFilter] = useState("all"); 

  const [isDevMode, setIsDevMode] = useState(false);

  const [showBooking, setShowBooking] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false); 
  const [rebookService, setRebookService] = useState(null);
  const [rescheduleApt, setRescheduleApt] = useState(null); 
  const [processingPayment, setProcessingPayment] = useState(null); 

  const [showServiceSelector, setShowServiceSelector] = useState(false);
  const [providerServices, setProviderServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [walkInService, setWalkInService] = useState(null);

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
      
      const allUpcoming = [...(appointments.upcoming || []), ...(appointments.scheduled || [])];
      const pastDue = appointments.past?.filter(a => a.status === 'scheduled') || [];
      const combinedUpcoming = [...allUpcoming, ...pastDue];

      if (combinedUpcoming.some(a => a.id === targetId)) {
        setActiveTab(user.user_type === "client" ? "scheduled" : "upcoming");
        return;
      }
      
      const inHistory = appointments.past?.some(a => a.id === targetId && a.status !== 'scheduled');
      if (inHistory) {
        setActiveTab("history");
        setHistoryFilter("all"); 
        return;
      }
    }
  }, [loading, appointments, location.state, user.user_type]);

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

  const processedAppointments = useMemo(() => {
    const rawPending = appointments.pending || [];
    const pastDueItems = (appointments.past || []).filter(a => a.status === 'scheduled');
    const baseUpcoming = user.user_type === 'client' 
        ? (appointments.scheduled || []) 
        : (appointments.upcoming || []);
    const combinedUpcoming = user.user_type === 'provider' 
        ? [...baseUpcoming, ...pastDueItems] 
        : baseUpcoming; 
    const cleanHistory = (appointments.past || []).filter(a => a.status !== 'scheduled');

    return {
        pending: rawPending,
        upcoming: combinedUpcoming,
        scheduled: combinedUpcoming, 
        history: cleanHistory
    };
  }, [appointments, user.user_type]);


  const handleDeleteAppointment = async (id) => {
    if (window.confirm("Remove this appointment from your dashboard?")) {
      try {
        await api.delete(`/appointments/${id}`);
        await fetchAppointments();
        alert("Appointment deleted.");
      } catch (err) {
        alert(err.response?.data?.error || "Failed to delete appointment.");
      }
    }
  };

  const handleRebook = (apt) => {
    setRebookService({
      service_id: apt.service_id, 
      id: apt.service_id, 
      name: apt.service_name,
      provider_name: apt.provider_name,
      provider_id: apt.provider_id, 
      duration: apt.duration,
      price: apt.price,
      opening_time: apt.opening_time || "08:00",
      closing_time: apt.closing_time || "18:00",
      rebook: true,
      old_appointment_id: apt.id,
    });
    setShowBooking(true);
  };

  const handleWalkInClick = async () => {
    setShowServiceSelector(true);
    if (providerServices.length === 0) {
        setLoadingServices(true);
        try {
            const res = await api.get('/services');
            const myServices = res.data.services.filter(s => s.provider_id === user.id);
            setProviderServices(myServices);
        } catch(e) { 
            console.error("Failed to load services"); 
        } finally { 
            setLoadingServices(false); 
        }
    }
  };

  const selectWalkInService = (service) => {
      setWalkInService(service);
      setShowServiceSelector(false);
      setShowBooking(true); 
  };

  const handleReschedule = (apt) => {
    setRescheduleApt(apt);
    setShowReschedule(true);
  };

  // ✅ UPDATED: Open Chat via Widget Event
  const openAppointmentChat = async (apt) => {
    const recipientId = user.user_type === 'client' ? apt.provider_id : apt.client_id;
    try {
      // 1. Ensure room exists
      const res = await api.post('/chat/rooms', {
        recipientId,
        contextType: 'appointment',
        contextId: apt.id
      });
      
      const contextData = { 
        service_name: apt.service_name, 
        appointment_date: apt.appointment_date 
      };

      // 2. Dispatch event to Global Widget
      window.dispatchEvent(new CustomEvent('openChatRoom', {
        detail: {
          room: res.data.room,
          context: contextData
        }
      }));

    } catch (err) {
      console.error("Failed to initialize chat room:", err);
      alert("Could not open chat at this time.");
    }
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
    setWalkInService(null);
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

     const isFuture = new Date(apt.appointment_date) > new Date();
     const actionsDisabled = isFuture && !isDevMode;

     const appointmentDate = new Date(apt.appointment_date);
     const sixMonthsAgo = new Date();
     sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
     
     const canDelete = appointmentDate <= sixMonthsAgo;

     const isWalkIn = apt.payment_reference && apt.payment_reference.startsWith("WALK-IN");

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

            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                <h4>{apt.service_name}</h4>
                {isWalkIn && <span className="walk-in-badge" >Walk-In</span>}
            </div>

            {user.user_type === "client" ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p><strong>With:</strong> {apt.provider_name}</p>
                    {/* ✅ Integrated Chat Button */}
                    <ChatButton onClick={() => openAppointmentChat(apt)} size="small" />
                </div>
            ) : (
                <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p><strong>Client:</strong> {apt.client_name} ({apt.client_phone})</p>
                    {/* ✅ Integrated Chat Button */}
                    <ChatButton onClick={() => openAppointmentChat(apt)} size="small" />
                </div>
                {(apt.status === 'pending' || apt.status === 'scheduled') && !isWalkIn && (
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
                {!isWalkIn && (
                    <p className="payment-line">
                    <strong>Deposit (30%):</strong> KES {deposit.toLocaleString()}
                    </p>
                )}

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

                {!isWalkIn && (
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
                )}
            </div>

            {renderAddons(apt)}

            {!isWalkIn && (
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
            )}
            </div>

            <div className="appointment-actions">
            {user.user_type === "client" ? (
                <>
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
                    
                    {canDelete && (
                        <button className="btn btn-danger small-btn" onClick={() => handleDeleteAppointment(apt.id)}>Delete</button>
                    )}
                    
                    </div>
                )}
                </>
            ) : (
                <>
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

                {type === "upcoming" && (apt.status === "scheduled" || apt.status === "completed") && (
                    <div className="status-dropdown-container">
                    <div style={{display:'flex', alignItems:'center', gap:'8px', width:'100%'}}>
                        {actionsDisabled && !isWalkIn && <Clock size={16} color="#94a3b8" title="Available when appointment time reached" />}
                        
                        {isWalkIn && apt.status === 'scheduled' ? (
                            <button 
                                className="btn btn-success small-btn"
                                onClick={() => handleStatusUpdate(apt.id, 'completed')}
                                disabled={updating === apt.id}
                                style={{width: '100%', backgroundColor: '#16a34a', color: 'white', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px'}}
                            >
                                <CheckSquare size={14} /> {updating === apt.id ? 'Updating...' : 'Mark Completed'}
                            </button>
                        ) : (
                            <select
                                value={apt.status}
                                onChange={handleStatusChange} 
                                disabled={updating === apt.id || (actionsDisabled && !isWalkIn)}
                                className={`status-select ${actionsDisabled && !isWalkIn ? 'disabled-select' : ''}`}
                                title={actionsDisabled ? "Actions disabled for future appointments (Enable Test Mode to override)" : ""}
                            >
                                <option value="scheduled">Scheduled</option>
                                <option value="completed">{pending > 0 && !isWalkIn ? "🔒 Completed (Pay Balance First)" : "Completed"}</option>
                                <option value="cancelled">Cancelled</option>
                                <option value="no-show">No Show</option>
                            </select>
                        )}
                    </div>
                    {actionsDisabled && !isWalkIn && <small style={{color:'#94a3b8', fontSize:'11px', marginTop:'4px', display:'block'}}>Action available on date</small>}
                    </div>
                )}

                {type === "history" && (
                    <div className="action-row">
                        {canDelete && (
                            <button className="btn btn-danger small-btn" onClick={() => handleDeleteAppointment(apt.id)}>Delete</button>
                        )}
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

    if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        displayList = displayList.filter(apt => 
            apt.service_name.toLowerCase().includes(term) ||
            (apt.client_name && apt.client_name.toLowerCase().includes(term)) ||
            (apt.provider_name && apt.provider_name.toLowerCase().includes(term)) ||
            (apt.notes && apt.notes.toLowerCase().includes(term))
        );
    }

    displayList.sort((a, b) => {
        const dateA = new Date(a.appointment_date);
        const dateB = new Date(b.appointment_date);
        const priceA = a.total_price || 0;
        const priceB = b.total_price || 0;

        switch (sortOption) {
            case "date-asc": return dateA - dateB; 
            case "date-desc": return dateB - dateA; 
            case "price-desc": return priceB - priceA; 
            case "price-asc": return priceA - priceB; 
            default: return 0;
        }
    });

    if (type === 'history') {
      if (historyFilter === 'completed') displayList = displayList.filter(apt => apt.status === 'completed');
      else if (historyFilter === 'cancelled') displayList = displayList.filter(apt => apt.status === 'cancelled' || apt.status === 'no-show');

      const now = new Date();
      if (dateFilter === 'this_year') {
          displayList = displayList.filter(apt => new Date(apt.appointment_date).getFullYear() === now.getFullYear());
      } else if (dateFilter === 'this_month') {
          displayList = displayList.filter(apt => new Date(apt.appointment_date).getFullYear() === now.getFullYear() && new Date(apt.appointment_date).getMonth() === now.getMonth());
      } else if (dateFilter === 'last_3_months') {
        const d = new Date(); d.setDate(d.getDate() - 90);
        displayList = displayList.filter(apt => new Date(apt.appointment_date) >= d);
      }
    }

    if (type === 'upcoming' && user.user_type === 'provider') {
        const now = new Date();
        const dueAppointments = displayList.filter(apt => new Date(apt.appointment_date) <= now);
        const futureAppointments = displayList.filter(apt => new Date(apt.appointment_date) > now);

        const itemsToDisplay = upcomingSubTab === 'due' ? dueAppointments : futureAppointments;

        return (
            <div className="appointments-split-view">
                <div className="history-filters" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
                    <div className="status-filters">
                        <button 
                            className={`filter-pill ${upcomingSubTab === 'due' ? 'active' : ''}`}
                            onClick={() => setUpcomingSubTab('due')}
                        >
                            <AlertTriangle size={14} style={{marginBottom: '-2px', marginRight: '4px'}}/> Actions Due ({dueAppointments.length})
                        </button>

                        <button 
                            className={`filter-pill ${upcomingSubTab === 'future' ? 'active' : ''}`}
                            onClick={() => setUpcomingSubTab('future')}
                        >
                            <Calendar size={14} style={{marginBottom: '-2px', marginRight: '4px'}}/> Future ({futureAppointments.length})
                        </button>
                    </div>

                    {upcomingSubTab === 'future' && (
                        <label className="dev-mode-toggle" style={{marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748b', cursor:'pointer'}}>
                            <input 
                                type="checkbox" 
                                checked={isDevMode} 
                                onChange={(e) => setIsDevMode(e.target.checked)} 
                            />
                            {isDevMode ? <Unlock size={14} color="#16a34a"/> : <Lock size={14} color="#64748b"/>}
                            Test Mode
                        </label>
                    )}
                </div>

                {itemsToDisplay.length === 0 ? (
                    <div className="no-appointments">
                        {upcomingSubTab === 'due' 
                            ? "✅ You're all caught up! No actions due." 
                            : "No upcoming future appointments."}
                    </div>
                ) : (
                    <div className="appointments-list">
                        {itemsToDisplay.map(apt => renderAppointmentCard(apt, type))}
                    </div>
                )}
            </div>
        );
    }

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
        
        <div className="am-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', marginBottom: '20px' }}>
            <h2 style={{margin: 0, fontSize: '24px', color: '#1e293b'}}>
                {user.user_type === "provider" ? "Manage Appointments" : "My Appointments"}
            </h2>
            
            <div className="am-controls" style={{ display: 'flex', gap: '10px' }}>
                {user.user_type === 'provider' && (
                    <div className="view-toggle-pills" style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
                        <button 
                            className={`pill-btn ${viewMode === 'list' ? 'active' : ''}`} 
                            onClick={() => setViewMode('list')}
                            style={{ padding: '6px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', background: viewMode === 'list' ? 'white' : 'transparent', boxShadow: viewMode === 'list' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', fontSize: '13px' }}
                        >
                            <List size={16} /> List
                        </button>
                        <button 
                            className={`pill-btn ${viewMode === 'calendar' ? 'active' : ''}`} 
                            onClick={() => setViewMode('calendar')}
                            style={{ padding: '6px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', background: viewMode === 'calendar' ? 'white' : 'transparent', boxShadow: viewMode === 'calendar' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', fontSize: '13px' }}
                        >
                            <Calendar size={16} /> Calendar
                        </button>
                    </div>
                )}

                <div className="search-box" style={{ position: 'relative', width: '220px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input 
                        type="text" 
                        placeholder="Search name, service..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%', padding: '8px 10px 8px 32px', border: '1px solid #cbd5e1', 
                            borderRadius: '8px', fontSize: '13px', outline: 'none'
                        }}
                    />
                    {searchTerm && (
                        <X 
                            size={14} 
                            onClick={() => setSearchTerm("")} 
                            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#94a3b8' }} 
                        />
                    )}
                </div>

                <div className="sort-box" style={{ position: 'relative' }}>
                    <ArrowUpDown size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none' }} />
                    <select 
                        value={sortOption} 
                        onChange={(e) => setSortOption(e.target.value)}
                        style={{
                            padding: '8px 30px 8px 32px', border: '1px solid #cbd5e1', borderRadius: '8px',
                            background: 'white', fontSize: '13px', color: '#334155', cursor: 'pointer', appearance: 'none'
                        }}
                    >
                        <option value="date-asc">Date: Earliest</option>
                        <option value="date-desc">Date: Latest</option>
                        <option value="price-desc">Price: High-Low</option>
                        <option value="price-asc">Price: Low-High</option>
                    </select>
                </div>
            </div>
        </div>

        {viewMode === 'calendar' && user.user_type === 'provider' ? (
            <CalendarView user={user} />
        ) : (
            <>
                <div className="tabs">
                  {tabs.map((tab) => {
                    const count = tab === 'history' 
                        ? processedAppointments.history.length 
                        : processedAppointments[tab]?.length;
                        
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
                  {user.user_type === 'provider' && (
                      <button 
                          className="btn-walk-in" 
                          onClick={handleWalkInClick}
                          style={{ marginLeft: 'auto' }}
                      >
                          <UserPlus size={16} /> Walk-In
                      </button>
                  )}
                </div>

                {activeTab === 'history' && (
                  <div className="history-filters" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div className="status-filters">
                      <button className={`filter-pill ${historyFilter === 'all' ? 'active' : ''}`} onClick={() => setHistoryFilter('all')}>All Status</button>
                      <button className={`filter-pill ${historyFilter === 'completed' ? 'active' : ''}`} onClick={() => setHistoryFilter('completed')}>Completed</button>
                      <button className={`filter-pill ${historyFilter === 'cancelled' ? 'active' : ''}`} onClick={() => setHistoryFilter('cancelled')}>Cancelled</button>
                    </div>

                    <div className="date-filter-container" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Calendar size={18} color="#64748b" />
                        <select 
                            value={dateFilter} 
                            onChange={(e) => setDateFilter(e.target.value)}
                            className="date-select"
                            style={{
                                padding: '6px 12px', borderRadius: '20px', border: '1px solid #cbd5e1',
                                backgroundColor: '#fff', fontSize: '0.9rem', cursor: 'pointer', outline: 'none'
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
                  {renderAppointmentsList(processedAppointments[activeTab], activeTab)}
                </div>
            </>
        )}

        {showBooking && (
          <BookingModal
            service={walkInService || rebookService}
            user={user}
            onClose={() => { setShowBooking(false); setWalkInService(null); }}
            onBookingSuccess={handleRebookSuccess}
            isWalkIn={!!walkInService} 
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
            user={user} 
            onClose={() => setSelectedPayment(null)}
          />
        )}

        {showServiceSelector && (
            <div className="modal-overlay" onClick={() => setShowServiceSelector(false)}>
                <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '400px', padding: '20px'}}>
                    <h3 style={{marginTop:0, marginBottom:'15px', color:'#1e293b'}}>Select Service to Block</h3>
                    {loadingServices ? (
                        <p>Loading services...</p>
                    ) : providerServices.length > 0 ? (
                        <div style={{display:'flex', flexDirection:'column', gap:'10px', maxHeight:'300px', overflowY:'auto'}}>
                            {providerServices.map(s => (
                                <button 
                                    key={s.id} 
                                    onClick={() => selectWalkInService(s)}
                                    className="service-select-btn"
                                    style={{
                                        textAlign:'left', padding:'12px', border:'1px solid #e2e8f0', borderRadius:'8px', background:'white', cursor:'pointer',
                                        display:'flex', justifyContent:'space-between', alignItems:'center'
                                    }}
                                >
                                    <span style={{fontWeight:'600', color:'#334155'}}>{s.name}</span>
                                    <span style={{fontSize:'0.85em', color:'#64748b'}}>{s.duration}m</span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p>No services found. Please create a service first.</p>
                    )}
                    <button className="btn btn-secondary" onClick={() => setShowServiceSelector(false)} style={{marginTop:'15px', width:'100%'}}>Cancel</button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}

export default AppointmentManager;