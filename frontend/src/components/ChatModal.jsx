/* frontend/src/components/ChatModal.jsx */
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
  const userId = parseInt(localStorage.getItem('userId'));

// ✅ FIXED: Determine other participant's info
const otherParticipant = room.client_id === userId 
  ? { name: room.provider_name || room.business_name, type: 'provider' }
  : { name: room.client_name, type: 'client' };

useEffect(() => {
  if (!room) return;

  // Fetch existing messages and enrich with correct sender names
  api.get(`/chat/rooms/${room.id}/messages`).then(res => {
    const enrichedMessages = res.data.messages.map(msg => ({
      ...msg,
      // ✅ FIX: Show correct sender name
      sender_name: msg.sender_id === userId ? 'You' : otherParticipant.name
    }));
    setMessages(enrichedMessages);
  });

  socket?.emit('join_room', { roomId: room.id });

  socket?.on('new_message', (msg) => {
    if (msg.room_id === room.id) {
      const enriched = {
        ...msg,
        // ✅ FIX: Show correct sender name for real-time messages
        sender_name: msg.sender_id === userId ? 'You' : otherParticipant.name
      };
      setMessages(prev => [...prev, enriched]);
    }
  });

  socket?.emit('mark_read', { roomId: room.id });

  return () => {
    socket?.off('new_message');
  };
}, [room, socket, userId, otherParticipant.name]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!newMessage.trim()) return;
    socket?.emit('send_message', { roomId: room.id, message: newMessage });
    setNewMessage('');
  };

  return (
    // ✅ Apply conditional overlay class based on inWidget prop
    <div className={inWidget ? "chat-widget-inner" : "chat-modal-overlay"} onClick={!inWidget ? onClose : undefined}>
      <div className={inWidget ? "chat-modal in-widget" : "chat-modal"} onClick={e => e.stopPropagation()}>
        
        {/* HEADER - Show who you're chatting with */}
        <div className="chat-header">
          <div>
            <h3>💬 {otherParticipant.name}</h3>
            <small className="participant-type">
              {otherParticipant.type === 'provider' ? 'Service Provider' : 'Client'}
            </small>
          </div>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* CONTEXTUAL BANNER */}
        {contextInfo && (
          <div className="chat-context-banner">
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

        {/* MESSAGES - Now with sender names and visual alignment */}
        <div className="chat-messages">
          <div className="chat-start-notice">Messages expire after 12 hours.</div>
          {messages.map(msg => (
            <div key={msg.id} className={`msg ${msg.sender_id === userId ? 'sent' : 'received'}`}>
              <span className="msg-sender">{msg.sender_name}</span>
              <p className="msg-text">{msg.message}</p>
              <span className="time">
                {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* INPUT AREA */}
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