import React, { useState, useEffect } from 'react';
import { X, Check, CheckCircle } from 'lucide-react';
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
    if (room.context_type !== 'profile' && room.context_id) {
      const ctx = await api.get(`/chat/context/${room.context_type}/${room.context_id}`);
      setContextInfo(ctx.data.context);
    }

    if (room.unread_count > 0) {
      try {
        await api.put(`/chat/rooms/${room.id}/mark-read`);
        fetchRooms();
      } catch (err) { console.error(err); }
    }

    const recipientName = room.client_id === userId
      ? room.provider_name || room.business_name
      : room.client_name;

    setSelectedRoom(room);
    if (onRoomSelect) onRoomSelect(room, recipientName);
  };

  if (selectedRoom) {
    return (
      <ChatModal
        room={selectedRoom}
        contextInfo={contextInfo}
        onClose={() => setSelectedRoom(null)}
        inWidget={true}
      />
    );
  }

  const content = (
    <div className={`chat-list ${inWidget ? 'widget-mode' : ''}`}>
      {rooms.length === 0 && <p className="empty-msg">No active conversations</p>}
      {rooms.map(room => {
        const lastMsg = room.last_message || {};
        const isUnread = room.unread_count > 0;
        const time = lastMsg.created_at ? new Date(lastMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' }) : '';
        const sender = lastMsg.sender_id === userId ? 'You' : (room.client_id === userId ? room.provider_name || room.business_name : room.client_name);

        const recipientName = room.client_id === userId
          ? room.provider_name || room.business_name
          : room.client_name;

        return (
          <div
            key={room.id}
            className={`chat-preview ${isUnread ? 'unread' : ''}`}
            onClick={() => openChat(room)}
          >
            <div className="preview-info">
              <strong className="participant-name">{recipientName}</strong>
              {lastMsg.message && (
                <small className="last-message">
                  {sender}: {lastMsg.message.length > 35 ? lastMsg.message.substring(0, 35) + '…' : lastMsg.message}
                </small>
              )}
            </div>
            <div className="preview-meta">
              <span className="time">{time}</span>
              <span className="message-count">{room.total_messages || 0}</span>
              {isUnread ? <CheckCircle size={16} className="unread-dot" /> : <Check size={16} className="read-dot" />}
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
          <button onClick={onClose} className="close-btn"><X size={20} /></button>
        </div>
        {content}
      </div>
    </div>
  );
};

export default ChatListModal;
