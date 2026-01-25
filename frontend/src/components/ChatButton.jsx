/* frontend/src/components/ChatButton.jsx */
import React from 'react';
import { MessageCircle } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import './ChatButton.css';

/**
 * Props:
 * - unreadCount: number (context-specific count ONLY)
 * - disableGlobalCounter: boolean (if true, never show global)
 * - size: 'normal' | 'small'
 */
const ChatButton = ({ 
  onClick, 
  unreadCount: propCount, 
  size = 'normal',
  disableGlobalCounter = false
}) => {
  const { globalUnreadCount } = useSocket();

  let countToDisplay = 0;

  if (propCount !== undefined) {
    countToDisplay = propCount;
  } else if (!disableGlobalCounter) {
    countToDisplay = globalUnreadCount;
  } else {
    countToDisplay = 0;
  }

  return (
    <button className={`chat-btn ${size}`} onClick={onClick}>
      <MessageCircle size={size === 'small' ? 16 : 20} />
      {countToDisplay > 0 && <span className="chat-badge">{countToDisplay}</span>}
    </button>
  );
};

export default ChatButton;
