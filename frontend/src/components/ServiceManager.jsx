// frontend/src/components/ServiceManager.jsx
import React, { useState, useEffect } from "react";
import { servicesAPI } from "../services/api";
import "./ServiceManager.css";

function ServiceManager({ user }) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingService, setEditingService] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    duration_minutes: 60,
    price: 0,
    category: "other",
    is_available: 1,
  });

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
      alert("✅ Service deleted!");
      loadServices();
    } catch (error) {
      console.error("Delete failed:", error);
      alert("❌ Failed to delete service.");
    }
  };

  const handleEdit = (service) => {
    setEditingService(service);
    setFormData({ ...service });
  };

  const handleUpdate = async () => {
    try {
      await servicesAPI.update(editingService.id, formData);
      alert("✅ Service updated!");
      setEditingService(null);
      loadServices();
    } catch (error) {
      console.error("Update failed:", error);
      alert("❌ Failed to update service.");
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div className="service-manager">
      <h2>
        {user?.user_type === "provider" ? "💼 My Services" : "🔎 Services"}
      </h2>

      <div className="services-grid">
        {services.map((s) => (
          <div key={s.id} className="service-card">
            <h3>{s.name}</h3>
            <p className="desc">{s.description}</p>
            <p>
              <strong>Provider:</strong> {s.provider_name} (
              {s.business_name || "Independent"})
            </p>
            <p>
              <strong>Category:</strong> {s.category}
            </p>
            <p>
              <strong>Duration:</strong> {s.duration_minutes} min
            </p>
            <p>
              <strong>Price:</strong> KSh {s.price}
            </p>

            {user?.user_type === "provider" && user.id === s.provider_id ? (
              <div className="service-actions">
                <button onClick={() => handleEdit(s)}>✏️ Edit</button>
                <button
                  className="delete-btn"
                  onClick={() => handleDelete(s.id)}
                >
                  🗑️ Delete
                </button>
              </div>
            ) : (
              <button disabled className="disabled-btn">
                📌 Provider: {s.provider_name}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Edit Dialog */}
      {editingService && (
        <div className="dialog-backdrop">
          <div className="dialog">
            <h3>✏️ Edit Service</h3>

            <label>
              Name:
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </label>

            <label>
              Description:
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </label>

            <label>
              Duration (minutes):
              <input
                type="number"
                value={formData.duration_minutes}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    duration_minutes: parseInt(e.target.value, 10),
                  })
                }
              />
            </label>

            <label>
              Price (KSh):
              <input
                type="number"
                value={formData.price}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    price: parseFloat(e.target.value),
                  })
                }
              />
            </label>

            <label>
              Category:
              <input
                type="text"
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
              />
            </label>

            <div className="dialog-actions">
              <button onClick={handleUpdate}>💾 Save</button>
              <button
                onClick={() => setEditingService(null)}
                className="cancel-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ServiceManager;
