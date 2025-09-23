import React, { useState, useEffect } from 'react';
import api from '../services/auth';

const ServiceManager = () => {
  const [services, setServices] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    duration_minutes: 60,
    price: '',
    category: 'beauty'
  });

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      const response = await api.get('/services');
      setServices(response.data);
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.post('/services', formData);
      setShowForm(false);
      setFormData({
        name: '',
        description: '',
        duration_minutes: 60,
        price: '',
        category: 'beauty'
      });
      fetchServices(); // Refresh the list
    } catch (error) {
      console.error('Error creating service:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const categoryLabels = {
    beauty: 'Beauty & Personal Care',
    health: 'Health & Wellness', 
    fitness: 'Fitness',
    professional: 'Professional Services',
    other: 'Other'
  };

  return (
    <div className="service-manager">
      <div className="service-header">
        <h2>📊 Service Management</h2>
        <button 
          onClick={() => setShowForm(true)} 
          className="add-service-btn"
        >
          ➕ Add New Service
        </button>
      </div>

      {showForm && (
        <div className="service-form-modal">
          <div className="service-form">
            <h3>Create New Service</h3>
            <form onSubmit={handleSubmit}>
              <input
                type="text"
                name="name"
                placeholder="Service Name (e.g., Haircut, Consultation)"
                value={formData.name}
                onChange={handleChange}
                required
              />
              
              <textarea
                name="description"
                placeholder="Service Description"
                value={formData.description}
                onChange={handleChange}
                rows="3"
              />
              
              <select name="category" value={formData.category} onChange={handleChange} required>
                <option value="beauty">Beauty & Personal Care</option>
                <option value="health">Health & Wellness</option>
                <option value="fitness">Fitness</option>
                <option value="professional">Professional Services</option>
                <option value="other">Other</option>
              </select>
              
              <div className="form-row">
                <input
                  type="number"
                  name="duration_minutes"
                  placeholder="Duration (minutes)"
                  value={formData.duration_minutes}
                  onChange={handleChange}
                  min="15"
                  step="15"
                  required
                />
                
                <input
                  type="number"
                  name="price"
                  placeholder="Price (KES)"
                  value={formData.price}
                  onChange={handleChange}
                  min="0"
                  step="50"
                />
              </div>
              
              <div className="form-actions">
                <button type="button" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={loading}>
                  {loading ? 'Creating...' : 'Create Service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="services-list">
        <h3>My Services ({services.length})</h3>
        
        {services.length === 0 ? (
          <div className="empty-state">
            <p>No services added yet. Create your first service to get started!</p>
          </div>
        ) : (
          <div className="services-grid">
            {services.map(service => (
              <div key={service.id} className="service-card">
                <div className="service-header">
                  <h4>{service.name}</h4>
                  <span className="category-badge">{categoryLabels[service.category]}</span>
                </div>
                
                {service.description && (
                  <p className="service-description">{service.description}</p>
                )}
                
                <div className="service-details">
                  <span>⏱️ {service.duration_minutes} minutes</span>
                  {service.price && <span>💰 KES {service.price}</span>}
                </div>
                
                <div className="service-actions">
                  <button className="edit-btn">Edit</button>
                  <button className="delete-btn">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ServiceManager;