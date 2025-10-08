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
  const [deletingId, setDeletingId] = useState(null)
  const [togglingId, setTogglingId] = useState(null)
  const [businessClosed, setBusinessClosed] = useState(false)

  useEffect(() => {
    fetchMyServices()
  }, [user.id])

  const fetchMyServices = async () => {
    try {
      const response = await api.get('/services')
      const myServices = response.data.services.filter(
        s => s.provider_id === user.id
      )
      setServices(myServices)
      setBusinessClosed(myServices.length > 0 && myServices.every(s => s.is_closed))
    } catch (err) {
      console.error('Error fetching services:', err)
    }
  }

  const validateForm = () => {
    const newErrors = {}
    if (!formData.name.trim()) newErrors.name = 'Service name is required'
    if (!formData.category) newErrors.category = 'Category is required'
    if (!formData.duration || formData.duration < 15)
      newErrors.duration = 'Duration must be at least 15 minutes'
    if (!formData.price || formData.price < 0)
      newErrors.price = 'Price must be a positive number'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async e => {
    e.preventDefault()
    if (!validateForm()) return
    setSaving(true)

    try {
      const payload = {
        ...formData,
        duration: parseInt(formData.duration),
        price: parseFloat(formData.price)
      }

      if (editingService) {
        await api.put(`/services/${editingService.id}`, payload)
      } else {
        await api.post('/services', payload)
      }

      await fetchMyServices()
      setShowForm(false)
      setEditingService(null)
      setFormData({ name: '', description: '', category: '', duration: '', price: '' })
    } catch (err) {
      console.error('Error saving service:', err)
      setErrors({ submit: 'Failed to save service.' })
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = service => {
    setEditingService(service)
    setFormData({
      name: service.name,
      description: service.description || '',
      category: service.category,
      duration: service.duration.toString(),
      price: service.price ? service.price.toString() : ''
    })
    setShowForm(true)
  }

  const handleDelete = async id => {
    if (!window.confirm('Delete this service?')) return
    setDeletingId(id)
    try {
      await api.delete(`/services/${id}`)
      await fetchMyServices()
    } catch (err) {
      console.error('Error deleting service:', err)
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleService = async service => {
    setTogglingId(service.id)
    try {
      await api.patch(`/services/${service.id}/closure`, {
        is_closed: service.is_closed ? 0 : 1
      })
      await fetchMyServices()
    } catch (err) {
      console.error('Error toggling service:', err)
      alert('Failed to update service status')
    } finally {
      setTogglingId(null)
    }
  }

  const handleToggleBusiness = async () => {
    try {
      const newStatus = !businessClosed
      setBusinessClosed(newStatus)
      await api.patch(`/services/provider/${user.id}/closure`, {
        is_closed: newStatus ? 1 : 0
      })
      await fetchMyServices()
    } catch (err) {
      console.error('Error toggling business:', err)
      setBusinessClosed(!businessClosed)
    }
  }

  return (
    <div className="service-manager">
      <div className="container">
        <div className="manager-header">
          <h2>Manage Your Services</h2>
          <div className="header-actions">
            <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancel' : 'Add New Service'}
            </button>
            {services.length > 0 && (
              <button className="btn btn-secondary" onClick={handleToggleBusiness}>
                {businessClosed ? 'Open Business' : 'Close Business'}
              </button>
            )}
          </div>
        </div>

        {/* Service cards */}
        <div className="services-list">
          {services.map(s => (
            <div
              key={s.id}
              className={`service-item card ${s.is_closed ? 'closed-provider' : ''}`}
            >
              <div className="service-info">
                <h4>
                  {s.name}{' '}
                  {s.is_closed && <span className="closed-badge">(Closed)</span>}
                </h4>
                <p className="service-category">{s.category}</p>
                <p className="service-description">{s.description}</p>
                <div className="service-meta">
                  <span>Duration: {s.duration} mins</span>
                  <span>Price: {s.price ? `KES ${s.price}` : 'Free'}</span>
                </div>
              </div>
              <div className="service-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => handleEdit(s)}
                  disabled={deletingId === s.id}
                >
                  Edit
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => handleDelete(s.id)}
                  disabled={deletingId === s.id}
                >
                  {deletingId === s.id ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => handleToggleService(s)}
                  disabled={togglingId === s.id}
                >
                  {togglingId === s.id
                    ? 'Updating...'
                    : s.is_closed
                    ? 'Open Service'
                    : 'Close Service'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Form */}
        {showForm && (
          <div className="service-form card">
            <h3>{editingService ? 'Edit Service' : 'Create New Service'}</h3>
            <form onSubmit={handleSubmit}>
              <label>Name *</label>
              <input
                name="name"
                value={formData.name}
                onChange={e =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
              <label>Category *</label>
              <input
                name="category"
                value={formData.category}
                onChange={e =>
                  setFormData({ ...formData, category: e.target.value })
                }
              />
              <label>Duration (mins) *</label>
              <input
                type="number"
                name="duration"
                value={formData.duration}
                onChange={e =>
                  setFormData({ ...formData, duration: e.target.value })
                }
              />
              <label>Price (KES) *</label>
              <input
                type="number"
                name="price"
                value={formData.price}
                onChange={e =>
                  setFormData({ ...formData, price: e.target.value })
                }
              />
              <button type="submit" className="btn btn-primary">
                Save
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

export default ServiceManager
