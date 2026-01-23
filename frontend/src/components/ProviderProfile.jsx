import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/auth';
import BookingModal from './BookingModal';
import { MapPin, Clock, Users, ArrowLeft, ExternalLink, Calendar, Phone } from 'lucide-react';
import './ProviderProfile.css';

const ProviderProfile = ({ user }) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedService, setSelectedService] = useState(null);
    const [showBookingModal, setShowBookingModal] = useState(false);

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
            {/* ✅ FIXED: Explicitly navigate to /dashboard and pass the 'services' tab state */}
            <button 
                className="back-link" 
                onClick={() => navigate('/dashboard', { state: { tab: 'services' } })}
            >
                <ArrowLeft size={18} /> Back to Services
            </button>

            <header className="profile-header">
                <div className="header-top">
                    <h1>{provider.business_name || provider.name}</h1>
                    <span className="joined-tag">Joined {new Date(provider.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}</span>
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
                            <span>Saturday - Sunday</span>
                            <strong className="closed-text">Closed</strong>
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