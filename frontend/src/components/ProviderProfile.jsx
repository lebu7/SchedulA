/* frontend/src/components/ProviderProfile.jsx */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/auth';
import BookingModal from './BookingModal';
// ✅ ADDED: MessageCircle icon & ChatButton CSS for styling
import { MapPin, Clock, Users, ArrowLeft, ExternalLink, Phone, MessageCircle } from 'lucide-react';
import './ProviderProfile.css';
import './ChatButton.css'; // Ensure we get the consistent button style

const ProviderProfile = ({ user }) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedService, setSelectedService] = useState(null);
    const [showBookingModal, setShowBookingModal] = useState(false);

    // ❌ REMOVED: Local chatRoom state (handled globally now)

    useEffect(() => {
        const fetchProviderData = async () => {
            try {
                const res = await api.get(`/auth/public-profile/${id}`);
                setData(res.data);
            } catch (err) {
                setError("Could not load provider profile.");
            } finally {
                setLoading(false);
            }
        };
        fetchProviderData();
    }, [id]);

    // ✅ UPDATED: Open Chat via Global Widget Event
    const openProfileChat = async () => {
        if (!data?.provider) return;

        try {
            // 1. Get/Create Room
            const res = await api.post('/chat/rooms', {
                recipientId: data.provider.id,
                contextType: 'profile',
                contextId: null
            });

            // 2. Dispatch Event to open Global Widget
            window.dispatchEvent(new CustomEvent('openChatRoom', {
                detail: {
                    room: res.data.room,
                    context: { name: "General Inquiry" } // Generic context context
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
                        <span className="joined-tag">Joined {new Date(provider.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}</span>
                    </div>
                    
                    {/* ✅ UPDATED: Chat Button with Text ("Open Chat") */}
                    <div className="header-actions">
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
                {/* Left Side: Services */}
                <section className="services-section">
                    <h2>Our Services</h2>
                    <div className="profile-services-list">
                        {services.map(service => (
                            <div key={service.id} className="mini-service-card">
                                <div className="service-info">
                                    <h3>{service.name}</h3>
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

                {/* Right Side: Business Details */}
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