import React, { useState, useEffect } from "react";
import api from "../services/auth";
import { PaystackButton } from "react-paystack";
import "./BookingModal.css";

function BookingModal({ service, user, onClose, onBookingSuccess }) {
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [serviceMeta, setServiceMeta] = useState(service || {});
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [paymentOption, setPaymentOption] = useState("deposit"); // deposit | full | custom
  const [customAmount, setCustomAmount] = useState("");
  const [addons, setAddons] = useState([]);
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [totalPrice, setTotalPrice] = useState(parseFloat(service?.price || 0));
  const [showAddonDropdown, setShowAddonDropdown] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false); // disables pay buttons

  // ---------- Helpers ----------
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

  const formatTimeDisplay = (timeStr) => {
    if (!timeStr) return "";
    const [h, m] = timeStr.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const displayHours = h % 12 || 12;
    return `${displayHours}:${m.toString().padStart(2, "0")} ${period}`;
  };

  const generateTimeSlots = (openingTime = "08:30", closingTime = "18:00", interval = 30) => {
    const slots = [];
    const [openH, openM] = openingTime.split(":").map(Number);
    const [closeH, closeM] = closingTime.split(":").map(Number);

    const openDate = new Date();
    openDate.setHours(openH, openM, 0, 0);
    const closeDate = new Date();
    closeDate.setHours(closeH, closeM, 0, 0);

    for (let time = new Date(openDate); time < closeDate; time.setMinutes(time.getMinutes() + interval)) {
      const hh = time.getHours().toString().padStart(2, "0");
      const mm = time.getMinutes().toString().padStart(2, "0");
      slots.push(`${hh}:${mm}`);
    }
    return slots;
  };

  // ---------- Init / fetch addons ----------
  useEffect(() => {
    if (service) setServiceMeta(service);
    if (service?.id) fetchAddons(service.id);
  }, [service]);

  const fetchAddons = async (serviceId) => {
    try {
      const res = await api.get(`/services/${serviceId}/sub-services`);
      setAddons(res.data.sub_services || []);
    } catch (err) {
      console.error("Error fetching add-ons:", err);
    }
  };

  // Close addon dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest(".addon-dropdown")) {
        setShowAddonDropdown(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // Update total when addons change
  useEffect(() => {
    const addonTotal = selectedAddons.reduce(
      (sum, addon) => sum + Number(addon.price ?? addon.additional_price ?? 0),
      0
    );
    setTotalPrice(Number(service?.price || 0) + addonTotal);
  }, [selectedAddons, service?.price]);

  const handleAddonToggle = (addon, checked) => {
    setSelectedAddons((prev) =>
      checked ? [...prev, addon] : prev.filter((a) => a.id !== addon.id)
    );
  };

  // Fetch provider availability when date selected
  useEffect(() => {
    const fetchAvailability = async () => {
      if (!serviceMeta?.provider_id || !selectedDate) return;
      setLoadingAvailability(true);
      try {
        await api.get(
          `/appointments/providers/${serviceMeta.provider_id}/availability?date=${selectedDate}`
        );
        // setAvailability(res.data); // Logic kept as requested
      } catch (err) {
        console.error("Error fetching provider availability:", err);
      } finally {
        setLoadingAvailability(false);
      }
    };
    fetchAvailability();
  }, [selectedDate, serviceMeta]);

  // ---------- Payment calculations ----------
  const depositPercentage = 0.3;
  const basePrice = Number(serviceMeta?.price || 0);
  const addonsTotal = selectedAddons.reduce(
    (sum, addon) => sum + Number(addon.price ?? addon.additional_price ?? 0),
    0
  );
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

  // ---------- Payment handler using Paystack ----------
  const buildPaystackConfig = (forOption) => {
    const amount = (() => {
      if (forOption === "full") return totalKES * 100;
      if (forOption === "custom") {
        const n = Number(customAmount || 0);
        const resolved = n >= depositKES ? Math.round(n * 100) : depositKES * 100;
        return resolved;
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

          let payment_status =
            paidAmountKES >= totalKES ? "paid" : "deposit-paid";

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

          const newAppointmentId = data?.appointment?.id;

          if (newAppointmentId) {
            await api.put(
              `/appointments/${newAppointmentId}/payment`,
              {
                payment_reference: response.reference,
                payment_amount: paidAmountKES,
                amount_paid: paidAmountKES,
                payment_status: payment_status,
                total_price: totalKES,
              },
              {
                headers: { Authorization: `Bearer ${token}` }
              }
            );

            onBookingSuccess?.();
            onClose?.();
          } else {
            setError("Payment succeeded but booking failed. Contact support.");
          }
        } catch (err) {
          console.error("❌ Error saving appointment:", err);
          setError("Payment succeeded but booking failed. Contact support.");
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

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("Please complete the payment to book.");
  };

  const depositConfig = buildPaystackConfig("deposit");
  const fullConfig = buildPaystackConfig("full");
  const customConfig = buildPaystackConfig("custom");

  const payDisabled = !selectedDate || !selectedTime || processingPayment;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className="modal-header">
          <div>
            <h3>Book {serviceMeta?.name}</h3>
            <span className="subtitle">with {serviceMeta?.provider_name}</span>
          </div>
          <button
            className="close-btn"
            onClick={() => { if (!processingPayment) onClose?.(); }}
            disabled={processingPayment}
          >
            ×
          </button>
        </div>

        {/* BODY */}
        <div className="modal-body">
          {/* Quick Stats */}
          <div className="service-quick-info">
            <div className="info-pill">
              <i className="fa fa-clock-o"></i> ⏱ {serviceMeta?.duration} mins
            </div>
            <div className="info-pill">
              <i className="fa fa-tag"></i> 🏷 KES {serviceMeta?.price}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="booking-form">
            {error && <div className="error-message">⚠️ {error}</div>}

            {/* SECTION 1: TIME & DATE */}
            <div className="form-section">
              <h4 className="section-title">1. Select Date & Time</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    className="styled-input"
                    value={selectedDate}
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      setSelectedTime("");
                    }}
                    min={getMinDate()}
                    max={getMaxDate()}
                  />
                </div>
                <div className="form-group">
                  <label>Time</label>
                  <div className="select-wrapper">
                    <select
                      className="styled-input"
                      value={selectedTime}
                      onChange={(e) => setSelectedTime(e.target.value)}
                      disabled={!selectedDate || loadingAvailability}
                    >
                      <option value="">{loadingAvailability ? "Loading..." : "Choose a time"}</option>
                      {generateTimeSlots(serviceMeta?.provider_opening_time || "08:30", serviceMeta?.provider_closing_time || "18:00", serviceMeta?.slot_interval || 30).map((time) => (
                        <option key={time} value={time}>
                          {formatTimeDisplay(time)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="two-column-layout">
              {/* LEFT COL: CUSTOMIZE */}
              <div className="column left-col">
                <h4 className="section-title">2. Customize Booking</h4>
                
                <div className="form-group relative-container">
                  <label>Add-ons</label>
                  <div className="addon-dropdown">
                    <button
                      type="button"
                      className={`addon-dropdown-toggle ${showAddonDropdown ? 'active' : ''}`}
                      onClick={() => setShowAddonDropdown((p) => !p)}
                    >
                      <span>{selectedAddons.length > 0 ? `${selectedAddons.length} selected` : "Select add-ons..."}</span>
                      <span className="arrow">{showAddonDropdown ? "▲" : "▼"}</span>
                    </button>

                    {showAddonDropdown && (
                      <div className="addon-dropdown-menu">
                        {addons.length ? (
                          <div className="addon-scroll">
                            {addons.map((addon) => {
                              const isChecked = selectedAddons.some((a) => a.id === addon.id);
                              return (
                                <label key={addon.id} className="addon-item">
                                  <div className="addon-check">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => handleAddonToggle(addon, e.target.checked)}
                                    />
                                    <span>{addon.name}</span>
                                  </div>
                                  <span className="addon-price">+KES {addon.price ?? addon.additional_price ?? 0}</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="no-addons">No add-ons available</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    rows="3"
                    className="styled-input textarea"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Allergies, preferences, etc."
                  ></textarea>
                </div>
              </div>

              {/* RIGHT COL: PAYMENT */}
              <div className="column right-col">
                <h4 className="section-title">3. Payment Options</h4>
                <div className="payment-options-box">
                  <label className={`pay-option-card ${paymentOption === "deposit" ? "active" : ""}`}>
                    <input type="radio" name="pay" checked={paymentOption === "deposit"} onChange={() => setPaymentOption("deposit")} />
                    <div className="option-details">
                      <span className="option-title">Pay Deposit</span>
                      <span className="option-price">KES {depositKES.toLocaleString()}</span>
                    </div>
                  </label>

                  <label className={`pay-option-card ${paymentOption === "full" ? "active" : ""}`}>
                    <input type="radio" name="pay" checked={paymentOption === "full"} onChange={() => setPaymentOption("full")} />
                    <div className="option-details">
                      <span className="option-title">Pay Full</span>
                      <span className="option-price">KES {totalKES.toLocaleString()}</span>
                    </div>
                  </label>

                  <label className={`pay-option-card ${paymentOption === "custom" ? "active" : ""}`}>
                    <input type="radio" name="pay" checked={paymentOption === "custom"} onChange={() => setPaymentOption("custom")} />
                    <div className="option-details">
                      <span className="option-title">Custom</span>
                      <span className="option-sub">Min: {depositKES.toLocaleString()}</span>
                    </div>
                  </label>

                  {paymentOption === "custom" && (
                    <div className="custom-amount-wrapper">
                      <span className="currency-prefix">KES</span>
                      <input
                        type="number"
                        min={depositKES}
                        step="50"
                        className="custom-amount-input"
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        placeholder={depositKES}
                      />
                    </div>
                  )}
                </div>

                {/* TOTAL SUMMARY */}
                <div className="price-breakdown">
                  <div className="breakdown-row">
                    <span>Service</span>
                    <span>KES {basePrice.toLocaleString()}</span>
                  </div>
                  {addonsTotal > 0 && (
                    <div className="breakdown-row">
                      <span>Add-ons</span>
                      <span>+ KES {addonsTotal.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="breakdown-total">
                    <span>Total</span>
                    <span>KES {totalPrice.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* FOOTER */}
            <div className="modal-footer">
              <button type="button" className="btn btn-text" onClick={onClose} disabled={processingPayment}>
                Cancel
              </button>

              <div className="pay-btn-wrapper">
                {paymentOption === "deposit" && (
                  <PaystackButton
                    className="btn btn-primary btn-block"
                    {...{ ...depositConfig, text: processingPayment ? "Processing..." : `Pay Deposit (KES ${depositKES.toLocaleString()})` }}
                    disabled={payDisabled}
                  />
                )}
                {paymentOption === "full" && (
                  <PaystackButton
                    className="btn btn-primary btn-block"
                    {...{ ...fullConfig, text: processingPayment ? "Processing..." : `Pay Full (KES ${totalKES.toLocaleString()})` }}
                    disabled={payDisabled}
                  />
                )}
                {paymentOption === "custom" && (
                  <PaystackButton
                    className="btn btn-primary btn-block"
                    {...{ ...customConfig, text: processingPayment ? "Processing..." : `Pay KES ${computeSelectedAmountKES().toLocaleString()}` }}
                    disabled={payDisabled}
                  />
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default BookingModal;