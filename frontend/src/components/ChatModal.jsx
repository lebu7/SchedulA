import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Calendar, Clock, Tag } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import api from '../services/auth';
import './ChatModal.css';

const ChatModal = ({ room, contextInfo, onClose, inWidget = false }) => {
  const { socket } = useSocket();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);

  const userId = Number(localStorage.getItem('userId'));

  // Determine other participant
  const otherParticipant = room.client_id === userId
    ? { name: room.provider_name || room.business_name, type: 'provider' }
    : { name: room.client_name, type: 'client' };

  // Fetch messages + socket listeners
  useEffect(() => {
    if (!room) return;

    let isMounted = true;

    // Fetch existing messages
    api.get(`/chat/rooms/${room.id}/messages`).then(res => {
      if (!isMounted) return;
      const processed = res.data.messages.map(msg => ({
        ...msg,
        sender_name: Number(msg.sender_id) === userId ? 'You' : otherParticipant.name
      }));
      setMessages(processed);
    });

    // Join room
    socket?.emit('join_room', { roomId: room.id });

    // Listen for new messages
    const handleNewMessage = (msg) => {
      if (msg.room_id === room.id && Number(msg.sender_id) !== userId) {
        setMessages(prev => [...prev, {
          ...msg,
          sender_name: otherParticipant.name
        }]);
      }
    };

    socket?.on('new_message', handleNewMessage);

    // Mark as read
    socket?.emit('mark_read', { roomId: room.id });

    return () => {
      isMounted = false;
      socket?.off('new_message', handleNewMessage);
    };
  }, [room, socket, userId, otherParticipant.name]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle sending
  const handleSend = () => {
    const text = newMessage.trim();
    if (!text) return;

    // Optimistic update
    const tempMsg = {
      id: Date.now(),
      room_id: room.id,
      sender_id: userId,
      sender_name: 'You',
      message: text,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempMsg]);

    // Emit message to server
    socket?.emit('send_message', { roomId: room.id, message: text });

    setNewMessage('');
  };

  return (
    <div className={(inWidget || !inWidget) ? "chat-widget-inner" : "chat-modal-overlay"}>
      <div className="chat-modal in-widget">
        {/* HEADER */}
        <div className="chat-header chat-header-custom">
          <div className="recipient-info">
            <h3>{otherParticipant.name}</h3>
            <small className="participant-type">
              {otherParticipant.type === 'provider' ? 'Service Provider' : 'Client'}
            </small>
          </div>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* CONTEXT BANNER AT TOP */}
        {contextInfo && (
          <div className="chat-context-banner-centered">
            <div className="context-icon">
              {room.context_type === 'appointment' ? <Calendar size={18} /> : <Tag size={18} />}
            </div>
            <div className="context-details">
              <strong>{contextInfo.service_name || contextInfo.name}</strong>
              <div className="context-meta">
                {room.context_type === 'appointment' ? (
                  <>
                    <span><Clock size={12} /> {new Date(contextInfo.appointment_date).toLocaleString()}</span>
                    <span className="status-tag">{contextInfo.status}</span>
                  </>
                ) : (
                  <span>KES {contextInfo.price} • {contextInfo.duration} mins</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MESSAGES */}
        <div className="chat-messages">
          <div className="chat-start-notice">Messages expire after 12 hours.</div>
          {messages.map(msg => {
            const isMe = Number(msg.sender_id) === userId;
            return (
              <div key={msg.id} className={`msg ${isMe ? 'sent' : 'received'}`}>
                <p className="msg-text">{msg.message}</p>
                <span className="time">
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* INPUT */}
        <div className="chat-input">
          <input
            type="text"
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleSend()}
            placeholder={`Message ${otherParticipant.name}...`}
          />
          <button onClick={handleSend} className="send-btn"><Send size={18} /></button>
        </div>
      </div>
    </div>
  );
};

export default ChatModal;
