/* frontend/src/components/ReviewListModal.jsx */
import React, { useEffect, useState, useMemo } from 'react';
import api from '../services/auth';
import ChatButton from './ChatButton'; 
import { useSocket } from "../contexts/SocketContext";
import { Star, X, User, MapPin, Clock, ExternalLink, Filter, ArrowUpDown } from 'lucide-react';
import './ReviewComponents.css';

const ReviewListModal = ({ serviceId, serviceName, onClose, user, preFilter = 'all' }) => {
    const [reviews, setReviews] = useState([]);
    const [serviceDetails, setServiceDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // ✅ Initializing state with the preFilter prop
    const [filterRating, setFilterRating] = useState(preFilter);
    const [sortBy, setSortBy] = useState('newest');

    const { roomUnreadCounts, resetRoomUnread } = useSocket();
    const isProvider = user?.user_type === 'provider';

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    // ✅ Sync state if prop changes (e.g. user clicks a different rating while modal logic resets)
    useEffect(() => {
        setFilterRating(preFilter);
    }, [preFilter, serviceId]);

    useEffect(() => {
        const fetchReviewData = async () => {
            setLoading(true);
            try {
                let endpoint = `/reviews/service/${serviceId}`;
                
                // ✅ Handle Provider-wide reviews fetch
                if (serviceId === 'provider') {
                    // Get provider ID from URL params as a safe fallback
                    const pathParts = window.location.pathname.split('/');
                    const providerId = pathParts[pathParts.length - 1];
                    endpoint = `/reviews/provider/${providerId}`;
                }

                const reviewsRes = await api.get(endpoint);
                setReviews(reviewsRes.data.reviews || []);

                // Only fetch service details if we aren't in the generic 'provider' mode
                if (serviceId !== 'provider') {
                    const servicesRes = await api.get('/services');
                    const currentService = servicesRes.data.services.find(s => s.id === serviceId);
                    setServiceDetails(currentService);
                }
            } catch (err) {
                console.error("Failed to load review modal data", err);
            } finally {
                setLoading(false);
            }
        };
        fetchReviewData();
    }, [serviceId]);

    const processedReviews = useMemo(() => {
        let result = [...reviews];

        if (filterRating !== 'all') {
            result = result.filter(r => r.rating === parseInt(filterRating));
        }

        result.sort((a, b) => {
            if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at);
            if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
            if (sortBy === 'highest') return b.rating - a.rating;
            if (sortBy === 'lowest') return a.rating - b.rating;
            return 0;
        });

        return result;
    }, [reviews, filterRating, sortBy]);

    const getCategoryClass = (category) => {
        if (!category) return "default-category";
        const cat = category.toLowerCase();
        if (cat.includes("salon")) return "salon-header";
        if (cat.includes("spa")) return "spa-header";
        if (cat.includes("barber")) return "barber-header";
        return "default-category";
    };

    const openServiceChat = async (e, service) => {
        if (e) e.stopPropagation(); 
        if (!service) return;
        try {
            const res = await api.post('/chat/rooms', {
                recipientId: service.provider_id,
                contextType: 'service',
                contextId: service.id
            });
            const contextData = { name: service.name, price: service.price, duration: service.duration };
              window.dispatchEvent(new CustomEvent('openChatRoom', {
                detail: {
                room: res.data.room,
                context: contextData,
                recipientName: service.business_name || service.provider_name
                }
                }));
            resetRoomUnread(service.id);
        } catch (err) {
            console.error("Failed to initialize service chat:", err);
        }
    };

    const formatDate = (dateString) => {
        const options = { day: 'numeric', month: 'short', year: 'numeric' };
        return new Date(dateString).toLocaleDateString('en-GB', options);
    };

    if (loading) return (
        <div className="modal-overlay">
            <div className="review-list-modal-content wide-modal loading-state">
                <div className="spinner"></div>
                <p>Loading details...</p>
            </div>
        </div>
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="review-list-modal-content wide-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{serviceId === 'provider' ? 'Business Feedback' : 'Service Feedback'}</h3>
                    <button className="close-btn" onClick={onClose}><X size={20}/></button>
                </div>

                <div className={`review-modal-grid-header ${isProvider || serviceId === 'provider' ? 'single-col' : ''}`}>
                    <div className="header-box service-box">
                        <div className="box-top-row">
                            <span className="box-label">{serviceId === 'provider' ? 'Business Overall' : 'Service Details'}</span>
                            {serviceDetails && (
                                <span className={`category-indicator ${getCategoryClass(serviceDetails?.category)}`}>
                                    {serviceDetails?.category}
                                </span>
                            )}
                        </div>
                        <h4>{serviceDetails?.name || serviceName}</h4>
                        {serviceDetails && (
                            <div className="box-meta">
                                <span><Clock size={14} /> {serviceDetails?.duration} mins</span>
                                <span className="price-tag-highlight">KES {parseFloat(serviceDetails?.price || 0).toFixed(0)}</span>
                            </div>
                        )}
                        <p className="box-desc">
                            {serviceId === 'provider' 
                                ? "Displaying customer feedback for all services provided by this business."
                                : (serviceDetails?.description || "No description available.")}
                        </p>
                    </div>

                    {!isProvider && serviceId !== 'provider' && (
                        <div className="header-box provider-box">
                            <div className="box-top-row" style={{ alignItems: 'flex-start' }}>
                                <div style={{flex: 1}}>
                                    <span className="box-label">Provider</span>
                                    <h4>{serviceDetails?.business_name || serviceDetails?.provider_name}</h4>
                                </div>
                            </div>
                            <div className="provider-contact-details">
                                <div className="box-info-item">
                                    <MapPin size={14} className="icon-blue" /> 
                                    <span>{serviceDetails?.suburb}, {serviceDetails?.business_address}</span>
                                </div>
                                {serviceDetails?.google_maps_link && (
                                    <a href={serviceDetails.google_maps_link} target="_blank" rel="noopener noreferrer" className="maps-mini-link">
                                        <ExternalLink size={12} /> View on Map
                                    </a>
                                )}
                                <div className="box-info-item clickable-chat-row" onClick={(e) => openServiceChat(e, serviceDetails)}>
                                    <div className="mini-chat-wrapper">
                                        <ChatButton 
                                            onClick={(e) => openServiceChat(e, serviceDetails)}
                                            size="small"
                                            contextType="service"
                                            contextId={serviceDetails?.id}
                                            unreadCount={roomUnreadCounts[serviceDetails?.id] || 0}
                                            disableGlobalCounter={true}
                                        />
                                    </div>
                                    <span className="chat-prompt-text">Contact via chat</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="reviews-list-controls">
                    <h4 className="reviews-section-title">Verified Reviews ({processedReviews.length})</h4>
                    
                    <div className="list-tools">
                        <div className="tool-select">
                            <Filter size={14} />
                            <select value={filterRating} onChange={(e) => setFilterRating(e.target.value)}>
                                <option value="all">All Ratings</option>
                                <option value="5">5 Stars</option>
                                <option value="4">4 Stars</option>
                                <option value="3">3 Stars</option>
                                <option value="2">2 Stars</option>
                                <option value="1">1 Star</option>
                            </select>
                        </div>
                        <div className="tool-select">
                            <ArrowUpDown size={14} />
                            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                                <option value="newest">Newest First</option>
                                <option value="oldest">Oldest First</option>
                                <option value="highest">Highest Rated</option>
                                <option value="lowest">Lowest Rated</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="reviews-scroll-container">
                    {processedReviews.length === 0 ? (
                        <div className="no-reviews">
                            <Star size={40} color="#cbd5e1" />
                            <p>{reviews.length === 0 ? "No reviews yet." : "No reviews match your filters."}</p>
                        </div>
                    ) : (
                        <div className="reviews-grid-layout">
                            {processedReviews.map(review => (
                                <div key={review.id} className="review-box-item">
                                    <div className="review-header">
                                        <div className="reviewer-info">
                                            <div className="avatar-placeholder"><User size={14}/></div>
                                            <strong className="client-name">{review.client_name}</strong>
                                        </div>
                                        <div className="review-meta-right">
                                            {serviceId === 'provider' && <span className="service-tag-mini">{review.service_name}</span>}
                                            <span className="review-date">{formatDate(review.created_at)}</span>
                                        </div>
                                    </div>
                                    <div className="review-stars">
                                        {[...Array(5)].map((_, i) => (
                                            <Star key={i} size={14} className={i < review.rating ? "filled" : "empty"} />
                                        ))}
                                    </div>
                                    {review.comment && <p className="review-comment">"{review.comment}"</p>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReviewListModal;