import React, { useState, useEffect } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import ChatListModal from './ChatListModal';
import './ChatWidget.css';

const ChatWidget = () => {
  const { unreadCount } = useSocket();
  const [isOpen, setIsOpen] = useState(false);

  // ✅ FIX: Listen for header icon clicks
  useEffect(() => {
    const handleToggle = () => setIsOpen(prev => !prev);
    window.addEventListener('toggleChatWidget', handleToggle);
    return () => window.removeEventListener('toggleChatWidget', handleToggle);
  }, []);

  return (
    <>
      {/* Fixed Bottom-Right Button */}
      <button 
        className="chat-widget-button" 
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open messages"
      >
        <MessageCircle size={24} />
        {unreadCount > 0 && <span className="chat-widget-badge">{unreadCount}</span>}
      </button>

      {/* Chat List Panel */}
      {isOpen && (
        <div className="chat-widget-panel">
          <div className="chat-widget-header">
            <h3>💬 Messages</h3>
            <div className="online-indicator" title="Live Support Active"></div>
            <button onClick={() => setIsOpen(false)} className="minimize-btn">
              <X size={20} />
            </button>
          </div>
          {/* ✅ FIX: Pass inWidget prop */}
          <ChatListModal onClose={() => setIsOpen(false)} inWidget={true} />
        </div>
      )}
    </>
  );
};

export default ChatWidget;