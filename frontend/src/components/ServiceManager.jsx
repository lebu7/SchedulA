import React, { useState, useEffect } from 'react'
import api from '../services/auth'
import './ServiceManager.css'

function ServiceManager({ user }) {
  const [services, setServices] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingService, setEditingService] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    duration: '',
    price: ''
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  // Fetch services immediately on component mount and when user changes
  useEffect(() => {
    fetchMyServices()
  }, [user.id])

  const fetchMyServices = async () => {
    try {
      const response = await api.get('/services')
      const myServices = response.data.services.filter(
        service => service.provider_id === user.id
      )
      setServices(myServices)
    } catch (error) {
      console.error('Error fetching services:', error)
    }
  }

  const validateForm = () => {
    const newErrors = {}
    
    if (!formData.name.trim()) {
      newErrors.name = 'Service name is required'
    }
    
    if (!formData.category) {
      newErrors.category = 'Category is required'
    }
    
    if (!formData.duration || formData.duration < 15) {
      newErrors.duration = 'Duration must be at least 15 minutes'
    }
    
    if (!formData.price || formData.price < 0) {
      newErrors.price = 'Price must be a positive number'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setSaving(true)

    try {
      const submitData = {
        ...formData,
        duration: parseInt(formData.duration),
        price: parseFloat(formData.price)
      }

      if (editingService) {
        await api.put(`/services/${editingService.id}`, submitData)
      } else {
        await api.post('/services', submitData)
      }
      
      // Refresh services immediately after successful save
      await fetchMyServices()
      
      // Reset form
      setShowForm(false)
      setEditingService(null)
      setFormData({ name: '', description: '', category: '', duration: '', price: '' })
      setErrors({})
      
    } catch (error) {
      console.error('Error saving service:', error)
      setErrors({ submit: 'Failed to save service. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }))
    }
  }

  const handleEdit = (service) => {
    setEditingService(service)
    setFormData({
      name: service.name,
      description: service.description || '',
      category: service.category,
      duration: service.duration.toString(),
      price: service.price ? service.price.toString() : ''
    })
    setErrors({})
    setShowForm(true)
  }

  const handleDelete = async (serviceId) => {
    if (window.confirm('Are you sure you want to delete this service?')) {
      try {
        await api.delete(`/services/${serviceId}`)
        // Refresh services immediately after delete
        await fetchMyServices()
      } catch (error) {
        console.error('Error deleting service:', error)
        alert('Failed to delete service. Please try again.')
      }
    }
  }

  const resetForm = () => {
    setShowForm(false)
    setEditingService(null)
    setFormData({ name: '', description: '', category: '', duration: '', price: '' })
    setErrors({})
  }

  return (
    <div className="service-manager">
      <div className="container">
        <div className="manager-header">
          <h2>Manage Your Services</h2>
          <button 
            className="btn btn-primary"
            onClick={() => setShowForm(!showForm)}
            disabled={saving}
          >
            {showForm ? 'Cancel' : 'Add New Service'}
          </button>
        </div>

        {showForm && (
          <div className="service-form card">
            <h3>{editingService ? 'Edit Service' : 'Create New Service'}</h3>
            
            {errors.submit && (
              <div className="error-message">{errors.submit}</div>
            )}
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Service Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g., Haircut, Massage, Consultation"
                  disabled={saving}
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
                  placeholder="Describe your service in detail..."
                  disabled={saving}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Category *</label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    disabled={saving}
                  >
                    <option value="">Select Category</option>
                    <option value="Beauty">Beauty & Personal Care</option>
                    <option value="Health">Health & Wellness</option>
                    <option value="Fitness">Fitness & Training</option>
                    <option value="Professional">Professional Services</option>
                    <option value="Automotive">Automotive</option>
                    <option value="Home Services">Home Services</option>
                    <option value="Education">Education & Tutoring</option>
                    <option value="Other">Other</option>
                  </select>
                  {errors.category && <span className="field-error">{errors.category}</span>}
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
                    disabled={saving}
                  />
                  {errors.duration && <span className="field-error">{errors.duration}</span>}
                  <small className="field-hint">Minimum 15 minutes</small>
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
                    disabled={saving}
                  />
                  {errors.price && <span className="field-error">{errors.price}</span>}
                  <small className="field-hint">Enter 0 for free service</small>
                </div>
              </div>

              <div className="form-actions">
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : (editingService ? 'Update Service' : 'Create Service')}
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={resetForm}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="services-list">
          {services.map(service => (
            <div key={service.id} className="service-item card">
              <div className="service-info">
                <h4>{service.name}</h4>
                <p className="service-category">{service.category}</p>
                <p className="service-description">{service.description}</p>
                <div className="service-meta">
                  <span>Duration: {service.duration} minutes</span>
                  <span>Price: {service.price ? `KES ${service.price}` : 'Free'}</span>
                </div>
              </div>
              <div className="service-actions">
                <button 
                  className="btn btn-secondary"
                  onClick={() => handleEdit(service)}
                  disabled={saving}
                >
                  Edit
                </button>
                <button 
                  className="btn btn-danger"
                  onClick={() => handleDelete(service.id)}
                  disabled={saving}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {services.length === 0 && !showForm && (
          <div className="no-services card">
            <p>You haven't created any services yet.</p>
            <button 
              className="btn btn-primary"
              onClick={() => setShowForm(true)}
            >
              Create Your First Service
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default ServiceManager