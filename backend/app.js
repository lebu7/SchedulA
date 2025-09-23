const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const database = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

// Get the frontend URL from environment or use default Codespaces pattern
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://fuzzy-engine-pgppr769gr7f645-3000.app.github.dev';

console.log('🔗 Frontend URL:', FRONTEND_URL);

// CORS configuration - allow your specific frontend
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));

app.use(express.json());

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-2024', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 SchedulA Backend API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: 'SQLite (Persistent)',
    endpoints: {
      health: '/',
      register: '/api/register',
      login: '/api/login',
      services: '/api/services',
      profile: '/api/profile'
    }
  });
});

// User registration
app.post('/api/register', async (req, res) => {
  try {
    console.log('📝 Registration request:', req.body);
    
    const { email, password, name, user_type = 'client', phone, business_name } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Check if user exists
    const existingUser = await database.get(
      'SELECT * FROM users WHERE email = ?', 
      [email]
    );
    
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

    // Get the created user
    const newUser = await database.get(
      'SELECT id, email, name, user_type, phone, business_name, created_at FROM users WHERE id = ?',
      [result.id]
    );

    console.log('✅ User registered:', newUser.email);

    // Generate token
    const token = jwt.sign(
      { 
        id: newUser.id, 
        email: newUser.email, 
        user_type: newUser.user_type, 
        name: newUser.name 
      },
      process.env.JWT_SECRET || 'fallback-secret-2024',
      { expiresIn: '24h' }
    );

    res.json({
      message: 'User registered successfully',
      token,
      user: newUser
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// User login
app.post('/api/login', async (req, res) => {
  try {
    console.log('🔑 Login request:', req.body.email);
    
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await database.get(
      'SELECT * FROM users WHERE email = ?', 
      [email]
    );
    
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
      { 
        id: user.id, 
        email: user.email, 
        user_type: user.user_type, 
        name: user.name 
      },
      process.env.JWT_SECRET || 'fallback-secret-2024',
      { expiresIn: '24h' }
    );

    // Return user without password
    const { password: _, ...userResponse } = user;

    console.log('✅ User logged in:', user.email);
    
    res.json({
      message: 'Login successful',
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('❌ Login error:', error);
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
    console.error('❌ Profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all services
app.get('/api/services', async (req, res) => {
  try {
    console.log('📦 Fetching all services');
    
    const services = await database.query(`
      SELECT s.*, u.name as provider_name, u.business_name 
      FROM services s 
      JOIN users u ON s.provider_id = u.id 
      ORDER BY s.created_at DESC
    `);

    res.json(services);
  } catch (error) {
    console.error('❌ Services fetch error:', error);
    res.status(500).json({ error: 'Server error fetching services' });
  }
});

// Create service (protected - providers only)
app.post('/api/services', authenticateToken, async (req, res) => {
  try {
    console.log('➕ Create service request from user:', req.user.id);
    
    const { name, description, duration_minutes = 60, price, category } = req.body;

    // Check if user is a provider
    if (req.user.user_type !== 'provider') {
      return res.status(403).json({ error: 'Only service providers can create services' });
    }

    if (!name || !category) {
      return res.status(400).json({ error: 'Service name and category are required' });
    }

    // Create service
    const result = await database.run(
      `INSERT INTO services (provider_id, name, description, duration_minutes, price, category) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, name, description, duration_minutes, price, category]
    );

    // Get the created service
    const newService = await database.get(
      `SELECT s.*, u.name as provider_name, u.business_name 
       FROM services s 
       JOIN users u ON s.provider_id = u.id 
       WHERE s.id = ?`,
      [result.id]
    );

    console.log('✅ Service created:', newService.name);

    res.json({
      message: 'Service created successfully',
      service: newService
    });

  } catch (error) {
    console.error('❌ Service creation error:', error);
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
    console.error('❌ My services error:', error);
    res.status(500).json({ error: 'Server error fetching services' });
  }
});

// Error handling
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((error, req, res, next) => {
  console.error('💥 Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Shutting down gracefully...');
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
  console.log(`🚀 Frontend: ${FRONTEND_URL}`);
  console.log(`🚀 Health: http://localhost:${PORT}/`);
  console.log('🚀 ======================================');
});