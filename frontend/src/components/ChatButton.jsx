/* frontend/src/components/ChatButton.jsx */
import React from 'react';
import { MessageCircle } from 'lucide-react';
import './ChatButton.css';

const ChatButton = ({ onClick, unreadCount = 0, size = 'normal' }) => (
  <button className={`chat-btn ${size}`} onClick={onClick}>
    <MessageCircle size={size === 'small' ? 16 : 20} />
    {unreadCount > 0 && <span className="chat-badge">{unreadCount}</span>}
  </button>
);

export default ChatButton;