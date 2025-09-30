import React, { useState, useEffect } from 'react'
import api from '../services/auth'
import './ServiceList.css'

function ServiceList({ user }) {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')

  useEffect(() => {
    fetchServices()
  }, [])

  const fetchServices = async () => {
    try {
      const params = new URLSearchParams()
      if (searchTerm) params.append('search', searchTerm)
      if (selectedCategory) params.append('category', selectedCategory)

      const response = await api.get(`/services?${params.toString()}`)
      setServices(response.data.services || [])
    } catch (error) {
      console.error('Error fetching services:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    setLoading(true)
    fetchServices()
  }

  if (loading) {
    return <div className="loading">Loading services...</div>
  }

  return (
    <div className="service-list">
      <div className="container">
        <div className="service-header">
          <h2>Available Services</h2>
          
          <form onSubmit={handleSearch} className="search-filters">
            <div className="search-group">
              <input
                type="text"
                placeholder="Search services..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button type="submit" className="btn btn-primary">Search</button>
            </div>
            
            <select 
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              <option value="Beauty">Beauty</option>
              <option value="Health">Health</option>
              <option value="Fitness">Fitness</option>
              <option value="Professional">Professional</option>
            </select>
          </form>
        </div>

        <div className="services-grid">
          {services.map(service => (
            <div key={service.id} className="service-card">
              <h3>{service.name}</h3>
              <p className="service-category">{service.category}</p>
              <p className="service-description">{service.description}</p>
              <div className="service-details">
                <span>⏱️ {service.duration} min</span>
                <span>💰 ${service.price}</span>
              </div>
              <div className="service-provider">
                <strong>{service.provider_name}</strong>
                {service.business_name && <span> - {service.business_name}</span>}
              </div>
              {user?.user_type === 'client' && (
                <button className="btn btn-primary book-btn">
                  Book Appointment
                </button>
              )}
            </div>
          ))}
        </div>

        {services.length === 0 && (
          <div className="no-services">
            <p>No services found. Try adjusting your search filters.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ServiceList