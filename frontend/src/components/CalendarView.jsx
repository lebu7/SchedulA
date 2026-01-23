import React, { useState, useEffect } from "react";
import Calendar from "react-calendar";
import api from "../services/auth";
import { Clock, User, Scissors, X, Calendar as CalendarIcon } from "lucide-react";
import "react-calendar/dist/Calendar.css";
import "./CalendarView.css";

function CalendarView({ user }) {
  const [appointments, setAppointments] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dayAppointments, setDayAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAppointments();
  }, []);

  useEffect(() => {
    filterAppointmentsByDate(selectedDate);
  }, [selectedDate, appointments]);

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const res = await api.get("/appointments");
      // Combine upcoming and past but filter out cancelled/rebooked for a clean calendar
      const allApts = [
        ...(res.data.appointments.upcoming || []),
        ...(res.data.appointments.scheduled || []),
        ...(res.data.appointments.past || [])
      ];
      
      const active = allApts.filter(a => a.status === 'scheduled' || a.status === 'completed');
      setAppointments(active);
    } catch (err) {
      console.error("Failed to fetch calendar data", err);
    } finally {
      setLoading(false);
    }
  };

  const filterAppointmentsByDate = (date) => {
    // Offset date to local timezone string for comparison
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    const dateString = localDate.toISOString().split('T')[0];
    
    const filtered = appointments.filter(a => 
      a.appointment_date.startsWith(dateString)
    ).sort((a, b) => a.appointment_date.localeCompare(b.appointment_date));
    setDayAppointments(filtered);
  };

  // Function to add dots to dates with appointments
  const tileContent = ({ date, view }) => {
    if (view === 'month') {
      const offset = date.getTimezoneOffset();
      const localDate = new Date(date.getTime() - (offset * 60 * 1000));
      const dateString = localDate.toISOString().split('T')[0];
      const hasApt = appointments.some(a => a.appointment_date.startsWith(dateString));
      return hasApt ? <div className="calendar-dot"></div> : null;
    }
  };

  return (
    <div className="calendar-view-container fade-in">
      <div className="calendar-card">
        <Calendar 
          onChange={setSelectedDate} 
          value={selectedDate}
          tileContent={tileContent}
          className="custom-react-calendar"
        />
      </div>

      <div className="day-details">
        <div className="day-header">
            <CalendarIcon size={20} />
            <h3>Schedule for {selectedDate.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
        </div>
        
        {loading ? (
          <div className="calendar-loading">
             <div className="spinner"></div>
             <p>Loading schedule...</p>
          </div>
        ) : dayAppointments.length > 0 ? (
          <div className="calendar-timeline">
            {dayAppointments.map(apt => (
              <div key={apt.id} className={`calendar-timeline-item ${apt.status}`}>
                <div className="calendar-time-column">
                  {new Date(apt.appointment_date).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="calendar-info-column">
                  <div className="calendar-service-line">
                    <strong>{apt.service_name}</strong>
                  </div>
                  <div className="calendar-client-line">
                    <User size={14} /> {apt.client_name}
                  </div>
                  <div className="calendar-meta-line">
                    <span><Clock size={12} /> {apt.duration} mins</span>
                    <span className={`status-pill-small ${apt.status}`}>{apt.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="calendar-empty-state">
            <CalendarIcon size={48} />
            <p>No appointments scheduled for this day.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default CalendarView;