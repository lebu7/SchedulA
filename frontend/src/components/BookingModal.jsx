import React, { useState, useEffect } from "react";
import api from "../services/auth";
import { PaystackButton } from "react-paystack";
import "./BookingModal.css";

function BookingModal({ service, user, onClose, onBookingSuccess }) {
  const [step, setStep] = useState(1);
  
  // Data States
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [slots, setSlots] = useState([]); // Array of { time, available } objects
  const [notes, setNotes] = useState("");
  
  // UI States
  const [error, setError] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [serviceMeta, setServiceMeta] = useState(service || {});
  const [showAddonDropdown, setShowAddonDropdown] = useState(false);
  
  // Payment & Addon States
  const [paymentOption, setPaymentOption] = useState("deposit");
  const [customAmount, setCustomAmount] = useState("");
  const [addons, setAddons] = useState([]);
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [totalPrice, setTotalPrice] = useState(parseFloat(service?.price || 0));
  const [processingPayment, setProcessingPayment] = useState(false);

  // ---------- 1. Availability Logic (Updated for Capacity) ----------

  // Fetch availability when date changes
  useEffect(() => {
    if (selectedDate && serviceMeta?.provider_id) {
      fetchAvailability();
    }
  }, [selectedDate, serviceMeta]);

  const fetchAvailability = async () => {
    setLoadingSlots(true);
    setSlots([]);
    setSelectedTime("");
    setError("");

    try {
      const res = await api.get(`/appointments/providers/${serviceMeta.provider_id}/availability`, {
        params: { date: selectedDate }
      });

      if (res.data.is_closed) {
        setError(`Provider is closed on this day: ${res.data.closed_reason || 'Day off'}`);
      } else {
        // Generate grid using the booked_slots from backend
        generateTimeSlots(
          res.data.opening_time, 
          res.data.closing_time, 
          res.data.booked_slots || [] // Ensure array
        );
      }
    } catch (err) {
      console.error(err);
      setError("Could not load availability.");
    }
    setLoadingSlots(false);
  };

  const generateTimeSlots = (openTime, closeTime, bookedRanges) => {
    const generated = [];
    const [openH, openM] = openTime.split(':').map(Number);
    const [closeH, closeM] = closeTime.split(':').map(Number);
    
    let current = new Date();
    current.setHours(openH, openM, 0, 0);
    
    const end = new Date();
    end.setHours(closeH, closeM, 0, 0);

    const now = new Date(); 
    
    // ✅ Get Capacity from service meta (default to 1 if not set)
    const serviceCapacity = serviceMeta.capacity || 1;

    while (current < end) {
      const timeString = current.toTimeString().slice(0, 5); // "08:00"
      
      // Calculate when this specific service would END if started now
      const slotEndTime = new Date(current.getTime() + (serviceMeta.duration || 30) * 60000);
      const timeStringEnd = slotEndTime.toTimeString().slice(0, 5);

      // ✅ Count overlapping bookings for this slot
      const overlapCount = bookedRanges.filter(booking => {
        return (timeString >= booking.start && timeString < booking.end) || // Starts inside another
               (timeStringEnd > booking.start && timeStringEnd <= booking.end) || // Ends inside another
               (timeString <= booking.start && timeStringEnd >= booking.end); // Envelops another
      }).length;

      // ✅ Disable only if overlaps >= capacity
      const isFull = overlapCount >= serviceCapacity;

      // Check if it's in the past (only relevant for today)
      const isPast = new Date(selectedDate).toDateString() === now.toDateString() && current < now;

      generated.push({
        time: timeString,
        available: !isFull && !isPast
      });

      // Increment by 30 mins (standard slot interval)
      current.setMinutes(current.getMinutes() + 30);
    }
    setSlots(generated);
  };

  // ---------- 2. Addons & Helpers (unchanged) ----------

  useEffect(() => {
    if (service) setServiceMeta(service);
    if (service?.id) fetchAddons(service.id);
  }, [service]);

  const fetchAddons = async (serviceId) => {
    try {
      const res = await api.get(`/services/${serviceId}/sub-services`);
      setAddons(res.data.sub_services || []);
    } catch (err) { console.error("Error fetching add-ons:", err); }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest(".addon-dropdown")) setShowAddonDropdown(false);
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  useEffect(() => {
    const addonTotal = selectedAddons.reduce((sum, a) => sum + Number(a.price ?? a.additional_price ?? 0), 0);
    setTotalPrice(Number(service?.price || 0) + addonTotal);
  }, [selectedAddons, service?.price]);

  const handleAddonToggle = (addon, checked) => {
    setSelectedAddons((prev) => checked ? [...prev, addon] : prev.filter((a) => a.id !== addon.id));
  };

  // ---------- 3. Payment Calculations (unchanged) ----------
  const depositPercentage = 0.3;
  const basePrice = Number(serviceMeta?.price || 0);
  const addonsTotal = selectedAddons.reduce((sum, a) => sum + Number(a.price ?? a.additional_price ?? 0), 0);
  const totalKES = basePrice + addonsTotal;
  const depositKES = Math.round(totalKES * depositPercentage);

  const computeSelectedAmountKES = () => {
    if (paymentOption === "full") return totalKES;
    if (paymentOption === "custom") {
      const entered = Number(customAmount || 0);
      return entered >= depositKES ? Math.round(entered) : depositKES;
    }
    return depositKES;
  };

  // ---------- 4. Paystack Config (unchanged) ----------
  const buildPaystackConfig = (forOption) => {
    const amount = (() => {
      if (forOption === "full") return totalKES * 100;
      if (forOption === "custom") {
        const n = Number(customAmount || 0);
        return (n >= depositKES ? Math.round(n * 100) : depositKES * 100);
      }
      return depositKES * 100;
    })();

    const email = user?.email || "customer@example.com";
    const metadata = {
      name: user?.name,
      service: serviceMeta?.name,
      addons: selectedAddons.map((a) => a.name).join(", ") || "None",
      totalPrice: totalKES,
      selectedDate,
      selectedTime,
      deposit_amount: depositKES,
      addons_total: addonsTotal,
    };

    return {
      email,
      amount,
      currency: "KES",
      metadata,
      publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
      text: `Pay KES ${(amount / 100).toLocaleString()}`,
      onSuccess: async (response) => {
        setProcessingPayment(true);
        setError("");

        try {
          const token = localStorage.getItem("token");
          const appointmentDateTime = new Date(`${selectedDate}T${selectedTime}:00`);
          const paidAmountKES = amount / 100;
          let payment_status = paidAmountKES >= totalKES ? "paid" : "deposit-paid";

          const payload = {
            service_id: serviceMeta.id,
            appointment_date: appointmentDateTime.toISOString(),
            notes: notes.trim(),
            addons: selectedAddons,
            addons_total: addonsTotal,
            total_price: totalKES,
            deposit_amount: depositKES,
            payment_reference: response.reference,
            payment_amount: paidAmountKES,
            amount_paid: paidAmountKES,
            payment_status: payment_status,
          };

          const { data } = await api.post("/appointments", payload, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (data?.appointmentId) {
            await api.put(`/appointments/${data.appointmentId}/payment`, {
                payment_reference: response.reference,
                payment_amount: paidAmountKES,
                amount_paid: paidAmountKES,
                payment_status: payment_status,
                total_price: totalKES,
              }, { headers: { Authorization: `Bearer ${token}` } }
            );
            onBookingSuccess?.();
            onClose?.();
          } else {
            setError("Payment succeeded but booking failed. Contact support.");
          }
        } catch (err) {
          console.error("❌ Error saving appointment:", err);
          setError(err.response?.data?.error || "Booking failed.");
        } finally {
          setProcessingPayment(false);
        }
      },
      onClose: () => {
        setProcessingPayment(false);
        setError("Payment window closed before completing payment.");
      },
    };
  };

  const handleSubmit = (e) => { e.preventDefault(); setError("Please complete the payment to book."); };
  
  const depositConfig = buildPaystackConfig("deposit");
  const fullConfig = buildPaystackConfig("full");
  const customConfig = buildPaystackConfig("custom");
  const payDisabled = !selectedDate || !selectedTime || processingPayment;

  const getMinDate = () => {
    const today = new Date();
    today.setDate(today.getDate() + 1);
    return today.toISOString().split("T")[0];
  };

  const getMaxDate = () => {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    return maxDate.toISOString().split("T")[0];
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content booking-modal" onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className="modal-header">
          <div>
            <h3>Book {serviceMeta?.name}</h3>
            <span className="subtitle">with {serviceMeta?.provider_name}</span>
          </div>
          <button className="close-btn" onClick={() => { if (!processingPayment) onClose?.(); }} disabled={processingPayment}>×</button>
        </div>

        {/* BODY */}
        <div className="modal-body">
          <div className="service-quick-info">
            <div className="info-pill"><i className="fa fa-clock-o"></i> ⏱ {serviceMeta?.duration} mins</div>
            <div className="info-pill"><i className="fa fa-tag"></i> 🏷 KES {serviceMeta?.price}</div>
          </div>

          <form onSubmit={handleSubmit} className="booking-form">
            {error && <div className="error-message">⚠️ {error}</div>}

            {/* STEP 1: DATE & TIME */}
            {step === 1 ? (
              <div className="step-1">
                <div className="form-group">
                  <label>Select Date</label>
                  <input type="date" className="styled-input" value={selectedDate} onChange={(e) => { setSelectedDate(e.target.value); setSelectedTime(""); }} min={getMinDate()} max={getMaxDate()} />
                </div>

                <div className="form-group">
                  <label>Select Time</label>
                  {!selectedDate ? <p className="hint">Please select a date first.</p> : loadingSlots ? <p className="hint">Loading availability...</p> : slots.length === 0 ? <p className="hint error">No slots available on this date.</p> : (
                    <div className="time-grid">
                      {slots.map((slot) => (
                        <button 
                          key={slot.time} 
                          type="button" 
                          className={`time-slot ${selectedTime === slot.time ? 'selected' : ''}`} 
                          disabled={!slot.available} 
                          onClick={() => setSelectedTime(slot.time)}
                        >
                          {slot.time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label>Notes (Optional)</label>
                  <textarea rows="2" className="styled-input textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special requests..." />
                </div>

                <button type="button" className="btn btn-primary btn-block" disabled={!selectedTime} onClick={() => setStep(2)}>Next: Customize & Pay</button>
              </div>
            ) : (
              // STEP 2: ADDONS & PAYMENT
              <div className="step-2">
                <div className="two-column-layout">
                  
                  {/* LEFT: ADDONS */}
                  <div className="column left-col">
                    <h4 className="section-title">2. Add-ons</h4>
                    <div className="form-group relative-container">
                      <div className="addon-dropdown">
                        <button type="button" className={`addon-dropdown-toggle ${showAddonDropdown ? 'active' : ''}`} onClick={() => setShowAddonDropdown((p) => !p)}>
                          <span>{selectedAddons.length > 0 ? `${selectedAddons.length} selected` : "Select add-ons..."}</span>
                          <span className="arrow">{showAddonDropdown ? "▲" : "▼"}</span>
                        </button>
                        {showAddonDropdown && (
                          <div className="addon-dropdown-menu">
                            {addons.length ? (
                              <div className="addon-scroll">
                                {addons.map((addon) => (
                                  <label key={addon.id} className="addon-item">
                                    <div className="addon-check">
                                      <input type="checkbox" checked={selectedAddons.some((a) => a.id === addon.id)} onChange={(e) => handleAddonToggle(addon, e.target.checked)} />
                                      <span>{addon.name}</span>
                                    </div>
                                    <span className="addon-price">+KES {addon.price ?? addon.additional_price ?? 0}</span>
                                  </label>
                                ))}
                              </div>
                            ) : <div className="no-addons">No add-ons available</div>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* RIGHT: PAYMENT */}
                  <div className="column right-col">
                    <h4 className="section-title">3. Payment</h4>
                    <div className="payment-options-box">
                      <label className={`pay-option-card ${paymentOption === "deposit" ? "active" : ""}`}>
                        <input type="radio" name="pay" checked={paymentOption === "deposit"} onChange={() => setPaymentOption("deposit")} />
                        <div className="option-details"><span className="option-title">Deposit</span><span className="option-price">KES {depositKES.toLocaleString()}</span></div>
                      </label>
                      <label className={`pay-option-card ${paymentOption === "full" ? "active" : ""}`}>
                        <input type="radio" name="pay" checked={paymentOption === "full"} onChange={() => setPaymentOption("full")} />
                        <div className="option-details"><span className="option-title">Full</span><span className="option-price">KES {totalKES.toLocaleString()}</span></div>
                      </label>
                      <label className={`pay-option-card ${paymentOption === "custom" ? "active" : ""}`}>
                        <input type="radio" name="pay" checked={paymentOption === "custom"} onChange={() => setPaymentOption("custom")} />
                        <div className="option-details"><span className="option-title">Custom</span><span className="option-sub">Min: {depositKES.toLocaleString()}</span></div>
                      </label>
                      {paymentOption === "custom" && (
                        <div className="custom-amount-wrapper">
                          <span className="currency-prefix">KES</span>
                          <input type="number" min={depositKES} step="50" className="custom-amount-input" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} placeholder={depositKES} />
                        </div>
                      )}
                    </div>
                    <div className="price-breakdown">
                      <div className="breakdown-total"><span>Total</span><span>KES {totalPrice.toLocaleString()}</span></div>
                    </div>
                    
                    {/* ✅ ADDED POLICY TEXT HERE */}
                    <div className="policy-text" style={{ fontSize: '0.85em', color: '#666', marginTop: '10px', lineHeight: '1.4', background: '#f9f9f9', padding: '8px', borderRadius: '4px', borderLeft: '3px solid #007bff' }}>
                      <strong>Policy:</strong> Refunds are processed for cancellations made <em>before</em> the appointment time. The deposit secures your spot; <strong>no-shows are non-refundable</strong>.
                    </div>

                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn btn-text" onClick={() => setStep(1)} disabled={processingPayment}>Back</button>
                  <div className="pay-btn-wrapper">
                    {paymentOption === "deposit" && <PaystackButton className="btn btn-primary btn-block" {...{ ...depositConfig, text: processingPayment ? "Processing..." : `Pay KES ${depositKES.toLocaleString()}` }} disabled={payDisabled} />}
                    {paymentOption === "full" && <PaystackButton className="btn btn-primary btn-block" {...{ ...fullConfig, text: processingPayment ? "Processing..." : `Pay KES ${totalKES.toLocaleString()}` }} disabled={payDisabled} />}
                    {paymentOption === "custom" && <PaystackButton className="btn btn-primary btn-block" {...{ ...customConfig, text: processingPayment ? "Processing..." : `Pay KES ${computeSelectedAmountKES().toLocaleString()}` }} disabled={payDisabled} />}
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

export default BookingModal;