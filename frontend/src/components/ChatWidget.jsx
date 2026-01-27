/* frontend/src/components/ChatWidget.jsx */
import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, ArrowLeft } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import ChatListModal from './ChatListModal';
import ChatModal from './ChatModal';
import './ChatWidget.css';

const ChatWidget = () => {
  const { globalUnreadCount, socket, onlineUsers } = useSocket();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  
  // Header Info State
  const [recipientName, setRecipientName] = useState('');
  const [recipientRole, setRecipientRole] = useState('');
  const [recipientId, setRecipientId] = useState(null);
  const [lastSeen, setLastSeen] = useState(null);
  const [, setTick] = useState(0); // Forces re-render for time updates

  const widgetRef = useRef(null);

  // Helper to format the Last Seen string
  const formatLastSeen = (dateStr) => {
    if (!dateStr) return 'Offline';
    try {
      // Normalize SQLite date string to ISO
      const standardizedDate = dateStr.includes(' ') 
        ? dateStr.replace(' ', 'T') + 'Z' 
        : dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
        
      const date = new Date(standardizedDate);
      const now = new Date();
      const diffInSeconds = Math.floor((now - date) / 1000);
      
      if (diffInSeconds < 60) return 'Last seen just now';
      
      const diffInMinutes = Math.floor(diffInSeconds / 60);
      if (diffInMinutes < 60) return `Last seen ${diffInMinutes}m ago`;
      
      const diffInHours = Math.floor(diffInMinutes / 60);
      if (diffInHours < 24) return `Last seen ${diffInHours}h ago`;

      return `Last seen ${date.toLocaleDateString('en-GB', { 
        day: 'numeric', 
        month: 'short' 
      })}`;
    } catch (e) { 
      return 'Offline'; 
    }
  };

  // ✅ 1. Real-time updates for Last Seen
  useEffect(() => {
    const handleUserOffline = (data) => {
      // If the user who just disconnected is the one we are chatting with, update their lastSeen
      if (recipientId && Number(data.userId) === Number(recipientId)) {
        setLastSeen(data.lastSeen);
      }
    };

    socket?.on('user_disconnected', handleUserOffline);
    
    // Ticker to refresh "m ago" strings every minute
    const ticker = setInterval(() => setTick(t => t + 1), 60000);

    return () => {
      socket?.off('user_disconnected', handleUserOffline);
      clearInterval(ticker);
    };
  }, [socket, recipientId]);

  // ✅ 2. Handle Opening Specific Chat (External Events)
  useEffect(() => {
    const handleOpenSpecificChat = (e) => {
      const { room, context, recipientName: customName } = e.detail;
      setIsOpen(true);

      const userId = Number(localStorage.getItem('userId'));
      const isClient = Number(room.client_id) === userId;
      
      const rId = isClient ? Number(room.provider_id) : Number(room.client_id);
      const name = customName || (isClient 
        ? room.business_name || room.provider_name 
        : room.client_name);
      
      const seen = isClient ? room.provider_last_seen : room.client_last_seen;

      setSelectedRoom({ ...room, contextInfo: context });
      setRecipientName(name);
      setRecipientRole(isClient ? 'Service Provider' : 'Client');
      setRecipientId(rId);
      setLastSeen(seen);
    };

    const handleToggle = () => setIsOpen(prev => !prev);

    window.addEventListener('openChatRoom', handleOpenSpecificChat);
    window.addEventListener('toggleChatWidget', handleToggle);

    return () => {
      window.removeEventListener('openChatRoom', handleOpenSpecificChat);
      window.removeEventListener('toggleChatWidget', handleToggle);
    };
  }, []);

  // ✅ 3. General Socket Listeners
  useEffect(() => {
    const handleUnreadUpdate = () => {
      window.dispatchEvent(new CustomEvent('updateChatBadge'));
    };
    
    socket?.on('unread_count_update', handleUnreadUpdate);
    return () => socket?.off('unread_count_update', handleUnreadUpdate);
  }, [socket]);

  // ✅ 4. Utility Functions
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isOpen && widgetRef.current && !widgetRef.current.contains(e.target)) {
        const btn = document.querySelector('.chat-widget-button');
        if (btn && btn.contains(e.target)) return;
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const resetHeader = () => {
    setSelectedRoom(null);
    setRecipientName('');
    setRecipientRole('');
    setRecipientId(null);
    setLastSeen(null);
  };

  const handleRoomSelect = (room, name) => {
    const userId = Number(localStorage.getItem('userId'));
    const isClient = Number(room.client_id) === userId;
    
    setSelectedRoom(room);
    setRecipientName(name);
    setRecipientRole(isClient ? 'Service Provider' : 'Client');
    setRecipientId(isClient ? Number(room.provider_id) : Number(room.client_id));
    setLastSeen(isClient ? room.provider_last_seen : room.client_last_seen);
  };

  const isOnline = recipientId && onlineUsers.has(Number(recipientId));

  return (
    <>
      {!isOpen && (
        <button 
          className="chat-widget-button" 
          onClick={() => setIsOpen(true)}
          aria-label="Open messages"
        >
          <MessageCircle size={28} />
          {globalUnreadCount > 0 && (
            <span className="chat-widget-badge">{globalUnreadCount}</span>
          )}
        </button>
      )}

      {isOpen && (
        <div className="chat-widget-panel" ref={widgetRef}>
          <div className="chat-widget-header">
            {selectedRoom ? (
              <div className="header-left">
                <button onClick={() => setSelectedRoom(null)} className="nav-btn">
                  <ArrowLeft size={18} />
                </button>
                <div className="header-info">
                  <span className="recipient-name-header">{recipientName}</span>
                  {/* ✅ FIXED: Show Online status or Last Seen time */}
                  {isOnline ? (
                    <span className="recipient-status-online">Online</span>
                  ) : (
                    <span className="recipient-status-offline">{formatLastSeen(lastSeen)}</span>
                  )}
                </div>
              </div>
            ) : (
              <h3 className="widget-title">Messages</h3>
            )}
            
            <button onClick={() => setIsOpen(false)} className="nav-btn close-btn">
              <X size={18} />
            </button>
          </div>

          <div className="chat-widget-content">
            {selectedRoom ? (
              <ChatModal
                room={selectedRoom}
                contextInfo={selectedRoom.contextInfo || null}
                onClose={() => setIsOpen(false)}
                inWidget={true}
              />
            ) : (
              <ChatListModal
                onClose={() => setIsOpen(false)}
                inWidget={true}
                onRoomSelect={handleRoomSelect}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default ChatWidget;