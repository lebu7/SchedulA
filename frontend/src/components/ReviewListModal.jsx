/* frontend/src/components/ReviewListModal.jsx */
import React, { useEffect, useState } from 'react';
import api from '../services/auth';
import { Star, X, User } from 'lucide-react';
import './ReviewComponents.css';

const ReviewListModal = ({ serviceId, serviceName, onClose }) => {
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get(`/reviews/service/${serviceId}`)
            .then(res => setReviews(res.data.reviews))
            .catch(err => console.error("Failed to load reviews", err))
            .finally(() => setLoading(false));
    }, [serviceId]);

    // Helper function to format date as "Day Month Year"
    const formatDate = (dateString) => {
        const options = { day: 'numeric', month: 'short', year: 'numeric' };
        return new Date(dateString).toLocaleDateString('en-GB', options);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="review-list-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Reviews for {serviceName}</h3>
                    <button className="close-btn" onClick={onClose}><X size={20}/></button>
                </div>

                <div className="reviews-scroll-container">
                    {loading ? (
                        <p className="loading-text">Loading reviews...</p>
                    ) : reviews.length === 0 ? (
                        <div className="no-reviews">
                            <Star size={40} color="#cbd5e1" />
                            <p>No reviews yet.</p>
                        </div>
                    ) : (
                        reviews.map(review => (
                            <div key={review.id} className="review-item">
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
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReviewListModal;