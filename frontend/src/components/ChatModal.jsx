import React, { useState, useEffect, useRef } from 'react';
import { Send, Calendar, Clock, Tag, Check, CheckCircle } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import api from '../services/auth';
import './ChatModal.css';

const ChatModal = ({ room, contextInfo, recipientName, onClose, inWidget = false }) => {
  const { socket, resetRoomUnread } = useSocket();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [fullRoom, setFullRoom] = useState(room);
  const [typingUsers, setTypingUsers] = useState([]);
  const messagesEndRef = useRef(null);

  const userId = Number(localStorage.getItem('userId'));

  const getOtherParticipantName = () => {
    if (recipientName) return recipientName;
    if (!fullRoom) return 'User';

    if (Number(fullRoom.client_id) === userId) {
      return (
        fullRoom.provider_name ||
        fullRoom.business_name ||
        contextInfo?.provider_name ||
        contextInfo?.business_name ||
        'Provider'
      );
    }

    return fullRoom.client_name || contextInfo?.client_name || 'Client';
  };

  const markRoomReadNow = () => {
    if (!socket || !fullRoom?.id) return;
    socket.emit('mark_read', { roomId: fullRoom.id });
    resetRoomUnread(fullRoom.id);
  };

  /* Reset unread count on room open */
  useEffect(() => {
    if (!fullRoom?.id) return;
    resetRoomUnread(fullRoom.id);
  }, [fullRoom?.id, resetRoomUnread]);

  /* Fetch messages + socket listeners */
  useEffect(() => {
    if (!room || !socket) return;

    let mounted = true;

    const fetchMessagesAndRoom = async () => {
      try {
        const res = await api.get(`/chat/rooms/${room.id}/messages`);
        if (!mounted) return;

        const fetchedMessages = (res.data.messages || []).map((msg) => ({
          ...msg,
          sender_name: Number(msg.sender_id) === userId ? 'You' : msg.sender_name,
        }));

        setMessages(fetchedMessages);

        setFullRoom((prev) => ({
          ...prev,
          client_name:
            prev?.client_name ||
            fetchedMessages.find((m) => m.sender_name !== 'You')?.sender_name ||
            prev?.client_name,
          provider_name:
            prev?.provider_name ||
            fetchedMessages.find((m) => m.sender_name !== 'You')?.sender_name ||
            prev?.provider_name,
        }));
      } catch (err) {
        console.error('Failed to fetch chat messages:', err);
      }
    };

    fetchMessagesAndRoom();

    socket.emit('join_room', { roomId: room.id });

    // ✅ Mark read immediately on open
    socket.emit('mark_read', { roomId: room.id });
    resetRoomUnread(room.id);

    const handleNewMessage = (msg) => {
      // only for THIS room
      if (Number(msg.room_id) !== Number(room.id)) return;

      // ✅ Ignore my own message (already appended locally by handleSend)
      if (Number(msg.sender_id) === userId) return;

      setMessages((prev) => [
        ...prev,
        {
          ...msg,
          sender_name: msg.sender_name || getOtherParticipantName(),
        },
      ]);

      // ✅ KEY FIX: if chat is open, mark it read instantly
      socket.emit('mark_read', { roomId: room.id });
      resetRoomUnread(room.id);
    };

    const handleMessagesRead = ({ roomId, readerId }) => {
      if (Number(roomId) !== Number(room.id)) return;
      if (Number(readerId) === userId) return;

      setMessages((prev) =>
        prev.map((m) =>
          Number(m.sender_id) === userId ? { ...m, is_read: 1 } : m
        )
      );
    };

    const handleUserTyping = ({ roomId, userName }) => {
      if (Number(roomId) !== Number(room.id)) return;
      setTypingUsers((prev) => [...new Set([...prev, userName])]);
    };

    const handleUserStopTyping = ({ roomId, userName }) => {
      if (Number(roomId) !== Number(room.id)) return;
      setTypingUsers((prev) => prev.filter((u) => u !== userName));
    };

    socket.on('new_message', handleNewMessage);
    socket.on('messages_read', handleMessagesRead);
    socket.on('user_typing', handleUserTyping);
    socket.on('user_stop_typing', handleUserStopTyping);

    return () => {
      mounted = false;
      socket.off('new_message', handleNewMessage);
      socket.off('messages_read', handleMessagesRead);
      socket.off('user_typing', handleUserTyping);
      socket.off('user_stop_typing', handleUserStopTyping);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, socket, userId]);

  // ✅ Safety: when tab becomes visible / focused, mark read again
  useEffect(() => {
    if (!fullRoom?.id || !socket) return;

    const onFocus = () => markRoomReadNow();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') markRoomReadNow();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullRoom?.id, socket]);

  /* Auto-scroll */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: messages.length > 10 ? 'auto' : 'smooth',
    });
  }, [messages]);

  const handleSend = () => {
    const text = newMessage.trim();
    if (!text || !fullRoom?.id) return;

    const tempMsg = {
      id: Date.now(),
      room_id: fullRoom.id,
      sender_id: userId,
      sender_name: 'You',
      message: text,
      created_at: new Date().toISOString(),
      is_read: 0,
    };

    setMessages((prev) => [...prev, tempMsg]);
    setNewMessage('');

    socket.emit('send_message', { roomId: fullRoom.id, message: text });
    socket.emit('stop_typing', { roomId: fullRoom.id, userName: 'You' });
  };

  const handleTyping = (e) => {
    setNewMessage(e.target.value);

    if (!fullRoom?.id) return;
    socket.emit('typing', { roomId: fullRoom.id, userName: 'You' });

    clearTimeout(handleTyping.timeout);
    handleTyping.timeout = setTimeout(() => {
      socket.emit('stop_typing', { roomId: fullRoom.id, userName: 'You' });
    }, 3000);
  };

  return (
    <div className={inWidget ? 'chat-widget-inner' : 'chat-modal-overlay'}>
      <div className={`chat-modal ${inWidget ? 'in-widget' : ''}`}>
        {/* Context banner */}
        {contextInfo && (
          <div className="chat-context-banner-centered">
            <div className="context-icon">
              {fullRoom?.context_type === 'appointment' ? (
                <Calendar size={18} />
              ) : (
                <Tag size={18} />
              )}
            </div>

            <div className="context-details">
              <strong>{contextInfo.service_name || contextInfo.name}</strong>

              <div className="context-meta">
                {fullRoom?.context_type === 'appointment' ? (
                  <>
                    <span>
                      <Clock size={12} />
                      {new Date(contextInfo.appointment_date).toLocaleString()}
                    </span>
                    <span className="status-tag">{contextInfo.status}</span>
                  </>
                ) : (
                  fullRoom?.context_type !== 'profile' && (
                    <span>
                      KES {Number(contextInfo.price).toLocaleString()} •
                      {contextInfo.duration ? ` ${contextInfo.duration} mins` : ' Duration N/A'}
                    </span>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        <div className="chat-messages">
          <div className="chat-start-notice">Messages expire after 12 hours.</div>

          {messages.map((msg) => {
            const isMe = Number(msg.sender_id) === userId;
            return (
              <div key={msg.id} className={`msg ${isMe ? 'sent' : 'received'}`}>
                <p className="msg-text">{msg.message}</p>
                <div className="msg-footer">
                  <span className="time">
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {isMe && (
                    <span className="read-indicator">
                      {msg.is_read ? <CheckCircle size={12} /> : <Check size={12} />}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {typingUsers.length > 0 && (
            <div className="typing-bubble-container">
              <div className="typing-bubble">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input">
          <input
            type="text"
            value={newMessage}
            onChange={handleTyping}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={`Message ${getOtherParticipantName()}...`}
          />
          <button onClick={handleSend} className="send-btn">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatModal;
