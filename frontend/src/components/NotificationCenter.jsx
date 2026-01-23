import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom'; 
import api from '../services/auth';
import { Bell, CheckCheck } from 'lucide-react'; 
import './NotificationCenter.css';

function NotificationCenter() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate(); 

  // ✅ FIXED: Dynamic relative time display
  const timeAgo = (dateStr) => {
    if (!dateStr) return 'Just now';
    
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffInSeconds = Math.floor((now - date) / 1000);

      if (isNaN(diffInSeconds)) return 'Just now';

      if (diffInSeconds < 60) return 'Just now';
      
      const diffInMinutes = Math.floor(diffInSeconds / 60);
      if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
      
      const diffInHours = Math.floor(diffInMinutes / 60);
      if (diffInHours < 24) return `${diffInHours}h ago`;
      
      const diffInDays = Math.floor(diffInHours / 24);
      if (diffInDays === 1) return 'Yesterday';
      if (diffInDays < 7) return `${diffInDays}d ago`;
      
      return date.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
    } catch (error) {
      console.error('Error calculating time ago:', error);
      return 'Recently';
    }
  };

  // Poll every 5 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 5000); 
    return () => clearInterval(interval);
  }, []);

  // Close dropdown if clicked outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications);
      setUnreadCount(res.data.unread_count);
    } catch (err) {
      // Fail silently
    }
  };

  const markAsRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) { console.error(err); }
  };

  const markAllRead = async () => {
    try {
      await api.put('/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch (err) { console.error(err); }
  };

  const handleNotificationClick = (notif) => {
    if (!notif.is_read) {
      markAsRead(notif.id);
    }
    setIsOpen(false);

    let navState = { tab: 'overview' };
    const title = notif.title.toLowerCase();

    switch (notif.type) {
      case 'booking':
        navState = { tab: 'appointments', subTab: 'pending', targetId: notif.reference_id };
        break;
      case 'reschedule':
        navState = { tab: 'appointments', subTab: 'pending', targetId: notif.reference_id };
        break;
      case 'cancellation':
      case 'refund':
        navState = { tab: 'appointments', subTab: 'history', targetId: notif.reference_id };
        break;
      case 'payment':
        navState = { tab: 'appointments', subTab: 'upcoming', targetId: notif.reference_id };
        break;
      case 'system':
        if (title.includes('service')) {
          navState = { tab: 'services', targetId: notif.reference_id };
        } else if (title.includes('profile') || title.includes('password')) {
          navState = { tab: 'settings', subTab: 'profile' };
        } else if (title.includes('schedule') || title.includes('hours')) {
          navState = { tab: 'settings', subTab: 'hours' };
        } else if (title.includes('settings')) {
          navState = { tab: 'settings', subTab: 'notifications' };
        } else {
          navState = { tab: 'overview' };
        }
        break;
      default:
        navState = { tab: 'overview' };
    }

    navigate('/dashboard', { state: navState });
  };

  return (
    <div className="notification-center" ref={dropdownRef}>
      <button className="notification-bell" onClick={() => setIsOpen(!isOpen)}>
        <Bell size={24} />
        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button className="mark-read-btn" onClick={markAllRead} title="Mark all read">
                <CheckCheck size={16} /> Mark all read
              </button>
            )}
          </div>
          
          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="empty-state">
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.map(notif => (
                <div 
                  key={notif.id} 
                  className={`notification-item ${notif.is_read ? 'read' : 'unread'}`}
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="notif-content">
                    <p className="notif-title">{notif.title}</p>
                    <p className="notif-message">{notif.message}</p>
                    <span className="notif-time">{timeAgo(notif.created_at)}</span>
                  </div>
                  {!notif.is_read && <div className="unread-dot"></div>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationCenter;