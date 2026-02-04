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

    // ✅ (19) Stop background scroll when modal is open
    useEffect(() => {
        const prevOverflow = document.body.style.overflow;
        const prevPaddingRight = document.body.style.paddingRight;

        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = "hidden";
        if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

        return () => {
            document.body.style.overflow = prevOverflow;
            document.body.style.paddingRight = prevPaddingRight;
        };
    }, []);

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
            onSuccess?.();
            onClose?.();
        } catch (err) {
            console.error("Failed to submit review", err);
            alert(err.response?.data?.error || "Review submission failed.");
        } finally {
            setLoading(false);
        }
    };

    const isUpdate = !!appointment.review_rating;

    return (
        <div
            className="modal-overlay"
            onClick={() => {
                if (!loading) onClose?.();
            }}
        >
            <div className="review-modal-content" onClick={(e) => e.stopPropagation()}>
                {/* ✅ (18) Themed header color for Review modal */}
                <div
                    className="modal-header"
                    style={{
                        background: 'linear-gradient(180deg, #fdf2f8 0%, #ffffff 85%)',
                        borderBottom: '1px solid #fbcfe8'
                    }}
                >
                    <h3 style={{ margin: 0 }}>
                        {isProvider
                            ? "Review from Client"
                            : (isUpdate ? "Update your Review" : "Rate your experience")}
                    </h3>

                    {/* ✅ (17) Close button stays top-right of THIS modal header, disabled while loading */}
                    <button
                        className="close-btn"
                        onClick={() => {
                            if (!loading) onClose?.();
                        }}
                        disabled={loading}
                        aria-label="Close review modal"
                        title={loading ? "Please wait..." : "Close"}
                    >
                        <X size={20} />
                    </button>
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
                                    onClick={() => !isProvider && !loading && setRating(ratingValue)}
                                    onMouseEnter={() => !isProvider && !loading && setHover(ratingValue)}
                                    onMouseLeave={() => !isProvider && !loading && setHover(0)}
                                    style={{
                                        cursor: isProvider ? 'default' : (loading ? 'not-allowed' : 'pointer'),
                                        opacity: isProvider && !isFilled ? 0.3 : 1
                                    }}
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
                        onChange={(e) => !isProvider && !loading && setComment(e.target.value)}
                        readOnly={isProvider || loading}
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
