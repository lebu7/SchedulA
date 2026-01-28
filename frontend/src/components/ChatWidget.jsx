import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, ArrowLeft } from 'lucide-react';
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

  // 🔹 Chat intent flags (ADDED)
  const [autoFocus, setAutoFocus] = useState(false);
  const [scrollToUnread, setScrollToUnread] = useState(false);

  const widgetRef = useRef(null);

  /* ------------------ Helpers ------------------ */

  const formatLastSeen = (dateStr) => {
    if (!dateStr) return 'Offline';
    try {
      const standardizedDate = dateStr.includes(' ')
        ? dateStr.replace(' ', 'T') + 'Z'
        : dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';

      const date = new Date(standardizedDate);
      const now = new Date();
      const diff = Math.floor((now - date) / 1000);

      if (diff < 60) return 'Last seen just now';
      const m = Math.floor(diff / 60);
      if (m < 60) return `Last seen ${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `Last seen ${h}h ago`;

      return `Last seen ${date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short'
      })}`;
    } catch {
      return 'Offline';
    }
  };

  /* ------------------ Socket Updates ------------------ */

  useEffect(() => {
    const handleUserOffline = (data) => {
      if (recipientId && Number(data.userId) === Number(recipientId)) {
        setLastSeen(data.lastSeen);
      }
    };

    socket?.on('user_disconnected', handleUserOffline);
    const ticker = setInterval(() => setTick(t => t + 1), 60000);

    return () => {
      socket?.off('user_disconnected', handleUserOffline);
      clearInterval(ticker);
    };
  }, [socket, recipientId]);

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
