// Authentication state management
export const authService = {
  // Store authentication data
  setAuth: (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    window.dispatchEvent(new Event('storage'));
  },
  
  // Clear authentication data
  clearAuth: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.dispatchEvent(new Event('storage'));
  },
  
  // Get current user
  getCurrentUser: () => {
    try {
      const user = localStorage.getItem('user');
      return user ? JSON.parse(user) : null;
    } catch (error) {
      console.error('Error parsing user data:', error);
      return null;
    }
  },
  
  // Get token
  getToken: () => {
    return localStorage.getItem('token');
  },
  
  // Check if user is authenticated
  isAuthenticated: () => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    return !!(token && user);
  },
  
  // Check if user is provider
  isProvider: () => {
    const user = authService.getCurrentUser();
    return user?.user_type === 'provider';
  },
  
  // Check if user is client
  isClient: () => {
    const user = authService.getCurrentUser();
    return user?.user_type === 'client';
  }
};

// Auth event listener for cross-component updates
export const setupAuthListener = (callback) => {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
};