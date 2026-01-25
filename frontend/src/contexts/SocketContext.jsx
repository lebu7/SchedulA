/* frontend/src/contexts/SocketContext.jsx */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children, user }) => {
  const [socket, setSocket] = useState(null);

  // 🔹 Legacy unread (kept for backward compatibility)
  const [unreadCount, setUnreadCount] = useState(0);

  // 🔹 Explicit GLOBAL unread count (dashboard button only)
  const [globalUnreadCount, setGlobalUnreadCount] = useState(0);

  const [onlineUsers, setOnlineUsers] = useState(new Set());

  // Fetch unread count via REST API (GLOBAL only)
  const fetchUnreadCount = async () => {
    if (!localStorage.getItem('token')) return;
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/chat/unread-count`,
        {
          headers: { 
            'Authorization': `Bearer ${localStorage.getItem('token')}` 
          }
        }
      );
      if (response.ok) {
        const data = await response.json();
        console.log('🔄 Unread count updated (GLOBAL):', data.count);

        // Keep original state
        setUnreadCount(data.count);

        // Explicit global-only state
        setGlobalUnreadCount(data.count);
      }
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  };

  useEffect(() => {
    if (!user) return;

    const socketUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    
    const newSocket = io(socketUrl, {
      auth: { token: localStorage.getItem('token') },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    newSocket.on('connect', () => {
      console.log('✅ Connected to real-time chat');
      fetchUnreadCount();
    });

    // Listen for global unread updates
    newSocket.on('unread_count_update', () => {
      console.log('🔔 Received unread update event (GLOBAL)');
      fetchUnreadCount();
    });

    // Online Status Events
    newSocket.on('online_users', (users) => {
      setOnlineUsers(new Set(users));
    });

    newSocket.on('user_connected', (userId) => {
      setOnlineUsers(prev => new Set(prev).add(userId));
    });

    newSocket.on('user_disconnected', (userId) => {
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    });

    setSocket(newSocket);

    // ✅ FALLBACK: Poll every 2 seconds to ensure count is always accurate
    const intervalId = setInterval(fetchUnreadCount, 2000);

    return () => {
      clearInterval(intervalId);
      newSocket.off('connect');
      newSocket.off('unread_count_update');
      newSocket.off('online_users');
      newSocket.off('user_connected');
      newSocket.off('user_disconnected');
      newSocket.close();
    };
  }, [user]);

  return (
    <SocketContext.Provider 
      value={{ 
        socket, 
        unreadCount,            // legacy
        globalUnreadCount,     // 🔹 use ONLY on dashboard main button
        setUnreadCount, 
        fetchUnreadCount, 
        onlineUsers 
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};
