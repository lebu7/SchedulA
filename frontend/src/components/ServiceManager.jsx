import React, { useState, useEffect } from "react";
import api from "../services/auth";
import "./ServiceManager.css";

function ServiceManager({ user }) {
  const [services, setServices] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    duration: "",
    price: "",
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

  useEffect(() => {
    fetchMyServices();
  }, [user.id]);

  const fetchMyServices = async () => {
    try {
      const response = await api.get("/services");
      const myServices = response.data.services.filter(
        (service) => service.provider_id === user.id
      );
      setServices(myServices);
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
        [serviceId]: res.data.sub_services || [],
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
      };
      if (editingService) {
        await api.put(`/services/${editingService.id}`, submitData);
      } else {
        await api.post("/services", submitData);
      }
      await fetchMyServices();
      setShowForm(false);
      setEditingService(null);
      resetForm();
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
    });
    setErrors({});
    setShowForm(true);
  };

  const handleDelete = async (serviceId) => {
    if (window.confirm("Are you sure you want to delete this service?")) {
      setDeletingId(serviceId);
      try {
        await api.delete(`/services/${serviceId}`);
        await fetchMyServices();
      } catch (error) {
        console.error("Error deleting service:", error);
      } finally {
        setDeletingId(null);
      }
    }
  };

  const handleToggleService = async (service) => {
    if (businessClosed) {
      alert("Please open your business first before managing services.");
      return;
    }
    setTogglingId(service.id);
    try {
      await api.patch(`/services/${service.id}/closure`, {
        is_closed: service.is_closed ? 0 : 1,
      });
      await fetchMyServices();
    } catch (error) {
      console.error("Error toggling service:", error);
    } finally {
      setTogglingId(null);
    }
  };

  const handleToggleBusiness = async () => {
    try {
      const newStatus = !businessClosed;
      setBusinessClosed(newStatus);
      await api.patch(`/services/provider/${user.id}/closure`, {
        is_closed: newStatus ? 1 : 0,
      });
      await fetchMyServices();
    } catch (error) {
      console.error("Error toggling business:", error);
      setBusinessClosed(!businessClosed);
    }
  };

  const handleAddSubservice = async (serviceId) => {
    if (!newSub.name.trim() || newSub.price === "") {
      alert("Please enter a name and price for the add-on.");
      return;
    }
    try {
      const payload = {
        name: newSub.name,
        description: "",
        additional_price: parseFloat(newSub.price),
      };
      await api.post(`/services/${serviceId}/sub-services`, payload);
      await fetchSubservices(serviceId);
      setAddingSubFor(null);
      setNewSub({ name: "", price: "" });
    } catch (error) {
      console.error("Error adding sub-service:", error);
    }
  };

  const handleUpdateSubservice = async (serviceId, subId) => {
    if (!editingSub.name.trim()) {
      alert("Please enter a valid add-on name.");
      return;
    }
    try {
      await api.put(`/services/${serviceId}/sub-services/${subId}`, {
        name: editingSub.name,
        description: "",
        additional_price: parseFloat(editingSub.price),
      });
      await fetchSubservices(serviceId);
      setEditingSub(null);
    } catch (error) {
      console.error("Error updating sub-service:", error);
    }
  };

  const handleDeleteSubservice = async (subId, serviceId) => {
    if (!window.confirm("Delete this add-on?")) return;
    try {
      await api.delete(`/services/${serviceId}/sub-services/${subId}`);
      fetchSubservices(serviceId);
    } catch (error) {
      console.error("Error deleting sub-service:", error);
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
    });
    setErrors({});
  };

  return (
    <div className="service-manager">
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
                <button className="close-btn" onClick={resetForm}>×</button>
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
                </div>

                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {editingService ? "Update Service" : "Create Service"}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={resetForm}>
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
            <div key={service.id} className={`service-item card ${service.is_closed ? "closed" : ""}`}>
              <div className="service-info">
                <h4>{service.name}</h4>
                <p className="service-category">{service.category}</p>
                <p className="service-description">{service.description}</p>
                <div className="service-meta">
                  <span>Duration: {service.duration} mins</span>
                  <span>Price: {service.price ? `KES ${service.price}` : "Free"}</span>
                </div>
              </div>

              {/* SUB-SERVICES */}
              <div className="subservice-section">
                <div className="subservice-header">
                  <h5>Add-ons / Sub-services</h5>
                </div>
                <ul className="subservice-list">
                  {(subservices[service.id] || []).map((sub) => (
                    <li key={sub.id}>
                      <span>
                        {sub.name} — <strong>KES {sub.price}</strong>
                      </span>
                      <div className="subservice-actions">
                        <button
                          className="btn btn-secondary"
                          onClick={() =>
                            setEditingSub({
                              ...sub,
                              serviceId: service.id,
                            })
                          }
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => handleDeleteSubservice(sub.id, service.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <button
                  className="add-subservice-btn"
                  onClick={() => setAddingSubFor(service.id)}
                >
                  + Add Add-on
                </button>
              </div>

              <div className="service-actions">
                <button className="btn btn-secondary" onClick={() => handleEdit(service)}>
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
                  className={`btn ${service.is_closed ? "btn-success" : "btn-primary"}`}
                  onClick={() => handleToggleService(service)}
                >
                  {service.is_closed ? "Open" : "Close"}
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
                  className="btn btn-primary"
                  onClick={() => {
                    if (editingSub) {
                      handleUpdateSubservice(editingSub.serviceId, editingSub.id);
                    } else {
                      handleAddSubservice(addingSubFor);
                    }
                  }}
                >
                  {editingSub ? "Update Add-on" : "Add Add-on"}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setAddingSubFor(null);
                    setEditingSub(null);
                    setNewSub({ name: "", price: "" });
                  }}
                >
                  Cancel
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
