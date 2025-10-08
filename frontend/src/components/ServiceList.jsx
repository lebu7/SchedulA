import React, { useState, useEffect } from 'react'
import api from '../services/auth'
import BookingModal from './BookingModal'
import './ServiceList.css'

function ServiceList({ user }) {
  const [allServices, setAllServices] = useState([])
  const [filteredServices, setFilteredServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [selectedService, setSelectedService] = useState(null)
  const [bookingSuccess, setBookingSuccess] = useState(false)

  useEffect(() => {
    fetchAllServices()
  }, [])

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
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim()
      filtered = filtered.filter(service => {
        const fields = [
          service.name,
          service.description,
          service.category,
          service.provider_name,
          service.business_name
        ].filter(Boolean)
        return fields.some(field => {
          const words = field.toLowerCase().split(/\s+/)
          return words.some(word =>
            word === term || word.startsWith(term)
          )
        })
      })
    }

    if (selectedCategory) {
      filtered = filtered.filter(service => service.category === selectedCategory)
    }

    setFilteredServices(filtered)
  }

  const handleBookClick = (service) => {
    if (service.is_closed) return
    setSelectedService(service)
    setShowBookingModal(true)
  }

  const handleBookingSuccess = () => {
    setBookingSuccess(true)
    setTimeout(() => setBookingSuccess(false), 3000)
  }

  const handleCloseModal = () => {
    setShowBookingModal(false)
    setSelectedService(null)
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
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {(searchTerm || selectedCategory) && (
                <button className="btn btn-secondary" onClick={() => { setSearchTerm(''); setSelectedCategory('') }}>
                  Clear
                </button>
              )}
            </div>

            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
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

        {bookingSuccess && (
          <div className="success-message">
            ✅ Appointment booked successfully! Check your appointments page.
          </div>
        )}

        {loading ? (
          <div className="loading">Loading services...</div>
        ) : (
          <>
            <div className="services-grid">
              {filteredServices.map(service => (
                <div
                  key={service.id}
                  className={`service-card ${service.is_closed ? 'closed-service' : ''}`}
                  onClick={() => handleBookClick(service)}
                >
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
                    <button
                      className="btn btn-primary book-btn"
                      disabled={service.is_closed}
                    >
                      {service.is_closed ? 'Closed' : 'Book Appointment'}
                    </button>
                  )}
                </div>
              ))}
            </div>

            {filteredServices.length === 0 && !loading && (
              <div className="no-services">
                <p>No services found. Try adjusting your search filters.</p>
                {(searchTerm || selectedCategory) && (
                  <button className="btn btn-primary" onClick={() => { setSearchTerm(''); setSelectedCategory('') }}>
                    Show All Services
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {showBookingModal && selectedService && (
          <BookingModal
            service={selectedService}
            user={user}
            onClose={handleCloseModal}
            onBookingSuccess={handleBookingSuccess}
          />
        )}
      </div>
    </div>
  )
}

export default ServiceList
