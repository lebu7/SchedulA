import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom'; 
import api from '../services/auth';
import { Bell, CheckCheck, CheckCircle, X, Star, MessageSquare } from 'lucide-react'; 
import './NotificationCenter.css';

function NotificationCenter() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [, setTick] = useState(0);
  const bellRef = useRef(null); 
  const dropdownRef = useRef(null); 
  const navigate = useNavigate(); 
  
  const [coords, setCoords] = useState({ top: 0, right: 0 });

  // --- Time formatter (unchanged) ---
  const timeAgo = (dateStr) => {
    if (!dateStr) return 'Just now';
    try {
      const standardizedDate = dateStr.endsWith('Z') 
        ? dateStr 
        : dateStr.includes(' ') 
            ? dateStr.replace(' ', 'T') + 'Z' 
            : dateStr + 'Z';

      const date = new Date(standardizedDate);
      const now = new Date();
      const diff = Math.floor((now - date) / 1000);

      if (diff < 5) return 'Just now';
      if (diff < 60) return `${diff}s ago`;
      const m = Math.floor(diff / 60);
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;

      return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return 'Recently';
    }
  };

  // --- Polling ---
  useEffect(() => {
    fetchNotifications();
    const fetchInterval = setInterval(fetchNotifications, 1000);
    const tickerInterval = setInterval(() => setTick(t => t + 1), 30000);
    return () => {
      clearInterval(fetchInterval);
      clearInterval(tickerInterval);
    };
  }, []);

  // --- Positioning ---
  useEffect(() => {
    if (isOpen && bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY + 10,
        right: window.innerWidth - rect.right
      });
    }
  }, [isOpen]);

  // --- Outside click ---
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        bellRef.current && !bellRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unread_count || 0);
    } catch {}
  };

  const markAsRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: 1 } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  const markAllRead = async (e) => {
    e?.stopPropagation();
    try {
      await api.put('/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch {}
  };

  // 🔥 CHAT-AWARE CLICK HANDLER (tightened)
  const handleNotificationClick = async (notif) => {
    if (!notif.is_read) markAsRead(notif.id);
    setIsOpen(false);

    // ✅ CHAT NOTIFICATION
    if (notif.type === 'chat' && notif.reference_id) {
      try {
        // Force dashboard route (deep-linkable)
        navigate(`/dashboard?chatRoomId=${notif.reference_id}`, { replace: true });

        // Ensure widget opens even if closed
        window.dispatchEvent(new CustomEvent('forceOpenChatWidget'));

        // Fetch room
        const res = await api.get(`/chat/rooms/${notif.reference_id}`);
        const room = res.data.room;

        // Dispatch open event with focus intent
        window.dispatchEvent(
          new CustomEvent('openChatRoom', {
            detail: {
              room,
              autoFocus: true,
              scrollToUnread: true
            }
          })
        );
        return;
      } catch (err) {
        console.error('Failed to open chat from notification', err);
      }
    }

    // --- EXISTING ROUTING (unchanged) ---
    let navState = { tab: 'overview' };
    const title = notif.title?.toLowerCase() || '';
    const type = notif.type;

    if (title.includes('appointment') && title.includes('?')) {
      navState = { tab: 'appointments', subTab: 'history', targetId: notif.reference_id };
    } else if (['booking', 'new_request', 'reschedule'].includes(type)) {
      navState = { tab: 'appointments', subTab: 'pending', targetId: notif.reference_id };
    } else if (['cancellation', 'refund'].includes(type)) {
      navState = { tab: 'appointments', subTab: 'history', targetId: notif.reference_id };
    } else if (type === 'payment') {
      navState = { tab: 'appointments', subTab: 'upcoming', targetId: notif.reference_id };
    } else if (type === 'system') {
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
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        <div className="notification-icon">
          <Bell size={20} color="#2563eb" />
          {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
        </div>
      </div>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="notification-dropdown"
          style={{ top: coords.top, right: coords.right, zIndex: 9999 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="notif-header">
            <h4>Notifications</h4>
            <div style={{ display: 'flex', gap: 10 }}>
              {unreadCount > 0 && (
                <span className="mark-read-text" onMouseDown={markAllRead}>
                  <CheckCheck size={14} /> Mark all
                </span>
              )}
              <span onMouseDown={() => setIsOpen(false)}><X size={16} /></span>
            </div>
          </div>

          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="empty-state">No notifications yet</div>
            ) : notifications.map(notif => (
              <div
                key={notif.id}
                className={`notif-item ${notif.is_read ? 'read' : 'unread'}`}
                onClick={() => handleNotificationClick(notif)}
              >
                <div className={`notif-icon ${
                  notif.type === 'chat'
                    ? 'purple'
                    : notif.title?.includes('?')
                    ? 'yellow'
                    : notif.type === 'system'
                    ? 'green'
                    : 'blue'
                }`}>
                  {notif.type === 'chat' ? (
                    <MessageSquare size={18} />
                  ) : notif.title?.includes('?') ? (
                    <Star size={18} fill="currentColor" />
                  ) : notif.type === 'system' ? (
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

                {!notif.is_read && <div className="unread-dot" />}
              </div>
            ))}
          </div>

          <div
            className="notif-footer"
            onMouseDown={() => {
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
