const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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

// In-memory storage for development
let users = [];
let services = [];
let nextId = 1;

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 SchedulA Backend API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    frontendUrl: FRONTEND_URL,
    endpoints: {
      health: '/',
      register: '/api/register',
      login: '/api/login',
      services: '/api/services'
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
    if (users.find(user => user.email === email)) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = {
      id: nextId++,
      email,
      password: hashedPassword,
      name,
      user_type,
      phone,
      business_name,
      created_at: new Date().toISOString()
    };

    users.push(user);
    console.log('✅ User registered:', user.email);

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, user_type: user.user_type, name: user.name },
      'your-secret-key-2024',
      { expiresIn: '24h' }
    );

    // Return user without password
    const { password: _, ...userResponse } = user;

    res.json({
      message: 'User registered successfully',
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// User login
app.post('/api/login', async (req, res) => {
  try {
    console.log('🔑 Login request:', req.body);
    
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = users.find(u => u.email === email);
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
      'your-secret-key-2024',
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

// Get all services
app.get('/api/services', (req, res) => {
  console.log('📦 Fetching services');
  res.json(services);
});

// Create service
app.post('/api/services', (req, res) => {
  try {
    console.log('➕ Create service request:', req.body);
    
    const { name, description, duration_minutes = 60, price, category } = req.body;

    if (!name || !category) {
      return res.status(400).json({ error: 'Service name and category are required' });
    }

    const service = {
      id: nextId++,
      provider_id: 1, // Default provider for demo
      name,
      description,
      duration_minutes,
      price,
      category,
      created_at: new Date().toISOString()
    };

    services.push(service);
    console.log('✅ Service created:', service.name);

    res.json({
      message: 'Service created successfully',
      service
    });

  } catch (error) {
    console.error('❌ Service creation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user profile
app.get('/api/profile', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const user = jwt.verify(token, 'your-secret-key-2024');
    const userData = users.find(u => u.id === user.id);
    
    if (!userData) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { password: _, ...userResponse } = userData;
    res.json({ user: userResponse });

  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired token' });
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

// Start server
app.listen(PORT, () => {
  console.log('🚀 ======================================');
  console.log('🚀 SchedulA Backend Server Started!');
  console.log('🚀 ======================================');
  console.log(`🚀 Port: ${PORT}`);
  console.log(`🚀 Frontend: ${FRONTEND_URL}`);
  console.log(`🚀 Local: http://localhost:${PORT}`);
  console.log(`🚀 Health: http://localhost:${PORT}/`);
  console.log('🚀 ======================================');
  console.log('📋 Available endpoints:');
  console.log('   GET  /              - Health check');
  console.log('   POST /api/register  - User registration');
  console.log('   POST /api/login     - User login');
  console.log('   GET  /api/services  - Get all services');
  console.log('   POST /api/services  - Create service');
  console.log('   GET  /api/profile   - Get user profile');
  console.log('🚀 ======================================');
});