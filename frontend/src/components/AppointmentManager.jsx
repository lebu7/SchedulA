import React, { useState, useEffect } from 'react';
import { servicesAPI, appointmentsAPI } from '../services/api';
import ProviderProfile from './ProviderProfile';
import './AppointmentManager.css';

function AppointmentManager({ user }) {
  const [services, setServices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [appointmentDate, setAppointmentDate] = useState('');
  const [clientNotes, setClientNotes] = useState('');

  const [viewingProvider, setViewingProvider] = useState(null);

  useEffect(() => {
    if (user.user_type === 'client') {
      loadServices();
    } else {
      loadAppointments();
    }
  }, [user]);

  const loadServices = async () => {
    try {
      setLoading(true);
      const data = await servicesAPI.getAll();
      setServices(data.data || []);
    } catch (error) {
      console.error('Failed to fetch services:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAppointments = async () => {
    try {
      setLoading(true);
      const data = await appointmentsAPI.getAll();
      setAppointments(data.data || []);
    } catch (error) {
      console.error('Failed to fetch appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBookClick = (service) => {
    setSelectedService(service);
    setAppointmentDate('');
    setClientNotes('');
    setShowBookingDialog(true);
  };

  const handleConfirmBooking = async () => {
    if (!appointmentDate) {
      alert('Please select a date and time');
      return;
    }
    try {
      await appointmentsAPI.create({
        service_id: selectedService.id,
        appointment_date: appointmentDate,
        client_notes: clientNotes,
      });
      alert('✅ Appointment booked successfully!');
      setShowBookingDialog(false);
      loadAppointments();
    } catch (error) {
      console.error('Booking failed:', error);
      alert('❌ Failed to book appointment. Please try again.');
    }
  };

  // ============ RENDER ==============
  if (loading) return <p>Loading...</p>;

  if (user.user_type === 'client') {
    return (
      <div className="appointment-manager">
        <h2>📋 Book an Appointment</h2>

        {/* Provider profile view */}
        {viewingProvider ? (
          <ProviderProfile
            providerId={viewingProvider}
            onBack={() => setViewingProvider(null)}
            onBook={(service) => handleBookClick(service)}
          />
        ) : (
          <>
            {/* Search bar */}
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search services (e.g. Massage, Salon, Cleaning)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Services Grid */}
            <div className="services-grid">
              {services
                .filter((s) =>
                  s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  s.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  s.business_name?.toLowerCase().includes(searchTerm.toLowerCase())
                )
                .map((service) => (
                  <div key={service.id} className="service-card">
                    <h3>{service.name}</h3>
                    <p className="desc">{service.description}</p>
                    <p>
                      <strong>Provider:</strong>{' '}
                      <button
                        className="link-btn"
                        onClick={() => setViewingProvider(service.provider_id)}
                      >
                        {service.provider_name} ({service.business_name || 'Independent'})
                      </button>
                    </p>
                    <p><strong>Category:</strong> {service.category}</p>
                    <p><strong>Duration:</strong> {service.duration_minutes} min</p>
                    <p><strong>Price:</strong> KSh {service.price}</p>
                    <button onClick={() => handleBookClick(service)}>📅 Book Now</button>
                  </div>
                ))}
              {services.length === 0 && <p>No services available yet.</p>}
            </div>
          </>
        )}

        {/* Booking Dialog */}
        {showBookingDialog && selectedService && (
          <div className="dialog-backdrop">
            <div className="dialog">
              <h3>📅 Book: {selectedService.name}</h3>
              <p>
                Provider: {selectedService.provider_name} (
                {selectedService.business_name || 'Independent'})
              </p>

              <label>
                Appointment Date & Time:
                <input
                  type="datetime-local"
                  value={appointmentDate}
                  onChange={(e) => setAppointmentDate(e.target.value)}
                />
              </label>

              <label>
                Notes (optional):
                <textarea
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                />
              </label>

              <div className="dialog-actions">
                <button onClick={handleConfirmBooking}>Confirm</button>
                <button
                  onClick={() => setShowBookingDialog(false)}
                  className="cancel-btn"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Provider view
  return (
    <div>
      <h2>📅 My Appointments</h2>
      {appointments.length === 0 ? (
        <p>No appointments yet.</p>
      ) : (
        <ul className="appointment-list">
          {appointments.map((appt) => (
            <li key={appt.id} className="appointment-item">
              <strong>{appt.service_name}</strong> with{' '}
              {appt.client_name || appt.provider_name} <br />
              <span>{new Date(appt.appointment_date).toLocaleString()}</span>
              {appt.client_notes && <p>Notes: {appt.client_notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AppointmentManager;
