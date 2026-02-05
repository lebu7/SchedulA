/* frontend/src/components/ChatButton.jsx */
import React, { useMemo } from "react";
import { MessageCircle } from "lucide-react";
import { useSocket } from "../contexts/SocketContext";
import "./ChatButton.css";

/**
 * Props:
 * - unreadCount: number (context/room-specific count ONLY)
 * - disableGlobalCounter: boolean (if true, never show global)
 * - size: 'normal' | 'small'
 */
const ChatButton = ({
  onClick,
  unreadCount: propCount,
  size = "normal",
  disableGlobalCounter = false,
}) => {
  const { globalUnreadCount } = useSocket();

  const countToDisplay = useMemo(() => {
    // If parent passed a count (even 0), always trust it
    if (typeof propCount === "number") return propCount;

    // Otherwise, optionally fall back to global
    if (!disableGlobalCounter) return Number(globalUnreadCount || 0);

    return 0;
  }, [propCount, disableGlobalCounter, globalUnreadCount]);

  return (
    <button
      type="button"
      className={`chat-btn ${size}`}
      onClick={onClick}
      aria-label="Open chat"
    >
      <MessageCircle size={size === "small" ? 16 : 20} />
      {countToDisplay > 0 && <span className="chat-badge">{countToDisplay}</span>}
    </button>
  );
};

export default ChatButton;
