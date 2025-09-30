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
    duration: 60,
    price: ''
  })

  useEffect(() => {
    fetchMyServices()
  }, [])

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

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingService) {
        await api.put(`/services/${editingService.id}`, formData)
      } else {
        await api.post('/services', formData)
      }
      setShowForm(false)
      setEditingService(null)
      setFormData({ name: '', description: '', category: '', duration: 60, price: '' })
      fetchMyServices()
    } catch (error) {
      console.error('Error saving service:', error)
    }
  }

  const handleEdit = (service) => {
    setEditingService(service)
    setFormData({
      name: service.name,
      description: service.description || '',
      category: service.category,
      duration: service.duration,
      price: service.price
    })
    setShowForm(true)
  }

  const handleDelete = async (serviceId) => {
    if (window.confirm('Are you sure you want to delete this service?')) {
      try {
        await api.delete(`/services/${serviceId}`)
        fetchMyServices()
      } catch (error) {
        console.error('Error deleting service:', error)
      }
    }
  }

  return (
    <div className="service-manager">
      <div className="container">
        <div className="manager-header">
          <h2>Manage Your Services</h2>
          <button 
            className="btn btn-primary"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancel' : 'Add New Service'}
          </button>
        </div>

        {showForm && (
          <div className="service-form card">
            <h3>{editingService ? 'Edit Service' : 'Create New Service'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Service Name:</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                />
              </div>

              <div className="form-group">
                <label>Description:</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  rows="3"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Category:</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    required
                  >
                    <option value="">Select Category</option>
                    <option value="Beauty">Beauty</option>
                    <option value="Health">Health</option>
                    <option value="Fitness">Fitness</option>
                    <option value="Professional">Professional</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Duration (minutes):</label>
                  <input
                    type="number"
                    value={formData.duration}
                    onChange={(e) => setFormData({...formData, duration: parseInt(e.target.value)})}
                    min="15"
                    step="15"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Price ($):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({...formData, price: e.target.value})}
                  />
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  {editingService ? 'Update Service' : 'Create Service'}
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
                  <span>Duration: {service.duration} min</span>
                  <span>Price: ${service.price || 'Free'}</span>
                </div>
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