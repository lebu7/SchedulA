/* frontend/src/components/ChatModal.jsx */
import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Calendar, Clock, Tag } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import api from '../services/auth';
import './ChatModal.css';

const ChatModal = ({ room, contextInfo, onClose }) => {
  const { socket } = useSocket();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);
  const userId = parseInt(localStorage.getItem('userId'));

  useEffect(() => {
    if (!room) return;

    // Fetch existing messages
    api.get(`/chat/rooms/${room.id}/messages`).then(res => {
      setMessages(res.data.messages);
    });

    // Join room
    socket?.emit('join_room', { roomId: room.id });

    // Listen for new messages
    socket?.on('new_message', (msg) => {
      if (msg.room_id === room.id) {
        setMessages(prev => [...prev, msg]);
      }
    });

    // Mark as read
    socket?.emit('mark_read', { roomId: room.id });

    return () => {
      socket?.off('new_message');
    };
  }, [room, socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!newMessage.trim()) return;
    // Send message via socket
    socket?.emit('send_message', { roomId: room.id, message: newMessage });
    setNewMessage('');
  };

  return (
    <div className="chat-modal-overlay" onClick={onClose}>
      <div className="chat-modal" onClick={e => e.stopPropagation()}>
        {/* HEADER */}
        <div className="chat-header">
          <div>
            <h3>💬 {room.provider_name || room.client_name || room.business_name}</h3>
          </div>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* ✅ ADDED: CONTEXTUAL BANNER */}
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

        {/* MESSAGES */}
        <div className="chat-messages">
          <div className="chat-start-notice">Messages expire after 12 hours.</div>
          {messages.map(msg => (
            <div key={msg.id} className={`msg ${msg.sender_id === userId ? 'sent' : 'received'}`}>
              <p>{msg.message}</p>
              <span className="time">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* INPUT */}
        <div className="chat-input">
          <input 
            type="text" 
            value={newMessage} 
            onChange={e => setNewMessage(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
          />
          <button onClick={handleSend} className="send-btn"><Send size={18} /></button>
        </div>
      </div>
    </div>
  );
};

export default ChatModal;