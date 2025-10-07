import axios from 'axios'

const API_URL = '/api'

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
})

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const authService = {
  async register(userData) {
    const response = await api.post('/auth/register', userData)
    return response.data
  },

  async login(credentials) {
    const response = await api.post('/auth/login', credentials)
    return response.data
  },

  async getProfile() {
    const response = await api.get('/auth/profile')
    return response.data.user
  },

  logout() {
    localStorage.removeItem('token')
  }
}

export default api
