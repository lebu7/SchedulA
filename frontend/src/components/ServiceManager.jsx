import React, { useState, useEffect } from "react";
import { servicesAPI } from "../services/api";
import "./ServiceManager.css";

function ServiceManager({ user }) {
  const [services, setServices] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      setLoading(true);
      const data = await servicesAPI.list();
      setServices(data.data || []);
    } catch (error) {
      console.error("Failed to fetch services:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this service?")) return;
    try {
      await servicesAPI.remove(id);
      alert("✅ Service deleted");
      loadServices();
    } catch (err) {
      console.error("Delete failed:", err);
      alert("❌ Failed to delete service");
    }
  };

  const handleEdit = async (service) => {
    const newName = prompt("Edit service name:", service.name);
    if (!newName) return;

    try {
      await servicesAPI.update(service.id, { name: newName });
      alert("✅ Service updated");
      loadServices();
    } catch (err) {
      console.error("Update failed:", err);
      alert("❌ Failed to update service");
    }
  };

  // 🔎 Filtered list (live search)
  const filteredServices = services.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.business_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.provider_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <p>Loading...</p>;

  return (
    <div className="service-manager">
      <h2>📋 Available Services</h2>

      {/* 🔍 Search bar */}
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search services..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Services Grid */}
      <div className="services-grid">
        {filteredServices.map((service) => (
          <div key={service.id} className="service-card">
            <h3>{service.name}</h3>
            <p className="desc">{service.description}</p>
            <p>
              <strong>Provider:</strong>{" "}
              {service.provider_name} ({service.business_name || "Independent"})
            </p>
            <p>
              <strong>Category:</strong> {service.category}
            </p>
            <p>
              <strong>Duration:</strong> {service.duration_minutes} min
            </p>
            <p>
              <strong>Price:</strong> KSh {service.price}
            </p>

            {/* 🎯 Conditional buttons */}
            <div className="card-actions">
              {user.user_type === "client" ? (
                <button
                  className="book-btn"
                  onClick={() => alert("📅 Hook booking logic here")}
                >
                  📅 Book Now
                </button>
              ) : (
                <>
                  <button
                    className="edit-btn"
                    onClick={() => handleEdit(service)}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    className="delete-btn"
                    onClick={() => handleDelete(service.id)}
                  >
                    🗑 Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {filteredServices.length === 0 && (
          <p>No services available. Try a different search.</p>
        )}
      </div>
    </div>
  );
}

export default ServiceManager;
