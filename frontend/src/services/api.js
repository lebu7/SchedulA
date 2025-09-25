import axios from 'axios';

// ==================== API CONFIGURATION ====================
let API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
// normalize to always end with /api
if (!API_BASE_URL.endsWith('/api')) {
  API_BASE_URL = API_BASE_URL.replace(/\/+$/, '') + '/api';
}

console.log('🔗 Frontend URL:', window.location.origin);
console.log('🔗 API Base URL:', API_BASE_URL);

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' }
});

// ==================== INTERCEPTORS ====================
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  console.log(`🚀 ${config.method?.toUpperCase()} ${config.url}`, config.data || '');
  return config;
}, (error) => Promise.reject(error));

api.interceptors.response.use(
  (response) => {
    console.log(`✅ ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('❌ Response error:', error.response?.status, error.message);
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
  login: async (credentials) => (await api.post('/login', credentials)).data,
  register: async (userData) => (await api.post('/register', userData)).data,
  getProfile: async () => (await api.get('/profile')).data
};

export const servicesAPI = {
  getAll: async () => (await api.get('/services')).data,
  getMyServices: async () => (await api.get('/my-services')).data,
  create: async (serviceData) => (await api.post('/services', serviceData)).data
};

export const appointmentsAPI = {
  getAll: async () => (await api.get('/appointments')).data,
  create: async (appointmentData) => (await api.post('/appointments', appointmentData)).data
};

// ==================== HEALTH CHECK ====================
export const healthCheck = async () => {
  try {
    const base = API_BASE_URL.replace(/\/api\/?$/, '');
    const response = await axios.get(base + '/', { timeout: 5000 });
    return response.data;
  } catch (error) {
    throw new Error(`Backend connection failed: ${error.response?.status || error.message}`);
  }
};

export default api;
