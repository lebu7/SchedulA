import React, { useEffect, useState } from "react";
import { servicesAPI } from "../services/api";
import "./ProviderProfile.css";

function ProviderProfile({ providerId, onBack, onBook, user }) {
  const [provider, setProvider] = useState(null);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProvider();
  }, [providerId]);

  const loadProvider = async () => {
    try {
      setLoading(true);
      const res = await servicesAPI.providerServices(providerId);
      if (res.data) {
        setProvider(res.data.provider);
        setServices(res.data.services || []);
      } else {
        setProvider(null);
        setServices([]);
      }
    } catch (err) {
      console.error("Failed to fetch provider", err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (service) => {
    const name = prompt("Service name:", service.name);
    if (name === null) return;
    const description = prompt("Description:", service.description || "");
    if (description === null) return;
    const duration = prompt("Duration (minutes):", service.duration_minutes || 60);
    if (duration === null) return;
    const price = prompt("Price (KES):", service.price ?? 0);
    if (price === null) return;

    try {
      await servicesAPI.update(service.id, {
        name,
        description,
        duration_minutes: parseInt(duration, 10) || 60,
        price: Number(price) || 0,
      });
      await loadProvider();
    } catch (err) {
      console.error("Edit failed", err);
      alert("Failed to update service");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this service?")) return;
    try {
      await servicesAPI.remove(id);
      await loadProvider();
    } catch (err) {
      console.error("Delete failed", err);
      alert("Failed to delete service");
    }
  };

  const openBookingDialog = (service) => {
    // bubble up to ServiceManager if provided; fallback to inline prompt
    if (typeof onBook === "function") {
      onBook(service);
      return;
    }
    const appointment_date = prompt("Enter appointment date/time (YYYY-MM-DDTHH:mm):");
    if (!appointment_date) return;
    (async () => {
      try {
        const { appointmentsAPI } = await import("../services/api");
        await appointmentsAPI.create({
          service_id: service.id,
          appointment_date,
          client_notes: "",
        });
        alert("Booked");
      } catch (err) {
        console.error("Booking failed", err);
        alert("Failed to book appointment");
      }
    })();
  };

  if (loading) return <p>Loading provider...</p>;

  if (!provider) return (
    <div className="provider-profile">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <p>Provider not found.</p>
    </div>
  );

  return (
    <div className="provider-profile">
      <button className="back-btn" onClick={onBack}>← Back</button>

      <div className="provider-header">
        <h2>{provider.name}</h2>
        {provider.business_name && <p>{provider.business_name}</p>}
        {provider.phone && <p>Contact: {provider.phone}</p>}
      </div>

      <h3>Services</h3>
      <div className="services-grid">
        {services.length === 0 && <p>No services yet.</p>}
        {services.map((s) => (
          <div key={s.id} className="service-card">
            <div>
              <h3>{s.name}</h3>
              <p className="desc">{s.description}</p>
              <p><strong>Duration:</strong> {s.duration_minutes} min</p>
              <p><strong>Price:</strong> KSh {s.price ?? 0}</p>
            </div>

            <div className="card-actions">
              {user?.user_type === "client" && (
                <button className="book-btn" onClick={() => openBookingDialog(s)}>📅 Book Now</button>
              )}

              {user?.user_type === "provider" && provider.id === user.id && (
                <>
                  <button className="edit-btn" onClick={() => handleEdit(s)}>✏️ Edit</button>
                  <button className="delete-btn" onClick={() => handleDelete(s.id)}>🗑 Delete</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProviderProfile;
