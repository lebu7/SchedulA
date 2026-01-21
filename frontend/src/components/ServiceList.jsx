import React, { useState, useEffect } from "react";
import api from "../services/auth";
import BookingModal from "./BookingModal";
import { Search, Filter, ArrowUpDown, List, Clock, Zap } from "lucide-react"; // 🧠 Added Icons
import "./ServiceList.css";

// 🧠 Helper: Fisher-Yates Shuffle for true randomness
const shuffleArray = (array) => {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
};

function ServiceList({ user }) {
  const [allServices, setAllServices] = useState([]);
  const [filteredServices, setFilteredServices] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [sortOption, setSortOption] = useState("random"); // 🆕 Sort State
  const [itemsToShow, setItemsToShow] = useState(20); // 🆕 Limit State

  // Modals & Data
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [subServices, setSubServices] = useState({});

  useEffect(() => {
    fetchAllServices();
  }, []);

  // 🧠 Re-run filter whenever any dependency changes (including sort/limit)
  useEffect(() => {
    filterServices();
  }, [searchTerm, selectedCategory, sortOption, itemsToShow, allServices]);

  const fetchAllServices = async () => {
    try {
      setLoading(true);
      const response = await api.get("/services");
      let services = response.data.services || [];
      
      // 🧠 Randomize initially so the "default" view is fresh every refresh
      services = shuffleArray(services);
      
      setAllServices(services);
      fetchAllSubServices(services);
    } catch (error) {
      console.error("Error fetching services:", error);
    } finally {
      setLoading(false);
    }
  };

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
    let result = [...allServices];

    // 1. Search Filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter((service) => {
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

    // 2. Category Filter
    if (selectedCategory) {
      result = result.filter((service) => service.category === selectedCategory);
    }

    // 3. 🆕 Sorting Logic
    if (sortOption !== "random") {
        result.sort((a, b) => {
            const priceA = parseFloat(a.price || 0);
            const priceB = parseFloat(b.price || 0);
            const nameA = a.name.toLowerCase();
            const nameB = b.name.toLowerCase();

            switch (sortOption) {
                case "price-asc": return priceA - priceB;
                case "price-desc": return priceB - priceA;
                case "name-asc": return nameA.localeCompare(nameB);
                case "name-desc": return nameB.localeCompare(nameA);
                case "duration-asc": return parseInt(a.duration) - parseInt(b.duration);
                default: return 0;
            }
        });
    }
    // If sort is 'random', we rely on the initial shuffle in fetchAllServices, 
    // or we could re-shuffle here if you want it dynamic on every click, 
    // but usually stable random is better for UX.

    // 4. 🆕 Limit Items
    if (itemsToShow !== "all") {
        result = result.slice(0, parseInt(itemsToShow));
    }

    setFilteredServices(result);
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
        
        {/* 🧠 Enhanced Header Section */}
        <div className="service-page-header">
            <div className="title-section">
                <h2>Explore Services</h2>
                <p>Discover the best beauty and wellness professionals near you.</p>
            </div>
            
            {/* 🆕 Control Bar */}
            <div className="control-bar">
                <div className="search-wrapper">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Find services or providers..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="filters-wrapper">
                    {/* Category Filter */}
                    <div className="filter-item">
                        <Filter size={16} />
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

                    {/* 🆕 Sort Filter */}
                    <div className="filter-item">
                        <ArrowUpDown size={16} />
                        <select
                            value={sortOption}
                            onChange={(e) => setSortOption(e.target.value)}
                        >
                            <option value="random">Recommended</option>
                            <option value="price-asc">Price: Low to High</option>
                            <option value="price-desc">Price: High to Low</option>
                            <option value="name-asc">Name: A - Z</option>
                            <option value="duration-asc">Duration: Shortest</option>
                        </select>
                    </div>

                    {/* 🆕 Limit Filter */}
                    <div className="filter-item mobile-hide">
                        <List size={16} />
                        <select
                            value={itemsToShow}
                            onChange={(e) => setItemsToShow(e.target.value)}
                        >
                            <option value={10}>Show 10</option>
                            <option value={20}>Show 20</option>
                            <option value={50}>Show 50</option>
                            <option value="all">Show All</option>
                        </select>
                    </div>

                    {(searchTerm || selectedCategory || sortOption !== "random") && (
                        <button
                            className="btn-clear"
                            onClick={() => {
                                setSearchTerm("");
                                setSelectedCategory("");
                                setSortOption("random");
                            }}
                        >
                            Reset
                        </button>
                    )}
                </div>
            </div>
        </div>

        {bookingSuccess && (
          <div className="success-message">
            ✅ Appointment booked successfully! Check your appointments page.
          </div>
        )}

        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Finding the best services for you...</p>
          </div>
        ) : (
          <>
            <div className="services-grid">
              {filteredServices.map((service) => {
                const addons = subServices[service.id] || [];
                const price = parseFloat(service.price).toFixed(0);

                return (
                  <div
                    key={service.id}
                    className={`service-card ${
                      service.is_closed ? "closed-service" : ""
                    }`}
                    data-status={service.is_closed ? "Closed" : ""}
                  >
                    <div className={`service-header-bar ${getCategoryClass(service.category)}`}>
                      <div className="header-content">
                        <h3 className="service-name">{service.name}</h3>
                        <p className="service-provider">
                           {service.business_name || service.provider_name}
                        </p>
                      </div>
                      <div className="header-price">
                        <small>From</small>
                        KES {price}
                      </div>
                    </div>

                    <div
                      className="service-main"
                      onClick={() => !service.is_closed && handleBookClick(service)}
                    >
                      <div className="meta-row">
                          <span className="meta-badge category">{service.category}</span>
                          <span className="meta-badge duration">
                              <Clock size={12} /> {service.duration}m
                          </span>
                      </div>

                      <p className="service-description">
                        {service.description.length > 80 
                            ? service.description.substring(0, 80) + "..." 
                            : service.description}
                      </p>

                      {/* Addon Preview Section */}
                      {addons.length > 0 ? (
                        <div className="addon-preview">
                          <div className="addon-title"><Zap size={12} fill="#f59e0b" color="#f59e0b" /> Add-ons available</div>
                          <div className="addon-tags">
                            {addons.slice(0, 2).map((a) => (
                              <span key={a.id} className="addon-tag">
                                {a.name}
                              </span>
                            ))}
                            {addons.length > 2 && <span className="addon-tag more">+{addons.length - 2} more</span>}
                          </div>
                        </div>
                      ) : (
                        <div className="addon-spacer"></div>
                      )}

                      {user?.user_type === "client" && (
                        <button
                          className="btn btn-primary book-btn"
                          disabled={service.is_closed}
                        >
                          {service.is_closed ? "Currently Closed" : "Book Now"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredServices.length === 0 && !loading && (
              <div className="no-services">
                <Search size={48} color="#cbd5e1" />
                <h3>No services found</h3>
                <p>We couldn't find matches for your filters. Try adjusting your search.</p>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                      setSearchTerm("");
                      setSelectedCategory("");
                      setSortOption("random");
                    }}
                  >
                    Clear Filters
                </button>
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