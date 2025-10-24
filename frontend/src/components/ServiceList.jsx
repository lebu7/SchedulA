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
  const [expandedServiceId, setExpandedServiceId] = useState(null);
  const [selectedAddons, setSelectedAddons] = useState({});
  const [totalPrice, setTotalPrice] = useState({});

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
      setAllServices(response.data.services || []);
    } catch (error) {
      console.error("Error fetching services:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubServices = async (serviceId) => {
    try {
      const res = await api.get(`/services/${serviceId}/sub-services`);
      setSubServices((prev) => ({
        ...prev,
        [serviceId]: res.data.sub_services || [],
      }));
    } catch (err) {
      console.error("Error fetching sub-services:", err);
    }
  };

  const toggleExpand = (serviceId) => {
    if (expandedServiceId === serviceId) {
      setExpandedServiceId(null);
    } else {
      setExpandedServiceId(serviceId);
      fetchSubServices(serviceId);
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
  const handleAddonSelect = (serviceId, addon, isChecked) => {
  setSelectedAddons((prev) => {
    const current = prev[serviceId] || [];
    const updated = isChecked
      ? [...current, addon]
      : current.filter((a) => a.id !== addon.id);
    return { ...prev, [serviceId]: updated };
  });

  setTotalPrice((prev) => {
    const base = allServices.find((s) => s.id === serviceId)?.price || 0;
    const addonsTotal = (selectedAddons[serviceId] || [])
      .filter((a) => isChecked || a.id !== addon.id)
      .reduce((sum, a) => sum + parseFloat(a.price || a.additional_price || 0), 0);
    return { ...prev, [serviceId]: base + addonsTotal };
  });
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
              {filteredServices.map((service) => (
                <div className={`service-card ${service.is_closed ? "closed-service" : ""}`} data-status={service.is_closed ? "Closed" : ""}>
                  <div
                    className="service-main"
                    onClick={() =>
                      !service.is_closed && handleBookClick(service)
                    }
                  >

                    <p className="service-category">{service.category}</p>
                    <p className="service-description">{service.description}</p>
                    <div className="service-details">
                      <span>⏱️ {service.duration} minutes</span>
                        <span>
                          💰 Total: KES{" "}
                          {totalPrice[service.id]
                            ? totalPrice[service.id].toFixed(2)
                            : parseFloat(service.price).toFixed(2)}
                        </span>

                    </div>
                    <div className="service-provider">
                      <strong>{service.provider_name}</strong>
                      {service.business_name && (
                        <span> - {service.business_name}</span>
                      )}
                    </div>
                    {user?.user_type === "client" && (
                      <button
                        className="btn btn-primary book-btn"
                        disabled={service.is_closed}
                      >
                        {service.is_closed ? "Closed" : "Book Appointment"}
                      </button>
                    )}
                  </div>

                  {/* === Sub-services (Add-ons) === */}
                  <div className="addons-section">
                    <button
                      className="btn btn-outline"
                      onClick={() => toggleExpand(service.id)}
                    >
                      {expandedServiceId === service.id
                        ? "Hide Add-ons"
                        : "View Add-ons"}
                    </button>

                    {expandedServiceId === service.id && (
                      <div className="addons-list">
                        {subServices[service.id]?.length ? (
                          <ul>
                            {subServices[service.id].map((sub) => {
                              const isChecked =
                                selectedAddons[service.id]?.some((a) => a.id === sub.id) || false;

                              return (
                                <li key={sub.id} className="addon-option">
                                  <label>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) =>
                                        handleAddonSelect(service.id, sub, e.target.checked)
                                      }
                                    />
                                    <strong>{sub.name}</strong>{" "}
                                    <span>+KES {sub.price ?? sub.additional_price}</span>
                                    {sub.description && <small> — {sub.description}</small>}
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p>No add-ons available.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
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
