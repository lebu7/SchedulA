import React, { useState, useEffect } from 'react';
import api from '../services/api';

const BookingCalendar = () => {
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      const response = await api.get('/services');
      setServices(response.data);
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  };

  const handleBooking = async (e) => {
    e.preventDefault();
    if (!selectedService || !selectedDate || !selectedTime) {
      setMessage('Please fill all fields');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const appointmentDateTime = `${selectedDate}T${selectedTime}:00`;
      await api.post('/appointments', {
        service_id: selectedService,
        appointment_date: appointmentDateTime,
        client_notes: notes
      });
      setMessage('Appointment booked successfully!');
      // Reset form
      setSelectedService('');
      setSelectedDate('');
      setSelectedTime('');
      setNotes('');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Booking failed');
    } finally {
      setLoading(false);
    }
  };

  // Generate time slots
  const timeSlots = [];
  for (let hour = 8; hour <= 18; hour++) {
    timeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
    timeSlots.push(`${hour.toString().padStart(2, '0')}:30`);
  }

  return (
    <div className="booking-calendar">
      <h2>📅 Book an Appointment</h2>
      
      <form onSubmit={handleBooking} className="booking-form">
        <select 
          value={selectedService} 
          onChange={(e) => setSelectedService(e.target.value)}
          required
        >
          <option value="">Select a Service</option>
          {services.map(service => (
            <option key={service.id} value={service.id}>
              {service.name} - {service.provider_name} (KES {service.price})
            </option>
          ))}
        </select>

        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          min={new Date().toISOString().split('T')[0]}
          required
        />

        <select 
          value={selectedTime} 
          onChange={(e) => setSelectedTime(e.target.value)}
          required
        >
          <option value="">Select Time</option>
          {timeSlots.map(time => (
            <option key={time} value={time}>{time}</option>
          ))}
        </select>

        <textarea
          placeholder="Additional notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows="3"
        />

        <button type="submit" disabled={loading}>
          {loading ? 'Booking...' : 'Book Appointment'}
        </button>
      </form>

      {message && <div className="booking-message">{message}</div>}

      <div className="booking-info">
        <h3>Available Services</h3>
        <div className="services-preview">
          {services.slice(0, 3).map(service => (
            <div key={service.id} className="service-preview">
              <strong>{service.name}</strong> by {service.business_name || service.provider_name}
              <br />
              <small>{service.duration_minutes} min • KES {service.price}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BookingCalendar;
