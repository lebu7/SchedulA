import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Try direct connection first
        const response = await axios.get('http://localhost:5000/');
        setMessage(response.data.message);
        setError('');
      } catch (err) {
        console.error('Backend connection failed:', err);
        setError('Backend server is not running. Please start the backend server on port 5000.');
        setMessage('Backend connection failed');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>🚀 SchedulA</h1>
          <p>Nairobi Booking System</p>
          <div className="loading">Loading...</div>
        </header>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>🚀 SchedulA</h1>
        <p>Nairobi Booking System</p>
        
        <div className="status-card">
          <h3>System Status</h3>
          <p><strong>Backend:</strong> {error ? '❌ Not Connected' : '✅ Connected'}</p>
          <p><strong>Message:</strong> {message}</p>
          {error && (
            <div className="error-message">
              <p>{error}</p>
              <small>Run this in another terminal: <code>cd backend && npm run dev</code></small>
            </div>
          )}
        </div>

        <div className="next-steps">
          <h3>Next Steps:</h3>
          <ul>
            <li>✅ Frontend setup complete</li>
            <li>{error ? '❌' : '✅'} Backend connection</li>
            <li>🔲 Database setup</li>
            <li>🔲 User authentication</li>
            <li>🔲 Booking system</li>
          </ul>
        </div>
      </header>
    </div>
  );
}

export default App;
