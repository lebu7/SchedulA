/* frontend/src/components/ReviewCarousel.jsx */
import React, { useState, useEffect } from 'react';
import { Star, Quote } from 'lucide-react';
import './ReviewComponents.css';

const ReviewCarousel = ({ reviews }) => {
    const [currentIndex, setCurrentIndex] = useState(0);

    // ✅ Auto-play Logic (7 seconds)
    useEffect(() => {
        if (!reviews || reviews.length <= 1) return;

        const interval = setInterval(() => {
            setCurrentIndex((prevIndex) => (prevIndex + 1) % reviews.length);
        }, 7000); // 7000ms = 7 seconds

        return () => clearInterval(interval);
    }, [reviews]);

    // Helper function to format date as "Day Month Year"
    const formatDate = (dateString) => {
        const options = { day: 'numeric', month: 'short', year: 'numeric' };
        return new Date(dateString).toLocaleDateString('en-GB', options);
    };

    if (!reviews || reviews.length === 0) {
        return (
            <div className="review-carousel-empty" style={{textAlign: 'center', padding: '20px', color: '#94a3b8'}}>
                <p>No reviews yet.</p>
            </div>
        );
    }

    const review = reviews[currentIndex];

    return (
        <div className="review-carousel" style={{position: 'relative', minHeight: '160px'}}>
            <div className="carousel-content" style={{animation: 'fadeIn 0.5s ease-in-out'}}> 
                <div className="carousel-header" style={{display: 'flex', justifyContent: 'space-between', marginBottom: '10px'}}>
                    <div className="stars" style={{display: 'flex'}}>
                        {[...Array(5)].map((_, i) => (
                            <Star key={i} size={14} fill={i < review.rating ? "#f59e0b" : "none"} color={i < review.rating ? "#f59e0b" : "#cbd5e1"} />
                        ))}
                    </div>
                    <span className="review-service-tag" style={{fontSize: '10px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                        {review.service_name}
                    </span>
                </div>
                
                <div className="review-body" style={{position: 'relative', paddingLeft: '15px', marginBottom: '10px'}}>
                    <Quote size={14} style={{position: 'absolute', left: 0, top: 0, color: '#cbd5e1'}} />
                    <p className="review-text" style={{fontSize: '13px', fontStyle: 'italic', color: '#334155', margin: 0, lineHeight: '1.4'}}>
                        {review.comment ? (review.comment.length > 100 ? review.comment.substring(0, 100) + "..." : review.comment) : "No comment provided."}
                    </p>
                </div>

                <div className="review-footer" style={{marginTop: 'auto', paddingTop: '10px', borderTop: '1px dashed #e2e8f0', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b'}}>
                    <span className="client-name">— {review.client_name}</span>
                    <span className="review-date">{formatDate(review.created_at)}</span>
                </div>
            </div>
            {/* Controls removed as requested */}
        </div>
    );
};

export default ReviewCarousel;