import axios from 'axios';

// Use the backend URL directly (port 5000)
const BACKEND_BASE_URL = 'https://fuzzy-engine-pgppr769gr7f645-5000.app.github.dev';
const API_URL = BACKEND_BASE_URL + '/api';

console.log('🔗 Backend URL:', BACKEND_BASE_URL);
console.log('🔗 API URL:', API_URL);

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

// Add request logging
api.interceptors.request.use((config) => {
  console.log('🚀 API Request:', config.method?.toUpperCase(), config.url, config.data);
  return config;
});

// Add response logging
api.interceptors.response.use(
  (response) => {
    console.log('✅ API Response:', response.status, response.data);
    return response;
  },
  (error) => {
    console.error('❌ API Error:', error.message);
    if (error.response) {
      console.error('Error details:', error.response.status, error.response.data);
    }
    return Promise.reject(error);
  }
);

export const authService = {
  // Test backend connection
  testConnection: async () => {
    try {
      console.log('Testing connection to:', BACKEND_BASE_URL);
      const response = await axios.get(BACKEND_BASE_URL, { timeout: 5000 });
      return response.data;
    } catch (error) {
      console.error('Connection test failed:', error.message);
      throw new Error(`Cannot connect to backend: ${error.message}`);
    }
  },

  // Register new user
  register: async (userData) => {
    try {
      console.log('Attempting registration with:', userData);
      const response = await api.post('/register', userData);
      
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        console.log('✅ Registration successful');
      }
      
      return response.data;
    } catch (error) {
      console.error('❌ Registration failed:', error);
      throw error;
    }
  },

  // Login user
  login: async (credentials) => {
    try {
      console.log('Attempting login with:', credentials.email);
      const response = await api.post('/login', credentials);
      
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        console.log('✅ Login successful');
      }
      
      return response.data;
    } catch (error) {
      console.error('❌ Login failed:', error);
      throw error;
    }
  },

  // Logout user
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    console.log('✅ User logged out');
  },

  // Get current user
  getCurrentUser: () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  // Get user profile (protected route)
  getProfile: async () => {
    const response = await api.get('/profile');
    return response.data;
  }
};

export default api;