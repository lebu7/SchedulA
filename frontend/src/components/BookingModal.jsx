import React, { useState, useEffect } from "react";
import api from "../services/auth";
import { PaystackButton } from "react-paystack";
import "./BookingModal.css";

function BookingModal({ service, user, onClose, onBookingSuccess, isWalkIn = false }) {
  const [step, setStep] = useState(1);
  
  // Data States
  const [selectedDate, setSelectedDate] = useState(isWalkIn ? new Date().toISOString().split("T")[0] : "");
  const [selectedTime, setSelectedTime] = useState("");
  const [slots, setSlots] = useState([]); 
  const [notes, setNotes] = useState("");
  
  // ✅ NEW: Walk-In Client Name State
  const [walkInName, setWalkInName] = useState("");

  // UI States
  const [error, setError] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [processingBooking, setProcessingBooking] = useState(false);
  
  // Initialize serviceMeta. 
  const [serviceMeta, setServiceMeta] = useState(service || {});
  const [showAddonDropdown, setShowAddonDropdown] = useState(false);
  
  // Payment & Addon States
  const [paymentOption, setPaymentOption] = useState("deposit");
  const [customAmount, setCustomAmount] = useState("");
  const [addons, setAddons] = useState([]);
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [totalPrice, setTotalPrice] = useState(parseFloat(service?.price || 0));
  const [processingPayment, setProcessingPayment] = useState(false);

  // Walk-In Payment States
  const [walkInAmount, setWalkInAmount] = useState(service?.price || "");
  const [paymentMethod, setPaymentMethod] = useState("Cash");

  const realServiceId = serviceMeta.service_id || serviceMeta.id;

  // ✅ 0. FETCH FULL SERVICE DETAILS
  useEffect(() => {
    const fetchServiceDetails = async () => {
      if (service.service_id) {
        try {
          const res = await api.get(`/services/${service.service_id}`);
          setServiceMeta(prev => ({ 
            ...prev, 
            ...res.data, 
            provider_id: res.data.provider_id || prev.provider_id 
          }));
          if (isWalkIn && !walkInAmount) setWalkInAmount(res.data.price);
        } catch (err) {
          console.error("Failed to fetch service details", err);
        }
      }
    };
    
    if (service) {
      setServiceMeta(service);
      fetchServiceDetails();
    }
    
    if (realServiceId) fetchAddons(realServiceId);
  }, [service, realServiceId]);


  // ---------- 1. Availability Logic ----------

  const handleDateChange = async (dateValue) => {
    setError("");
    setSelectedTime("");
    setSlots([]);

    if (!dateValue) {
      setSelectedDate("");
      return;
    }

    const dateObj = new Date(dateValue);
    const dayOfWeek = dateObj.getDay(); 

    try {
      const providerRes = await api.get(`/auth/public-profile/${serviceMeta.provider_id}`);
      const providerSettings = providerRes.data.provider;

      const isSatClosed = dayOfWeek === 6 && !providerSettings.is_open_sat;
      const isSunClosed = dayOfWeek === 0 && !providerSettings.is_open_sun;

      if (isSatClosed || isSunClosed) {
        const dayName = dayOfWeek === 6 ? "Saturdays" : "Sundays";
        setError(`This provider is closed on ${dayName}. Please pick another date.`);
        setSelectedDate(""); 
        return;
      }

      setSelectedDate(dateValue);
    } catch (err) {
      console.error("Error validating date:", err);
      setSelectedDate(dateValue);
    }
  };

  useEffect(() => {
    if (selectedDate && serviceMeta?.provider_id) {
      fetchAvailability();
    }
  }, [selectedDate, serviceMeta]);

  const fetchAvailability = async () => {
    setLoadingSlots(true);
    setSlots([]);
    setSelectedTime("");
    
    try {
      const [availabilityRes, userRes] = await Promise.all([
        api.get(`/appointments/providers/${serviceMeta.provider_id}/availability`, {
          params: { date: selectedDate }
        }),
        api.get('/appointments')
      ]);

      const availabilityData = availabilityRes.data;
      
      const userAppsObj = userRes.data.appointments || {};
      const allUserActiveApps = [
        ...(userAppsObj.pending || []),
        ...(userAppsObj.scheduled || []),
        ...(userAppsObj.upcoming || [])
      ];

      const myBookingsForThisService = allUserActiveApps.filter(apt => {
        const aptDate = new Date(apt.appointment_date).toDateString();
        const selDate = new Date(selectedDate).toDateString();
        return aptDate === selDate && apt.service_id === realServiceId;
      });

      if (availabilityData.is_closed) {
        setError(`Provider is closed on this day: ${availabilityData.closed_reason || 'Day off'}`);
      } else {
        generateTimeSlots(
          availabilityData.opening_time, 
          availabilityData.closing_time, 
          availabilityData.booked_slots || [], 
          myBookingsForThisService 
        );
      }
    } catch (err) {
      console.error(err);
      setError("Could not load availability.");
    }
    setLoadingSlots(false);
  };

  const generateTimeSlots = (openTime, closeTime, bookedRanges, myBookings) => {
    const generated = [];
    if (!openTime || !closeTime) return;

    const [openH, openM] = openTime.split(':').map(Number);
    const [closeH, closeM] = closeTime.split(':').map(Number);
    
    let current = new Date(selectedDate); // Base current on selected date
    current.setHours(openH, openM, 0, 0);
    
    const end = new Date(selectedDate);
    end.setHours(closeH, closeM, 0, 0);

    const now = new Date(); 
    const serviceCapacity = serviceMeta.capacity || 1;
    const duration = serviceMeta.duration || 30;

    while (current < end) {
      const timeString = current.toTimeString().slice(0, 5);
      
      const slotEndTime = new Date(current.getTime() + duration * 60000);
      const timeStringEnd = slotEndTime.toTimeString().slice(0, 5);

      const overlapCount = bookedRanges.filter(booking => {
        return (timeString >= booking.start && timeString < booking.end) || 
               (timeStringEnd > booking.start && timeStringEnd <= booking.end) || 
               (timeString <= booking.start && timeStringEnd >= booking.end); 
      }).length;

      const isBookedByMe = user.user_type === 'client' && !isWalkIn && myBookings.some(myAppt => {
        const myTime = new Date(myAppt.appointment_date).toTimeString().slice(0, 5);
        return myTime === timeString;
      });

      const isFull = overlapCount >= serviceCapacity;
      
      // ✅ Dynamic Past Logic: Disable slot if it's today and time has passed
      let isPast = false;
      const isToday = new Date(selectedDate).toDateString() === now.toDateString();
      
      if (isToday) {
         // Slot is past if its start time is before current time
         isPast = current.getTime() < now.getTime();
      }

      generated.push({
        time: timeString,
        available: !isFull && !isPast && !isBookedByMe,
        status: isBookedByMe ? "booked" : (isFull ? "full" : "open")
      });

      current.setMinutes(current.getMinutes() + 30);
    }
    setSlots(generated);
  };

  // ---------- 2. Addons & Helpers ----------

  const fetchAddons = async (sId) => {
    try {
      const res = await api.get(`/services/${sId}/sub-services`);
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
    setTotalPrice(Number(serviceMeta?.price || 0) + addonTotal);
  }, [selectedAddons, serviceMeta?.price]);

  const handleAddonToggle = (addon, checked) => {
    setSelectedAddons((prev) => checked ? [...prev, addon] : prev.filter((a) => a.id !== addon.id));
  };

  // ---------- 3. WALK-IN SUBMIT LOGIC ----------
  const handleWalkInSubmit = async () => {
    if (!selectedDate || !selectedTime) return;
    if (!walkInName.trim()) {
        setError("Please enter a client name for this walk-in.");
        return;
    }

    setProcessingBooking(true);
    
    try {
      const appointmentDateTime = new Date(`${selectedDate}T${selectedTime}:00`);
      
      // ✅ Combine Client Name into Notes for storage
      // Format: "Walk-In Client: [Name] | [Other Notes]"
      const combinedNotes = `Walk-In Client: ${walkInName} | ${notes.trim()}`;

      const payload = {
        service_id: realServiceId,
        appointment_date: appointmentDateTime.toISOString(),
        notes: combinedNotes, // Save name in notes
        client_name: walkInName, // Also send as field (in case backend supports it)
        addons: selectedAddons,
        is_walk_in: true, 
        payment_reference: `WALK-IN-${paymentMethod.toUpperCase()}-${Date.now()}`, 
        payment_amount: Number(walkInAmount)
      };

      await api.post("/appointments", payload);
      alert("✅ Walk-in recorded & time blocked!");
      onBookingSuccess?.();
      onClose?.();
    } catch (err) {
      console.error("❌ Walk-in failed:", err);
      setError(err.response?.data?.error || "Failed to block slot.");
    } finally {
      setProcessingBooking(false);
    }
  };

  // ---------- 4. Regular Payment Config ----------
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
          const appointmentDateTime = new Date(`${selectedDate}T${selectedTime}:00`);
          const paidAmountKES = amount / 100;
          let payment_status = paidAmountKES >= totalKES ? "paid" : "deposit-paid";

          const payload = {
            service_id: realServiceId, 
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

          const { data } = await api.post("/appointments", payload);

          if (data?.appointmentId) {
            await api.put(`/appointments/${data.appointmentId}/payment`, {
                payment_reference: response.reference,
                payment_amount: paidAmountKES,
                amount_paid: paidAmountKES,
                payment_status: payment_status,
                total_price: totalKES,
              });
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
    // ✅ Enabled same-day booking by returning today
    return new Date().toISOString().split("T")[0];
  };

  const getMaxDate = () => {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    return maxDate.toISOString().split("T")[0];
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content booking-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{isWalkIn ? "Record Walk-In" : `Book ${serviceMeta?.name}`}</h3>
            <span className="subtitle">{isWalkIn ? "Blocks 1 slot & records revenue" : `with ${serviceMeta?.provider_name}`}</span>
          </div>
          <button className="close-btn" onClick={() => { if (!processingPayment && !processingBooking) onClose?.(); }} disabled={processingPayment || processingBooking}>×</button>
        </div>

        <div className="modal-body">
          <div className="service-quick-info">
            <div className="info-pill"><i className="fa fa-clock-o"></i> ⏱ {serviceMeta?.duration} mins</div>
            <div className="info-pill"><i className="fa fa-tag"></i> 🏷 KES {serviceMeta?.price}</div>
          </div>

          <form onSubmit={handleSubmit} className="booking-form">
            {error && <div className="error-message">⚠️ {error}</div>}

            {step === 1 ? (
              <div className="step-1">
                <div className="form-group">
                  <label>Select Date</label>
                  <input 
                    type="date" 
                    className="styled-input" 
                    value={selectedDate} 
                    onChange={(e) => handleDateChange(e.target.value)} 
                    min={getMinDate()} 
                    max={getMaxDate()}
                    readOnly={isWalkIn} 
                    style={isWalkIn ? {backgroundColor: '#f1f5f9', cursor: 'not-allowed'} : {}}
                  />
                  {isWalkIn && <small style={{color: '#64748b', fontSize: '11px'}}>Walk-ins are recorded for today.</small>}
                </div>

                <div className="form-group">
                  <label>Select Time</label>
                  {!selectedDate ? <p className="hint">Please select a date first.</p> : loadingSlots ? <p className="hint">Loading availability...</p> : slots.length === 0 ? <p className="hint error">{error || "No slots available."}</p> : (
                    <div className="time-grid">
                      {slots.map((slot) => (
                        <button 
                          key={slot.time} 
                          type="button" 
                          className={`time-slot ${selectedTime === slot.time ? 'selected' : ''}`} 
                          disabled={!slot.available} 
                          onClick={() => setSelectedTime(slot.time)}
                        >
                          {slot.status === 'booked' ? 'Booked' : slot.time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {isWalkIn && (
                  <div className="walk-in-payment-section" style={{background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px'}}>
                    
                    {/* ✅ NEW: Walk-In Client Name Input */}
                    <div className="form-group">
                        <label style={{fontSize: '0.85em', color:'#2563eb', fontWeight:'600'}}>Client Name (Required)</label>
                        <input 
                            type="text" 
                            className="styled-input" 
                            value={walkInName} 
                            onChange={(e) => setWalkInName(e.target.value)} 
                            placeholder="e.g. John Doe"
                            style={{borderColor: '#93c5fd'}}
                        />
                    </div>

                    <h4 style={{fontSize: '0.9em', color: '#1e293b', marginBottom: '10px', marginTop: '10px'}}>💰 Record Payment</h4>
                    <div className="form-group">
                        <label style={{fontSize: '0.85em'}}>Amount Collected (KES)</label>
                        <input 
                            type="number" 
                            className="styled-input" 
                            value={walkInAmount} 
                            onChange={(e) => setWalkInAmount(e.target.value)} 
                            placeholder={serviceMeta?.price}
                        />
                    </div>
                    <div className="form-group">
                        <label style={{fontSize: '0.85em'}}>Payment Method</label>
                        <select 
                            className="styled-input" 
                            value={paymentMethod} 
                            onChange={(e) => setPaymentMethod(e.target.value)}
                        >
                            <option value="Cash">Cash</option>
                            <option value="M-Pesa">M-Pesa</option>
                            <option value="Card">Card</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label>Notes ({isWalkIn ? "Additional Details" : "Optional"})</label>
                  <textarea rows="2" className="styled-input textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special requests..." />
                </div>

                {isWalkIn ? (
                    <button 
                        type="button" 
                        className="btn btn-primary btn-block" 
                        disabled={!selectedTime || processingBooking || !walkInAmount || !walkInName} 
                        onClick={handleWalkInSubmit}
                        style={{backgroundColor: '#16a34a'}} 
                    >
                        {processingBooking ? "Processing..." : "Confirm & Record Payment"}
                    </button>
                ) : (
                    <button type="button" className="btn btn-primary btn-block" disabled={!selectedTime} onClick={() => setStep(2)}>Customize & Pay</button>
                )}
              </div>
            ) : (
              <div className="step-2">
                {/* Step 2 Content (Unchanged) */}
                <div className="two-column-layout">
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
                    
                    <div className="policy-text" style={{ fontSize: '0.85em', color: '#666', marginTop: '10px', lineHeight: '1.4', background: '#f9f9f9', padding: '8px', borderRadius: '4px', borderLeft: '3px solid #007bff' }}>
                      <strong>Policy:</strong> Refunds are processed for cancellations made <em>before</em> the appointment time. The deposit secures your spot; <strong>no-shows are non-refundable</strong>.
                    </div>

                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn btn-text" onClick={() => setStep(1)} disabled={processingPayment}>Back</button>
                  <div className="pay-btn-wrapper">
                    {paymentOption === "deposit" && <PaystackButton className="btn btn-primary btn-block" {...{ ...depositConfig, text: processingPayment ? "Processing..." : `Pay KES ${depositKES.toLocaleString()}` }} disabled={payDisabled} />}
                    {fullConfig.publicKey && paymentOption === "full" && <PaystackButton className="btn btn-primary btn-block" {...{ ...fullConfig, text: processingPayment ? "Processing..." : `Pay KES ${totalKES.toLocaleString()}` }} disabled={payDisabled} />}
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