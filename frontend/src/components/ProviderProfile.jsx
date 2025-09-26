// src/components/ProviderProfile.jsx
import React, { useState, useEffect } from 'react';
import { servicesAPI, appointmentsAPI } from '@/services/api';
import '@/components/ProviderProfile.css';

export default function ProviderProfile({ providerId, onBack, onBook }) {
  const [provider, setProvider] = useState(null);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  // booking dialog local
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [appointmentDate, setAppointmentDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadProvider();
    // eslint-disable-next-line
  }, [providerId]);

  const loadProvider = async () => {
    setLoading(true);
    try {
      const res = await servicesAPI.providerServices(providerId);
      setProvider(res.data.provider);
      setServices(res.data.services || []);
    } catch (err) {
      console.error('Failed to fetch provider', err);
    } finally {
      setLoading(false);
    }
  };

  const openBooking = (service) => {
    setSelectedService(service);
    setAppointmentDate('');
    setNotes('');
    setShowBookingDialog(true);
  };

  const handleConfirmBooking = async () => {
    if (!appointmentDate) return alert('Choose date/time');
    try {
      await appointmentsAPI.create({
        service_id: selectedService.id,
        appointment_date: appointmentDate,
        notes
      });
      alert('Appointment booked ✅');
      setShowBookingDialog(false);
      // optionally call parent's onBook
      onBook && onBook(selectedService);
    } catch (err) {
      console.error('Booking error', err);
      alert('Failed to book appointment');
    }
  };

  if (loading) return <div className="loading-state">Loading provider...</div>;

  return (
    <div className="provider-profile">
      <div className="provider-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <div>
          <h2>{provider.name}</h2>
          {provider.business_name && <p className="muted">{provider.business_name}</p>}
          {provider.phone && <p className="muted">Contact: {provider.phone}</p>}
        </div>
      </div>

      <div className="provider-services">
        <h3>Services Offered</h3>
        {services.length === 0 ? <p>No services listed.</p> : (
          <div className="services-grid">
            {services.map(s => (
              <div key={s.id} className="service-card">
                <div className="service-card-header">
                  <h4>{s.name}</h4>
                  <span className="category-tag">{s.category}</span>
                </div>
                {s.description && <p className="service-description">{s.description}</p>}
                <div className="service-details">
                  <span>⏱️ {s.duration_minutes} min</span>
                  <span>💰 {s.price ? `KES ${s.price}` : 'Free'}</span>
                </div>
                <div className="service-actions">
                  <button className="primary-btn" onClick={() => openBooking(s)}>📅 Book Now</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Local booking dialog */}
      {showBookingDialog && selectedService && (
        <div className="dialog-backdrop">
          <div className="dialog">
            <h3>📅 Book: {selectedService.name}</h3>
            <p>Provider: {provider.name} ({provider.business_name || 'Independent'})</p>

            <label>
              Appointment Date & Time:
              <input type="datetime-local" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} />
            </label>

            <label>
              Notes (optional):
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>

            <div className="dialog-actions">
              <button onClick={handleConfirmBooking} className="primary-btn">Confirm</button>
              <button onClick={() => setShowBookingDialog(false)} className="cancel-btn">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
