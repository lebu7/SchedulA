import React, { useState, useEffect } from "react";
import api from "../services/auth";
import { PaystackButton } from "react-paystack";
import "./BookingModal.css";

function BookingModal({ service, user, onClose, onBookingSuccess }) {
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [notes, setNotes] = useState("");
  const [booking, setBooking] = useState(false); // general booking flag (not used for payment)
  const [error, setError] = useState("");
  const [serviceMeta, setServiceMeta] = useState(service || {});
  const [availability, setAvailability] = useState(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
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
        const res = await api.get(
          `/appointments/providers/${serviceMeta.provider_id}/availability?date=${selectedDate}`
        );
        setAvailability(res.data);
      } catch (err) {
        console.error("Error fetching provider availability:", err);
        setAvailability(null);
      } finally {
        setLoadingAvailability(false);
      }
    };
    fetchAvailability();
  }, [selectedDate, serviceMeta, refreshKey]);

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

  const computeSelectedAmountPaystack = () => {
    return computeSelectedAmountKES() * 100; // Paystack expects amount in "kobo" (×100)
  };

  // ---------- Payment handler using react-paystack's PaystackButton (old method) ----------
  // We'll create paystack props dynamically based on chosen option.
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
      text: `Pay KES ${(amount / 100).toFixed(2)}`,
      onSuccess: async (response) => {
        setProcessingPayment(true);
        setError("");

        try {
          const token = localStorage.getItem("token"); // <--- FIX ADDED

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
            headers: { Authorization: `Bearer ${token}` }   // <--- REQUIRED FIX
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
                headers: { Authorization: `Bearer ${token}` } // <--- REQUIRED FIX
              }
            );

            onBookingSuccess?.();
            onClose?.();
          } else {
            setError(
              "Payment succeeded but saving the booking failed. Contact support with your reference."
            );
          }
        } catch (err) {
          console.error("❌ Error saving appointment after payment:", err);
          setError(
            "Payment succeeded but saving the booking failed. Contact support with your reference."
          );
        } finally {
          setProcessingPayment(false);
        }
      },
      onClose: () => {
        // Payment window closed before completion
        setProcessingPayment(false);
        setError("Payment window closed before completing payment.");
      },
    };
  };

  // ---------- UI actions ----------
  const handlePayDepositClick = () => {
    setPaymentOption("deposit");
    setProcessingPayment(true);
    // PaystackButton will open when rendered and clicked — but to reuse react-paystack we render two PaystackButton components.
    // We don't need extra logic here; clicking the deposit PaystackButton triggers onSuccess/onClose.
  };

  const handlePayFullClick = () => {
    setPaymentOption("full");
    setProcessingPayment(true);
  };

  const handlePayCustomClick = () => {
    setPaymentOption("custom");
    setProcessingPayment(true);
  };

  // Prevent the native form submission (we require payment)
  const handleSubmit = (e) => {
    e.preventDefault();
    setError("Please pay to complete booking (deposit or full).");
  };

  // ---------- Render ----------
  // We will render three PaystackButton components but show/hide labels & disabled states accordingly.
  // The PaystackButton requires a config prop object; react-paystack accepts props directly.

  // Build configs for deposit, full, custom:
  const depositConfig = buildPaystackConfig("deposit");
  const fullConfig = buildPaystackConfig("full");
  const customConfig = buildPaystackConfig("custom");

  // Ensure pay buttons are disabled until date/time chosen
  const payDisabled = !selectedDate || !selectedTime || processingPayment;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Book {serviceMeta?.name}</h3>
          <button
            className="close-btn"
            onClick={() => {
              if (!processingPayment) onClose?.();
            }}
            disabled={processingPayment}
          >
            ×
          </button>
        </div>

        <div className="service-info">
          <div className="service-detail">
            <span className="detail-label">Provider:</span>
            <span className="detail-value">{serviceMeta?.provider_name}</span>
          </div>
          <div className="service-detail">
            <span className="detail-label">Duration:</span>
            <span className="detail-value">{serviceMeta?.duration} minutes</span>
          </div>
          <div className="service-detail">
            <span className="detail-label">Base Price:</span>
            <span className="detail-value">KES {serviceMeta?.price}</span>
          </div>

          <div className="appointment-preview compact">
            <h4>Booking Summary</h4>
            <div className="preview-details">
              <div className="preview-item">
                <span className="preview-label">Base:</span>
                <span className="preview-value">KES {serviceMeta?.price}</span>
              </div>
              {selectedAddons.map((a) => (
                <div key={a.id} className="preview-item addon-line">
                  <span className="preview-label">+ {a.name}</span>
                  <span className="preview-value">KES {a.price ?? a.additional_price ?? 0}</span>
                </div>
              ))}
              <div className="preview-item total">
                <span className="preview-label">Total:</span>
                <span className="preview-value">KES {totalPrice}</span>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="booking-form">
          {error && <div className="error-message">⚠️ {error}</div>}

          {/* DATE & TIME */}
          <div className="form-row">
            <div className="form-group">
              <label>Select Date *</label>
              <input
                type="date"
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
              <label>Select Time *</label>
              <select value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)}>
                <option value="">Choose a time</option>
                {generateTimeSlots(serviceMeta?.provider_opening_time || "08:30", serviceMeta?.provider_closing_time || "18:00", serviceMeta?.slot_interval || 30).map((time) => (
                  <option key={time} value={time}>
                    {formatTimeDisplay(time)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ADDONS + PAYMENT SIDE-BY-SIDE */}
          <div className="two-column-section">
            <div className="addons-box">
              <label>Select Add-ons *</label>
              <div className="addon-dropdown">
                <button
                  type="button"
                  className="addon-dropdown-toggle"
                  onClick={() => setShowAddonDropdown((p) => !p)}
                >
                  {selectedAddons.length > 0 ? `${selectedAddons.length} selected` : "Choose add-ons"}
                  <i className={`fa fa-chevron-${showAddonDropdown ? "up" : "down"}`}></i>
                </button>

                {showAddonDropdown && (
                  <div className="addon-dropdown-menu">
                    {addons.length ? (
                      <div className="addon-scroll">
                        {addons.map((addon) => {
                          const isChecked = selectedAddons.some((a) => a.id === addon.id);
                          return (
                            <label key={addon.id} className="addon-item">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => handleAddonToggle(addon, e.target.checked)}
                              />
                              <span>{addon.name}</span>
                              <span className="addon-price">+KES {addon.price ?? addon.additional_price ?? 0}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="no-addons">No add-ons available</p>
                    )}
                  </div>
                )}
              </div>

              <label className="notes-label">Additional Notes</label>
              <textarea
                rows="3"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special requirements..."
              ></textarea>
            </div>

            <div className="payment-box">
              <h4>Payment Options</h4>

              <label className="pay-option">
                <input type="radio" name="pay" checked={paymentOption === "deposit"} onChange={() => setPaymentOption("deposit")} />
                Pay Deposit (KES {depositKES})
              </label>

              <label className="pay-option">
                <input type="radio" name="pay" checked={paymentOption === "full"} onChange={() => setPaymentOption("full")} />
                Pay Full (KES {totalKES})
              </label>

              <label className="pay-option custom-option">
                <input type="radio" name="pay" checked={paymentOption === "custom"} onChange={() => setPaymentOption("custom")} />
                Custom Amount (min KES {depositKES})
              </label>

              {paymentOption === "custom" && (
                <input
                  type="number"
                  min={depositKES}
                  step="50"
                  className="custom-input"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                />
              )}

              <div className="summary-box">
                <div className="summary-row">
                  <span>Total Price:</span>
                  <strong>KES {totalPrice}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* ACTIONS: Cancel + Pay buttons (PaystackButton components) */}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={processingPayment}>
              Cancel
            </button>

            {/* Deposit Paystack button */}
            <div style={{ display: paymentOption === "deposit" ? "inline-block" : "none" }}>
              <PaystackButton
                className="btn btn-primary"
                {...{
                  ...depositConfig,
                  text: processingPayment ? "Processing..." : `Pay Deposit (KES ${depositKES})`,
                  onSuccess: depositConfig.onSuccess,
                  onClose: depositConfig.onClose,
                }}
                disabled={payDisabled}
              />
            </div>

            {/* Full Paystack button */}
            <div style={{ display: paymentOption === "full" ? "inline-block" : "none" }}>
              <PaystackButton
                className="btn btn-primary"
                {...{
                  ...fullConfig,
                  text: processingPayment ? "Processing..." : `Pay Full (KES ${totalKES})`,
                  onSuccess: fullConfig.onSuccess,
                  onClose: fullConfig.onClose,
                }}
                disabled={payDisabled}
              />
            </div>

            {/* Custom Paystack button */}
            <div style={{ display: paymentOption === "custom" ? "inline-block" : "none" }}>
              <PaystackButton
                className="btn btn-primary"
                {...{
                  ...customConfig,
                  text: processingPayment ? "Processing..." : `Pay (KES ${computeSelectedAmountKES()})`,
                  onSuccess: customConfig.onSuccess,
                  onClose: customConfig.onClose,
                }}
                disabled={payDisabled}
              />
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default BookingModal;
