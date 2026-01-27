/* frontend/src/components/ReviewListModal.jsx */
import React, { useEffect, useState } from 'react';
import api from '../services/auth';
import ChatButton from './ChatButton'; 
import { useSocket } from "../contexts/SocketContext";
import { Star, X, User, MapPin, Clock, Phone, ExternalLink } from 'lucide-react';
import './ReviewComponents.css';

const ReviewListModal = ({ serviceId, serviceName, onClose }) => {
    const [reviews, setReviews] = useState([]);
    const [serviceDetails, setServiceDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const { roomUnreadCounts, resetRoomUnread } = useSocket();

    // ✅ Prevent background scrolling when modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    useEffect(() => {
        const fetchReviewData = async () => {
            try {
                const reviewsRes = await api.get(`/reviews/service/${serviceId}`);
                setReviews(reviewsRes.data.reviews || []);

                const servicesRes = await api.get('/services');
                const currentService = servicesRes.data.services.find(s => s.id === serviceId);
                setServiceDetails(currentService);
            } catch (err) {
                console.error("Failed to load review modal data", err);
            } finally {
                setLoading(false);
            }
        };
        fetchReviewData();
    }, [serviceId]);

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
        try {
          const res = await api.post('/chat/rooms', {
            recipientId: service.provider_id,
            contextType: 'service',
            contextId: service.id
          });
          const contextData = { name: service.name, price: service.price };
          window.dispatchEvent(new CustomEvent('openChatRoom', {
            detail: { room: res.data.room, context: contextData }
          }));
          resetRoomUnread(service.id);
        } catch (err) {
          console.error("Failed to initialize service chat:", err);
          alert("Could not start conversation with provider.");
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
                    <h3>Service Feedback</h3>
                    <button className="close-btn" onClick={onClose}><X size={20}/></button>
                </div>

                <div className="review-modal-grid-header">
                    <div className="header-box service-box">
                        <div className="box-top-row">
                            <span className="box-label">Service Details</span>
                            <span className={`category-indicator ${getCategoryClass(serviceDetails?.category)}`}>
                                {serviceDetails?.category}
                            </span>
                        </div>
                        <h4>{serviceDetails?.name || serviceName}</h4>
                        <div className="box-meta">
                            <span><Clock size={14} /> {serviceDetails?.duration} mins</span>
                            <span className="price-tag-highlight">KES {parseFloat(serviceDetails?.price || 0).toFixed(0)}</span>
                        </div>
                        <p className="box-desc">
                            {serviceDetails?.description || "No description available."}
                        </p>
                    </div>

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
                            <div 
                                className="box-info-item clickable-chat-row" 
                                onClick={(e) => openServiceChat(e, serviceDetails)}
                            >
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
                </div>

                <h4 className="reviews-section-title">Verified Reviews ({reviews.length})</h4>

                <div className="reviews-scroll-container">
                    {reviews.length === 0 ? (
                        <div className="no-reviews">
                            <Star size={40} color="#cbd5e1" />
                            <p>No reviews yet for this service.</p>
                        </div>
                    ) : (
                        <div className="reviews-grid-layout">
                            {reviews.map(review => (
                                <div key={review.id} className="review-box-item">
                                    <div className="review-header">
                                        <div className="reviewer-info">
                                            <div className="avatar-placeholder"><User size={14}/></div>
                                            <strong className="client-name">{review.client_name}</strong>
                                        </div>
                                        <span className="review-date">{formatDate(review.created_at)}</span>
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