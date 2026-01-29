import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, ArrowLeft, SquareUser } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useSocket } from '../contexts/SocketContext';
import ChatListModal from './ChatListModal';
import ChatModal from './ChatModal';
import api from '../services/auth';
import './ChatWidget.css';

const ChatWidget = () => {
  const { globalUnreadCount, socket, onlineUsers } = useSocket();
  const location = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);

  // Header Info
  const [recipientName, setRecipientName] = useState('');
  const [recipientRole, setRecipientRole] = useState('');
  const [recipientId, setRecipientId] = useState(null);
  const [lastSeen, setLastSeen] = useState(null);
  const [, setTick] = useState(0);

  // 🔹 Chat intent flags
  const [autoFocus, setAutoFocus] = useState(false);
  const [scrollToUnread, setScrollToUnread] = useState(false);

  const widgetRef = useRef(null);

  /* ------------------ Helpers ------------------ */

  const formatLastSeen = (dateStr) => {
    if (!dateStr) return 'Offline';

    try {
      // 1. Normalize Date: Ensure UTC ('Z') if missing, to match DB 'CURRENT_TIMESTAMP'
      let standardized = dateStr;
      if (!standardized.endsWith('Z') && !standardized.includes('+')) {
        standardized = standardized.replace(' ', 'T') + 'Z';
      }

      const date = new Date(standardized);
      if (isNaN(date.getTime())) return 'Offline';

      const now = new Date();
      const diffInSeconds = Math.floor((now - date) / 1000);

      // Handle small negative diffs (clock skew)
      if (diffInSeconds < 0) return 'Last seen just now';

      if (diffInSeconds < 60) return 'Last seen just now';
      
      const minutes = Math.floor(diffInSeconds / 60);
      if (minutes < 60) return `Last seen ${minutes}m ago`;
      
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `Last seen ${hours}h ago`;

      return `Last seen ${date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short'
      })}`;
    } catch (err) {
      return 'Offline';
    }
  };

  /* ------------------ Data Fetching ------------------ */

  // ✅ New function to fetch fresh last_seen from DB
  const fetchRecipientStatus = async (id) => {
    if (!id) return;
    try {
      const res = await api.get(`/chat/status/${id}`);
      if (res.data.last_seen) {
        setLastSeen(res.data.last_seen);
      }
    } catch (err) {
      console.error("Failed to fetch status", err);
    }
  };

  /* ------------------ Socket Updates ------------------ */

  useEffect(() => {
    // 1. When user disconnects, update state immediately
    const handleUserOffline = (data) => {
      if (recipientId && Number(data.userId) === Number(recipientId)) {
        setLastSeen(data.lastSeen); 
      }
    };

    // 2. When user connects
    const handleUserOnline = (userId) => {
       if (recipientId && Number(userId) === Number(recipientId)) {
          // You could refetch here, but "Online" badge handles it visually
       }
    };

    socket?.on('user_disconnected', handleUserOffline);
    socket?.on('user_connected', handleUserOnline);
    
    // Auto-refresh text every 60s
    const ticker = setInterval(() => {
        setTick(t => t + 1);
        // Also refetch status occasionally to ensure sync
        if (recipientId && !onlineUsers.has(recipientId)) {
            fetchRecipientStatus(recipientId);
        }
    }, 60000);

    return () => {
      socket?.off('user_disconnected', handleUserOffline);
      socket?.off('user_connected', handleUserOnline);
      clearInterval(ticker);
    };
  }, [socket, recipientId, onlineUsers]);

  // ✅ Fetch status immediately when opening a chat (fixing "Offline" on reload)
  useEffect(() => {
    if (recipientId && !onlineUsers.has(recipientId)) {
        fetchRecipientStatus(recipientId);
    }
  }, [recipientId, onlineUsers]);

  /* ------------------ External Events ------------------ */

  useEffect(() => {
    const handleOpenSpecificChat = (e) => {
      const {
        room,
        context,
        autoFocus: af,
        scrollToUnread: stu,
        recipientName: customName
      } = e.detail;

      setIsOpen(true);
      setAutoFocus(!!af);
      setScrollToUnread(!!stu);

      const userId = Number(localStorage.getItem('userId'));
      const isClient = Number(room.client_id) === userId;

      const rId = isClient ? Number(room.provider_id) : Number(room.client_id);
      const name = customName || (
        isClient ? room.business_name || room.provider_name : room.client_name
      );

      setSelectedRoom({ ...room, contextInfo: context });
      setRecipientName(name);
      setRecipientRole(isClient ? 'Service Provider' : 'Client');
      setRecipientId(rId);
      
      // Set initial state from room props, but useEffect will refresh it
      setLastSeen(isClient ? room.provider_last_seen : room.client_last_seen);
    };

    const handleToggle = () => setIsOpen(prev => !prev);
    const handleForceOpen = () => setIsOpen(true);

    window.addEventListener('openChatRoom', handleOpenSpecificChat);
    window.addEventListener('toggleChatWidget', handleToggle);
    window.addEventListener('forceOpenChatWidget', handleForceOpen);

    return () => {
      window.removeEventListener('openChatRoom', handleOpenSpecificChat);
      window.removeEventListener('toggleChatWidget', handleToggle);
      window.removeEventListener('forceOpenChatWidget', handleForceOpen);
    };
  }, []);

  /* ------------------ URL Deep-Link Support ------------------ */

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const chatRoomId = params.get('chatRoomId');

    if (!chatRoomId) return;

    const openFromUrl = async () => {
      try {
        setIsOpen(true);
        setAutoFocus(true);
        setScrollToUnread(true);

        const res = await api.get(`/chat/rooms/${chatRoomId}`);
        const room = res.data.room;

        window.dispatchEvent(new CustomEvent('openChatRoom', {
          detail: {
            room,
            autoFocus: true,
            scrollToUnread: true
          }
        }));
      } catch (err) {
        console.error('Failed to open chat from URL', err);
      }
    };

    openFromUrl();
  }, [location.search]);

  /* ------------------ Utility ------------------ */

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

  /* ------------------ Render ------------------ */

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
                {/* Avatar Icon */}
                <SquareUser size={38} strokeWidth={1.5} color="#e2e8f0" fill="#ffffff33" style={{ marginRight: '0px' }} />
                
                <div className="header-info">
                  <span className="recipient-name-header">{recipientName}</span>
                  {isOnline ? (
                    <span className="recipient-status-online">Online</span>
                  ) : (
                    <span className="recipient-status-offline">
                      {formatLastSeen(lastSeen)}
                    </span>
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
                autoFocus={autoFocus}
                scrollToUnread={scrollToUnread}
                onClose={() => setIsOpen(false)}
                inWidget
              />
            ) : (
              <ChatListModal
                onClose={() => setIsOpen(false)}
                inWidget
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