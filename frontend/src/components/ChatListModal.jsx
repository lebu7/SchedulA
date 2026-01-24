/* frontend/src/components/ChatListModal.jsx */
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import api from '../services/auth';
import ChatModal from './ChatModal';
import './ChatListModal.css';

const ChatListModal = ({ onClose }) => {
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [contextInfo, setContextInfo] = useState(null);

  useEffect(() => {
    // Fetch user's rooms
    api.get('/chat/rooms').then(res => setRooms(res.data.rooms));
  }, []);

  const openChat = async (room) => {
    if (room.context_type !== 'profile' && room.context_id) {
      // Fetch details of the appointment or service
      const ctx = await api.get(`/chat/context/${room.context_type}/${room.context_id}`);
      setContextInfo(ctx.data.context);
    }
    setSelectedRoom(room);
  };

  if (selectedRoom) {
    return <ChatModal room={selectedRoom} contextInfo={contextInfo} onClose={() => setSelectedRoom(null)} />;
  }

  return (
    <div className="chat-list-overlay" onClick={onClose}>
      <div className="chat-list-modal" onClick={e => e.stopPropagation()}>
        <div className="chat-list-header">
          <h3>💬 Messages</h3>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div className="chat-list-body">
          {rooms.map(room => (
            <div key={room.id} className="chat-preview" onClick={() => openChat(room)}>
              <div className="preview-info">
                <strong>{room.provider_name || room.client_name}</strong>
                {room.context_type !== 'profile' && <small className="context-label">{room.context_type}</small>}
              </div>
              {room.unread_count > 0 && <span className="badge">{room.unread_count}</span>}
            </div>
          ))}
          {rooms.length === 0 && <p className="empty-msg">No active conversations</p>}
        </div>
      </div>
    </div>
  );
};

export default ChatListModal;