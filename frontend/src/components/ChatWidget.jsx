/* frontend/src/components/ChatWidget.jsx */
import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, ArrowLeft } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import ChatListModal from './ChatListModal';
import ChatModal from './ChatModal';
import './ChatWidget.css';

const ChatWidget = () => {
  // ✅ Get onlineUsers from context
  const { unreadCount, socket, onlineUsers } = useSocket();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  
  // Header Info State
  const [recipientName, setRecipientName] = useState('');
  const [recipientRole, setRecipientRole] = useState('');
  const [recipientId, setRecipientId] = useState(null); // ✅ Track ID for status check

  const widgetRef = useRef(null);

  // Toggle widget via event (from Header)
  useEffect(() => {
    const handleToggle = () => setIsOpen(prev => !prev);
    window.addEventListener('toggleChatWidget', handleToggle);
    return () => window.removeEventListener('toggleChatWidget', handleToggle);
  }, []);

  // Listen for real-time unread updates
  useEffect(() => {
    const handleUnreadUpdate = () => {
      window.dispatchEvent(new CustomEvent('updateChatBadge'));
    };
    
    socket?.on('unread_count_update', handleUnreadUpdate);
    return () => {
      socket?.off('unread_count_update', handleUnreadUpdate);
    };
  }, [socket]);

  // Close widget if click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isOpen && widgetRef.current && !widgetRef.current.contains(e.target)) {
        const btn = document.querySelector('.chat-widget-button');
        if (btn && btn.contains(e.target)) return;

        setIsOpen(false);
        setTimeout(() => {
          resetHeader();
        }, 300);
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
  };

  const handleRoomSelect = (room, name) => {
    setSelectedRoom(room);
    setRecipientName(name);
    
    // Determine Role & ID
    const userId = Number(localStorage.getItem('userId'));
    const isClient = room.client_id === userId;
    
    setRecipientRole(isClient ? 'Service Provider' : 'Client');
    setRecipientId(isClient ? room.provider_id : room.client_id); // ✅ Store ID
  };

  const handleBack = () => {
    resetHeader();
  };

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => {
      resetHeader();
    }, 300);
  };

  // ✅ Check Online Status
  const isOnline = recipientId && onlineUsers.has(recipientId);

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button 
          className="chat-widget-button" 
          onClick={() => setIsOpen(true)}
          aria-label="Open messages"
        >
          <MessageCircle size={24} />
          {unreadCount > 0 && <span className="chat-widget-badge">{unreadCount}</span>}
        </button>
      )}

      {/* Widget Panel */}
      {isOpen && (
        <div className="chat-widget-panel" ref={widgetRef}>
          {/* Header */}
          <div className="chat-widget-header">
            {selectedRoom ? (
              <div className="header-left">
                <button 
                  onClick={handleBack} 
                  className="nav-btn"
                  title="Back to list"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="header-info">
                  <span className="recipient-name-header">{recipientName}</span>
                  {/* ✅ Online Status Logic */}
                  {isOnline ? (
                    <span className="recipient-status-online">Online</span>
                  ) : (
                    <span className="recipient-role-header">{recipientRole}</span>
                  )}
                </div>
              </div>
            ) : (
              <h3 className="widget-title">Messages</h3>
            )}
            
            {/* Close Button */}
            <button 
              onClick={handleClose}
              className="nav-btn close-btn"
              title="Close chat"
            >
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div className="chat-widget-content">
            {selectedRoom ? (
              <ChatModal
                room={selectedRoom}
                contextInfo={selectedRoom.contextInfo || null}
                onClose={handleClose}
                inWidget={true}
              />
            ) : (
              <ChatListModal
                onClose={handleClose}
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