import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom"; // ✅ Import useLocation
import api from "../services/auth";
import "./ServiceManager.css";

function ServiceManager({ user }) {
  const [services, setServices] = useState([]);
  const location = useLocation(); // ✅ Hook for navigation state

  const [showForm, setShowForm] = useState(false);
  const [editingService, setEditingService] = useState(null);
  
  // ✅ capacity field initialized to "1"
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    duration: "",
    price: "",
    capacity: "1", 
  });
  
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [businessClosed, setBusinessClosed] = useState(false);
  const [subservices, setSubservices] = useState({});
  const [newSub, setNewSub] = useState({ name: "", price: "" });
  const [addingSubFor, setAddingSubFor] = useState(null);
  const [editingSub, setEditingSub] = useState(null);
  const [globalSuccess, setGlobalSuccess] = useState("");
  const [globalError, setGlobalError] = useState("");
  const [expandedService, setExpandedService] = useState(null);

  useEffect(() => {
    fetchMyServices();
  }, [user.id]);

  // ✅ Auto-scroll to specific service when redirected from notification
  useEffect(() => {
    if (services.length > 0 && location.state?.targetId) {
      setTimeout(() => {
        const element = document.getElementById(`service-${location.state.targetId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('highlight-target'); // Optional: Add CSS for highlighting
          // Remove highlight after animation
          setTimeout(() => element.classList.remove('highlight-target'), 2000);
        }
      }, 500); // Small delay to ensure rendering
    }
  }, [services, location.state]);

  const fetchMyServices = async () => {
    try {
      const response = await api.get("/services");
      const myServices = response.data.services.filter(
        (service) => service.provider_id === user.id
      );
      setServices(myServices);
      
      const allClosed = myServices.length > 0 && myServices.every(s => s.is_closed === 1);
      setBusinessClosed(allClosed);

      myServices.forEach((svc) => fetchSubservices(svc.id));
    } catch (error) {
      console.error("Error fetching services:", error);
    }
  };

  const fetchSubservices = async (serviceId) => {
    try {
      const res = await api.get(`/services/${serviceId}/sub-services`);
      setSubservices((prev) => ({
        ...prev,
        [serviceId]: (res.data.sub_services || []).map(sub => ({
          ...sub,
          price: sub.additional_price ?? sub.price ?? 0
        })),
      }));
    } catch (error) {
      console.error("Error fetching sub-services:", error);
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = "Service name is required";
    if (!formData.category) newErrors.category = "Category is required";
    if (!formData.duration || formData.duration < 15)
      newErrors.duration = "Duration must be at least 15 minutes";
    if (!formData.price || formData.price < 0)
      newErrors.price = "Price must be a positive number";
    
    // ✅ Validation for capacity
    if (!formData.capacity || parseInt(formData.capacity) < 1)
      newErrors.capacity = "Capacity must be at least 1";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSaving(true);

    try {
      const submitData = {
        ...formData,
        duration: parseInt(formData.duration),
        price: parseFloat(formData.price),
        capacity: parseInt(formData.capacity), // ✅ Send capacity to API
      };

      const res = editingService
        ? await api.put(`/services/${editingService.id}`, submitData)
        : await api.post("/services", submitData);

      if (res.data?.service) {
        if (editingService) {
          setServices((prev) =>
            prev.map((s) =>
              s.id === editingService.id ? res.data.service : s
            )
          );
        } else {
          setServices((prev) => [...prev, res.data.service]);
          await fetchSubservices(res.data.service.id);
        }
      } else {
        await fetchMyServices();
      }

      setShowForm(false);
      setEditingService(null);
      resetForm();
      setGlobalSuccess("✅ Service saved successfully!");
      setTimeout(() => setGlobalSuccess(""), 2000);
    } catch (error) {
      console.error("Error saving service:", error);
      setErrors({ submit: "Failed to save service. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleEdit = (service) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      description: service.description || "",
      category: service.category,
      duration: service.duration.toString(),
      price: service.price ? service.price.toString() : "",
      capacity: service.capacity ? service.capacity.toString() : "1", // ✅ Load existing capacity
    });
    setErrors({});
    setShowForm(true);
  };

  const handleDelete = async (serviceId) => {
    if (!window.confirm("Are you sure you want to delete this service?")) return;

    setDeletingId(serviceId);
    try {
      await api.delete(`/services/${serviceId}`);
      setServices((prev) => prev.filter((s) => s.id !== serviceId));
      setGlobalSuccess("✅ Service deleted successfully!");
      setTimeout(() => setGlobalSuccess(""), 2000);
    } catch (error) {
      console.error("Error deleting service:", error);
      setGlobalError("❌ Failed to delete service. Try again.");
      setTimeout(() => setGlobalError(""), 2000);
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleService = async (service) => {
    if (service.is_closed && businessClosed) {
      setGlobalError("❌ Cannot open service while Business is Closed. Please 'Open Business' first.");
      setTimeout(() => setGlobalError(""), 3000);
      return;
    }

    setTogglingId(service.id);

    try {
      const updatedStatus = service.is_closed ? 0 : 1;
      await api.patch(`/services/${service.id}/closure`, {
        is_closed: updatedStatus === 1 ? 1 : 0,
      });

      setServices((prev) =>
        prev.map((s) =>
          s.id === service.id ? { ...s, is_closed: updatedStatus } : s
        )
      );

      setGlobalSuccess(
        updatedStatus
          ? "✅ Service closed successfully!"
          : "✅ Service reopened successfully!"
      );
    } catch (error) {
      console.error("Error toggling service:", error);
      setGlobalError(
        error.response?.data?.error ||
          "❌ Failed to toggle service. Please try again."
      );
    } finally {
      setTimeout(() => setGlobalSuccess(""), 2000);
      setTimeout(() => setGlobalError(""), 2000);
      setTogglingId(null);
    }
  };

  const handleToggleBusiness = async () => {
    try {
      const newStatus = !businessClosed;
      await api.patch(`/services/provider/${user.id}/closure`, {
        is_closed: newStatus ? 1 : 0,
      });

      await fetchMyServices();
      setBusinessClosed(newStatus);

      setGlobalSuccess(
        newStatus
          ? "✅ Business closed — all active services temporarily closed."
          : "✅ Business reopened — previously closed services reopened."
      );
      setTimeout(() => setGlobalSuccess(""), 3000);
    } catch (error) {
      console.error("Error toggling business:", error);
      setGlobalError("❌ Failed to toggle business. Try again.");
      setTimeout(() => setGlobalError(""), 3000);
    }
  };

  const handleAddSubservice = async (serviceId) => {
    if (!newSub.name.trim() || newSub.price === "") {
      alert("Please enter a name and price for the add-on.");
      return;
    }

    try {
      const formattedPrice = parseFloat(newSub.price);
      if (isNaN(formattedPrice)) {
        alert("Price must be a number.");
        return;
      }

      const payload = {
        name: newSub.name,
        description: "",
        price: formattedPrice,
        additional_price: formattedPrice,
      };

      await api.post(`/services/${serviceId}/sub-services`, payload);
      await fetchSubservices(serviceId);

      setSubservices(prev => ({
        ...prev,
        [serviceId]: prev[serviceId].map(sub => ({
          ...sub,
          price: sub.additional_price ?? sub.price ?? 0
        }))
      }));

      setGlobalSuccess("✅ Add-on created successfully!");
      setTimeout(() => setGlobalSuccess(""), 2000);

      setAddingSubFor(null);
      setNewSub({ name: "", price: "" });
    } catch (error) {
      console.error("Error adding sub-service:", error);
      alert(error.response?.data?.error || "Failed to save add-on.");
    }
  };

  const handleDeleteSubservice = async (subId, serviceId) => {
    if (!window.confirm("Are you sure you want to delete this add-on?")) return;
    try {
      await api.delete(`/services/${serviceId}/sub-services/${subId}`);
      await fetchSubservices(serviceId);
      setSubservices(prev => ({
        ...prev,
        [serviceId]: prev[serviceId].map(sub => ({
          ...sub,
          price: sub.additional_price ?? sub.price ?? 0
        }))
      }));
      setGlobalSuccess("✅ Add-on deleted successfully!");
      setTimeout(() => setGlobalSuccess(""), 2000);
    } catch (error) {
      console.error("Error deleting sub-service:", error);
      setGlobalError("❌ Failed to delete add-on. Please try again.");
      setTimeout(() => setGlobalError(""), 2500);
    }
  };

  const handleUpdateSubservice = async (serviceId, subId) => {
    if (!editingSub.name.trim()) {
      alert("Please enter a valid add-on name.");
      return;
    }

    try {
      const formattedPrice = parseFloat(editingSub.price);
      if (isNaN(formattedPrice)) {
        alert("Price must be a number.");
        return;
      }

      const payload = {
        name: editingSub.name,
        description: "",
        price: formattedPrice,
        additional_price: formattedPrice,
      };

      await api.put(`/services/${serviceId}/sub-services/${subId}`, payload);
      await fetchSubservices(serviceId);

      setSubservices(prev => ({
        ...prev,
        [serviceId]: prev[serviceId].map(sub => ({
          ...sub,
          price: sub.additional_price ?? sub.price ?? 0
        }))
      }));

      setGlobalSuccess("✅ Add-on updated successfully!");
      setTimeout(() => setGlobalSuccess(""), 2000);

      setEditingSub(null);
    } catch (error) {
      console.error("Error updating sub-service:", error);
      alert(error.response?.data?.error || "Failed to update add-on.");
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingService(null);
    setFormData({
      name: "",
      description: "",
      category: "",
      duration: "",
      price: "",
      capacity: "1", // ✅ ADDED: Reset capacity
    });
    setErrors({});
  };

  return (
    <div className="service-manager">
      {globalSuccess && <div className="global-success-popup">{globalSuccess}</div>}
      {globalError && <div className="global-error-popup">{globalError}</div>}

      <div className="container">
        <div className="manager-header">
          <h2>Manage Your Services</h2>
          <div className="header-actions">
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              Add New Service
            </button>
            {services.length > 0 && (
              <button
                className={`btn ${businessClosed ? "btn-success" : "btn-danger"}`}
                onClick={handleToggleBusiness}
              >
                {businessClosed ? "Open Business" : "Close Business"}
              </button>
            )}
          </div>
        </div>

        {/* SERVICE FORM MODAL */}
        {showForm && (
          <div className="modal-overlay" onClick={resetForm}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{editingService ? "Edit Service" : "Create New Service"}</h3>
                <button className="close-btn" onClick={resetForm}>
                  ×
                </button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>Service Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g., X Spa, X Barbershop"
                  />
                  {errors.name && <span className="field-error">{errors.name}</span>}
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows="3"
                    placeholder="Describe your service..."
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Category *</label>
                    <select
                      name="category"
                      value={formData.category}
                      onChange={handleInputChange}
                    >
                      <option value="">Select Category</option>
                      <option value="Salon">Salon</option>
                      <option value="Spa">Spa</option>
                      <option value="Barbershop">Barbershop</option>
                    </select>
                    {errors.category && (
                      <span className="field-error">{errors.category}</span>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Duration (minutes) *</label>
                    <input
                      type="number"
                      name="duration"
                      value={formData.duration}
                      onChange={handleInputChange}
                      placeholder="e.g., 60"
                      min="15"
                      step="5"
                    />
                  </div>

                  <div className="form-group">
                    <label>Price (KES) *</label>
                    <input
                      type="number"
                      name="price"
                      value={formData.price}
                      onChange={handleInputChange}
                      placeholder="e.g., 1500"
                      min="0"
                      step="50"
                    />
                  </div>

                  {/* ✅ ADDED: Capacity Input Field */}
                  <div className="form-group">
                    <label>Capacity (Staff/Slots) *</label>
                    <input
                      type="number"
                      name="capacity"
                      value={formData.capacity}
                      onChange={handleInputChange}
                      placeholder="1"
                      min="1"
                      title="Number of people who can perform this service simultaneously"
                    />
                    <small style={{fontSize: '0.8em', color: '#666'}}>Max simultaneous bookings</small>
                  </div>
                </div>

                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {editingService ? "Update Service" : "Create Service"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={resetForm}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* SERVICES LIST */}
        <div className="services-list">
          {services.map((service) => (
            <div
              key={service.id || `temp-${service.name}-${Math.random()}`}
              id={`service-${service.id}`} // ✅ ADDED ID FOR SCROLLING
              className={`service-item card ${
                businessClosed || service.is_closed ? "closed-service" : ""
              }`}
              data-status={
                businessClosed
                  ? "Business Closed"
                  : service.is_closed
                  ? "Service Closed"
                  : ""
              }
            >
              <div className="service-info">
                <h4>{service.name}</h4>
                <p className="service-category">{service.category}</p>
                <p className="service-description">{service.description}</p>
                <div className="service-meta">
                  <span>⏱ {service.duration} mins</span>
                  <span>🏷 KES {service.price ? service.price : "Free"}</span>
                  {/* ✅ ADDED: Display Capacity */}
                  <span>👥 Capacity: {service.capacity || 1}</span>
                </div>
              </div>

              {/* SUB-SERVICES */}
              <div className="subservice-section">
                <div className="subservice-header">
                  <button
                    className="toggle-addons-btn"
                    onClick={() =>
                      setExpandedService(
                        expandedService === service.id ? null : service.id
                      )
                    }
                  >
                    {expandedService === service.id
                      ? "Hide Add-ons"
                      : "View Add-ons"}
                  </button>
                </div>

                {expandedService === service.id && (
                  <div className="addons-dropdown">
                    <ul className="subservice-list">
                      {(subservices[service.id] || []).map((sub) => (
                        <li key={sub.id}>
                          <span>
                            {sub.name} — <strong>KES {sub.additional_price ?? sub.price ?? 0}</strong>
                          </span>
                          <div className="subservice-actions compact">
                            <button
                              className="icon-btn edit"
                              onClick={() =>
                                setEditingSub({
                                  id: sub.id,
                                  name: sub.name,
                                  price: sub.additional_price ?? sub.price ?? 0,
                                  serviceId: service.id,
                                })
                              }
                              title="Edit Add-on"
                            >
                              ✏️
                            </button>
                            <button
                              className="icon-btn delete"
                              onClick={() =>
                                handleDeleteSubservice(sub.id, service.id)
                              }
                              title="Delete Add-on"
                            >
                              🗑️
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>

                    <button
                      className="icon-btn add"
                      onClick={() => setAddingSubFor(service.id)}
                      title="Add new add-on"
                    >
                      ➕ Add Add-on
                    </button>
                  </div>
                )}
              </div>

              <div className="service-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => handleEdit(service)}
                >
                  Edit
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => handleDelete(service.id)}
                  disabled={deletingId === service.id}
                >
                  {deletingId === service.id ? "Deleting..." : "Delete"}
                </button>
                
                <button
                  className={`btn ${
                    service.is_closed ? "btn-success" : "btn-primary"
                  }`}
                  onClick={() => handleToggleService(service)}
                  disabled={businessClosed && service.is_closed}
                  style={{
                    opacity: (businessClosed && service.is_closed) ? 0.6 : 1,
                    cursor: (businessClosed && service.is_closed) ? 'not-allowed' : 'pointer'
                  }}
                  title={businessClosed && service.is_closed ? "Open Business to enable this service" : ""}
                >
                  {togglingId === service.id
                    ? "Updating..."
                    : service.is_closed
                    ? "Open"
                    : "Close"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ADD / EDIT SUBSERVICE MODAL */}
        {(addingSubFor || editingSub) && (
          <div
            className="modal-overlay"
            onClick={() => {
              setAddingSubFor(null);
              setEditingSub(null);
              setNewSub({ name: "", price: "" });
            }}
          >
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{editingSub ? "Edit Add-on" : "Add New Add-on"}</h3>
                <button
                  className="close-btn"
                  onClick={() => {
                    setAddingSubFor(null);
                    setEditingSub(null);
                    setNewSub({ name: "", price: "" });
                  }}
                >
                  ×
                </button>
              </div>

              <div className="form-group">
                <label>Add-on Name *</label>
                <input
                  type="text"
                  placeholder="e.g., Beard Trim"
                  value={editingSub ? editingSub.name : newSub.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    editingSub
                      ? setEditingSub((prev) => ({ ...prev, name: val }))
                      : setNewSub((prev) => ({ ...prev, name: val }));
                  }}
                />
              </div>

              <div className="form-group">
                <label>Price (KES)</label>
                <input
                  type="number"
                  placeholder="e.g., 500"
                  value={editingSub ? editingSub.price : newSub.price}
                  onChange={(e) => {
                    const val = e.target.value;
                    editingSub
                      ? setEditingSub((prev) => ({ ...prev, price: val }))
                      : setNewSub((prev) => ({ ...prev, price: val }));
                  }}
                />
              </div>

              <div className="form-actions">
                <button
                  className="icon-btn add"
                  onClick={() => {
                    if (editingSub) {
                      handleUpdateSubservice(editingSub.serviceId, editingSub.id);
                    } else {
                      handleAddSubservice(addingSubFor);
                    }
                  }}
                >
                  {editingSub ? "💾 Update" : "➕ Add"}
                </button>

                <button
                  className="icon-btn delete"
                  onClick={() => {
                    setAddingSubFor(null);
                    setEditingSub(null);
                    setNewSub({ name: "", price: "" });
                  }}
                >
                  ✖ Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {services.length === 0 && !showForm && (
          <div className="no-services card">
            <p>You haven't created any services yet.</p>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              Create Your First Service
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ServiceManager;