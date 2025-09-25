const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const db = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

// ==================== MIDDLEWARE ====================
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
      }
      req.user = user;
      next();
    });
  } catch (error) {
    res.status(500).json({ error: 'Authentication error' });
  }
};

// ==================== UTILITY FUNCTIONS ====================
const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const sanitizeUser = (user) => {
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
};

// ==================== ROUTES ====================

// Health check
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 SchedulA Backend API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// -------------------- AUTH --------------------
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, name, user_type = 'client', phone, business_name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!['client', 'provider'].includes(user_type)) {
      return res.status(400).json({ error: 'Invalid user type' });
    }

    const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const result = await db.run(
      `INSERT INTO users (email, password, name, user_type, phone, business_name) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [email, hashedPassword, name, user_type, phone, business_name]
    );

    const newUser = await db.get(
      'SELECT id, email, name, user_type, phone, business_name, created_at FROM users WHERE id = ?',
      [result.id]
    );

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, user_type: newUser.user_type },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: newUser
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, user_type: user.user_type },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: sanitizeUser(user)
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const user = await db.get(
      'SELECT id, email, name, user_type, phone, business_name, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true, user });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// -------------------- SERVICES --------------------
app.get('/api/services', async (req, res) => {
  try {
    const services = await db.query(`
      SELECT s.*, u.name as provider_name, u.business_name 
      FROM services s 
      JOIN users u ON s.provider_id = u.id 
      ORDER BY s.created_at DESC
    `);
    res.json({ success: true, data: services });
  } catch (error) {
    console.error('Services fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

app.post('/api/services', authenticateToken, async (req, res) => {
  try {
    if (req.user.user_type !== 'provider') {
      return res.status(403).json({ error: 'Only service providers can create services' });
    }
    const { name, description, duration_minutes = 60, price, category } = req.body;
    if (!name || !category) {
      return res.status(400).json({ error: 'Service name and category are required' });
    }
    const result = await db.run(
      `INSERT INTO services (provider_id, name, description, duration_minutes, price, category) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, name, description, duration_minutes, price, category]
    );
    const newService = await db.get(`
      SELECT s.*, u.name as provider_name, u.business_name 
      FROM services s 
      JOIN users u ON s.provider_id = u.id 
      WHERE s.id = ?
    `, [result.id]);
    res.status(201).json({ success: true, message: 'Service created successfully', data: newService });
  } catch (error) {
    console.error('Service creation error:', error);
    res.status(500).json({ error: 'Failed to create service' });
  }
});

app.get('/api/my-services', authenticateToken, async (req, res) => {
  try {
    if (req.user.user_type !== 'provider') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const services = await db.query(
      'SELECT * FROM services WHERE provider_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ success: true, data: services });
  } catch (error) {
    console.error('My services error:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// -------------------- APPOINTMENTS --------------------
app.get('/api/appointments', authenticateToken, async (req, res) => {
  try {
    let appointments;
    if (req.user.user_type === 'provider') {
      appointments = await db.query(`
        SELECT a.*, s.name as service_name, u.name as client_name 
        FROM appointments a
        JOIN services s ON a.service_id = s.id
        JOIN users u ON a.client_id = u.id
        WHERE a.provider_id = ?
        ORDER BY a.appointment_date DESC
      `, [req.user.id]);
    } else {
      appointments = await db.query(`
        SELECT a.*, s.name as service_name, u.name as provider_name, u.business_name 
        FROM appointments a
        JOIN services s ON a.service_id = s.id
        JOIN users u ON a.provider_id = u.id
        WHERE a.client_id = ?
        ORDER BY a.appointment_date DESC
      `, [req.user.id]);
    }
    res.json({ success: true, data: appointments });
  } catch (error) {
    console.error('Appointments error:', error);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

app.post('/api/appointments', authenticateToken, async (req, res) => {
  try {
    if (req.user.user_type !== 'client') {
      return res.status(403).json({ error: 'Only clients can book appointments' });
    }
    const { service_id, appointment_date, client_notes } = req.body;
    if (!service_id || !appointment_date) {
      return res.status(400).json({ error: 'Service ID and appointment date are required' });
    }
    const service = await db.get(`
      SELECT s.*, u.id as provider_id 
      FROM services s 
      JOIN users u ON s.provider_id = u.id 
      WHERE s.id = ?
    `, [service_id]);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // calculate end_date using service duration
    const endDate = new Date(new Date(appointment_date).getTime() + service.duration_minutes * 60000);

    await db.run(
      `INSERT INTO appointments 
       (client_id, service_id, provider_id, appointment_date, end_date, status, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        service_id,
        service.provider_id,
        appointment_date,
        endDate.toISOString(),
        'scheduled',
        client_notes || null
      ]
    );
    res.status(201).json({ success: true, message: 'Appointment booked successfully' });
  } catch (error) {
    console.error('❌ Appointment creation error:', error);
    res.status(500).json({ error: 'Failed to book appointment' });
  }
});

// ==================== ERROR HANDLING ====================
app.use((req, res) => res.status(404).json({ error: 'Endpoint not found' }));
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down gracefully...');
  await db.close();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 ======================================');
  console.log('🚀 SchedulA Backend Server Started!');
  console.log('🚀 ======================================');
  console.log(`🚀 Port: ${PORT}`);
  console.log(`🚀 Health: http://localhost:${PORT}/`);
  console.log('🚀 ======================================');
});
