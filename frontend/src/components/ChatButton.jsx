/* frontend/src/components/ChatButton.jsx */
import React from 'react';
import { MessageCircle } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext'; // ✅ Connect to Real-time Context
import './ChatButton.css';

const ChatButton = ({ onClick, unreadCount: propCount, size = 'normal' }) => {
  const { unreadCount: globalCount } = useSocket();

  // ✅ Priority: Use prop if provided (for specific chats), otherwise use Global Context
  const countToDisplay = propCount !== undefined ? propCount : globalCount;

  return (
    <button className={`chat-btn ${size}`} onClick={onClick}>
      <MessageCircle size={size === 'small' ? 16 : 20} />
      {countToDisplay > 0 && <span className="chat-badge">{countToDisplay}</span>}
    </button>
  );
};

export default ChatButton;