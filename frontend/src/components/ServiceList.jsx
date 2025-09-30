import React, { useState, useEffect } from 'react'
import api from '../services/auth'
import './ServiceList.css'

function ServiceList({ user }) {
  const [allServices, setAllServices] = useState([])
  const [filteredServices, setFilteredServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')

  // Fetch all services on component mount
  useEffect(() => {
    fetchAllServices()
  }, [])

  // Filter services whenever search term or category changes
  useEffect(() => {
    filterServices()
  }, [searchTerm, selectedCategory, allServices])

  const fetchAllServices = async () => {
    try {
      setLoading(true)
      const response = await api.get('/services')
      setAllServices(response.data.services || [])
    } catch (error) {
      console.error('Error fetching services:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterServices = () => {
    let filtered = allServices

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim()
      filtered = filtered.filter(service =>
        service.name.toLowerCase().includes(term) ||
        service.description?.toLowerCase().includes(term) ||
        service.category.toLowerCase().includes(term) ||
        service.provider_name?.toLowerCase().includes(term) ||
        service.business_name?.toLowerCase().includes(term)
      )
    }

    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter(service =>
        service.category === selectedCategory
      )
    }

    setFilteredServices(filtered)
  }

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value)
  }

  const handleCategoryChange = (e) => {
    setSelectedCategory(e.target.value)
  }

  const clearFilters = () => {
    setSearchTerm('')
    setSelectedCategory('')
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
                placeholder="Search services, providers, categories..."
                value={searchTerm}
                onChange={handleSearchChange}
              />
              {(searchTerm || selectedCategory) && (
                <button 
                  className="btn btn-secondary"
                  onClick={clearFilters}
                >
                  Clear
                </button>
              )}
            </div>
            
            <select 
              value={selectedCategory}
              onChange={handleCategoryChange}
            >
              <option value="">All Categories</option>
              <option value="Beauty">Beauty & Personal Care</option>
              <option value="Health">Health & Wellness</option>
              <option value="Fitness">Fitness & Training</option>
              <option value="Professional">Professional Services</option>
              <option value="Automotive">Automotive</option>
              <option value="Home Services">Home Services</option>
              <option value="Education">Education & Tutoring</option>
            </select>
          </div>
        </div>

        {/* Search info */}
        {(searchTerm || selectedCategory) && (
          <div className="search-info">
            <p>
              Showing {filteredServices.length} of {allServices.length} services
              {searchTerm && ` matching "${searchTerm}"`}
              {selectedCategory && ` in ${selectedCategory}`}
            </p>
          </div>
        )}

        {loading ? (
          <div className="loading">Loading services...</div>
        ) : (
          <>
            <div className="services-grid">
              {filteredServices.map(service => (
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

            {filteredServices.length === 0 && !loading && (
              <div className="no-services">
                <p>No services found. Try adjusting your search filters.</p>
                {(searchTerm || selectedCategory) && (
                  <button className="btn btn-primary" onClick={clearFilters}>
                    Show All Services
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default ServiceList