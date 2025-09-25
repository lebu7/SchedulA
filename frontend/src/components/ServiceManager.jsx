import React, { useState, useEffect } from 'react';
import { servicesAPI } from '../services/api';
import { authService } from '../services/auth';

const ServiceManager = () => {
  const [services, setServices] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    duration_minutes: 60,
    price: '',
    category: 'beauty'
  });

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      setLoading(true);
      setError('');
      
      if (!authService.isProvider()) {
        setError('Only service providers can manage services');
        return;
      }

      const response = await servicesAPI.getMyServices();
      
      if (response.success) {
        setServices(response.data || []);
      } else {
        setError(response.error || 'Failed to load services');
      }
      
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateService = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError('');

      const response = await servicesAPI.create(formData);
      
      if (response.success) {
        setShowForm(false);
        setFormData({
          name: '',
          description: '',
          duration_minutes: 60,
          price: '',
          category: 'beauty'
        });
        await loadServices(); // Reload the list
      } else {
        setError(response.error || 'Failed to create service');
      }
      
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to create service');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const categoryLabels = {
    beauty: 'Beauty & Personal Care',
    health: 'Health & Wellness',
    fitness: 'Fitness',
    professional: 'Professional Services',
    other: 'Other'
  };

  if (!authService.isProvider()) {
    return (
      <div className="service-manager">
        <div className="access-denied">
          <h3>🔒 Access Restricted</h3>
          <p>Service management is only available for service providers.</p>
          <p>Please register as a provider to offer your services.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="service-manager">
      <div className="service-header">
        <h2>📊 Manage Your Services</h2>
        <button 
          onClick={() => setShowForm(true)}
          className="primary-btn"
          disabled={loading}
        >
          ➕ Add New Service
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={loadServices}>Retry</button>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Create New Service</h3>
              <button onClick={() => setShowForm(false)}>×</button>
            </div>
            
            <form onSubmit={handleCreateService}>
              <div className="form-group">
                <label>Service Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g., Haircut, Massage, Consultation"
                  required
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Describe your service..."
                  rows="3"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Duration (minutes) *</label>
                  <input
                    type="number"
                    name="duration_minutes"
                    value={formData.duration_minutes}
                    onChange={handleChange}
                    min="15"
                    step="15"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Price (KES)</label>
                  <input
                    type="number"
                    name="price"
                    value={formData.price}
                    onChange={handleChange}
                    placeholder="0 for free service"
                    min="0"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Category *</label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  required
                >
                  <option value="beauty">Beauty & Personal Care</option>
                  <option value="health">Health & Wellness</option>
                  <option value="fitness">Fitness</option>
                  <option value="professional">Professional Services</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-actions">
                <button 
                  type="button" 
                  onClick={() => setShowForm(false)}
                  className="secondary-btn"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="primary-btn"
                >
                  {loading ? 'Creating...' : 'Create Service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="services-content">
        {loading && services.length === 0 ? (
          <div className="loading-state">Loading services...</div>
        ) : services.length === 0 ? (
          <div className="empty-state">
            <h3>No services yet</h3>
            <p>Create your first service to start accepting bookings!</p>
            <button 
              onClick={() => setShowForm(true)}
              className="primary-btn"
            >
              Create Your First Service
            </button>
          </div>
        ) : (
          <div className="services-grid">
            <div className="services-stats">
              <p>Showing {services.length} service(s)</p>
            </div>
            
            {services.map(service => (
              <div key={service.id} className="service-card">
                <div className="service-card-header">
                  <h4>{service.name}</h4>
                  <span className="category-tag">
                    {categoryLabels[service.category] || service.category}
                  </span>
                </div>
                
                {service.description && (
                  <p className="service-description">{service.description}</p>
                )}
                
                <div className="service-details">
                  <span>⏱️ {service.duration_minutes} minutes</span>
                  <span>💰 {service.price ? `KES ${service.price}` : 'Free'}</span>
                </div>
                
                <div className="service-actions">
                  <small>Created: {new Date(service.created_at).toLocaleDateString()}</small>
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