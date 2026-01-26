/* frontend/src/components/ProviderProfile.jsx */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/auth';
import BookingModal from './BookingModal';
import ReviewCarousel from './ReviewCarousel'; 
import { MapPin, Clock, Users, ArrowLeft, ExternalLink, Phone, MessageCircle, Heart, Star } from 'lucide-react';
import './ProviderProfile.css';
import './ChatButton.css';

const ProviderProfile = ({ user }) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedService, setSelectedService] = useState(null);
    const [showBookingModal, setShowBookingModal] = useState(false);
    const [isFavorite, setIsFavorite] = useState(false);

    useEffect(() => {
        const fetchProviderData = async () => {
            try {
                const res = await api.get(`/auth/public-profile/${id}`);
                setData(res.data);
                
                const reviewsRes = await api.get(`/reviews/provider/${id}`);
                setReviews(reviewsRes.data.reviews || []);
            } catch (err) {
                setError("Could not load provider profile.");
            } finally {
                setLoading(false);
            }
        };
        fetchProviderData();
    }, [id]);

    useEffect(() => {
        if (user && user.user_type === 'client') {
            api.get('/favorites')
                .then(res => {
                    const providers = res.data.providers || [];
                    const found = providers.some(p => Number(p.item_id) === Number(id));
                    setIsFavorite(found);
                })
                .catch(err => console.error("Failed to fetch favorites:", err));
        }
    }, [id, user]);

    const handleToggleFavorite = async () => {
        try {
            await api.post('/favorites/toggle', { itemId: id, type: 'provider' });
            setIsFavorite(prev => !prev);
        } catch (err) {
            console.error("Failed to toggle favorite", err);
            alert("Could not update favorites.");
        }
    };

    const openProfileChat = async () => {
        if (!data?.provider) return;
        try {
            const res = await api.post('/chat/rooms', {
                recipientId: data.provider.id,
                contextType: 'profile',
                contextId: null
            });
            window.dispatchEvent(new CustomEvent('openChatRoom', {
                detail: {
                    room: res.data.room,
                    context: { name: "General Inquiry" }
                }
            }));
        } catch (err) {
            console.error("Failed to initialize chat:", err);
            alert("Could not start conversation at this time.");
        }
    };

    const handleBook = (service) => {
        setSelectedService({
            ...service,
            provider_id: data.provider.id,
            business_name: data.provider.business_name,
            provider_name: data.provider.name
        });
        setShowBookingModal(true);
    };

    if (loading) return <div className="loading-spinner">Loading Profile...</div>;
    if (error) return <div className="error-view">{error}</div>;

    const { provider, services, staff_count } = data;
    const rating = provider.avg_rating ? Number(provider.avg_rating).toFixed(1) : "New";

    return (
        <div className="provider-profile-page">
            <button 
                className="back-link" 
                onClick={() => navigate('/dashboard', { state: { tab: 'services' } })}
            >
                <ArrowLeft size={18} /> Back to Services
            </button>

            <header className="profile-header">
                <div className="header-top">
                    <div className="header-titles">
                        <h1>{provider.business_name || provider.name}</h1>
                        <div className="header-meta-row">
                            <span className="joined-tag">Joined {new Date(provider.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}</span>
                            
                            {/* ✅ STYLED RATING PILL */}
                            <div className="provider-rating-pill">
                                <Star size={16} fill={provider.avg_rating ? "#f59e0b" : "none"} color="#f59e0b" />
                                <strong>{rating}</strong>
                                <span className="review-count">({provider.review_count || 0} reviews)</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="header-actions">
                        {user && user.user_type === 'client' && (
                            <button 
                                onClick={handleToggleFavorite}
                                className={`favorite-btn ${isFavorite ? 'active' : ''}`}
                                title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                            >
                                <Heart size={20} fill={isFavorite ? "currentColor" : "none"} />
                                <span>{isFavorite ? 'Saved' : 'Save'}</span>
                            </button>
                        )}

                        <button className="chat-btn" onClick={openProfileChat}>
                            <MessageCircle size={20} />
                            <span>Open Chat</span>
                        </button>
                    </div>
                </div>
                
                <div className="header-stats">
                    <div className="stat-pill"><MapPin size={16} /> {provider.suburb}</div>
                    <div className="stat-pill"><Users size={16} /> {staff_count} Staff Members</div>
                    <div className="stat-pill"><Clock size={16} /> {provider.opening_time} - {provider.closing_time}</div>
                </div>
            </header>

            <div className="profile-grid">
                <section className="services-section">
                    <h2>Our Services</h2>
                    <div className="profile-services-list">
                        {services.map(service => (
                            <div key={service.id} className="mini-service-card">
                                <div className="service-info">
                                    <div className="mini-service-header">
                                        <h3>{service.name}</h3>
                                        {/* ✅ STYLED SERVICE RATING */}
                                        {service.avg_rating && (
                                            <div className="service-rating-mini">
                                                <Star size={12} fill="#f59e0b" color="#f59e0b"/>
                                                <span>{Number(service.avg_rating).toFixed(1)}</span>
                                            </div>
                                        )}
                                    </div>
                                    <p className="profile-service-desc">{service.description}</p>
                                    <div className="mini-meta">
                                        <span><Clock size={14} /> {service.duration}m</span>
                                        <span className="price-tag">KES {parseFloat(service.price).toFixed(0)}</span>
                                    </div>
                                </div>
                                <button className="book-mini-btn" onClick={() => handleBook(service)}>Book</button>
                            </div>
                        ))}
                    </div>
                </section>

                <aside className="business-sidebar">
                    <div className="sidebar-card">
                        <h3>Contact & Location</h3>
                        <div className="contact-item">
                            <Phone size={18} />
                            <span>{provider.phone}</span>
                        </div>
                        <div className="contact-item">
                            <MapPin size={18} />
                            <span>{provider.business_address}, {provider.suburb}</span>
                        </div>
                        {provider.google_maps_link && (
                            <a href={provider.google_maps_link} target="_blank" rel="noopener noreferrer" className="maps-button">
                                View on Google Maps <ExternalLink size={16} />
                            </a>
                        )}
                    </div>

                    <div className="sidebar-card">
                        <h3>Operating Hours</h3>
                        <div className="hours-row">
                            <span>Monday - Friday</span>
                            <strong>{provider.opening_time} - {provider.closing_time}</strong>
                        </div>
                        <div className="hours-row">
                            <span>Saturday</span>
                            {provider.is_open_sat ? (
                                <strong>{provider.opening_time} - {provider.closing_time}</strong>
                            ) : (
                                <strong className="closed-text">Closed</strong>
                            )}
                        </div>
                        <div className="hours-row">
                            <span>Sunday</span>
                            {provider.is_open_sun ? (
                                <strong>{provider.opening_time} - {provider.closing_time}</strong>
                            ) : (
                                <strong className="closed-text">Closed</strong>
                            )}
                        </div>
                    </div>

                    <div className="sidebar-card">
                        <h3>Recent Reviews</h3>
                        <ReviewCarousel reviews={reviews} />
                    </div>
                </aside>
            </div>

            {showBookingModal && selectedService && (
                <BookingModal
                    service={selectedService}
                    user={user}
                    onClose={() => setShowBookingModal(false)}
                    onBookingSuccess={() => {
                        setShowBookingModal(false);
                        alert("Booking Successful!");
                    }}
                />
            )}
        </div>
    );
};

export default ProviderProfile;