/* frontend/src/components/ClientReportModal.jsx */
import React, { useState, useEffect } from 'react';
import { X, Calendar, DollarSign, UserX, FileText, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import api from '../services/auth';
import './ClientReportModal.css';

const ClientReportModal = ({ clientId, onClose }) => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!clientId) return;

    const fetchHistory = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/appointments/client-history/${clientId}`);
        setReport(res.data);
      } catch (err) {
        console.error("Failed to load client history:", err);
        setError("Could not load client history.");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [clientId]);

  if (!clientId) return null;

  return (
    <div className="report-modal-overlay" onClick={onClose}>
      <div className="report-modal-container" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="report-header">
          <div className="header-left">
            <h2>Client Visit Report</h2>
            {report?.client && (
              <p className="client-subtitle">
                History for <span className="highlight-name">{report.client.name}</span> • {report.client.phone}
              </p>
            )}
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="report-body">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Generating report...</p>
            </div>
          ) : error ? (
            <div className="error-state">
              <AlertTriangle size={30} color="#ef4444" />
              <p>{error}</p>
            </div>
          ) : (
            <>
              {/* Key Statistics Cards */}
              <div className="stats-grid">
                <div className="stat-card blue">
                  <div className="stat-icon"><Calendar size={18} /></div>
                  <div className="stat-info">
                    <span className="stat-label">Total Visits</span>
                    <strong className="stat-value">{report.stats.total_visits}</strong>
                  </div>
                </div>

                <div className="stat-card green">
                  <div className="stat-icon"><DollarSign size={18} /></div>
                  <div className="stat-info">
                    <span className="stat-label">Total Spent</span>
                    <strong className="stat-value">KES {report.stats.total_spent.toLocaleString()}</strong>
                  </div>
                </div>

                <div className="stat-card orange">
                  <div className="stat-icon"><UserX size={18} /></div>
                  <div className="stat-info">
                    <span className="stat-label">No-Shows</span>
                    <strong className="stat-value">{report.stats.no_shows}</strong>
                  </div>
                </div>

                <div className="stat-card red">
                  <div className="stat-icon"><X size={18} /></div>
                  <div className="stat-info">
                    <span className="stat-label">Cancellations</span>
                    <strong className="stat-value">{report.stats.cancellations}</strong>
                  </div>
                </div>
              </div>

              {/* Visit History Table */}
              <div className="history-section">
                <h3>Appointment History</h3>
                {report.history.length === 0 ? (
                  <p className="empty-history">No appointment history found with this client.</p>
                ) : (
                  <div className="table-wrapper">
                    <table className="history-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Service</th>
                          <th>Status</th>
                          <th>Price</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.history.map((apt) => (
                          <tr key={apt.id}>
                            <td className="col-date">
                              {new Date(apt.appointment_date).toLocaleDateString('en-KE', {
                                day: 'numeric', month: 'short', year: 'numeric'
                              })}
                              <span className="sub-time">
                                {new Date(apt.appointment_date).toLocaleTimeString('en-KE', {
                                  hour: '2-digit', minute: '2-digit'
                                })}
                              </span>
                            </td>
                            <td className="col-service">{apt.service_name}</td>
                            <td className="col-status">
                              <span className={`status-pill ${apt.status}`}>
                                {apt.status}
                              </span>
                            </td>
                            <td className="col-price">KES {apt.total_price.toLocaleString()}</td>
                            <td className="col-notes">
                              {apt.notes ? <span title={apt.notes}>{apt.notes}</span> : <span className="text-muted">-</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="report-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Print Report</button>
        </div>
      </div>
    </div>
  );
};

export default ClientReportModal;