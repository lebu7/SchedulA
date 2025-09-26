// src/components/ServiceList.jsx
import React, { useState, useEffect } from "react";
import { servicesAPI, appointmentsAPI } from "@/services/api";
import { authService } from "@/services/auth";
import "@/components/ServiceList.css";

const ServiceCard = ({ s, user, onBook, onOpenProvider, onEdit, onDelete }) => {
  const isProvider = user?.user_type === "provider";

  return (
    <div className="service-card">
      <div className="service-card-header">
        <h4>{s.name}</h4>
        <span className="category-tag">{s.category || "General"}</span>
      </div>
      <p className="service-description">{s.description}</p>
      <div className="service-details">
        <span>⏱ {s.duration_minutes || 60} min</span>
        <span>💰 {s.price ? `KES ${s.price}` : "Free"}</span>
      </div>
      <div className="service-actions">
        {isProvider ? (
          <>
            <button onClick={() => onEdit(s)} className="secondary-btn">✏️ Edit</button>
            <button onClick={() => onDelete(s.id)} className="secondary-btn">🗑 Delete</button>
          </>
        ) : (
          <>
            <button
              onClick={() => onOpenProvider && onOpenProvider(s.provider_id)}
              className="secondary-btn"
            >
              👤 {s.provider_name}
            </button>
            <button onClick={() => onBook(s)} className="primary-btn">📅 Book</button>
          </>
        )}
      </div>
    </div>
  );
};

const ServiceList = ({ forProvider = null, onOpenProvider }) => {
  const user = authService.getCurrentUser();
  const [services, setServices] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [bookService, setBookService] = useState(null);
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      const params = {};
      if (q) params.q = q;
      if (forProvider) params.provider = forProvider;
      const res = await servicesAPI.list(params);
      setServices(res.data || []);
    } catch (err) {
      console.error("Failed to load services", err);
      setError("Failed to load services");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [q]);

  const handleBookClick = (s) => {
    setBookService(s);
    setDate("");
    setNotes("");
  };

  const handleConfirm = async () => {
    try {
      setError("");
      if (!date) { setError("Please choose date and time"); return; }
      await appointmentsAPI.create({
        service_id: bookService.id,
        appointment_date: date,
        notes,
      });
      alert("✅ Appointment booked!");
      setBookService(null);
      load();
    } catch (err) {
      console.error("Booking failed", err);
      setError(err.response?.data?.error || err.message || "Booking failed");
    }
  };

  const handleEdit = async (service) => {
    const name = prompt("Update service name", service.name);
    if (!name) return;
    try {
      await servicesAPI.update(service.id, { ...service, name });
      load();
    } catch (err) {
      alert("Failed to update service");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this service?")) return;
    try {
      await servicesAPI.remove(id);
      load();
    } catch (err) {
      alert("Failed to delete service");
    }
  };

  return (
    <div className="services-container">
      <div className="search-row">
        <input
          placeholder="Search services or providers"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : services.length === 0 ? (
        <p>No services found</p>
      ) : (
        <div className="services-grid">
          {services.map((s) => (
            <ServiceCard
              key={s.id}
              s={s}
              user={user}
              onBook={handleBookClick}
              onOpenProvider={(id) => onOpenProvider && onOpenProvider(id)}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {bookService && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Book: {bookService.name}</h3>
            <p>
              With: {bookService.provider_name}{" "}
              {bookService.business_name ? `(${bookService.business_name})` : ""}
            </p>

            <div className="form-group">
              <label>Choose date & time</label>
              <input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Notes (optional)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="form-actions">
              <button onClick={() => setBookService(null)} className="secondary-btn">
                Cancel
              </button>
              <button onClick={handleConfirm} className="primary-btn">
                Confirm Booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceList;
