// src/components/ServiceManager.jsx
import React, { useState, useEffect, useRef } from 'react';
import { servicesAPI, appointmentsAPI } from '@/services/api';
import { authService } from '@/services/auth';
import ProviderProfile from '@/components/ProviderProfile';
import '@/components/ServiceManager.css';

const emptyForm = {
  name: '',
  description: '',
  duration_minutes: 60,
  price: 0,
  category: 'other',
  is_available: 1
};

export default function ServiceManager({ user }) {
  const isProvider = user?.user_type === 'provider';
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingServiceId, setEditingServiceId] = useState(null);

  // client view
  const [searchTerm, setSearchTerm] = useState('');
  const [viewingProvider, setViewingProvider] = useState(null);
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [appointmentDate, setAppointmentDate] = useState('');
  const [notes, setNotes] = useState('');

  const searchTimer = useRef(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [user]);

  const load = async (q = '') => {
    try {
      setLoading(true);
      const res = await servicesAPI.list(q ? { q } : {});
      setServices(res.data || []);
    } catch (err) {
      console.error('Failed to load services', err);
      setServices([]);
    } finally {
      setLoading(false);
    }
  };

  // live search (debounced)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      load(searchTerm.trim());
    }, 250);
    return () => clearTimeout(searchTimer.current);
  }, [searchTerm]);

  // ---------- Provider CRUD ----------
  const openCreate = () => {
    setEditing(true);
    setEditingServiceId(null);
    setForm(emptyForm);
  };

  const openEdit = (s) => {
    setEditing(true);
    setEditingServiceId(s.id);
    setForm({
      name: s.name,
      description: s.description,
      duration_minutes: s.duration_minutes,
      price: s.price,
      category: s.category,
      is_available: s.is_available
    });
  };

  const handleSaveService = async (e) => {
    e.preventDefault();
    try {
      if (!form.name) return alert('Name required');
      if (editingServiceId) {
        await servicesAPI.update(editingServiceId, form);
        alert('Service updated');
      } else {
        await servicesAPI.create(form);
        alert('Service created');
      }
      setEditing(false);
      load();
    } catch (err) {
      console.error('Save service failed', err);
      alert('Failed to save service');
    }
  };

  const handleDeleteService = async (id) => {
    if (!confirm('Delete this service?')) return;
    try {
      await servicesAPI.remove(id);
      alert('Service deleted');
      load();
    } catch (err) {
      console.error('Delete failed', err);
      alert('Failed to delete service');
    }
  };

  // ---------- Client booking ----------
  const handleBookClick = (service) => {
    setSelectedService(service);
    setAppointmentDate('');
    setNotes('');
    setShowBookingDialog(true);
  };

  const handleConfirmBooking = async () => {
    if (!appointmentDate) return alert('Select a date/time');
    try {
      await appointmentsAPI.create({
        service_id: selectedService.id,
        appointment_date: appointmentDate,
        notes: notes || ''
      });
      alert('✅ Appointment booked successfully!');
      setShowBookingDialog(false);
    } catch (err) {
      console.error('Booking failed', err);
      alert('❌ Failed to book appointment, please try again.');
    }
  };

  // For provider, clicking provider name opens ProviderProfile (shouldn't appear for provider)
  const openProvider = (providerId) => {
    setViewingProvider(providerId);
  };

  // Render
  if (loading) return <div className="loading-state">Loading services...</div>;

  // Provider view: management area
  if (isProvider) {
    return (
      <div className="service-manager provider-view">
        <div className="service-header">
          <h2>📊 My Services</h2>
          <div style={{display: 'flex', gap: '0.5rem'}}>
            <button className="primary-btn" onClick={openCreate}>➕ Add New Service</button>
            <button onClick={() => load()} className="secondary-btn">🔄 Refresh</button>
          </div>
        </div>

        {editing && (
          <div className="modal-overlay">
            <div className="modal">
              <div className="modal-header">
                <h3>{editingServiceId ? 'Edit Service' : 'Create New Service'}</h3>
                <button onClick={() => setEditing(false)}>×</button>
              </div>
              <form onSubmit={handleSaveService}>
                <div className="form-group">
                  <label>Service Name *</label>
                  <input name="name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea name="description" value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows="3" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Duration (minutes)</label>
                    <input type="number" name="duration_minutes" value={form.duration_minutes} min="15" step="15" onChange={e => setForm({...form, duration_minutes: Number(e.target.value)})} />
                  </div>
                  <div className="form-group">
                    <label>Price (KES)</label>
                    <input type="number" name="price" value={form.price} onChange={e => setForm({...form, price: Number(e.target.value)})} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <input name="category" value={form.category} onChange={e => setForm({...form, category: e.target.value})} />
                </div>
                <div className="form-actions">
                  <button type="button" onClick={() => setEditing(false)} className="secondary-btn">Cancel</button>
                  <button type="submit" className="primary-btn">{editingServiceId ? 'Save' : 'Create'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="services-grid provider-grid">
          {services.length === 0 ? (
            <div className="empty-state">You have no services yet.</div>
          ) : services.map(s => (
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
                <button className="secondary-btn" onClick={() => openEdit(s)}>✏️ Edit</button>
                <button className="secondary-btn" onClick={() => handleDeleteService(s.id)}>🗑️ Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Client view: Find Services
  return (
    <div className="service-manager client-view">
      {viewingProvider ? (
        <ProviderProfile providerId={viewingProvider} onBack={() => setViewingProvider(null)} onBook={(service) => handleBookClick(service)} />
      ) : (
        <>
          <div className="service-header">
            <h2>🔎 Find Services</h2>
            <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
              <input
                className="search-input"
                placeholder="Search services (eg. Massage, Haircut, Fitness)..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              <button className="secondary-btn" onClick={() => { setSearchTerm(''); load(); }}>Reset</button>
            </div>
          </div>

          <div className="services-grid client-grid">
            {services.length === 0 ? <div className="empty-state">No services found.</div> :
              services.map(service => (
                <div key={service.id} className="service-card">
                  <div className="service-card-header">
                    <h4>{service.name}</h4>
                    <span className="category-tag">{service.category}</span>
                  </div>
                  {service.description && <p className="service-description">{service.description}</p>}
                  <div className="service-details">
                    <span>⏱️ {service.duration_minutes} min</span>
                    <span>💰 {service.price ? `KES ${service.price}` : 'Free'}</span>
                  </div>

                  <div className="service-actions">
                    <button className="primary-btn" onClick={() => handleBookClick(service)}>📅 Book Now</button>
                    <button className="link-btn" onClick={() => openProvider(service.provider_id)}>{service.provider_name}</button>
                  </div>
                </div>
              ))
            }
          </div>
        </>
      )}

      {/* Booking Dialog (client) */}
      {showBookingDialog && selectedService && (
        <div className="dialog-backdrop">
          <div className="dialog">
            <h3>📅 Book: {selectedService.name}</h3>
            <p>Provider: {selectedService.provider_name} ({selectedService.business_name || 'Independent'})</p>

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
