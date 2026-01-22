import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom"; 
import api from "../services/auth";
import { 
  Clock, Tag, Users, Edit2, Trash2, Eye, Plus, X, 
  ChevronDown, ChevronUp, Power, AlertTriangle 
} from "lucide-react";
import "./ServiceManager.css";

function ServiceManager({ user }) {
  const [services, setServices] = useState([]);
  const location = useLocation();

  // Modal & Form States
  const [showForm, setShowForm] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [previewService, setPreviewService] = useState(null); // 👁️ New Preview State

  const [formData, setFormData] = useState({
    name: "", description: "", category: "", duration: "", price: "", capacity: "1", 
  });
  
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [businessClosed, setBusinessClosed] = useState(false);
  
  // Sub-services
  const [subservices, setSubservices] = useState({});
  const [newSub, setNewSub] = useState({ name: "", price: "" });
  const [addingSubFor, setAddingSubFor] = useState(null);
  const [editingSub, setEditingSub] = useState(null);
  const [expandedService, setExpandedService] = useState(null);

  // Alerts
  const [globalSuccess, setGlobalSuccess] = useState("");
  const [globalError, setGlobalError] = useState("");

  useEffect(() => {
    fetchMyServices();
  }, [user.id]);

  // Auto-scroll to target from notifications
  useEffect(() => {
    if (services.length > 0 && location.state?.targetId) {
      setTimeout(() => {
        const element = document.getElementById(`service-${location.state.targetId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('highlight-target');
          setTimeout(() => element.classList.remove('highlight-target'), 2000);
        }
      }, 500);
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

  // ... [Keep existing validation & submit logic] ...
  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = "Service name is required";
    if (!formData.category) newErrors.category = "Category is required";
    if (!formData.duration || formData.duration < 15) newErrors.duration = "Min 15 mins";
    if (!formData.price || formData.price < 0) newErrors.price = "Positive price required";
    if (!formData.capacity || parseInt(formData.capacity) < 1) newErrors.capacity = "Min 1 slot";
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
        capacity: parseInt(formData.capacity),
      };
      const res = editingService
        ? await api.put(`/services/${editingService.id}`, submitData)
        : await api.post("/services", submitData);

      if (res.data?.service) {
        if (editingService) {
          setServices((prev) => prev.map((s) => s.id === editingService.id ? res.data.service : s));
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
      capacity: service.capacity ? service.capacity.toString() : "1",
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
      setGlobalSuccess("✅ Service deleted!");
      setTimeout(() => setGlobalSuccess(""), 2000);
    } catch (error) {
      setGlobalError("❌ Failed to delete service.");
      setTimeout(() => setGlobalError(""), 2000);
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleService = async (service) => {
    if (service.is_closed && businessClosed) {
      setGlobalError("❌ Open business first.");
      setTimeout(() => setGlobalError(""), 3000);
      return;
    }
    setTogglingId(service.id);
    try {
      const updatedStatus = service.is_closed ? 0 : 1;
      await api.patch(`/services/${service.id}/closure`, { is_closed: updatedStatus });
      setServices((prev) => prev.map((s) => s.id === service.id ? { ...s, is_closed: updatedStatus } : s));
      setGlobalSuccess(updatedStatus ? "🔒 Service Closed" : "🔓 Service Opened");
    } catch (error) {
      setGlobalError("❌ Toggle failed.");
    } finally {
      setTimeout(() => setGlobalSuccess(""), 2000);
      setTimeout(() => setGlobalError(""), 2000);
      setTogglingId(null);
    }
  };

  const handleToggleBusiness = async () => {
    try {
      const newStatus = !businessClosed;
      await api.patch(`/services/provider/${user.id}/closure`, { is_closed: newStatus ? 1 : 0 });
      await fetchMyServices();
      setBusinessClosed(newStatus);
      setGlobalSuccess(newStatus ? "🔒 Business Closed" : "🔓 Business Reopened");
      setTimeout(() => setGlobalSuccess(""), 3000);
    } catch (error) {
      setGlobalError("❌ Toggle failed.");
      setTimeout(() => setGlobalError(""), 3000);
    }
  };

  // ... [Keep subservice add/edit/delete logic same as provided, just ensure state updates] ...
  const handleAddSubservice = async (serviceId) => {
      // (Logic same as your provided code, omitted for brevity but preserved in functionality)
      // Ensure you copy your existing handleAddSubservice logic here
      if (!newSub.name.trim() || newSub.price === "") { alert("Enter name and price."); return; }
      try {
        const payload = { name: newSub.name, description: "", price: parseFloat(newSub.price), additional_price: parseFloat(newSub.price) };
        await api.post(`/services/${serviceId}/sub-services`, payload);
        await fetchSubservices(serviceId);
        setAddingSubFor(null); setNewSub({ name: "", price: "" });
        setGlobalSuccess("✅ Add-on created!"); setTimeout(() => setGlobalSuccess(""), 2000);
      } catch (e) { alert("Failed to add."); }
  };
  
  const handleDeleteSubservice = async (subId, serviceId) => {
      if(!window.confirm("Delete add-on?")) return;
      try { await api.delete(`/services/${serviceId}/sub-services/${subId}`); await fetchSubservices(serviceId); }
      catch(e) { alert("Failed delete."); }
  };

  const handleUpdateSubservice = async (serviceId, subId) => {
      if (!editingSub.name.trim()) { alert("Enter valid name."); return; }
      try {
        const payload = { name: editingSub.name, description: "", price: parseFloat(editingSub.price), additional_price: parseFloat(editingSub.price) };
        await api.put(`/services/${serviceId}/sub-services/${subId}`, payload);
        await fetchSubservices(serviceId);
        setEditingSub(null);
      } catch(e) { alert("Update failed."); }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingService(null);
    setFormData({ name: "", description: "", category: "", duration: "", price: "", capacity: "1" });
    setErrors({});
  };

  // Helper for Theme Colors
  const getCategoryClass = (category) => {
    if (!category) return "default-category";
    const cat = category.toLowerCase();
    if (cat.includes("salon")) return "salon-header";
    if (cat.includes("spa")) return "spa-header";
    if (cat.includes("barber")) return "barber-header";
    return "default-category";
  };

  return (
    <div className="service-manager">
      {globalSuccess && <div className="global-success-popup">{globalSuccess}</div>}
      {globalError && <div className="global-error-popup">{globalError}</div>}

      <div className="container">
        
        {/* HEADER */}
        <div className="manager-header">
          <div className="header-title">
            <h2>Manage Your Services</h2>
            <p>Create, edit, and organize your service offerings.</p>
          </div>
          <div className="header-actions">
            <button className="btn btn-primary add-btn" onClick={() => setShowForm(true)}>
              <Plus size={18} /> New Service
            </button>
            {services.length > 0 && (
              <button
                className={`btn ${businessClosed ? "btn-open-biz" : "btn-close-biz"}`}
                onClick={handleToggleBusiness}
              >
                <Power size={18} /> {businessClosed ? "Open Business" : "Close Business"}
              </button>
            )}
          </div>
        </div>

        {/* SERVICES GRID */}
        <div className="services-list">
          {services.map((service) => {
            const isClosed = businessClosed || service.is_closed;
            const themeClass = getCategoryClass(service.category);
            
            return (
              <div
                key={service.id}
                id={`service-${service.id}`}
                className={`provider-service-card ${isClosed ? "dimmed" : ""}`}
              >
                {/* Colored Header Bar */}
                <div className={`provider-card-header ${themeClass}`}>
                  <div className="header-top">
                    <h3>{service.name}</h3>
                    <span className="cat-badge">{service.category}</span>
                  </div>
                  <div className="header-price">KES {service.price}</div>
                </div>

                {/* Body Content */}
                <div className="provider-card-body">
                  <p className="description">{service.description || "No description provided."}</p>
                  
                  {/* Meta Stats Row */}
                  <div className="meta-stats">
                    <div className="stat" title="Duration">
                        <Clock size={14} /> {service.duration}m
                    </div>
                    <div className="stat" title="Capacity per slot">
                        <Users size={14} /> {service.capacity || 1}
                    </div>
                    <div className="stat" title="Status">
                        {isClosed ? <span className="status-closed">Closed</span> : <span className="status-active">Active</span>}
                    </div>
                  </div>

                  {/* Add-ons Section */}
                  <div className="addons-wrapper">
                    <button
                        className="toggle-addons-link"
                        onClick={() => setExpandedService(expandedService === service.id ? null : service.id)}
                    >
                        {expandedService === service.id ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} 
                        {expandedService === service.id ? "Hide Add-ons" : `Add-ons (${(subservices[service.id] || []).length})`}
                    </button>

                    {expandedService === service.id && (
                        <div className="addons-content">
                            <ul className="addons-list-clean">
                                {(subservices[service.id] || []).map((sub) => (
                                    <li key={sub.id}>
                                        <div className="addon-info">
                                            <span className="name">{sub.name}</span>
                                            <span className="price">+KES {sub.price}</span>
                                        </div>
                                        <div className="addon-tools">
                                            <button onClick={() => setEditingSub({ ...sub, serviceId: service.id })}><Edit2 size={12}/></button>
                                            <button onClick={() => handleDeleteSubservice(sub.id, service.id)}><Trash2 size={12}/></button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            <button className="add-addon-small-btn" onClick={() => setAddingSubFor(service.id)}>
                                + Add New
                            </button>
                        </div>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="provider-card-footer">
                   <div className="left-actions">
                       <button className="icon-action-btn preview" title="Preview Client View" onClick={() => setPreviewService(service)}>
                           <Eye size={18} />
                       </button>
                   </div>
                   <div className="right-actions">
                       <button className="icon-action-btn edit" onClick={() => handleEdit(service)} title="Edit">
                           <Edit2 size={18} />
                       </button>
                       <button className="icon-action-btn delete" onClick={() => handleDelete(service.id)} title="Delete">
                           <Trash2 size={18} />
                       </button>
                       <button 
                           className={`toggle-status-btn ${service.is_closed ? 'open' : 'close'}`}
                           onClick={() => handleToggleService(service)}
                           disabled={businessClosed}
                           title={businessClosed ? "Open business first" : (service.is_closed ? "Open Service" : "Close Service")}
                       >
                           {service.is_closed ? "Open" : "Close"}
                       </button>
                   </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* --- MODALS --- */}

        {/* 1. SERVICE FORM MODAL */}
        {showForm && (
          <div className="modal-overlay" onClick={resetForm}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{editingService ? "Edit Service" : "Create New Service"}</h3>
                <button className="close-btn" onClick={resetForm}><X size={24}/></button>
              </div>
              <form onSubmit={handleSubmit} className="service-form">
                {/* Form fields same as before, just ensured layout */}
                <div className="form-group">
                  <label>Service Name *</label>
                  <input type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="e.g., Luxury Facial" />
                  {errors.name && <span className="field-error">{errors.name}</span>}
                </div>
                <div className="form-group">
                    <label>Description</label>
                    <textarea name="description" value={formData.description} onChange={handleInputChange} rows="3" />
                </div>
                <div className="form-row-3">
                    <div className="form-group">
                        <label>Category *</label>
                        <select name="category" value={formData.category} onChange={handleInputChange}>
                            <option value="">Select...</option>
                            <option value="Salon">Salon</option>
                            <option value="Spa">Spa</option>
                            <option value="Barbershop">Barbershop</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Duration (mins) *</label>
                        <input type="number" name="duration" value={formData.duration} onChange={handleInputChange} />
                    </div>
                    <div className="form-group">
                        <label>Price (KES) *</label>
                        <input type="number" name="price" value={formData.price} onChange={handleInputChange} />
                    </div>
                </div>
                <div className="form-group">
                    <label>Capacity (Simultaneous Clients) *</label>
                    <input type="number" name="capacity" value={formData.capacity} onChange={handleInputChange} min="1" />
                </div>
                <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save Service"}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 2. SUB-SERVICE MODAL */}
        {(addingSubFor || editingSub) && (
          <div className="modal-overlay" onClick={() => { setAddingSubFor(null); setEditingSub(null); setNewSub({name:"", price:""}); }}>
            <div className="modal-content small-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{editingSub ? "Edit Add-on" : "Add New Add-on"}</h3>
                    <button className="close-btn" onClick={() => { setAddingSubFor(null); setEditingSub(null); }}><X size={20}/></button>
                </div>
                <div className="modal-body-padded">
                    <div className="form-group">
                        <label>Name</label>
                        <input type="text" value={editingSub ? editingSub.name : newSub.name} onChange={(e) => editingSub ? setEditingSub({...editingSub, name: e.target.value}) : setNewSub({...newSub, name: e.target.value})} />
                    </div>
                    <div className="form-group">
                        <label>Price (KES)</label>
                        <input type="number" value={editingSub ? editingSub.price : newSub.price} onChange={(e) => editingSub ? setEditingSub({...editingSub, price: e.target.value}) : setNewSub({...newSub, price: e.target.value})} />
                    </div>
                    <div className="modal-footer">
                        <button className="btn btn-primary block" onClick={() => editingSub ? handleUpdateSubservice(editingSub.serviceId, editingSub.id) : handleAddSubservice(addingSubFor)}>
                            {editingSub ? "Update Add-on" : "Add Add-on"}
                        </button>
                    </div>
                </div>
            </div>
          </div>
        )}

        {/* 3. PREVIEW MODAL (CLIENT VIEW REPLICA) */}
        {previewService && (
            <div className="modal-overlay" onClick={() => setPreviewService(null)}>
                <div className="preview-modal-content" onClick={(e) => e.stopPropagation()}>
                    <div className="preview-header">
                        <h4>Client Preview</h4>
                        <button onClick={() => setPreviewService(null)}><X size={18}/></button>
                    </div>
                    <div className="preview-card-wrapper">
                        {/* THIS IS A REPLICA OF THE CLIENT CARD STRUCTURE */}
                        <div className="service-card">
                            <div className={`service-header-bar ${getCategoryClass(previewService.category)}`}>
                                <div className="header-content">
                                    <h3 className="service-name">{previewService.name}</h3>
                                    <p className="service-provider">{user.name} — {user.business_name}</p>
                                </div>
                                <div className="header-price"><small>From</small> KES {previewService.price}</div>
                            </div>
                            <div className="service-main">
                                <div className="meta-row">
                                    <span className="meta-badge category">{previewService.category}</span>
                                    <span className="meta-badge duration"><Clock size={12}/> {previewService.duration}m</span>
                                </div>
                                <p className="service-description">{previewService.description}</p>
                                <button className="btn btn-primary book-btn">Book Appointment</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {services.length === 0 && !showForm && (
          <div className="no-services-state">
            <AlertTriangle size={48} color="#cbd5e1" />
            <h3>No Services Yet</h3>
            <p>Start by adding your first service to accept bookings.</p>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>Add Service</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ServiceManager;