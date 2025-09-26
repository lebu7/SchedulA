import React, { useState, useEffect } from "react";
import { servicesAPI } from "../services/api";
import ProviderProfile from "./ProviderProfile";
import "./ServiceManager.css";

function ServiceManager({ user }) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  // viewing provider
  const [viewingProviderId, setViewingProviderId] = useState(null);
  // booking dialog for quick book from list (client)
  const [showBooking, setShowBooking] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [bookingDate, setBookingDate] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async (q = "") => {
    try {
      setLoading(true);
      const params = {};
      if (q) params.q = q;
      const res = await servicesAPI.list(params);
      setServices(res.data || []);
    } catch (err) {
      console.error("Failed to load services", err);
    } finally {
      setLoading(false);
    }
  };

  // live search: call backend if you want server-side search, or filter client-side
  useEffect(() => {
    const term = searchTerm.trim();
    if (term === "") {
      loadServices();
      return;
    }
    // Debounce simple: wait 250ms after last keystroke
    const t = setTimeout(() => loadServices(term), 250);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this service?")) return;
    try {
      await servicesAPI.remove(id);
      await loadServices(searchTerm);
    } catch (err) {
      console.error("Delete failed", err);
      alert("Failed to delete service");
    }
  };

  const handleEdit = async (service) => {
    // simple inline edit prompts (you can replace with modal later)
    const name = prompt("Service name:", service.name);
    if (name === null) return;
    const description = prompt("Description:", service.description || "");
    if (description === null) return;
    const duration = prompt("Duration (minutes):", service.duration_minutes || 60);
    if (duration === null) return;
    const price = prompt("Price (KES):", service.price ?? 0);
    if (price === null) return;
    const category = prompt("Category:", service.category || "other");
    if (category === null) return;

    try {
      await servicesAPI.update(service.id, {
        name,
        description,
        duration_minutes: parseInt(duration, 10) || 60,
        price: Number(price) || 0,
        category,
      });
      await loadServices(searchTerm);
    } catch (err) {
      console.error("Update failed", err);
      alert("Failed to update service");
    }
  };

  const openProvider = (providerId) => {
    setViewingProviderId(providerId);
  };

  const closeProvider = () => {
    setViewingProviderId(null);
  };

  const openBooking = (service) => {
    setSelectedService(service);
    setBookingDate("");
    setBookingNotes("");
    setShowBooking(true);
  };

  const confirmBooking = async () => {
    if (!bookingDate) {
      alert("Please pick date & time");
      return;
    }
    try {
      await servicesAPI.providerServices; // noop to satisfy linter if unused
      // call appointments endpoint via global api in frontend (use appointmentsAPI)
      const { default: api } = await import("../services/api");
      // We need to call appointmentsAPI.create — import it specifically
      const { appointmentsAPI } = await import("../services/api");
      await appointmentsAPI.create({
        service_id: selectedService.id,
        appointment_date: bookingDate,
        client_notes: bookingNotes,
      });
      alert("✅ Appointment booked");
      setShowBooking(false);
    } catch (err) {
      console.error("Booking failed:", err);
      alert("❌ Failed to book appointment");
    }
  };

  if (loading) return <p>Loading services...</p>;

  // If viewing provider profile
  if (viewingProviderId) {
    return <ProviderProfile providerId={viewingProviderId} onBack={closeProvider} onBook={(s) => openBooking(s)} user={user} />;
  }

  // Render service grid
  return (
    <div className="service-manager">
      <div className="service-header">
        <h2>{user.user_type === "provider" ? "📋 My Services" : "🔎 Find Services"}</h2>
        <div className="search-area">
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search services, providers, categories..."
            className="search-input"
          />
        </div>
      </div>

      <div className="services-grid">
        {services.length === 0 && <p>No services found.</p>}

        {services.map((s) => (
          <div key={s.id} className="service-card">
            <div>
              <h3>{s.name}</h3>
              <p className="desc">{s.description}</p>
              <p><strong>Category:</strong> {s.category}</p>
              <p><strong>Duration:</strong> {s.duration_minutes} min</p>
              <p><strong>Price:</strong> KSh {s.price ?? "0"}</p>
              <p>
                <strong>Provider:</strong>{" "}
                <button className="link-btn" onClick={() => openProvider(s.provider_id)}>
                  {s.provider_name} {s.business_name ? `(${s.business_name})` : ""}
                </button>
              </p>
            </div>

            <div className="card-actions">
              {user.user_type === "client" && (
                <>
                  <button className="book-btn" onClick={() => openBooking(s)}>📅 Book Now</button>
                </>
              )}

              {user.user_type === "provider" && s.provider_id === user.id && (
                <>
                  <button className="edit-btn" onClick={() => handleEdit(s)}>✏️ Edit</button>
                  <button className="delete-btn" onClick={() => handleDelete(s.id)}>🗑 Delete</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Booking dialog (from service list) */}
      {showBooking && selectedService && (
        <div className="dialog-backdrop">
          <div className="dialog">
            <h3>Book: {selectedService.name}</h3>
            <p>Provider: {selectedService.provider_name} {selectedService.business_name ? `(${selectedService.business_name})` : ""}</p>
            <label>
              Date & Time
              <input type="datetime-local" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} />
            </label>
            <label>
              Notes (optional)
              <textarea value={bookingNotes} onChange={(e) => setBookingNotes(e.target.value)} />
            </label>

            <div className="dialog-actions">
              <button onClick={confirmBooking}>Confirm</button>
              <button className="cancel-btn" onClick={() => setShowBooking(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ServiceManager;
