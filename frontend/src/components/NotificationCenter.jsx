/* frontend/src/components/NotificationCenter.jsx */
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom'; 
import api from '../services/auth';
import { Bell, CheckCheck, CheckCircle, X, Star } from 'lucide-react'; 
import './NotificationCenter.css';

function NotificationCenter() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [, setTick] = useState(0); // Forces re-render for real-time updates
  const bellRef = useRef(null); 
  const dropdownRef = useRef(null); 
  const navigate = useNavigate(); 
  
  const [coords, setCoords] = useState({ top: 0, right: 0 });

  // ✅ Updated Nairobi-accurate Real-time formatter
  const timeAgo = (dateStr) => {
    if (!dateStr) return 'Just now';
    try {
      /**
       * Ensure the timestamp is treated as UTC (standard for .toISOString())
       * Adding 'Z' forces JS to treat it as Zulu/UTC time.
       */
      const standardizedDate = dateStr.endsWith('Z') 
        ? dateStr 
        : dateStr.includes(' ') 
            ? dateStr.replace(' ', 'T') + 'Z' 
            : dateStr + 'Z';
            
      const date = new Date(standardizedDate);
      const now = new Date();
      
      // Calculate difference in seconds
      const diffInSeconds = Math.floor((now - date) / 1000);
      
      // If server/client clocks are slightly out of sync, show Just Now
      if (diffInSeconds < 5) return 'Just now';
      if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
      
      const diffInMinutes = Math.floor(diffInSeconds / 60);
      if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
      
      const diffInHours = Math.floor(diffInMinutes / 60);
      if (diffInHours < 24) return `${diffInHours}h ago`;

      // Format: Day Month Year (e.g., 26 Jan 2026)
      return date.toLocaleDateString('en-GB', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric' 
      });
    } catch (e) { 
      return 'Recently'; 
    }
  };

  useEffect(() => {
    fetchNotifications();
    const fetchInterval = setInterval(fetchNotifications, 1000); 

    // ✅ Forces UI refresh every 30s to advance "Just now" to "1m ago"
    const tickerInterval = setInterval(() => {
      setTick(t => t + 1);
    }, 30000); 

    return () => {
      clearInterval(fetchInterval);
      clearInterval(tickerInterval);
    };
  }, []);

  useEffect(() => {
    if (isOpen && bellRef.current) {
        const rect = bellRef.current.getBoundingClientRect();
        setCoords({
            top: rect.bottom + window.scrollY + 10,
            right: window.innerWidth - rect.right
        });
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(event.target) &&
        bellRef.current && !bellRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
        document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unread_count || 0);
    } catch (err) {}
  };

  const markAsRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) { console.error(err); }
  };

  const markAllRead = async (e) => {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    try {
      await api.put('/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch (err) { console.error("Failed to mark all read:", err); }
  };

  const handleNotificationClick = (notif) => {
    if (!notif.is_read) markAsRead(notif.id);
    setIsOpen(false);

    let navState = { tab: 'overview' };
    const title = notif.title ? notif.title.toLowerCase() : '';
    const type = notif.type;

    if (title.includes('appointment') && title.includes('?')) {
        navState = { tab: 'appointments', subTab: 'history', targetId: notif.reference_id };
    }
    else if (['booking', 'new_request', 'reschedule'].includes(type)) {
        navState = { tab: 'appointments', subTab: 'pending', targetId: notif.reference_id };
    } 
    else if (['cancellation', 'refund'].includes(type)) {
        navState = { tab: 'appointments', subTab: 'history', targetId: notif.reference_id };
    }
    else if (['payment'].includes(type)) {
        navState = { tab: 'appointments', subTab: 'upcoming', targetId: notif.reference_id };
    }
    else if (type === 'system') {
        if (title.includes('service')) navState = { tab: 'services', targetId: notif.reference_id };
        else if (title.includes('profile')) navState = { tab: 'settings', subTab: 'profile' };
        else if (title.includes('settings')) navState = { tab: 'settings', subTab: 'notifications' };
    }
    
    navigate('/dashboard', { replace: true, state: navState });
  };

  return (
    <>
      <div 
        className="notification-wrapper" 
        ref={bellRef} 
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setIsOpen(!isOpen);
        }}
        role="button"
        tabIndex={0}
        style={{ cursor: 'pointer' }}
      >
        <div className="notification-icon">
            <Bell size={20} color="#2563eb" className="bell-icon" />
            {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
        </div>
      </div>

      {isOpen && createPortal(
        <div 
            ref={dropdownRef} 
            className="notification-dropdown" 
            style={{ 
                position: 'absolute', 
                top: `${coords.top}px`, 
                right: `${coords.right}px`, 
                zIndex: 9999 
            }}
            onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="notif-header">
            <h4>Notifications</h4>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {unreadCount > 0 && (
                <span 
                    className="mark-read-text" 
                    onMouseDown={markAllRead} 
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                    <CheckCheck size={14} /> Mark all
                </span>
                )}
                <span 
                    onMouseDown={(e) => { e.stopPropagation(); setIsOpen(false); }} 
                    className="close-notif" 
                    style={{ cursor: 'pointer' }}
                >
                    <X size={16}/>
                </span>
            </div>
          </div>
          
          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="empty-state"><p>No notifications yet</p></div>
            ) : (
              notifications.map(notif => (
                <div 
                  key={notif.id} 
                  className={`notif-item ${notif.is_read ? 'read' : 'unread'}`}
                  onClick={() => handleNotificationClick(notif)}
                >
                 <div className={`notif-icon ${notif.title?.includes('?') ? 'yellow' : notif.type === 'system' ? 'green' : 'blue'}`}>
                    {notif.title?.includes('?') ? (
                      <Star size={18} fill="currentColor" />
                    ) : (notif.type === 'system' || notif.title?.includes('Welcome')) ? (
                      <CheckCircle size={18} /> 
                    ) : (
                      <Bell size={18} />
                    )}
                  </div>
                  <div className="notif-text">
                    <p className="notif-title">{notif.title}</p>
                    <p className="notif-message">{notif.message}</p>
                    <span className="notif-time">{timeAgo(notif.created_at)}</span>
                  </div>
                  {!notif.is_read && <div className="unread-dot"></div>}
                </div>
              ))
            )}
          </div>
          
          <div 
            className="notif-footer" 
            onMouseDown={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                navigate('/dashboard', { state: { tab: 'settings', subTab: 'notifications' } });
            }}
          >
            Manage Settings
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default NotificationCenter;