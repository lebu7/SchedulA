import React, { useState, useEffect } from "react";
import api from "../services/auth";
import { PaystackButton } from "react-paystack";
import "./BookingModal.css";

function BookingModal({ service, user, onClose, onBookingSuccess }) {
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [notes, setNotes] = useState("");
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState("");
  const [serviceMeta, setServiceMeta] = useState(service || {});
  const [availability, setAvailability] = useState(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [paymentOption, setPaymentOption] = useState("deposit");
  const [customAmount, setCustomAmount] = useState("");
  const [addons, setAddons] = useState([]);
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [totalPrice, setTotalPrice] = useState(parseFloat(service.price || 0));
  const [showAddonDropdown, setShowAddonDropdown] = useState(false);

  useEffect(() => {
    if (service) setServiceMeta(service);
    fetchAddons(service.id);
  }, [service]);

  const fetchAddons = async (serviceId) => {
    try {
      const res = await api.get(`/services/${serviceId}/sub-services`);
      setAddons(res.data.sub_services || []);
    } catch (err) {
      console.error("Error fetching add-ons:", err);
    }
  };

  //Close addon dropdown
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
      (sum, addon) =>
        sum + parseFloat(addon.price || addon.additional_price || 0),
      0
    );
    setTotalPrice(parseFloat(service.price) + addonTotal);
  }, [selectedAddons, service.price]);

  const handleAddonToggle = (addon, checked) => {
    setSelectedAddons((prev) =>
      checked ? [...prev, addon] : prev.filter((a) => a.id !== addon.id)
    );
  };

  // Generate time slots between opening and closing times
const generateTimeSlots = (openingTime, closingTime, interval = 30) => {
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

  // Availability fetch
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

  const formatTimeDisplay = (timeStr) => {
    const [h, m] = timeStr.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const displayHours = h % 12 || 12;
    return `${displayHours}:${m.toString().padStart(2, "0")} ${period}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (addons.length > 0 && selectedAddons.length === 0) {
      setError("Please select at least one add-on service.");
      return;
    }
    if (!selectedDate || !selectedTime) {
      setError("Please select both date and time");
      return;
    }
    if (availability?.is_closed) {
      setError("Provider is closed on this date.");
      return;
    }

    const appointmentDateTime = new Date(`${selectedDate}T${selectedTime}:00`);
    const now = new Date();
    if (appointmentDateTime <= now) {
      setError("Please select a future date and time");
      return;
    }

    setBooking(true);
    setError("");

    try {
      const payload = {
        service_id: serviceMeta.id,
        appointment_date: appointmentDateTime.toISOString(),
        notes: notes.trim(),
        addons: selectedAddons.map((a) => a.id),
      };

      await api.post("/appointments", payload);
      onBookingSuccess?.();
      onClose?.();
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      console.error("Booking error:", err);
      const msg = err.response?.data?.error || "Failed to book appointment.";
      setError(msg);
    } finally {
      setBooking(false);
    }
  };

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

  const isClosed = availability?.is_closed;
  const isGloballyClosed = serviceMeta?.is_closed && !availability;
  const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY; // ✅ fix for Vite (no 'process' error)
  const email = user?.email || "customer@example.com"; // fallback if user object lacks email

  // 💰 Payment calculations
  const depositPercentage = 0.3; // 30% deposit
  const fullAmount = totalPrice * 100; // Paystack uses kobo (KES * 100)
  const depositAmount = Math.floor(fullAmount * depositPercentage);

  // ✅ compute payment amount based on selected option
  const selectedPaymentAmount = (() => {
    if (paymentOption === "full") return fullAmount;
    if (paymentOption === "custom") {
      const entered = parseFloat(customAmount || 0) * 100;
      return entered >= depositAmount ? entered : depositAmount; // must be ≥ deposit
    }
    return depositAmount; // default = deposit
  })();

  const paystackProps = {
    email,
    amount: depositAmount,
    currency: "KES",
    metadata: {
      name: user?.name,
      service: serviceMeta.name,
    },
    publicKey,
    text: `Pay Deposit (KES ${(depositAmount / 100).toFixed(2)})`,
    onSuccess: (response) => handlePaymentSuccess(response),
    onClose: () => setError("Payment window closed before completing payment."),
  };

    const handlePaymentSuccess = async (response) => {
      console.log("✅ Payment successful:", response);
      setError("");

      try {
        // Continue with booking after successful payment
        const appointmentDateTime = new Date(`${selectedDate}T${selectedTime}:00`);
        const payload = {
          service_id: serviceMeta.id,
          appointment_date: appointmentDateTime.toISOString(),
          notes: notes.trim(),
          addons: selectedAddons.map((a) => a.id),
          payment_reference: response.reference, // store Paystack reference
        };

        await api.post("/appointments", payload);
        onBookingSuccess?.();
        onClose?.();
      } catch (err) {
        console.error("Booking after payment failed:", err);
        setError("Payment was successful, but booking failed. Please contact support.");
      }
    };


  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Book {serviceMeta.name}</h3>
          <button className="close-btn" onClick={onClose} disabled={booking}>
            ×
          </button>
        </div>

        <div className="service-info">
          <div className="service-detail">
            <span className="detail-label">Provider:</span>
            <span className="detail-value">{serviceMeta.provider_name}</span>
          </div>
          <div className="service-detail">
            <span className="detail-label">Duration:</span>
            <span className="detail-value">{serviceMeta.duration} minutes</span>
          </div>
          <div className="service-detail">
            <span className="detail-label">Base Price:</span>
            <span className="detail-value">KES {serviceMeta.price}</span>
          </div>

          <div className="appointment-preview compact">
            <h4>Booking Summary</h4>
            <div className="preview-details">
              <div className="preview-item">
                <span className="preview-label">Base:</span>
                <span className="preview-value">KES {serviceMeta.price}</span>
              </div>
              {selectedAddons.map((a) => (
                <div key={a.id} className="preview-item addon-line">
                  <span className="preview-label">+ {a.name}</span>
                  <span className="preview-value">
                    KES {a.price ?? a.additional_price}
                  </span>
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
              <select
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
              >
                <option value="">Choose a time</option>
                {generateTimeSlots(
                  serviceMeta.provider_opening_time || "08:30",
                  serviceMeta.provider_closing_time || "18:00",
                  serviceMeta.slot_interval || 30
                ).map((time) => (
                  <option key={time} value={time}>
                    {formatTimeDisplay(time)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ADDON DROPDOWN */}
          <div className="form-group">
            <label>Select Add-ons *</label>
            <div className="addon-dropdown">
              <button
                type="button"
                className="addon-dropdown-toggle"
                onClick={() => setShowAddonDropdown((prev) => !prev)}
              >
                {selectedAddons.length > 0
                  ? `${selectedAddons.length} selected`
                  : "Choose add-ons"}{" "}
                <i className={`fa fa-chevron-${showAddonDropdown ? "up" : "down"}`}></i>
              </button>

              {showAddonDropdown && (
                <div className="addon-dropdown-menu">
                  {addons.length ? (
                    <div className="addon-scroll">
                      {addons.map((addon) => {
                        const isChecked = selectedAddons.some(
                          (a) => a.id === addon.id
                        );
                        return (
                          <label key={addon.id} className="addon-item">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) =>
                                handleAddonToggle(addon, e.target.checked)
                              }
                            />
                            <span>{addon.name}</span>
                            <span className="addon-price">
                              +KES {addon.price ?? addon.additional_price}
                            </span>
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
          </div>

          {/* NOTES */}
          <div className="form-group full-width">
            <label>Additional Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows="2"
              maxLength="200"
              placeholder="Any special requirements..."
            />
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>

            {/* Show Paystack button only when date & time selected */}
            {selectedDate && selectedTime ? (
              <PaystackButton className="btn btn-primary" {...paystackProps} />
            ) : (
              <button className="btn btn-primary" disabled>
                Select Date & Time to Pay
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default BookingModal;
