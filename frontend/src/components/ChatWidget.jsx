/* frontend/src/components/ChatWidget.jsx */
import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, ArrowLeft } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import ChatListModal from './ChatListModal';
import ChatModal from './ChatModal';
import './ChatWidget.css';

const ChatWidget = () => {
  const { unreadCount, socket, onlineUsers } = useSocket();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  
  // Header Info State
  const [recipientName, setRecipientName] = useState('');
  const [recipientRole, setRecipientRole] = useState('');
  const [recipientId, setRecipientId] = useState(null);

  const widgetRef = useRef(null);

  // ✅ NEW: Listen for "openChatRoom" event from other components
  useEffect(() => {
    const handleOpenSpecificChat = (e) => {
      // ✅ Accept 'recipientName' from the event detail
      const { room, context, recipientName } = e.detail;
      
      // 1. Open Widget
      setIsOpen(true);

      // 2. Determine User details
      const userId = Number(localStorage.getItem('userId'));
      const isClient = room.client_id === userId;
      
      // ✅ Priority: Use the name passed in event -> Room Name -> Fallback
      const name = recipientName || (isClient 
        ? room.provider_name || room.business_name 
        : room.client_name) || "Chat";

      const role = isClient ? 'Service Provider' : 'Client';
      const rId = isClient ? room.provider_id : room.client_id;

      // 3. Set Active Room
      setSelectedRoom({ ...room, contextInfo: context });
      setRecipientName(name);
      setRecipientRole(role);
      setRecipientId(rId);
    };

    const handleToggle = () => setIsOpen(prev => !prev);

    window.addEventListener('openChatRoom', handleOpenSpecificChat);
    window.addEventListener('toggleChatWidget', handleToggle);

    return () => {
      window.removeEventListener('openChatRoom', handleOpenSpecificChat);
      window.removeEventListener('toggleChatWidget', handleToggle);
    };
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
    
    const userId = Number(localStorage.getItem('userId'));
    const isClient = room.client_id === userId;
    
    setRecipientRole(isClient ? 'Service Provider' : 'Client');
    setRecipientId(isClient ? room.provider_id : room.client_id);
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
          <MessageCircle size={28} />
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