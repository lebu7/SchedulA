/* frontend/src/contexts/SocketContext.jsx */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children, user }) => {
  const [socket, setSocket] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // ✅ Initialize Socket and Global Listeners
  useEffect(() => {
    if (!user) return;

    // Use environment variable or fallback to localhost
    const socketUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    
    const newSocket = io(socketUrl, {
      auth: { token: localStorage.getItem('token') }
    });

    newSocket.on('connect', () => {
      console.log('✅ Connected to real-time chat');
    });

    // Listen for global unread updates (e.g., when a message arrives in any room)
    newSocket.on('unread_count_update', () => {
      fetchUnreadCount();
    });

    setSocket(newSocket);

    // Cleanup on logout or unmount
    return () => {
      newSocket.off('connect');
      newSocket.off('unread_count_update');
      newSocket.close();
    };
  }, [user]);

  // ✅ Fetch unread count via REST API
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

  // Initial fetch when user logs in
  useEffect(() => {
    if (user) fetchUnreadCount();
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket, unreadCount, setUnreadCount, fetchUnreadCount }}>
      {children}
    </SocketContext.Provider>
  );
};