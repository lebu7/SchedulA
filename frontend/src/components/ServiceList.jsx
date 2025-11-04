import React, { useState, useEffect } from "react";
import api from "../services/auth";
import BookingModal from "./BookingModal";
import "./ServiceList.css";

function ServiceList({ user }) {
  const [allServices, setAllServices] = useState([]);
  const [filteredServices, setFilteredServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [subServices, setSubServices] = useState({});

  useEffect(() => {
    fetchAllServices();
  }, []);

  useEffect(() => {
    filterServices();
  }, [searchTerm, selectedCategory, allServices]);

  const fetchAllServices = async () => {
    try {
      setLoading(true);
      const response = await api.get("/services");
      const services = response.data.services || [];
      setAllServices(services);
      // Fetch sub-services for all
      fetchAllSubServices(services);
    } catch (error) {
      console.error("Error fetching services:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch sub-services for all visible services
  const fetchAllSubServices = async (services) => {
    try {
      const results = {};
      await Promise.all(
        services.map(async (service) => {
          try {
            const res = await api.get(`/services/${service.id}/sub-services`);
            results[service.id] = res.data.sub_services || [];
          } catch {
            results[service.id] = [];
          }
        })
      );
      setSubServices(results);
    } catch (err) {
      console.error("Error fetching add-ons:", err);
    }
  };

  const filterServices = () => {
    let filtered = allServices;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter((service) => {
        const fields = [
          service.name,
          service.description,
          service.category,
          service.provider_name,
          service.business_name,
        ].filter(Boolean);
        return fields.some((field) => {
          const words = field.toLowerCase().split(/\s+/);
          return words.some((word) => word === term || word.startsWith(term));
        });
      });
    }

    if (selectedCategory) {
      filtered = filtered.filter(
        (service) => service.category === selectedCategory
      );
    }

    setFilteredServices(filtered);
  };

  const handleBookClick = (service) => {
    if (service.is_closed) return;
    setSelectedService(service);
    setShowBookingModal(true);
  };

  const handleBookingSuccess = () => {
    setBookingSuccess(true);
    setTimeout(() => setBookingSuccess(false), 3000);
  };

  const handleCloseModal = () => {
    setShowBookingModal(false);
    setSelectedService(null);
  };

  const getCategoryClass = (category) => {
    if (!category) return "default-category";
    const cat = category.toLowerCase();
    if (cat.includes("salon")) return "salon-header";
    if (cat.includes("spa")) return "spa-header";
    if (cat.includes("barber")) return "barber-header";
    return "default-category";
  };

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
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setSearchTerm("");
                    setSelectedCategory("");
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              <option value="Salon">Salon</option>
              <option value="Spa">Spa</option>
              <option value="Barbershop">Barbershop</option>
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
              {filteredServices.map((service) => {
                const addons = subServices[service.id] || [];

                return (
                  <div
                    key={service.id}
                    className={`service-card ${
                      service.is_closed ? "closed-service" : ""
                    }`}
                    data-status={service.is_closed ? "Closed" : ""}
                  >
                    <div
                      className={`service-header-bar ${getCategoryClass(
                        service.category
                      )}`}
                    >
                      <h3 className="service-name">{service.name}</h3>
                      <p className="service-provider">
                        {service.provider_name}
                        {service.business_name && (
                          <span className="business-name">
                            {" "}
                            — {service.business_name}
                          </span>
                        )}
                      </p>
                    </div>

                    <div
                      className="service-main"
                      onClick={() =>
                        !service.is_closed && handleBookClick(service)
                      }
                    >
                      <p className="service-category">{service.category}</p>
                      <p className="service-description">
                        {service.description}
                      </p>

                      <div className="service-details">
                        <span>{service.duration} minutes</span>
                        <span className="price-text">
                          Deposit:{" "}
                          <strong>
                            KES {parseFloat(service.price).toFixed(2)}
                          </strong>
                        </span>
                      </div>

                      {/* Addon Preview Section */}
                      {addons.length > 0 && (
                        <div className="addon-preview">
                          <p>Popular add-ons:</p>
                          <ul>
                            {addons.slice(0, 2).map((a) => (
                              <li key={a.id}>
                                {a.name} (+KES {a.price ?? a.additional_price})
                              </li>
                            ))}
                            {addons.length > 2 && (
                              <li className="more-addons">+ more available</li>
                            )}
                          </ul>
                        </div>
                      )}

                      {user?.user_type === "client" && (
                        <button
                          className="btn btn-primary book-btn"
                          disabled={service.is_closed}
                        >
                          {service.is_closed ? "Closed" : "Book Appointment"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredServices.length === 0 && !loading && (
              <div className="no-services">
                <p>No services found. Try adjusting your search filters.</p>
                {(searchTerm || selectedCategory) && (
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setSearchTerm("");
                      setSelectedCategory("");
                    }}
                  >
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
  );
}

export default ServiceList;
