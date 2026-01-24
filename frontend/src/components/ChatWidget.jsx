/* frontend/src/components/ChatWidget.jsx */
import React, { useState } from 'react';
import { MessageCircle, X, Minimize2 } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import ChatListModal from './ChatListModal';
import './ChatWidget.css';

const ChatWidget = () => {
  const { unreadCount } = useSocket();
  const [isOpen, setIsOpen] = useState(false);

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

      {/* Chat List Panel (Slides from bottom-right) */}
      {isOpen && (
        <div className="chat-widget-panel">
          <div className="chat-widget-header">
            <h3>💬 Messages</h3>
            <div className="online-indicator" title="Live Support Active"></div>
            <button onClick={() => setIsOpen(false)} className="minimize-btn">
              <X size={20} />
            </button>
          </div>
          {/* Reuse the updated ChatListModal in widget mode */}
          <ChatListModal onClose={() => setIsOpen(false)} inWidget={true} />
        </div>
      )}
    </>
  );
};

export default ChatWidget;