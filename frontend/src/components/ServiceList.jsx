import React, { useState, useEffect } from 'react'
import api from '../services/auth'
import './ServiceList.css'

function ServiceList({ user }) {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')

  useEffect(() => {
    const delaySearch = setTimeout(() => {
      fetchServices()
    }, 300) // 300ms delay for live search

    return () => clearTimeout(delaySearch)
  }, [searchTerm, selectedCategory])

  const fetchServices = async () => {
    try {
      setLoading(true)
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

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value)
  }

  const handleCategoryChange = (e) => {
    setSelectedCategory(e.target.value)
  }

  return (
    <div className="service-list">
      <div className="container">
        <div className="service-header">
          <h2>Available Services</h2>
          
          <div className="search-filters">
            <div className="search-group">
              <input
                type="text"
                placeholder="Search services, providers..."
                value={searchTerm}
                onChange={handleSearchChange}
              />
            </div>
            
            <select 
              value={selectedCategory}
              onChange={handleCategoryChange}
            >
              <option value="">All Categories</option>
              <option value="Beauty">Beauty</option>
              <option value="Health">Health</option>
              <option value="Fitness">Fitness</option>
              <option value="Professional">Professional</option>
              <option value="Automotive">Automotive</option>
              <option value="Home Services">Home Services</option>
              <option value="Education">Education</option>
            </select>
          </div>
        </div>

        {loading && <div className="loading">Searching services...</div>}

        <div className="services-grid">
          {services.map(service => (
            <div key={service.id} className="service-card">
              <h3>{service.name}</h3>
              <p className="service-category">{service.category}</p>
              <p className="service-description">{service.description}</p>
              <div className="service-details">
                <span>⏱️ {service.duration} minutes</span>
                <span>💰 KES {service.price}</span>
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

        {!loading && services.length === 0 && (
          <div className="no-services">
            <p>No services found. Try adjusting your search filters.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ServiceList