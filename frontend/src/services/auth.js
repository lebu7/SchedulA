import axios from 'axios';

// CORRECT Backend URL - port 5000, not 3000
const BACKEND_BASE_URL = 'https://fuzzy-engine-pgppr769gr7f645-5000.app.github.dev';
const API_URL = BACKEND_BASE_URL + '/api';

console.log('🔗 Frontend URL:', window.location.origin);
console.log('🔗 Backend URL:', BACKEND_BASE_URL);
console.log('🔗 API URL:', API_URL);

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

// Request interceptor
api.interceptors.request.use((config) => {
  console.log('🚀 API Request:', config.method?.toUpperCase(), config.url);
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor
api.interceptors.response.use(
  (response) => {
    console.log('✅ API Response:', response.status);
    return response;
  },
  (error) => {
    console.error('❌ API Error:', error.message);
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    return Promise.reject(error);
  }
);

export const authService = {
  // Test backend connection
  testConnection: async () => {
    try {
      console.log('Testing connection to:', BACKEND_BASE_URL);
      const response = await axios.get(BACKEND_BASE_URL, { 
        timeout: 10000 
      });
      console.log('✅ Backend connection successful');
      return response.data;
    } catch (error) {
      console.error('❌ Backend connection failed:', error.message);
      throw new Error(`Cannot connect to backend: ${error.message}`);
    }
  },

  // Register new user
  register: async (userData) => {
    const response = await api.post('/register', userData);
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }
    return response.data;
  },

  // Login user
  login: async (credentials) => {
    const response = await api.post('/login', credentials);
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }
    return response.data;
  },

  // Logout user
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  // Get current user
  getCurrentUser: () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  }
};

export default api;