// frontend/src/components/ProviderProfile.jsx
import React, { useEffect, useState } from 'react';
import { servicesAPI, appointmentsAPI } from '../services/api';
import './ProviderProfile.css';

const ProviderProfile = ({ providerId, onBook }) => {
  const [provider, setProvider] = useState(null);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const res = await servicesAPI.providerServices(providerId);
      setProvider(res.data.provider);
      setServices(res.data.services || []);
    } catch (err) {
      console.error('Provider load failed', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{ if (providerId) load(); }, [providerId]);

  const handleBook = (s) => {
    // emit a simple flow: open the global booking UI - in App.jsx we switch to bookings.
    // For simplicity, open the appointment modal here or call an external callback
    // We'll open a prompt for date/time (quick)
    const date = prompt('Enter date/time (YYYY-MM-DDTHH:MM): e.g. 2025-09-25T14:30');
    if (!date) return;
    const notes = prompt('Notes (optional):') || null;
    appointmentsAPI.create({ service_id: s.id, appointment_date: date, notes }).then(()=> {
      alert('Booked successfully'); if (onBook) onBook();
    }).catch(err => { alert(err.response?.data?.error || err.message || 'Booking failed'); });
  };

  if (!provider) return <div>Loading provider...</div>;

  return (
    <div className="provider-profile">
      <div className="provider-header">
        <h2>{provider.name}</h2>
        {provider.business_name && <p>{provider.business_name}</p>}
        {provider.phone && <p>📞 {provider.phone}</p>}
      </div>

      <div className="provider-services">
        <h3>Services</h3>
        {services.length === 0 ? <p>No services</p> : services.map(s => (
          <div key={s.id} className="service-card">
            <h4>{s.name}</h4>
            <p>{s.description}</p>
            <div className="service-meta">
              <span>⏱ {s.duration_minutes || 60} min</span>
              <span>💰 {s.price ? `KES ${s.price}` : 'Free'}</span>
            </div>
            <div className="service-actions">
              <button className="primary-btn" onClick={() => handleBook(s)}>Book</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProviderProfile;
