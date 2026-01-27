/* frontend/src/components/ChatListModal.jsx */
import React, { useState, useEffect } from 'react';
import { X, Check, MessageCircle, CheckCircle } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import api from '../services/auth';
import ChatModal from './ChatModal';
import './ChatListModal.css';

const ChatListModal = ({ onClose, inWidget = false, onRoomSelect }) => {
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [contextInfo, setContextInfo] = useState(null);
  const userId = Number(localStorage.getItem('userId'));
  const { onlineUsers, socket } = useSocket(); 

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (msg) => {
      setRooms(prev => {
        const roomIndex = prev.findIndex(r => r.id === msg.room_id);
        
        if (roomIndex === -1) {
          fetchRooms();
          return prev;
        }

        const updatedRooms = [...prev];
        const room = { ...updatedRooms[roomIndex] };

        room.last_message = {
          message: msg.message,
          sender_id: msg.sender_id,
          created_at: msg.created_at,
          is_read: 0 
        };

        if (Number(msg.sender_id) !== userId) {
          room.unread_count = (room.unread_count || 0) + 1;
        }

        updatedRooms.splice(roomIndex, 1);
        updatedRooms.unshift(room);
        
        return updatedRooms;
      });
    };

    const handleMessagesRead = ({ roomId, readerId }) => {
      setRooms(prev => prev.map(room => {
        if (room.id !== roomId) return room;

        if (Number(readerId) !== userId && room.last_message && Number(room.last_message.sender_id) === userId) {
           return {
             ...room,
             last_message: { ...room.last_message, is_read: 1 }
           };
        }
        
        if (Number(readerId) === userId) {
           return { ...room, unread_count: 0 };
        }

        return room;
      }));
    };

    socket.on('new_message', handleNewMessage);
    socket.on('messages_read', handleMessagesRead);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('messages_read', handleMessagesRead);
    };
  }, [socket, userId]);

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

    if (room.context_type !== 'profile' && room.context_id) {
      try {
        const ctx = await api.get(`/chat/context/${room.context_type}/${room.context_id}`);
        fetchedContext = ctx.data.context;
        setContextInfo(fetchedContext);
      } catch (err) {
        console.error("Failed to load context", err);
      }
    } else {
      setContextInfo(null);
    }

    if (room.unread_count > 0) {
      try {
        socket?.emit('mark_read', { roomId: room.id });
        setRooms(prev => prev.map(r => r.id === room.id ? { ...r, unread_count: 0 } : r));
      } catch (err) { console.error(err); }
    }

    const recipientName = room.client_id === userId
      ? room.provider_name || room.business_name
      : room.client_name;

    // ✅ Pass the room object (containing client_last_seen/provider_last_seen) to Widget
    if (inWidget && onRoomSelect) {
      onRoomSelect({ ...room, contextInfo: fetchedContext }, recipientName);
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
        <div className="empty-msg">
          <MessageCircle size={40} color="#cbd5e1" />
          <p>No conversations yet</p>
          <small>Start chatting from appointment or service pages</small>
        </div>
      )}

      {rooms.map(room => {
        const lastMsg = room.last_message || {};
        const isUnread = room.unread_count > 0;
        const isMe = Number(lastMsg.sender_id) === userId;

        const time = lastMsg.created_at 
          ? new Date(lastMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' }) 
          : '';
        
        const sender = isMe
          ? 'You' 
          : (room.client_id === userId ? room.provider_name || room.business_name : room.client_name);

        const recipientName = room.client_id === userId
          ? room.provider_name || room.business_name
          : room.client_name;

        const otherUserId = room.client_id === userId ? room.provider_id : room.client_id;
        const isOnline = onlineUsers.has(otherUserId);

        return (
          <div
            key={room.id}
            className={`chat-preview ${isUnread ? 'unread' : ''}`}
            onClick={() => openChat(room)}
          >
            <div className="preview-info">
              <div className="preview-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                  <strong className="participant-name">{recipientName}</strong>
                  {isOnline && <span className="online-dot" title="Online"></span>}
                </div>
                <span className="time">{time}</span>
              </div>
              
              <div className="preview-footer">
                <small className="last-message">
                  {lastMsg.message ? (
                    <>
                      <span className="sender-prefix">{sender}: </span>
                      {lastMsg.message}
                    </>
                  ) : (
                    'No messages yet'
                  )}
                </small>
                
                {isUnread ? (
                   <span className="chat-list-badge">{room.unread_count}</span>
                ) : isMe ? (
                   <span className="read-status-icon">
                     {lastMsg.is_read ? (
                        <CheckCircle size={14} color="#2563eb" /> 
                     ) : (
                        <Check size={14} color="#94a3b8" /> 
                     )}
                   </span>
                ) : null}
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
        <div className="chat-list-body">
          {content}
        </div>
      </div>
    </div>
  );
};

export default ChatListModal;