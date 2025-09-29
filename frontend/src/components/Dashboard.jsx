import React from 'react'
import './Dashboard.css'

function Dashboard({ user }) {
  return (
    <div className="container">
      <div className="dashboard">
        <h2>Welcome to your Dashboard, {user.name}!</h2>
        <div className="card">
          <h3>Your Profile</h3>
          <p><strong>Email:</strong> {user.email}</p>
          <p><strong>Role:</strong> {user.user_type}</p>
          {user.phone && <p><strong>Phone:</strong> {user.phone}</p>}
          {user.business_name && <p><strong>Business:</strong> {user.business_name}</p>}
        </div>

        <div className="card">
          <h3>Quick Actions</h3>
          {user.user_type === 'client' ? (
            <div className="action-buttons">
              <button className="btn btn-primary">Find Services</button>
              <button className="btn btn-secondary">My Appointments</button>
            </div>
          ) : (
            <div className="action-buttons">
              <button className="btn btn-primary">Manage Services</button>
              <button className="btn btn-secondary">View Appointments</button>
              <button className="btn btn-secondary">Business Settings</button>
            </div>
          )}
        </div>

        <div className="card">
          <h3>Getting Started</h3>
          <p>
            {user.user_type === 'client' 
              ? 'Browse services, book appointments, and manage your schedule all in one place.'
              : 'List your services, manage appointments, and grow your business with Schedula.'
            }
          </p>
        </div>
      </div>
    </div>
  )
}

export default Dashboard