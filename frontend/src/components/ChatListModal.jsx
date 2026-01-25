/* frontend/src/components/ChatListModal.jsx */
import React, { useState, useEffect } from 'react';
import { X, Check, CheckCircle, MessageCircle } from 'lucide-react';
import api from '../services/auth';
import ChatModal from './ChatModal';
import './ChatListModal.css';

const ChatListModal = ({ onClose, inWidget = false, onRoomSelect }) => {
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [contextInfo, setContextInfo] = useState(null);
  const userId = Number(localStorage.getItem('userId'));

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchRooms = async () => {
    try {
      const res = await api.get('/chat/rooms');
      setRooms(res.data.rooms || []);
    } catch (err) {
      console.error('Failed to fetch chat rooms', err);
    }
  };

  const openChat = async (room) => {
    let fetchedContext = null;

    // 1. Fetch context data FIRST so it's ready to pass
    if (room.context_type !== 'profile' && room.context_id) {
      try {
        const ctx = await api.get(`/chat/context/${room.context_type}/${room.context_id}`);
        fetchedContext = ctx.data.context; // Capture data to pass up
        setContextInfo(fetchedContext);    // Set local state for overlay mode
      } catch (err) {
        console.error("Failed to load context", err);
      }
    }

    // 2. Mark as read
    if (room.unread_count > 0) {
      try {
        await api.put(`/chat/rooms/${room.id}/mark-read`);
        setRooms(prev => prev.map(r => r.id === room.id ? { ...r, unread_count: 0 } : r));
      } catch (err) { console.error(err); }
    }

    const recipientName = room.client_id === userId
      ? room.provider_name || room.business_name
      : room.client_name;

    // 3. Handle navigation
    if (inWidget && onRoomSelect) {
      // ✅ FIXED: Pass the actually fetchedContext instead of null
      onRoomSelect({ 
        ...room, 
        contextInfo: fetchedContext 
      }, recipientName); 
    } else {
      setSelectedRoom(room);
    }
  };

  if (selectedRoom && !inWidget) {
    return (
      <ChatModal
        room={selectedRoom}
        contextInfo={contextInfo}
        onClose={() => setSelectedRoom(null)}
        inWidget={false}
      />
    );
  }

  const content = (
    <div className={`chat-list ${inWidget ? 'widget-mode' : ''}`}>
      {rooms.length === 0 && (
        <div className="empty-msg" style={{ padding: '40px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <MessageCircle size={40} color="#cbd5e1" style={{ marginBottom: '10px' }} />
          <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 5px 0' }}>No conversations yet</p>
          <small style={{ color: '#cbd5e1', fontSize: '12px' }}>
            Start chatting from appointment or service pages
          </small>
        </div>
      )}

      {rooms.map(room => {
        const lastMsg = room.last_message || {};
        const isUnread = room.unread_count > 0;
        const time = lastMsg.created_at ? new Date(lastMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' }) : '';
        const sender = lastMsg.sender_id === userId ? 'You' : (room.client_id === userId ? room.provider_name || room.business_name : room.client_name);
        const recipientName = room.client_id === userId ? room.provider_name || room.business_name : room.client_name;

        return (
          <div
            key={room.id}
            className={`chat-preview ${isUnread ? 'unread' : ''}`}
            onClick={() => openChat(room)}
          >
            <div className="preview-info">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong className="participant-name">{recipientName}</strong>
                <span className="time">{time}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                <small className="last-message" style={{ color: isUnread ? '#1e293b' : '#64748b', fontWeight: isUnread ? 600 : 400 }}>
                  {lastMsg.message ? (sender + ': ' + (lastMsg.message.length > 30 ? lastMsg.message.substring(0, 30) + '…' : lastMsg.message)) : 'No messages yet'}
                </small>
                {isUnread ? <span className="badge">{room.unread_count}</span> : <span className="read-status" style={{ opacity: 0.5 }}><Check size={14} /></span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return inWidget ? content : (
    <div className="chat-list-overlay" onClick={onClose}>
      <div className="chat-list-modal" onClick={e => e.stopPropagation()}>
        <div className="chat-list-header">
          <h3>💬 Messages</h3>
          <button onClick={onClose} className="close-btn"><X size={20} /></button>
        </div>
        <div className="chat-list-body">{content}</div>
      </div>
    </div>
  );
};

export default ChatListModal;