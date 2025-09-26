// src/services/api.js
import axios from 'axios';

// Base API url (Vite env or proxy)
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

console.log('🔗 Frontend URL:', window.location.origin);
console.log('🔗 API Base URL:', API_BASE_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' }
});

// Request interceptor (attach token)
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
}, err => Promise.reject(err));

// Response interceptor
api.interceptors.response.use(res => res, err => {
  console.error('API response error', err?.response?.status, err?.message);
  if (err.response?.status === 401) {
    localStorage.removeItem('token'); localStorage.removeItem('user'); window.dispatchEvent(new Event('storage'));
  }
  return Promise.reject(err);
});

// Auth
export const authAPI = {
  login: (credentials) => api.post('/login', credentials).then(r => r.data),
  register: (data) => api.post('/register', data).then(r => r.data),
  getProfile: () => api.get('/profile').then(r => r.data)
};

// Services
export const servicesAPI = {
  list: (params = {}) => api.get('/services', { params }).then(r => r.data),
  create: (data) => api.post('/services', data).then(r => r.data),
  update: (id, data) => api.put(`/services/${id}`, data).then(r => r.data),
  remove: (id) => api.delete(`/services/${id}`).then(r => r.data),
  providerServices: (providerId) => api.get(`/providers/${providerId}`).then(r => r.data)
};

// Appointments
export const appointmentsAPI = {
  list: () => api.get('/appointments').then(r => r.data),
  create: (data) => api.post('/appointments', data).then(r => r.data),
  update: (id, data) => api.put(`/appointments/${id}`, data).then(r => r.data),
  remove: (id) => api.delete(`/appointments/${id}`).then(r => r.data),
  latest: () => api.get('/appointments/latest').then(r => r.data)
};

// Health check (call server root)
export const healthCheck = async () => {
  try {
    const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '');
    const res = await axios.get(base + '/', { timeout: 5000 });
    return res.data;
  } catch (err) {
    throw new Error(err.response?.status || err.message);
  }
};

export default api;
