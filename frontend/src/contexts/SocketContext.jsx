/* frontend/src/contexts/SocketContext.jsx */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children, user }) => {
  const [socket, setSocket] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState(new Set()); // ✅ Track online users

  useEffect(() => {
    if (!user) return;

    const socketUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    
    const newSocket = io(socketUrl, {
      auth: { token: localStorage.getItem('token') }
    });

    newSocket.on('connect', () => {
      console.log('✅ Connected to real-time chat');
    });

    // ✅ Listen for Online Status Events
    newSocket.on('online_users', (users) => {
      setOnlineUsers(new Set(users)); // Initialize list
    });

    newSocket.on('user_connected', (userId) => {
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        newSet.add(userId);
        return newSet;
      });
    });

    newSocket.on('user_disconnected', (userId) => {
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    });

    // Listen for unread updates
    newSocket.on('unread_count_update', () => {
      fetchUnreadCount();
    });

    setSocket(newSocket);

    return () => {
      newSocket.off('connect');
      newSocket.off('online_users');
      newSocket.off('user_connected');
      newSocket.off('user_disconnected');
      newSocket.off('unread_count_update');
      newSocket.close();
    };
  }, [user]);

  const fetchUnreadCount = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/chat/unread-count`, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')}` 
        }
      });
      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.count);
      }
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  };

  useEffect(() => {
    if (user) fetchUnreadCount();
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket, unreadCount, setUnreadCount, fetchUnreadCount, onlineUsers }}>
      {children}
    </SocketContext.Provider>
  );
};