/* frontend/src/components/ChatModal.jsx */
import React, { useState, useEffect, useRef } from 'react';
import { Send, Calendar, Clock, Tag, Check, CheckCircle } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import api from '../services/auth';
import './ChatModal.css';

const ChatModal = ({ room, contextInfo, onClose, inWidget = false }) => {
  const { socket, resetRoomUnread } = useSocket();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);

  const userId = Number(localStorage.getItem('userId'));

  const otherParticipant = room.client_id === userId
    ? { name: room.provider_name || room.business_name, type: 'provider' }
    : { name: room.client_name, type: 'client' };

  useEffect(() => {
    if (room?.id) resetRoomUnread(room.id);
  }, [room?.id, resetRoomUnread]);

  useEffect(() => {
    if (!room) return;

    let isMounted = true;

    api.get(`/chat/rooms/${room.id}/messages`).then(res => {
      if (!isMounted) return;
      const processed = res.data.messages.map(msg => ({
        ...msg,
        sender_name: Number(msg.sender_id) === userId ? 'You' : otherParticipant.name
      }));
      setMessages(processed);
    });

    socket?.emit('join_room', { roomId: room.id });

    const handleNewMessage = (msg) => {
      if (msg.room_id === room.id && Number(msg.sender_id) !== userId) {
        setMessages(prev => [...prev, {
          ...msg,
          sender_name: otherParticipant.name
        }]);
      }
    };

    const handleMessagesRead = ({ roomId, readerId }) => {
      if (roomId === room.id && Number(readerId) !== userId) {
        setMessages(prev => prev.map(msg => ({ ...msg, is_read: 1 })));
      }
    };

    socket?.on('new_message', handleNewMessage);
    socket?.on('messages_read', handleMessagesRead);

    socket?.emit('mark_read', { roomId: room.id });

    return () => {
      isMounted = false;
      socket?.off('new_message', handleNewMessage);
      socket?.off('messages_read', handleMessagesRead);
    };
  }, [room, socket, userId, otherParticipant.name]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ 
        behavior: messages.length > 10 ? 'auto' : 'smooth',
        block: 'end'
      });
    }
  }, [messages]);

  const handleSend = () => {
    const text = newMessage.trim();
    if (!text) return;

    const tempMsg = {
      id: Date.now(),
      room_id: room.id,
      sender_id: userId,
      sender_name: 'You',
      message: text,
      created_at: new Date().toISOString(),
      is_read: false
    };
    setMessages(prev => [...prev, tempMsg]);

    socket?.emit('send_message', { roomId: room.id, message: text });
    setNewMessage('');
  };

  return (
    <div className={inWidget ? "chat-widget-inner" : "chat-modal-overlay"}>
      <div className={`chat-modal ${inWidget ? 'in-widget' : ''}`}>
        
        {/* ✅ Context Banner with proper duration and price formatting */}
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
                  <span>
                    KES {Number(contextInfo.price).toLocaleString()} • 
                    {contextInfo.duration ? ` ${contextInfo.duration} mins` : ' Duration N/A'}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="chat-messages">
          <div className="chat-start-notice">Messages expire after 12 hours.</div>
          {messages.map(msg => {
            const isMe = Number(msg.sender_id) === userId;
            return (
              <div key={msg.id} className={`msg ${isMe ? 'sent' : 'received'}`}>
                <p className="msg-text">{msg.message}</p>
                <div className="msg-footer">
                  <span className="time">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
          <div ref={messagesEndRef} />
        </div>

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