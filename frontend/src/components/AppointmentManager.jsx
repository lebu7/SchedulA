// frontend/src/components/AppointmentManager.jsx
import React, { useState, useEffect } from 'react';
import { servicesAPI, appointmentsAPI } from '../services/api';
import ProviderProfile from './ProviderProfile';
import './AppointmentManager.css';

function AppointmentManager({ user }) {
  const [services, setServices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // booking/reschedule dialogs
  const [showDialog, setShowDialog] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [appointmentDate, setAppointmentDate] = useState('');
  const [notes, setNotes] = useState('');
  const [editingAppt, setEditingAppt] = useState(null);

  // provider profile view
  const [viewingProvider, setViewingProvider] = useState(null);

  useEffect(() => {
    if (user.user_type === 'client') {
      loadServices();
      loadAppointments();
    } else {
      loadAppointments();
    }
  }, [user]);

  const loadServices = async () => {
    try {
      setLoading(true);
      const data = await servicesAPI.list();
      setServices(data.data || []);
    } catch (err) {
      console.error('Failed to fetch services', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAppointments = async () => {
    try {
      setLoading(true);
      const data = await appointmentsAPI.list();
      setAppointments(data.data || []);
    } catch (err) {
      console.error('Failed to fetch appointments', err);
    } finally {
      setLoading(false);
    }
  };

  // ----- Booking & Editing -----
  const openBookingDialog = (service) => {
    setSelectedService(service);
    setEditingAppt(null);
    setAppointmentDate('');
    setNotes('');
    setShowDialog(true);
  };

  const openRescheduleDialog = (appt) => {
    setEditingAppt(appt);
    setSelectedService(null);
    setAppointmentDate(appt.appointment_date.slice(0, 16));
    setNotes(appt.notes || '');
    setShowDialog(true);
  };

  const handleConfirm = async () => {
    if (!appointmentDate) {
      alert('Please choose a date/time');
      return;
    }

    try {
      if (editingAppt) {
        // reschedule
        await appointmentsAPI.update(editingAppt.id, {
          appointment_date: appointmentDate,
          notes,
        });
        alert('✅ Appointment rescheduled');
      } else {
        // new booking
        await appointmentsAPI.create({
          service_id: selectedService.id,
          appointment_date: appointmentDate,
          notes,
        });
        alert('✅ Appointment booked');
      }
      setShowDialog(false);
      loadAppointments();
    } catch (err) {
      console.error('Booking/reschedule failed', err);
      alert('❌ Failed, please try again.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this appointment?')) return;
    try {
      await appointmentsAPI.remove(id);
      alert('🗑️ Appointment deleted');
      loadAppointments();
    } catch (err) {
      console.error('Delete failed', err);
      alert('❌ Failed to delete appointment');
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await appointmentsAPI.update(id, { status });
      loadAppointments();
    } catch (err) {
      console.error('Status update failed', err);
    }
  };

  // ----- RENDER -----
  if (loading) return <p>Loading...</p>;

  if (user.user_type === 'client') {
    return (
      <div className="appointment-manager">
        <h2>📋 Book an Appointment</h2>

        {viewingProvider ? (
          <ProviderProfile
            providerId={viewingProvider}
            onBack={() => setViewingProvider(null)}
            onBook={openBookingDialog}
          />
        ) : (
          <>
            {/* Search */}
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search services (e.g. Massage, Salon)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Services */}
            <div className="services-grid">
              {services
                .filter(
                  (s) =>
                    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    s.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    s.business_name?.toLowerCase().includes(searchTerm.toLowerCase())
                )
                .map((s) => (
                  <div key={s.id} className="service-card">
                    <h3>{s.name}</h3>
                    <p>{s.description}</p>
                    <p>
                      <strong>Provider:</strong>{' '}
                      <button
                        className="link-btn"
                        onClick={() => setViewingProvider(s.provider_id)}
                      >
                        {s.provider_name} ({s.business_name || 'Independent'})
                      </button>
                    </p>
                    <p><strong>Price:</strong> KSh {s.price}</p>
                    <button onClick={() => openBookingDialog(s)}>📅 Book Now</button>
                  </div>
                ))}
            </div>

            {/* My Bookings */}
            <h3>📌 My Bookings</h3>
            <div className="appointments-grid">
              {appointments.map((a) => (
                <div key={a.id} className={`appointment-card ${a.status}`}>
                  <h4>{a.service_name}</h4>
                  <p>
                    With {a.provider_name} ({a.business_name || 'Independent'})
                  </p>
                  <p>{new Date(a.appointment_date).toLocaleString()}</p>
                  <p>Status: {a.status}</p>
                  {a.notes && <p>Notes: {a.notes}</p>}

                  <div className="actions">
                    {a.status === 'scheduled' && (
                      <>
                        <button onClick={() => openRescheduleDialog(a)}>✏️ Reschedule</button>
                        <button onClick={() => handleDelete(a.id)}>🗑️ Cancel</button>
                      </>
                    )}
                    {a.status !== 'scheduled' && (
                      <>
                        <button onClick={() => openBookingDialog({ id: a.service_id, ...a })}>
                          🔁 Rebook
                        </button>
                        <button onClick={() => handleDelete(a.id)}>🗑️ Delete</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Dialog */}
        {showDialog && (
          <div className="dialog-backdrop">
            <div className="dialog">
              <h3>
                {editingAppt
                  ? `✏️ Reschedule ${editingAppt.service_name}`
                  : `📅 Book: ${selectedService?.name}`}
              </h3>

              <label>
                Date & Time:
                <input
                  type="datetime-local"
                  value={appointmentDate}
                  onChange={(e) => setAppointmentDate(e.target.value)}
                />
              </label>

              <label>
                Notes:
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>

              <div className="dialog-actions">
                <button onClick={handleConfirm}>Confirm</button>
                <button className="cancel-btn" onClick={() => setShowDialog(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ----- PROVIDER VIEW -----
  return (
    <div className="appointment-manager">
      <h2>📅 My Appointments (Provider)</h2>
      <div className="appointments-grid">
        {appointments.map((a) => (
          <div key={a.id} className={`appointment-card ${a.status}`}>
            <h4>{a.service_name}</h4>
            <p>Client: {a.client_name}</p>
            <p>{new Date(a.appointment_date).toLocaleString()}</p>
            <p>Status: {a.status}</p>
            {a.notes && <p>Notes: {a.notes}</p>}
            <div className="actions">
              {['scheduled', 'completed', 'cancelled', 'no-show'].map((st) => (
                <button
                  key={st}
                  disabled={a.status === st}
                  onClick={() => handleStatusChange(a.id, st)}
                >
                  {st}
                </button>
              ))}
              <button onClick={() => handleDelete(a.id)}>🗑️ Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AppointmentManager;
