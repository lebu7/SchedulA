import React, { useEffect, useState } from 'react';
import { servicesAPI } from '../services/api';
import './ProviderProfile.css';

function ProviderProfile({ providerId, onBack, onBook }) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProviderServices();
  }, [providerId]);

  const loadProviderServices = async () => {
    try {
      setLoading(true);
      const all = await servicesAPI.getAll();
      const filtered = (all.data || []).filter(s => s.provider_id === providerId);
      setServices(filtered);
    } catch (err) {
      console.error('Failed to load provider services', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <p>Loading provider services...</p>;

  return (
    <div className="provider-profile">
      <button className="back-btn" onClick={onBack}>⬅ Back</button>
      <h2>Provider Services</h2>

      {services.length === 0 ? (
        <p>No services found for this provider.</p>
      ) : (
        <div className="provider-services-grid">
          {services.map(service => (
            <div key={service.id} className="provider-service-card">
              <h3>{service.name}</h3>
              <p>{service.description}</p>
              <p><strong>Category:</strong> {service.category}</p>
              <p><strong>Duration:</strong> {service.duration_minutes} min</p>
              <p><strong>Price:</strong> KSh {service.price}</p>
              <button onClick={() => onBook(service)}>📅 Book</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProviderProfile;
