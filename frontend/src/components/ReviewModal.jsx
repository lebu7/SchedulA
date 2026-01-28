/* frontend/src/components/ReviewModal.jsx */
import React, { useState, useEffect } from 'react';
import api from '../services/auth';
import { Star, X } from 'lucide-react';
import './ReviewComponents.css';

const ReviewModal = ({ appointment, onClose, onSuccess, user }) => {
    const [rating, setRating] = useState(appointment.review_rating || 0);
    const [comment, setComment] = useState(appointment.review_comment || "");
    const [hover, setHover] = useState(0);
    const [loading, setLoading] = useState(false);

    const isProvider = user?.user_type === 'provider';

    useEffect(() => {
        setRating(appointment.review_rating || 0);
        setComment(appointment.review_comment || "");
    }, [appointment]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isProvider) return; // Providers cannot submit
        if (rating === 0) return alert("Please select a rating.");

        setLoading(true);
        try {
            await api.post('/reviews', {
                appointment_id: appointment.id,
                rating,
                comment
            });
            alert("Review submitted! Thank you.");
            onSuccess();
            onClose();
        } catch (err) {
            console.error("Failed to submit review", err);
            alert(err.response?.data?.error || "Review submission failed.");
        } finally {
            setLoading(false);
        }
    };

    const isUpdate = !!appointment.review_rating;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="review-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>
                        {isProvider 
                            ? "Review from Client" 
                            : (isUpdate ? "Update your Review" : "Rate your experience")}
                    </h3>
                    <button className="close-btn" onClick={onClose}><X size={20}/></button>
                </div>
                
                <form onSubmit={handleSubmit}>
                    <div className="review-service-info">
                        <strong>{appointment.service_name}</strong>
                        <span>with {appointment.business_name || appointment.provider_name}</span>
                    </div>

                    <div className="star-rating-input">
                        {[...Array(5)].map((_, index) => {
                            const ratingValue = index + 1;
                            const isFilled = ratingValue <= (hover || rating);
                            return (
                                <Star 
                                    key={index}
                                    size={32}
                                    className={`star ${isFilled ? "filled" : ""}`}
                                    onClick={() => !isProvider && setRating(ratingValue)}
                                    onMouseEnter={() => !isProvider && setHover(ratingValue)}
                                    onMouseLeave={() => !isProvider && setHover(0)}
                                    style={{ cursor: isProvider ? 'default' : 'pointer', opacity: isProvider && !isFilled ? 0.3 : 1 }}
                                />
                            );
                        })}
                    </div>
                    
                    {!isProvider && (
                        <p className="rating-label">
                            {rating === 1 ? "Poor" : rating === 2 ? "Fair" : rating === 3 ? "Good" : rating === 4 ? "Very Good" : rating === 5 ? "Excellent!" : "Select a rating"}
                        </p>
                    )}

                    <textarea 
                        className="review-textarea"
                        placeholder={isProvider ? "No written feedback provided." : "Share details of your own experience (optional)"}
                        value={comment}
                        onChange={(e) => !isProvider && setComment(e.target.value)}
                        readOnly={isProvider}
                        maxLength={500}
                    ></textarea>

                    {!isProvider && (
                        <button type="submit" className="btn btn-primary full-width" disabled={loading}>
                            {loading ? "Saving..." : (isUpdate ? "Update Review" : "Submit Review")}
                        </button>
                    )}
                </form>
            </div>
        </div>
    );
};

export default ReviewModal;