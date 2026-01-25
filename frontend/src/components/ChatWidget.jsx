import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, ArrowLeft } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import ChatListModal from './ChatListModal';
import ChatModal from './ChatModal';
import './ChatWidget.css';

const ChatWidget = () => {
  const { unreadCount } = useSocket();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [recipientName, setRecipientName] = useState('');
  const widgetRef = useRef(null);

  // Toggle widget via event
  useEffect(() => {
    const handleToggle = () => setIsOpen(prev => !prev);
    window.addEventListener('toggleChatWidget', handleToggle);
    return () => window.removeEventListener('toggleChatWidget', handleToggle);
  }, []);

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
          {/* Header */}
          <div className="chat-widget-header">
            {selectedRoom && (
              <>
                <button 
                  onClick={() => {
                    setSelectedRoom(null);
                    setRecipientName('');
                  }} 
                  className="minimize-btn"
                  aria-label="Back to chat list"
                >
                  <ArrowLeft size={20} />
                </button>
                <span className="recipient-name">{recipientName}</span>
              </>
            )}
            {!selectedRoom && <div className="online-indicator" title="Live Support Active"></div>}
            <button 
              onClick={() => {
                setIsOpen(false);
                setSelectedRoom(null);
                setRecipientName('');
              }}
              className="minimize-btn"
              aria-label="Close chat"
            >
              <X size={20} />
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
