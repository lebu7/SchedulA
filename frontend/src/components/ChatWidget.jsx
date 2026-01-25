/* frontend/src/components/ChatWidget.jsx */
import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, ArrowLeft } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import ChatListModal from './ChatListModal';
import ChatModal from './ChatModal';
import './ChatWidget.css';

const ChatWidget = () => {
  const { unreadCount, socket } = useSocket();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [recipientName, setRecipientName] = useState('');
  const widgetRef = useRef(null);

  // Toggle widget via event (from Header)
  useEffect(() => {
    const handleToggle = () => setIsOpen(prev => !prev);
    window.addEventListener('toggleChatWidget', handleToggle);
    return () => window.removeEventListener('toggleChatWidget', handleToggle);
  }, []);

  // Fix Widget Badge Real-Time Updates
  useEffect(() => {
    const handleUnreadUpdate = () => {
      // Trigger re-fetch from context
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
        setIsOpen(false);
        setSelectedRoom(null);
        setRecipientName('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

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
          {/* Header - Fix Back/Close Navigation Logic */}
          <div className="chat-widget-header">
            {selectedRoom ? (
              <>
                {/* Back Button */}
                <button 
                  onClick={() => {
                    setSelectedRoom(null);
                    setRecipientName('');
                  }} 
                  className="nav-btn"
                  title="Back to list"
                >
                  <ArrowLeft size={18} />
                </button>
                <span className="recipient-name">{recipientName}</span>
              </>
            ) : (
              <h3 style={{margin:0, fontSize:'16px'}}>Messages</h3>
            )}
            
            {/* Close Button (Always visible) */}
            <button 
              onClick={() => {
                setIsOpen(false);
                setSelectedRoom(null);
                setRecipientName('');
              }}
              className="nav-btn close-btn"
              title="Close chat"
            >
              <X size={18} />
            </button>
          </div>

          {/* Chat List or Chat Modal */}
          {selectedRoom ? (
            <ChatModal
              room={selectedRoom}
              contextInfo={selectedRoom.contextInfo || null}
              onClose={() => {
                setSelectedRoom(null);
                setRecipientName('');
              }}
              inWidget={true}
            />
          ) : (
            <ChatListModal
              onClose={() => {
                setIsOpen(false);
                setSelectedRoom(null);
                setRecipientName('');
              }}
              inWidget={true}
              onRoomSelect={(room, name) => {
                setSelectedRoom(room);
                setRecipientName(name);
              }}
            />
          )}
        </div>
      )}
    </>
  );
};

export default ChatWidget;