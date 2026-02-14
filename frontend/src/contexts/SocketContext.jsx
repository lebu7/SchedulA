/* frontend/src/contexts/SocketContext.jsx */
import React, { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children, user }) => {
  const [socket, setSocket] = useState(null);

  // 🔹 Legacy unread (kept for backward compatibility)
  const [unreadCount, setUnreadCount] = useState(0);

  // 🔹 Explicit GLOBAL unread count (dashboard button only)
  const [globalUnreadCount, setGlobalUnreadCount] = useState(0);

  // 🆕 Per-room unread counts (keyed by roomId)
  const [roomUnreadCounts, setRoomUnreadCounts] = useState({});

  const [onlineUsers, setOnlineUsers] = useState(new Set());

  // Fetch unread count via REST API (GLOBAL only)
  const fetchUnreadCount = async () => {
    if (!localStorage.getItem("token")) return;

    try {
      const response = await fetch(
        `${
          import.meta.env.VITE_API_URL || "http://localhost:5000"
        }/api/chat/unread-count`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log("🔄 Unread count updated (GLOBAL):", data.count);

        // Keep original state
        setUnreadCount(data.count);

        // Explicit global-only state
        setGlobalUnreadCount(data.count);
      }
    } catch (err) {
      console.error("Failed to fetch unread count:", err);
    }
  };

  // 🆕 Reset unread count for a specific room
  const resetRoomUnread = (roomId) => {
    if (!roomId) return;
    setRoomUnreadCounts((prev) => ({
      ...prev,
      [roomId]: 0,
    }));
  };

  // 🔹 Socket connection & event subscriptions
  useEffect(() => {
    if (!user) return;

    const socketUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";
    const newSocket = io(socketUrl, {
      auth: { token: localStorage.getItem("token") },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

const handlers = {
  connect: () => {
    console.log("✅ Connected to real-time chat");
    fetchUnreadCount();
  },

  unread_count_update: () => {
    console.log("🔔 Received unread update event (GLOBAL)");
    fetchUnreadCount();
  },

  // Per-room increments (supports backend: room_id) + ignores my own outgoing messages
  new_message: (msg) => {
    const roomId = Number(msg?.roomId ?? msg?.room_id);
    if (!roomId) return;

    const myId =
      Number(localStorage.getItem("userId")) ||
      Number(user?.id) ||
      Number(user?.userId);

    if (myId && Number(msg?.sender_id) === myId) return;

    setRoomUnreadCounts((prev) => ({
      ...prev,
      [roomId]: (prev[roomId] || 0) + 1,
    }));
  },

  online_users: (users) => setOnlineUsers(new Set(users)),

  user_connected: (userId) =>
    setOnlineUsers((prev) => new Set(prev).add(Number(userId))),

  // Backend sends: { userId, lastSeen }, but sometimes you may emit just userId
  user_disconnected: (payload) =>
    setOnlineUsers((prev) => {
      const newSet = new Set(prev);
      const id = typeof payload === "object" ? payload.userId : payload;
      newSet.delete(Number(id));
      return newSet;
    }),
};

    Object.keys(handlers).forEach((event) =>
      newSocket.on(event, handlers[event])
    );

    setSocket(newSocket);

    // FALLBACK: Poll every 2 seconds to ensure count is always accurate
    const intervalId = setInterval(fetchUnreadCount, 2000);

    return () => {
      clearInterval(intervalId);
      Object.keys(handlers).forEach((event) => newSocket.off(event));
      newSocket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        unreadCount, // legacy
        globalUnreadCount, // use ONLY on dashboard main button
        roomUnreadCounts, // per room unread count (key: roomId)
        resetRoomUnread, // call when a room opens
        setUnreadCount,
        fetchUnreadCount,
        onlineUsers,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};
