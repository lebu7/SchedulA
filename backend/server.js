const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const db = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// ---------------- auth middleware ----------------
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// ---------------- Appointments ----------------

// client books appointment
app.post('/api/appointments', authenticateToken, async (req, res) => {
  try {
    if (req.user.user_type !== 'client')
      return res.status(403).json({ error: 'Only clients can book appointments' });

    const { service_id, appointment_date, notes } = req.body;
    if (!service_id || !appointment_date)
      return res.status(400).json({ error: 'Service ID and appointment date are required' });

    const service = await db.get(
      'SELECT s.*, u.id as provider_id FROM services s JOIN users u ON s.provider_id = u.id WHERE s.id = ?',
      [service_id]
    );
    if (!service) return res.status(404).json({ error: 'Service not found' });

    // check double booking
    const existing = await db.get(
      `SELECT * FROM appointments
       WHERE provider_id = ? AND status = 'scheduled'
       AND appointment_date = ?`,
      [service.provider_id, appointment_date]
    );
    if (existing) {
      return res.status(400).json({ error: 'Time slot already booked, choose another' });
    }

    const duration = service.duration_minutes || 60;
    const endDate = new Date(new Date(appointment_date).getTime() + duration * 60000).toISOString();

    const result = await db.run(
      `INSERT INTO appointments (client_id, service_id, provider_id, appointment_date, end_date, status, notes, client_deleted, provider_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [req.user.id, service_id, service.provider_id, appointment_date, endDate, 'scheduled', notes || null]
    );

    const created = await db.get('SELECT * FROM appointments WHERE id = ?', [result.id]);
    res.status(201).json({ success: true, message: 'Appointment booked', data: created });
  } catch (err) {
    console.error('Appointment creation error:', err);
    res.status(500).json({ error: 'Failed to book appointment' });
  }
});

// provider requests reschedule
app.put('/api/appointments/:id/reschedule', authenticateToken, async (req, res) => {
  try {
    const apptId = parseInt(req.params.id, 10);
    const { new_date, notes } = req.body;

    const appt = await db.get('SELECT * FROM appointments WHERE id = ?', [apptId]);
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    if (req.user.user_type !== 'provider' || appt.provider_id !== req.user.id)
      return res.status(403).json({ error: 'Not allowed' });

    await db.run(
      `UPDATE appointments
       SET status = ?, appointment_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      ['reschedule-requested', new_date, notes || null, apptId]
    );

    const updated = await db.get('SELECT * FROM appointments WHERE id = ?', [apptId]);
    res.json({ success: true, message: 'Reschedule requested', data: updated });
  } catch (err) {
    console.error('Reschedule request error:', err);
    res.status(500).json({ error: 'Failed to request reschedule' });
  }
});

// client accepts reschedule
app.put('/api/appointments/:id/accept-reschedule', authenticateToken, async (req, res) => {
  try {
    const apptId = parseInt(req.params.id, 10);
    const appt = await db.get('SELECT * FROM appointments WHERE id = ?', [apptId]);
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    if (req.user.user_type !== 'client' || appt.client_id !== req.user.id)
      return res.status(403).json({ error: 'Not allowed' });

    await db.run(
      `UPDATE appointments SET status = 'scheduled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [apptId]
    );

    const updated = await db.get('SELECT * FROM appointments WHERE id = ?', [apptId]);
    res.json({ success: true, message: 'Reschedule accepted', data: updated });
  } catch (err) {
    console.error('Accept reschedule error:', err);
    res.status(500).json({ error: 'Failed to accept reschedule' });
  }
});

// client declines reschedule
app.put('/api/appointments/:id/decline-reschedule', authenticateToken, async (req, res) => {
  try {
    const apptId = parseInt(req.params.id, 10);
    const appt = await db.get('SELECT * FROM appointments WHERE id = ?', [apptId]);
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    if (req.user.user_type !== 'client' || appt.client_id !== req.user.id)
      return res.status(403).json({ error: 'Not allowed' });

    await db.run(
      `UPDATE appointments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [apptId]
    );

    const updated = await db.get('SELECT * FROM appointments WHERE id = ?', [apptId]);
    res.json({ success: true, message: 'Reschedule declined, appointment cancelled', data: updated });
  } catch (err) {
    console.error('Decline reschedule error:', err);
    res.status(500).json({ error: 'Failed to decline reschedule' });
  }
});

module.exports = app;
