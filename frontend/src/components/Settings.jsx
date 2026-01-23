import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; 
import api from "../services/auth";
import BookingModal from "./BookingModal";
import { 
  Search, Filter, ArrowUpDown, List, Clock, Zap, 
  Plus, Power, Edit, Trash2, Store, Lock, Unlock, MapPin, X, ExternalLink 
} from "lucide-react"; 
import "./ServiceList.css";

// 🏙️ Nairobi Suburbs Data
const NAIROBI_SUBURBS = {
  A: ["Airbase"],
  B: ["Baba Dogo"],
  C: ["California", "Chokaa", "Clay City"],
  D: ["Dagoretti", "Dandora", "Donholm"],
  E: ["Eastleigh"],
  G: ["Gikomba/Kamukunji", "Githurai"],
  H: ["Huruma"],
  I: ["Imara Daima", "Industrial Area"],
  J: ["Jamhuri"],
  K: ["Kabiro", "Kahawa", "Kahawa West", "Kamulu", "Kangemi", "Kariobangi", "Kasarani", "Kawangware", "Kayole", "Kiamaiko", "Kibra", "Kileleshwa", "Kitisuru", "Komarock"],
  L: ["Landimawe", "Langata", "Lavington", "Lucky Summer"],
  M: ["Makadara", "Makongeni", "Maringo/Hamza", "Mathare Hospital", "Mathare North", "Mbagathi Way", "Mlango Kubwa", "Mombasa Road", "Mountain View", "Mowlem", "Muthaiga", "Mwiki"],
  N: ["Nairobi South", "Nairobi West", "Njiru"],
  P: ["Pangani", "Parklands/Highridge", "Pumwani"],
  R: ["Ridgeways", "Roysambu", "Ruai", "Ruaraka", "Runda"],
  S: ["Saika", "South B", "South C"],
  T: ["Thome"],
  U: ["Umoja", "Upperhill", "Utalii", "Utawala"],
  W: ["Westlands", "Woodley/Kenyatta Golf Course"],
  Z: ["Zimmerman", "Ziwani/Kariokor"]
};

// Helper: Fisher-Yates Shuffle
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
  const navigate = useNavigate();
  const [allServices, setAllServices] = useState([]);
  const [filteredServices, setFilteredServices] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isBusinessClosed, setIsBusinessClosed] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSuburb, setSelectedSuburb] = useState(""); 
  const [selectedCategory, setSelectedCategory] = useState("");
  const [sortOption, setSortOption] = useState("random");
  const [itemsToShow, setItemsToShow] = useState(20);

  // Modals & Data
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [subServices, setSubServices] = useState({});

  // 🆕 Location Modal State
  const [mapService, setMapService] = useState(null);

  useEffect(() => {
    fetchAllServices();
  }, [user.user_type]); 

  useEffect(() => {
    filterServices();
  }, [searchTerm, selectedSuburb, selectedCategory, sortOption, itemsToShow, allServices, isBusinessClosed]);

  const fetchAllServices = async () => {
    try {
      setLoading(true);
      const response = await api.get("/services");
      let services = response.data.services || [];
      
      if (user.user_type === 'client') {
        services = shuffleArray(services);
      }
      
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

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter((service) => {
        const fields = [service.name, service.description, service.category, service.provider_name, service.business_name].filter(Boolean);
        return fields.some((field) => field.toLowerCase().includes(term));
      });
    }

    if (selectedSuburb) {
      result = result.filter((service) => service.suburb === selectedSuburb);
    }

    if (selectedCategory) {
      result = result.filter((service) => service.category === selectedCategory);
    }

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

    if (itemsToShow !== "all" && user.user_type === 'client') {
        result = result.slice(0, parseInt(itemsToShow));
    }

    setFilteredServices(result);
  };

  // === ACTIONS ===
  const handleBookClick = (service) => {
    if (service.is_closed || isBusinessClosed) return;
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

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this service? This cannot be undone.")) {
      try {
        await api.delete(`/services/${id}`);
        setAllServices(prev => prev.filter(s => s.id !== id));
        alert("Service deleted successfully.");
      } catch (error) {
        console.error("Delete failed", error);
        alert("Failed to delete service.");
      }
    }
  };

  const toggleServiceStatus = async (service) => {
    try {
      const newStatus = !service.is_closed;
      await api.put(`/services/${service.id}`, { is_closed: newStatus });
      setAllServices(prev => prev.map(s => 
        s.id === service.id ? { ...s, is_closed: newStatus } : s
      ));
    } catch (error) {
      console.error("Toggle status failed", error);
      alert("Failed to update status.");
    }
  };

  const handleToggleBusiness = () => {
    const action = isBusinessClosed ? "OPEN" : "CLOSE";
    if (window.confirm(`Are you sure you want to ${action} the business? This will affect availability for all services.`)) {
        setIsBusinessClosed(!isBusinessClosed);
    }
  };

  const handleEdit = (service) => {
    navigate(`/services/edit/${service.id}`, { state: { service } });
  };

  const handleViewAddons = (service) => {
    const addons = subServices[service.id] || [];
    if (addons.length === 0) {
        alert("No add-ons configured for this service.");
    } else {
        alert(`Add-ons for ${service.name}:\n\n` + addons.map(a => `- ${a.name}: KES ${a.price}`).join('\n'));
    }
  };

  const handleLocationClick = (e, service) => {
    e.stopPropagation(); // Prevent opening booking modal
    setMapService(service);
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
        
        {/* ==========================
            PROVIDER VIEW
           ========================== */}
        {user.user_type === 'provider' ? (
            <>
                <div className="service-page-header">
                    <div className="title-section">
                        <h2>Manage Your Services</h2>
                        <p>Update prices, manage availability, and add new offerings.</p>
                    </div>
                    <div className="provider-top-actions">
                         <button className="btn-add-service" onClick={() => navigate('/services/new')}>
                            <Plus size={18} /> Add New Service
                         </button>
                         <button 
                            className={`btn-close-business ${isBusinessClosed ? 'closed' : ''}`} 
                            onClick={handleToggleBusiness}
                         >
                            <Power size={18} /> {isBusinessClosed ? "Re-open Business" : "Close Business"}
                         </button>
                    </div>
                </div>

                {isBusinessClosed && (
                    <div className="business-closed-banner">
                        ⚠️ Your business is currently marked as <strong>CLOSED</strong>. Clients cannot book any services.
                    </div>
                )}

                <div className="services-grid">
                    {filteredServices.map((service) => {
                        const isDimmed = service.is_closed || isBusinessClosed;

                        return (
                            <div key={service.id} className={`provider-card ${isDimmed ? 'dimmed-card' : ''}`}>
                                {isDimmed && (
                                    <div className="status-overlay-badge">
                                        {isBusinessClosed ? "BUSINESS CLOSED" : "SERVICE CLOSED"}
                                    </div>
                                )}

                                <div className="provider-card-header">
                                    <h3>{service.name}</h3>
                                    <span className="provider-category-badge">{service.category}</span>
                                </div>

                                <p className="provider-card-desc">
                                    {service.description 
                                        ? (service.description.length > 100 ? service.description.substring(0, 100) + '...' : service.description)
                                        : "No description provided."}
                                </p>

                                <div className="provider-stats-row">
                                    <div className="stat-item">
                                        <Clock size={14} style={{marginBottom:'4px'}}/>
                                        <span>{service.duration}m</span>
                                    </div>
                                    <div className="stat-item">
                                        <span style={{fontSize:'12px', fontWeight:'400'}}>Price</span>
                                        <span>KES {service.price}</span>
                                    </div>
                                    <div className="stat-item">
                                        <Store size={14} style={{marginBottom:'4px'}}/>
                                        <span>Cap: {service.capacity || 1}</span>
                                    </div>
                                </div>

                                <button className="btn-view-addons" onClick={() => handleViewAddons(service)}>
                                    View Add-ons ({subServices[service.id]?.length || 0})
                                </button>

                                <div className="provider-actions-footer">
                                    <button className="btn-action btn-edit" onClick={() => handleEdit(service)}>
                                        <Edit size={14} /> Edit
                                    </button>
                                    <button className="btn-action btn-delete" onClick={() => handleDelete(service.id)}>
                                        <Trash2 size={14} /> Delete
                                    </button>
                                    <button 
                                        className={`btn-action ${service.is_closed ? 'btn-toggle-open' : 'btn-toggle-close'}`} 
                                        onClick={() => toggleServiceStatus(service)}
                                    >
                                        {service.is_closed ? (
                                            <><Unlock size={12} /> Open</>
                                        ) : (
                                            <><Lock size={12} /> Close</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </>
        ) : (
        /* ==========================
            CLIENT VIEW
           ========================== */
            <>
                <div className="service-page-header">
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

                        {/* Suburb Filter */}
                        <div className="search-wrapper location-search">
                            <MapPin size={18} className="search-icon" />
                            <select 
                                value={selectedSuburb} 
                                onChange={(e) => setSelectedSuburb(e.target.value)}
                                className="suburb-filter-select"
                            >
                                <option value="">All Locations</option>
                                {Object.keys(NAIROBI_SUBURBS).sort().map(letter => (
                                    <optgroup key={letter} label={letter}>
                                        {NAIROBI_SUBURBS[letter].map(sub => (
                                            <option key={sub} value={sub}>{sub}</option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>

                        <div className="filters-wrapper">
                            <div className="filter-item">
                                <Filter size={16} />
                                <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                                    <option value="">All Categories</option>
                                    <option value="Salon">Salon</option>
                                    <option value="Spa">Spa</option>
                                    <option value="Barbershop">Barbershop</option>
                                </select>
                            </div>

                            <button
                                className="btn-clear"
                                onClick={() => {
                                    setSearchTerm("");
                                    setSelectedSuburb("");
                                    setSelectedCategory("");
                                }}
                            >
                                Reset
                            </button>
                        </div>
                    </div>
                </div>

                {loading ? (
                  <div className="loading-container">
                    <div className="spinner"></div>
                    <p>Finding the best services for you...</p>
                  </div>
                ) : (
                  <>
                    <div className="services-grid">
                      {filteredServices.map((service) => {
                        const price = parseFloat(service.price).toFixed(0);
                        const isDimmed = service.is_closed || isBusinessClosed;

                        return (
                          <div
                            key={service.id}
                            className={`service-card ${isDimmed ? "closed-client-card" : ""}`}
                          >
                            <div className={`service-header-bar ${getCategoryClass(service.category)}`}>
                              <div className="header-content">
                                <h3 className="service-name">{service.name}</h3>
                                {/* 🆕 Provider name updated to standout button style below service name */}
                                <div 
                                  className="provider-link-btn" 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/provider/${service.provider_id}`);
                                  }}
                                  title={`View profile of ${service.business_name || service.provider_name}`}
                                >
                                   {service.business_name || service.provider_name}
                                </div>
                              </div>
                              <div className="header-price">
                                <small>From</small>
                                KES {price}
                              </div>
                            </div>

                            <div className="service-main" onClick={() => !isDimmed && handleBookClick(service)}>
                              
                              {(service.suburb || service.business_address) && (
                                <div 
                                    className="meta-row location-row clickable" 
                                    onClick={(e) => handleLocationClick(e, service)}
                                    title="View location map"
                                >
                                    <MapPin size={13} color="#2563eb" style={{marginRight:'4px', flexShrink:0}} />
                                    <span className="location-link">
                                        {service.suburb}, {service.business_address}
                                    </span>
                                </div>
                              )}

                              <div className="meta-row">
                                  <span className="meta-badge category">{service.category}</span>
                                  <span className="meta-badge duration">
                                      <Clock size={12} /> {service.duration}m
                                  </span>
                              </div>

                              <p className="service-description">{service.description}</p>

                              <button className="btn btn-primary book-btn" disabled={isDimmed}>
                                {isDimmed ? "Currently Closed" : "Book Now"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
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
        
        {mapService && (
            <div className="map-modal-overlay" onClick={() => setMapService(null)}>
                <div className="map-modal-content" onClick={e => e.stopPropagation()}>
                    <div className="map-header">
                        <h3>📍 Location Details</h3>
                        <button onClick={() => setMapService(null)} className="close-btn"><X size={20} /></button>
                    </div>
                    <div className="map-body">
                        <h4 style={{margin:'0 0 5px 0', color:'#1e293b'}}>{mapService.business_name}</h4>
                        <p style={{color:'#64748b', fontSize:'14px', marginBottom:'20px'}}>
                            {mapService.suburb}, {mapService.business_address}
                        </p>
                        
                        <div className="map-actions">
                            {mapService.google_maps_link && (
                                <a 
                                    href={mapService.google_maps_link} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="btn-open-map"
                                >
                                    <MapPin size={18} /> Open in Google Maps <ExternalLink size={14} style={{marginLeft:5}}/>
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
}

export default ServiceList;