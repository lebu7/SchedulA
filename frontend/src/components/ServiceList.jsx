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
      const res = await api.get('/services')
      setAllServices(res.data.services || [])
    } catch (err) {
      console.error('Error fetching services:', err)
    } finally {
      setLoading(false)
    }
  }

  const filterServices = () => {
    let list = allServices
    if (searchTerm)
      list = list.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    if (selectedCategory)
      list = list.filter(s => s.category === selectedCategory)
    setFilteredServices(list)
  }

  const handleBookClick = service => {
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
        <h2>Available Services</h2>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="services-grid">
            {filteredServices.map(service => (
              <div
                key={service.id}
                className={`service-card ${
                  service.is_closed ? 'closed-client' : ''
                }`}
              >
                <h3>
                  {service.name}{' '}
                  {service.is_closed && (
                    <span className="closed-badge">(Closed)</span>
                  )}
                </h3>
                <p className="service-category">{service.category}</p>
                <p className="service-description">{service.description}</p>
                <div className="service-details">
                  <span>⏱️ {service.duration} mins</span>
                  <span>💰 KES {service.price}</span>
                </div>
                <div className="service-provider">
                  <strong>{service.provider_name}</strong>{' '}
                  {service.business_name && <span>– {service.business_name}</span>}
                </div>

                {user?.user_type === 'client' && (
                  <button
                    className="btn btn-primary book-btn"
                    disabled={service.is_closed}
                    onClick={() => handleBookClick(service)}
                  >
                    {service.is_closed ? 'Unavailable' : 'Book Appointment'}
                  </button>
                )}
              </div>
            ))}
          </div>
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
