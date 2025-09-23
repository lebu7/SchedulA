const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Enhanced CORS configuration
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ 
    message: '✅ SchedulA Backend is running!',
    timestamp: new Date().toISOString(),
    status: 'OK'
  });
});

// Test registration
app.post('/api/register', (req, res) => {
  console.log('Registration attempt:', req.body);
  
  const { email, password, name } = req.body;
  
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  res.json({
    message: 'User registered successfully',
    token: 'test-jwt-token',
    user: {
      id: 1,
      email: email,
      name: name,
      user_type: 'client'
    }
  });
});

// Test login
app.post('/api/login', (req, res) => {
  console.log('Login attempt:', req.body);
  
  const { email, password } = req.body;
  
  res.json({
    message: 'Login successful',
    token: 'test-jwt-token',
    user: {
      id: 1,
      email: email,
      name: 'Test User',
      user_type: 'client'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 SchedulA Simple Backend running on port', PORT);
  console.log('📡 http://localhost:' + PORT);
});
