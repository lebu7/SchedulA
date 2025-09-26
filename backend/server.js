// backend/server.js
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const db = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

// ---------------- middleware ----------------
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ---------------- auth middleware ----------------
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access token required' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) return res.status(403).json({ error: 'Invalid or expired token' });
      req.user = user;
      next();
    });
  } catch (err) {
    res.status(500).json({ error: 'Authentication error' });
  }
};

// ---------------- utils ----------------
const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const sanitizeUser = (user) => {
  const { password, ...u } = user;
  return u;
};

// ---------------- routes ----------------
// Health
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 SchedulA Backend API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ================= Auth =================
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, name, user_type = 'client', phone, business_name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Email, password, and name are required' });
    if (!validateEmail(email)) return res.status(400).json({ error: 'Invalid email format' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (!['client', 'provider'].includes(user_type)) return res.status(400).json({ error: 'Invalid user type' });

    const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(400).json({ error: 'User already exists with this email' });

    const hashed = await bcrypt.hash(password, 12);
    const result = await db.run(
      `INSERT INTO users (email, password, name, user_type, phone, business_name) VALUES (?, ?, ?, ?, ?, ?)`,
      [email, hashed, name, user_type, phone, business_name]
    );

    const newUser = await db.get('SELECT id, email, name, user_type, phone, business_name, created_at FROM users WHERE id = ?', [result.id]);
    const token = jwt.sign({ id: newUser.id, email: newUser.email, user_type: newUser.user_type }, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({ success: true, message: 'User registered successfully', token, user: newUser });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(400).json({ error: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: user.id, email: user.email, user_type: user.user_type }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, message: 'Login successful', token, user: sanitizeUser(user) });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const user = await db.get('SELECT id, email, name, user_type, phone, business_name, created_at FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ================= Services =================
app.get('/api/services', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const category = (req.query.category || '').trim();

    let baseSql = `SELECT s.*, u.name as provider_name, u.business_name FROM services s JOIN users u ON s.provider_id = u.id`;
    const params = [];
    const filters = [];

    if (q) {
      filters.push('(s.name LIKE ? OR s.description LIKE ? OR s.category LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    if (category) {
      filters.push('s.category = ?');
      params.push(category);
    }

    if (filters.length) baseSql += ' WHERE ' + filters.join(' AND ');

    baseSql += ' ORDER BY s.created_at DESC';

    const services = await db.query(baseSql, params);
    res.json({ success: true, data: services });
  } catch (error) {
    console.error('Services fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

app.post('/api/services', authenticateToken, async (req, res) => {
  try {
    if (req.user.user_type !== 'provider') return res.status(403).json({ error: 'Only service providers can create services' });

    const { name, description = '', duration_minutes = 60, price = 0, category = 'other', is_available = 1 } = req.body;
    if (!name || !category) return res.status(400).json({ error: 'Service name and category are required' });

    const result = await db.run(
      `INSERT INTO services (provider_id, name, description, duration_minutes, price, category, is_available, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [req.user.id, name, description, duration_minutes, price, category, is_available]
    );

    const service = await db.get(`SELECT s.*, u.name as provider_name, u.business_name FROM services s JOIN users u ON s.provider_id = u.id WHERE s.id = ?`, [result.id]);
    res.status(201).json({ success: true, message: 'Service created', data: service });
  } catch (error) {
    console.error('Service creation error:', error);
    res.status(500).json({ error: 'Failed to create service' });
  }
});

app.put('/api/services/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.user_type !== 'provider') return res.status(403).json({ error: 'Only providers can update services' });
    const serviceId = parseInt(req.params.id, 10);

    const service = await db.get('SELECT * FROM services WHERE id = ?', [serviceId]);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    if (service.provider_id !== req.user.id) return res.status(403).json({ error: 'Not allowed' });

    const { name, description, duration_minutes, price, category, is_available } = req.body;
    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (duration_minutes !== undefined) { updates.push('duration_minutes = ?'); params.push(duration_minutes); }
    if (price !== undefined) { updates.push('price = ?'); params.push(price); }
    if (category !== undefined) { updates.push('category = ?'); params.push(category); }
    if (is_available !== undefined) { updates.push('is_available = ?'); params.push(is_available); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(serviceId);
    await db.run(`UPDATE services SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);

    const updated = await db.get('SELECT * FROM services WHERE id = ?', [serviceId]);
    res.json({ success: true, message: 'Service updated', data: updated });
  } catch (error) {
    console.error('Service update error:', error);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

app.delete('/api/services/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.user_type !== 'provider') return res.status(403).json({ error: 'Only providers can delete services' });
    const serviceId = parseInt(req.params.id, 10);
    const service = await db.get('SELECT * FROM services WHERE id = ?', [serviceId]);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    if (service.provider_id !== req.user.id) return res.status(403).json({ error: 'Not allowed' });

    await db.run('DELETE FROM services WHERE id = ?', [serviceId]);
    res.json({ success: true, message: 'Service deleted' });
  } catch (err) {
    console.error('Service delete error:', err);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

app.get('/api/providers/:id', async (req, res) => {
  try {
    const providerId = parseInt(req.params.id, 10);
    const user = await db.get('SELECT id, name, business_name, phone, created_at FROM users WHERE id = ? AND user_type = ?', [providerId, 'provider']);
    if (!user) return res.status(404).json({ error: 'Provider not found' });

    const services = await db.query('SELECT * FROM services WHERE provider_id = ? ORDER BY created_at DESC', [providerId]);
    res.json({ success: true, data: { provider: user, services } });
  } catch (err) {
    console.error('Provider fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch provider' });
  }
});

// ================= Appointments =================
app.get('/api/appointments', authenticateToken, async (req, res) => {
  try {
    let appointments;
    if (req.user.user_type === 'provider') {
      appointments = await db.query(`
        SELECT a.*, s.name as service_name, u.name as client_name, u.phone as client_phone 
        FROM appointments a
        JOIN services s ON a.service_id = s.id
        JOIN users u ON a.client_id = u.id
        WHERE a.provider_id = ? AND a.provider_deleted = 0
        ORDER BY a.appointment_date DESC
      `, [req.user.id]);
    } else {
      appointments = await db.query(`
        SELECT a.*, s.name as service_name, u.name as provider_name, u.business_name, u.phone as provider_phone
        FROM appointments a
        JOIN services s ON a.service_id = s.id
        JOIN users u ON a.provider_id = u.id
        WHERE a.client_id = ? AND a.client_deleted = 0
        ORDER BY a.appointment_date DESC
      `, [req.user.id]);
    }
    res.json({ success: true, data: appointments });
  } catch (err) {
    console.error('Appointments fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

app.post('/api/appointments', authenticateToken, async (req, res) => {
  try {
    if (req.user.user_type !== 'client') return res.status(403).json({ error: 'Only clients can book appointments' });

    const { service_id, appointment_date, notes } = req.body;
    if (!service_id || !appointment_date) return res.status(400).json({ error: 'Service ID and appointment date are required' });

    const service = await db.get('SELECT s.*, u.id as provider_id FROM services s JOIN users u ON s.provider_id = u.id WHERE s.id = ?', [service_id]);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const duration = service.duration_minutes || 60;
    const endDate = new Date(new Date(appointment_date).getTime() + duration * 60000);

    const result = await db.run(
      `INSERT INTO appointments (client_id, service_id, provider_id, appointment_date, end_date, status, notes, client_deleted, provider_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [req.user.id, service_id, service.provider_id, appointment_date, endDate.toISOString(), 'scheduled', notes || null]
    );

    res.status(201).json({ success: true, message: 'Appointment booked', appointment_id: result.id });
  } catch (err) {
    console.error('Appointment creation error:', err);
    res.status(500).json({ error: 'Failed to book appointment' });
  }
});

app.put('/api/appointments/:id', authenticateToken, async (req, res) => {
  try {
    const apptId = parseInt(req.params.id, 10);
    const appt = await db.get('SELECT * FROM appointments WHERE id = ?', [apptId]);
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    const body = req.body;
    if (req.user.user_type === 'client' && appt.client_id !== req.user.id) return res.status(403).json({ error: 'Not allowed' });
    if (req.user.user_type === 'provider' && appt.provider_id !== req.user.id) return res.status(403).json({ error: 'Not allowed' });

    const updates = [];
    const params = [];

    if (body.appointment_date !== undefined) {
      updates.push('appointment_date = ?');
      params.push(body.appointment_date);
      const service = await db.get('SELECT duration_minutes FROM services WHERE id = ?', [appt.service_id]);
      const duration = (service && service.duration_minutes) ? service.duration_minutes : 60;
      const newEnd = new Date(new Date(body.appointment_date).getTime() + duration * 60000).toISOString();
      updates.push('end_date = ?');
      params.push(newEnd);
    }

    if (body.status !== undefined) { updates.push('status = ?'); params.push(body.status); }
    if (body.notes !== undefined) { updates.push('notes = ?'); params.push(body.notes); }

    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    params.push(apptId);
    await db.run(`UPDATE appointments SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);

    const updated = await db.get('SELECT * FROM appointments WHERE id = ?', [apptId]);
    res.json({ success: true, message: 'Appointment updated', data: updated });
  } catch (err) {
    console.error('Appointment update error:', err);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

app.delete('/api/appointments/:id', authenticateToken, async (req, res) => {
  try {
    const apptId = parseInt(req.params.id, 10);
    const appt = await db.get('SELECT * FROM appointments WHERE id = ?', [apptId]);
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    if (req.user.user_type === 'client' && appt.client_id !== req.user.id) return res.status(403).json({ error: 'Not allowed' });
    if (req.user.user_type === 'provider' && appt.provider_id !== req.user.id) return res.status(403).json({ error: 'Not allowed' });

    if (req.user.user_type === 'client') {
      await db.run('UPDATE appointments SET client_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [apptId]);
    } else {
      await db.run('UPDATE appointments SET provider_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [apptId]);
    }

    const updated = await db.get('SELECT client_deleted, provider_deleted FROM appointments WHERE id = ?', [apptId]);
    if (updated && updated.client_deleted && updated.provider_deleted) {
      await db.run('DELETE FROM appointments WHERE id = ?', [apptId]);
      return res.json({ success: true, message: 'Appointment permanently deleted' });
    }

    res.json({ success: true, message: 'Appointment deleted for your view' });
  } catch (err) {
    console.error('Appointment delete error:', err);
    res.status(500).json({ error: 'Failed to delete appointment' });
  }
});

// ---------------- error handling & start ----------------
app.use((req, res) => res.status(404).json({ error: 'Endpoint not found' }));
app.use((err, req, res, next) => { console.error('Unhandled error:', err); res.status(500).json({ error: 'Internal server error' }); });

process.on('SIGINT', async () => { console.log('\n🔄 Shutting down...'); await db.close(); process.exit(0); });

app.listen(PORT, () => {
  console.log('🚀 SchedulA Backend Server Started!');
  console.log(`🚀 Port: ${PORT}`);
});
