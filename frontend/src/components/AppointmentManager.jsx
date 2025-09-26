// frontend/src/components/AppointmentManager.jsx
import React, { useState, useEffect } from "react";
import { servicesAPI, appointmentsAPI } from "../services/api";
import ProviderProfile from "./ProviderProfile";
import "./AppointmentManager.css";

function AppointmentManager({ user }) {
  const [services, setServices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredServices, setFilteredServices] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [appointmentDate, setAppointmentDate] = useState("");
  const [clientNotes, setClientNotes] = useState("");

  const [viewingProvider, setViewingProvider] = useState(null);
  const [activeTab, setActiveTab] = useState("services"); // 👈 separate tabs

  // Load services or appointments
  useEffect(() => {
    if (user.user_type === "client") {
      loadServices();
    } else {
      loadAppointments();
    }
  }, [user]);

  // Search effect — live filter
  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredServices(services);
    } else {
      const term = searchTerm.toLowerCase();
      setFilteredServices(
        services.filter(
          (s) =>
            s.name.toLowerCase().includes(term) ||
            s.category?.toLowerCase().includes(term) ||
            s.business_name?.toLowerCase().includes(term) ||
            s.provider_name?.toLowerCase().includes(term)
        )
      );
    }
  }, [searchTerm, services]);

  const loadServices = async () => {
    try {
      setLoading(true);
      const data = await servicesAPI.list();
      setServices(data.data || []);
      setFilteredServices(data.data || []);
    } catch (error) {
      console.error("Failed to fetch services:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadAppointments = async () => {
    try {
      setLoading(true);
      const data = await appointmentsAPI.list();
      setAppointments(data.data || []);
    } catch (error) {
      console.error("Failed to fetch appointments:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleBookClick = (service) => {
    setSelectedService(service);
    setAppointmentDate("");
    setClientNotes("");
    setShowBookingDialog(true);
  };

  const handleConfirmBooking = async () => {
    if (!appointmentDate) {
      alert("Please select a date and time");
      return;
    }
    try {
      await appointmentsAPI.create({
        service_id: selectedService.id,
        appointment_date: appointmentDate,
        notes: clientNotes,
      });
      alert("✅ Appointment booked successfully!");
      setShowBookingDialog(false);
      loadAppointments();
      setActiveTab("bookings");
    } catch (error) {
      console.error("Booking failed:", error);
      alert("❌ Failed to book appointment. Please try again.");
    }
  };

  if (loading) return <p>Loading...</p>;

  // ========== CLIENT VIEW ==========
  if (user.user_type === "client") {
    return (
      <div className="appointment-manager">
        <nav className="appt-nav">
          <button
            className={activeTab === "services" ? "active" : ""}
            onClick={() => setActiveTab("services")}
          >
            Find Services
          </button>
          <button
            className={activeTab === "bookings" ? "active" : ""}
            onClick={() => {
              setActiveTab("bookings");
              loadAppointments();
            }}
          >
            My Bookings
          </button>
        </nav>

        {activeTab === "services" && (
          <>
            <h2>🔎 Find Services</h2>

            {viewingProvider ? (
              <ProviderProfile
                providerId={viewingProvider}
                onBack={() => setViewingProvider(null)}
                onBook={(service) => handleBookClick(service)}
              />
            ) : (
              <>
                <div className="search-bar">
                  <input
                    type="text"
                    placeholder="Search services (e.g. Massage, Salon, Cleaning)..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <div className="services-grid">
                  {filteredServices.map((service) => (
                    <div key={service.id} className="service-card">
                      <h3>{service.name}</h3>
                      <p className="desc">{service.description}</p>
                      <p>
                        <strong>Provider:</strong>{" "}
                        <button
                          className="link-btn"
                          onClick={() => setViewingProvider(service.provider_id)}
                        >
                          {service.provider_name} (
                          {service.business_name || "Independent"})
                        </button>
                      </p>
                      <p>
                        <strong>Category:</strong> {service.category}
                      </p>
                      <p>
                        <strong>Duration:</strong> {service.duration_minutes}{" "}
                        min
                      </p>
                      <p>
                        <strong>Price:</strong> KSh {service.price}
                      </p>
                      <button onClick={() => handleBookClick(service)}>
                        📅 Book Now
                      </button>
                    </div>
                  ))}
                  {filteredServices.length === 0 && (
                    <p>No services match your search.</p>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {activeTab === "bookings" && (
          <div>
            <h2>📋 My Bookings</h2>
            {appointments.length === 0 ? (
              <p>No bookings yet.</p>
            ) : (
              <ul className="appointment-list">
                {appointments.map((appt) => (
                  <li key={appt.id} className="appointment-item">
                    <strong>{appt.service_name}</strong> with{" "}
                    {appt.provider_name} <br />
                    <span>
                      {new Date(appt.appointment_date).toLocaleString()}
                    </span>
                    {appt.notes && <p>Notes: {appt.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {showBookingDialog && selectedService && (
          <div className="dialog-backdrop">
            <div className="dialog">
              <h3>📅 Book: {selectedService.name}</h3>
              <p>
                Provider: {selectedService.provider_name} (
                {selectedService.business_name || "Independent"})
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

  // ========== PROVIDER VIEW ==========
  return (
    <div className="appointment-manager">
      <h2>📅 My Appointments</h2>
      {appointments.length === 0 ? (
        <p>No appointments yet.</p>
      ) : (
        <ul className="appointment-list">
          {appointments.map((appt) => (
            <li key={appt.id} className="appointment-item">
              <strong>{appt.service_name}</strong> with {appt.client_name} <br />
              <span>{new Date(appt.appointment_date).toLocaleString()}</span>
              {appt.notes && <p>Notes: {appt.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AppointmentManager;
