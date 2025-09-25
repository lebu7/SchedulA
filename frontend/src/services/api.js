import axios from 'axios';

// ==================== API CONFIGURATION ====================
// Use environment variable in Codespaces or fallback to Vite proxy in local dev
// In Codespaces, set frontend/.env:  VITE_API_URL=https://<your-codespace>-5000.app.github.dev/api
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

console.log('🔗 Frontend URL:', window.location.origin);
console.log('🔗 API Base URL:', API_BASE_URL);

// Create axios instance with better defaults
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// ==================== INTERCEPTORS ====================
// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    console.log(`🚀 ${config.method?.toUpperCase()} ${config.url}`, config.data || '');
    return config;
  },
  (error) => {
    console.error('❌ Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    console.log(`✅ ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('❌ Response error:', error.response?.status, error.message);

    // Handle unauthorized
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('storage'));
    }

    return Promise.reject(error);
  }
);

// ==================== API METHODS ====================
export const authAPI = {
  login: async (credentials) => {
    const response = await api.post('/login', credentials);
    return response.data;
  },

  register: async (userData) => {
    const response = await api.post('/register', userData);
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get('/profile');
    return response.data;
  }
};

export const servicesAPI = {
  getAll: async () => {
    const response = await api.get('/services');
    return response.data;
  },

  getMyServices: async () => {
    const response = await api.get('/my-services');
    return response.data;
  },

  create: async (serviceData) => {
    const response = await api.post('/services', serviceData);
    return response.data;
  }
};

export const appointmentsAPI = {
  getAll: async () => {
    const response = await api.get('/appointments');
    return response.data;
  },

  create: async (appointmentData) => {
    const response = await api.post('/appointments', appointmentData);
    return response.data;
  }
};

// ==================== HEALTH CHECK ====================
export const healthCheck = async () => {
  try {
    // strip `/api` so we call backend root
    const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '');
    const response = await axios.get(base + '/', { timeout: 5000 });
    return response.data;
  } catch (error) {
    throw new Error(
      `Backend connection failed: ${error.response?.status || error.message}`
    );
  }
};


export default api;
