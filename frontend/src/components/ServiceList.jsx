/* frontend/src/components/ServiceList.jsx */
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; 
import api from "../services/auth";
import BookingModal from "./BookingModal";
import ReviewListModal from "./ReviewListModal"; 
import ChatButton from './ChatButton';
import { useSocket } from "../contexts/SocketContext";
import { 
  Search, Filter, ArrowUpDown, List, Clock, Zap, 
  Plus, Power, Edit, Trash2, Store, Lock, Unlock, MapPin, X, ExternalLink,
  Heart, Star 
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

  // ✅ Reviews Modal State
  const [viewReviewsService, setViewReviewsService] = useState(null);

  // ❤️ Favorites State
  const [favoriteIds, setFavoriteIds] = useState(new Set());

  const { roomUnreadCounts, resetRoomUnread } = useSocket();

  useEffect(() => {
    fetchAllServices();
    if (user.user_type === 'client') {
        fetchFavorites();
    }
  }, [user.user_type]); 

  useEffect(() => {
    filterServices();
  }, [searchTerm, selectedSuburb, selectedCategory, sortOption, itemsToShow, allServices, isBusinessClosed]);

  const fetchFavorites = async () => {
    try {
        const res = await api.get('/favorites');
        const ids = new Set(res.data.services.map(f => f.item_id));
        setFavoriteIds(ids);
    } catch (error) {
        console.error("Error fetching favorites:", error);
    }
  };

  const toggleFavorite = async (e, serviceId) => {
    e.stopPropagation(); 
    if (user.user_type === 'provider') return; // Disable for providers
    try {
        await api.post('/favorites/toggle', { itemId: serviceId, type: 'service' });
        
        setFavoriteIds(prev => {
            const next = new Set(prev);
            if (next.has(serviceId)) {
                next.delete(serviceId);
            } else {
                next.add(serviceId);
            }
            return next;
        });
    } catch (error) {
        console.error("Failed to toggle favorite:", error);
        alert("Could not update favorites. Please try again.");
    }
  };

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

  const handleBookClick = (service) => {
    if (user.user_type === 'provider') return;
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

  const handleToggleBusiness = () => {
    const action = isBusinessClosed ? "OPEN" : "CLOSE";
    if (window.confirm(`Are you sure you want to ${action} the business?`)) {
        setIsBusinessClosed(!isBusinessClosed);
    }
  };

  const handleLocationClick = (e, service) => {
    e.stopPropagation(); 
    if (user.user_type === 'provider') return;
    setMapService(service);
  };
  
  const handleRatingClick = (e, service) => {
      e.stopPropagation();
      if (user.user_type === 'provider') return;
      setViewReviewsService(service);
  };

  const getCategoryClass = (category) => {
    if (!category) return "default-category";
    const cat = category.toLowerCase();
    if (cat.includes("salon")) return "salon-header";
    if (cat.includes("spa")) return "spa-header";
    if (cat.includes("barber")) return "barber-header";
    return "default-category";
  };

  const openServiceChat = async (e, service) => {
    e.stopPropagation(); 
    if (user.user_type === 'provider') return;
    try {
      const res = await api.post('/chat/rooms', {
        recipientId: service.provider_id,
        contextType: 'service',
        contextId: service.id
      });
      
      const contextData = { 
        name: service.name, 
        price: service.price,
        duration: service.duration 
      };
      
      window.dispatchEvent(new CustomEvent('openChatRoom', {
        detail: {
          room: res.data.room,
          context: contextData,
          recipientName: service.business_name || service.provider_name
        }
      }));
    } catch (err) {
      console.error("Failed to initialize service chat:", err);
    }
  };

  return (
    <div className="service-list">
      <div className="container">
        
        <div className="service-page-header">
            <div className="title-section">
                <h2>{user.user_type === 'provider' ? "Manage Your Services" : "Explore Services"}</h2>
                <p>{user.user_type === 'provider' ? "View and organize your service offerings." : "Discover the best beauty and wellness professionals near you."}</p>
            </div>
            
            {user.user_type === 'provider' ? (
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
            ) : (
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

                        <div className="filter-item">
                            <ArrowUpDown size={16} />
                            <select value={sortOption} onChange={(e) => setSortOption(e.target.value)}>
                                <option value="random">Recommended</option>
                                <option value="price-asc">Price: Low to High</option>
                                <option value="price-desc">Price: High to Low</option>
                                <option value="name-asc">Name: A - Z</option>
                                <option value="duration-asc">Duration: Shortest</option>
                            </select>
                        </div>

                        {(searchTerm || selectedSuburb || selectedCategory || sortOption !== "random") && (
                            <button
                                className="btn-clear"
                                onClick={() => {
                                    setSearchTerm("");
                                    setSelectedSuburb("");
                                    setSelectedCategory("");
                                    setSortOption("random");
                                }}
                            >
                                Reset
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>

        {user.user_type === 'provider' && isBusinessClosed && (
            <div className="business-closed-banner">
                ⚠️ Your business is currently marked as <strong>CLOSED</strong>. Clients cannot book any services.
            </div>
        )}

        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Finding the best services for you...</p>
          </div>
        ) : (
          <div className="services-grid">
            {filteredServices.map((service) => {
              const addons = subServices[service.id] || [];
              const price = parseFloat(service.price).toFixed(0);
              const isDimmed = service.is_closed || isBusinessClosed;
              const isFavorite = favoriteIds.has(service.id);
              const rating = service.avg_rating ? Number(service.avg_rating).toFixed(1) : null;
              const isProvider = user.user_type === 'provider';

              return (
                <div
                  key={service.id}
                  className={`service-card ${isDimmed ? "closed-client-card" : ""} ${isProvider ? "provider-readonly-card" : ""}`}
                  data-status={isBusinessClosed ? "Business Closed" : (service.is_closed ? "Currently Closed" : "")}
                >
                  <div className={`service-header-bar ${getCategoryClass(service.category)}`}>
                    <div className="header-left-col">
                      <h3 className="service-name">{service.name}</h3>
                      <p 
                        className="service-business-link" 
                        onClick={(e) => {
                          if(isProvider) return;
                          e.stopPropagation();
                          navigate(`/provider/${service.provider_id}`);
                        }}
                      >
                         {service.business_name}
                      </p>
                    </div>

                    <div className="header-right-col">
                        <div className="header-price">
                          <small>From</small>
                          KES {price}
                        </div>
                        
                        <div 
                          className="rating-badge-minimal"
                          onClick={(e) => handleRatingClick(e, service)}
                        >
                          <span className="rating-num">{rating || "New"}</span>
                          <div className="star-group">
                            {[...Array(5)].map((_, i) => (
                              <Star 
                                key={i}
                                size={10} 
                                fill={rating && i < Math.round(rating) ? "#f59e0b" : "none"} 
                                color={rating && i < Math.round(rating) ? "#f59e0b" : "rgba(255,255,255,0.4)"} 
                              />
                            ))}
                          </div>
                        </div>
                    </div>
                  </div>

                  <div className="service-main" onClick={() => !isProvider && !isDimmed && handleBookClick(service)}>
                    
                    {(service.suburb || service.business_address) && (
                      <div 
                          className={`meta-row location-row ${!isProvider ? 'clickable' : ''}`} 
                          onClick={(e) => handleLocationClick(e, service)}
                      >
                          <MapPin size={13} color="#2563eb" style={{marginRight:'4px', flexShrink:0}} />
                          <span className="location-link">
                              {service.suburb ? <span style={{fontWeight:'600'}}>{service.suburb}</span> : null}
                              {service.suburb && service.business_address ? ", " : ""}
                              {service.business_address}
                          </span>
                      </div>
                    )}

                    <div className="meta-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '5px' }}>
                            <span className="meta-badge category">{service.category}</span>
                            <span className="meta-badge duration">
                                <Clock size={12} /> {service.duration}m
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              className="btn-icon-favorite"
                              onClick={(e) => toggleFavorite(e, service.id)}
                              disabled={isProvider}
                            >
                              <Heart 
                                  size={20} 
                                  fill={isFavorite ? "#ef4444" : "none"} 
                                  color={isFavorite ? "#ef4444" : "#94a3b8"} 
                              />
                            </button>

                            <ChatButton 
                              onClick={(e) => openServiceChat(e, service)}
                              size="small"
                              contextType="service"
                              contextId={service.id}
                              unreadCount={isProvider ? 0 : (roomUnreadCounts[service.id] || 0)}
                              disableGlobalCounter={true}
                            />
                        </div>
                    </div>

                    <p className="service-description">
                      {service.description.length > 80 
                          ? service.description.substring(0, 80) + "..." 
                          : service.description}
                    </p>

                    {addons.length > 0 ? (
                      <div className="addon-preview">
                        <div className="addon-title"><Zap size={12} fill="#f59e0b" color="#f59e0b" /> Add-ons available</div>
                        <div className="addon-tags">
                          {addons.slice(0, 2).map((a) => (
                            <span key={a.id} className="addon-tag">{a.name}</span>
                          ))}
                          {addons.length > 2 && <span className="addon-tag more">+{addons.length - 2} more</span>}
                        </div>
                      </div>
                    ) : (
                      <div className="addon-spacer"></div>
                    )}

                    <button className="btn btn-primary book-btn" disabled={isDimmed || isProvider}>
                      {isProvider ? "Preview Mode" : (isDimmed ? (isBusinessClosed ? "Business Closed" : "Service Closed") : "Book Now")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filteredServices.length === 0 && !loading && (
          <div className="no-services">
            <Search size={48} color="#cbd5e1" />
            <h3>No services found</h3>
            <p>Try adjusting your search filters.</p>
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
        
        {viewReviewsService && (
            <ReviewListModal
                serviceId={viewReviewsService.id}
                serviceName={viewReviewsService.name}
                onClose={() => setViewReviewsService(null)}
            />
        )}
      </div>
    </div>
  );
}

export default ServiceList;