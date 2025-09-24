const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const database = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// ==================== ROUTES ====================

// Health check
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 SchedulA Backend API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: 'SQLite (Persistent)',
    endpoints: {
      auth: ['POST /api/register', 'POST /api/login', 'GET /api/profile'],
      services: ['GET /api/services', 'POST /api/services', 'GET /api/my-services'],
      appointments: ['GET /api/appointments', 'POST /api/appointments']
    }
  });
});

// User registration
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, name, user_type = 'client', phone, business_name } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Check if user exists
    const existingUser = await database.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const result = await database.run(
      `INSERT INTO users (email, password, name, user_type, phone, business_name) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [email, hashedPassword, name, user_type, phone, business_name]
    );

    // Get created user
    const newUser = await database.get(
      'SELECT id, email, name, user_type, phone, business_name, created_at FROM users WHERE id = ?',
      [result.id]
    );

    // Generate token
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, user_type: newUser.user_type, name: newUser.name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'User registered successfully',
      token,
      user: newUser
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// User login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await database.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, user_type: user.user_type, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Return user without password
    const { password: _, ...userResponse } = user;

    res.json({
      message: 'Login successful',
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Get user profile
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const user = await database.get(
      'SELECT id, email, name, user_type, phone, business_name, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all services (public)
app.get('/api/services', async (req, res) => {
  try {
    const services = await database.query(`
      SELECT s.*, u.name as provider_name, u.business_name 
      FROM services s 
      JOIN users u ON s.provider_id = u.id 
      WHERE s.is_available = 1
      ORDER BY s.created_at DESC
    `);
    res.json(services);
  } catch (error) {
    console.error('Services fetch error:', error);
    res.status(500).json({ error: 'Server error fetching services' });
  }
});

// Create service (providers only)
app.post('/api/services', authenticateToken, async (req, res) => {
  try {
    if (req.user.user_type !== 'provider') {
      return res.status(403).json({ error: 'Only service providers can create services' });
    }

    const { name, description, duration_minutes = 60, price, category } = req.body;

    if (!name || !category) {
      return res.status(400).json({ error: 'Service name and category are required' });
    }

    // Create service
    const result = await database.run(
      `INSERT INTO services (provider_id, name, description, duration_minutes, price, category) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, name, description, duration_minutes, price, category]
    );

    // Get created service
    const newService = await database.get(
      `SELECT s.*, u.name as provider_name, u.business_name 
       FROM services s 
       JOIN users u ON s.provider_id = u.id 
       WHERE s.id = ?`,
      [result.id]
    );

    res.json({
      message: 'Service created successfully',
      service: newService
    });

  } catch (error) {
    console.error('Service creation error:', error);
    res.status(500).json({ error: 'Server error creating service' });
  }
});

// Get services for current provider
app.get('/api/my-services', authenticateToken, async (req, res) => {
  try {
    if (req.user.user_type !== 'provider') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const services = await database.query(
      'SELECT * FROM services WHERE provider_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(services);
  } catch (error) {
    console.error('My services error:', error);
    res.status(500).json({ error: 'Server error fetching services' });
  }
});

// Get appointments for user
app.get('/api/appointments', authenticateToken, async (req, res) => {
  try {
    let appointments;
    if (req.user.user_type === 'provider') {
      appointments = await database.query(`
        SELECT a.*, s.name as service_name, u.name as client_name 
        FROM appointments a
        JOIN services s ON a.service_id = s.id
        JOIN users u ON a.client_id = u.id
        WHERE a.provider_id = ?
        ORDER BY a.appointment_date DESC
      `, [req.user.id]);
    } else {
      appointments = await database.query(`
        SELECT a.*, s.name as service_name, u.name as provider_name, u.business_name 
        FROM appointments a
        JOIN services s ON a.service_id = s.id
        JOIN users u ON a.provider_id = u.id
        WHERE a.client_id = ?
        ORDER BY a.appointment_date DESC
      `, [req.user.id]);
    }

    res.json(appointments);
  } catch (error) {
    console.error('Appointments error:', error);
    res.status(500).json({ error: 'Server error fetching appointments' });
  }
});

// Create appointment
app.post('/api/appointments', authenticateToken, async (req, res) => {
  try {
    if (req.user.user_type !== 'client') {
      return res.status(403).json({ error: 'Only clients can book appointments' });
    }

    const { service_id, appointment_date, client_notes } = req.body;

    if (!service_id || !appointment_date) {
      return res.status(400).json({ error: 'Service ID and appointment date are required' });
    }

    // Get service details
    const service = await database.get(`
      SELECT s.*, u.id as provider_id 
      FROM services s 
      JOIN users u ON s.provider_id = u.id 
      WHERE s.id = ?
    `, [service_id]);

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Calculate end date
    const endDate = new Date(new Date(appointment_date).getTime() + service.duration_minutes * 60000);

    // Check for conflicts
    const existingAppointment = await database.get(
      'SELECT * FROM appointments WHERE provider_id = ? AND appointment_date = ?',
      [service.provider_id, appointment_date]
    );

    if (existingAppointment) {
      return res.status(400).json({ error: 'Time slot is already booked' });
    }

    // Create appointment
    const result = await database.run(
      `INSERT INTO appointments (client_id, service_id, provider_id, appointment_date, end_date, client_notes) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, service_id, service.provider_id, appointment_date, endDate.toISOString(), client_notes]
    );

    // Get created appointment
    const newAppointment = await database.get(`
      SELECT a.*, s.name as service_name, u.name as provider_name, u.business_name 
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      JOIN users u ON a.provider_id = u.id
      WHERE a.id = ?
    `, [result.id]);

    res.json({
      message: 'Appointment booked successfully',
      appointment: newAppointment
    });

  } catch (error) {
    console.error('Appointment creation error:', error);
    res.status(500).json({ error: 'Server error creating appointment' });
  }
});

// Error handling
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await database.close();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 ======================================');
  console.log('🚀 SchedulA Backend Server Started!');
  console.log('🚀 ======================================');
  console.log(`🚀 Port: ${PORT}`);
  console.log(`🚀 Database: SQLite (Persistent)`);
  console.log(`🚀 Environment: ${process.env.NODE_ENV}`);
  console.log('🚀 ======================================');
});