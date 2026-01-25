/* backend/src/services/socketService.js */
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { db } from "../config/database.js";

let io;
// ✅ Track online users (using a Set for unique user IDs)
const onlineUsers = new Set();

export const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin:
        process.env.NODE_ENV === "production"
          ? "https://yourdomain.com"
          : "http://localhost:3000",
      credentials: true,
    },
  });

  // Authentication Middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token"));

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) return next(new Error("Invalid token"));
      socket.user = user;
      socket.userId = Number(user.userId);
      next();
    });
  });

  io.on("connection", (socket) => {
    const userId = socket.userId;
    console.log(`✅ User ${userId} connected to Chat`);

    // ✅ Online Status Logic
    onlineUsers.add(userId);
    socket.join(`user:${userId}`);

    // 1. Send current list of online users to the newly connected user
    socket.emit("online_users", Array.from(onlineUsers));

    // 2. Broadcast to everyone else that this user came online
    socket.broadcast.emit("user_connected", userId);

    socket.on("join_room", async ({ roomId }) => {
      db.get(
        `SELECT cr.*, 
                u1.name AS client_name, 
                u2.name AS provider_name, 
                u2.business_name
         FROM chat_rooms cr
         JOIN users u1 ON cr.client_id = u1.id
         JOIN users u2 ON cr.provider_id = u2.id
         WHERE cr.id = ? AND (cr.client_id = ? OR cr.provider_id = ?)`,
        [roomId, userId, userId],
        (err, room) => {
          if (err || !room) {
            socket.emit("error", { message: "Access denied" });
            return;
          }
          socket.join(`room:${roomId}`);
          socket.emit("joined_room", { roomId, roomInfo: room });
        },
      );
    });

    socket.on("send_message", ({ roomId, message }) => {
      const senderId = userId;

      db.get(
        `SELECT cr.*, 
                u1.name AS client_name, 
                u2.name AS provider_name, 
                u2.business_name
        FROM chat_rooms cr
        JOIN users u1 ON cr.client_id = u1.id
        JOIN users u2 ON cr.provider_id = u2.id
        WHERE cr.id = ? AND (cr.client_id = ? OR cr.provider_id = ?)`,
        [roomId, senderId, senderId],
        (err, room) => {
          if (err || !room) {
            socket.emit("error", { message: "Invalid room" });
            return;
          }

          const expiresAt = new Date(
            Date.now() + 12 * 60 * 60 * 1000,
          ).toISOString();

          db.run(
            `INSERT INTO chat_messages (room_id, sender_id, message, expires_at)
            VALUES (?, ?, ?, ?)`,
            [roomId, senderId, message, expiresAt],
            function (insertErr) {
              if (insertErr) {
                console.error(insertErr);
                return socket.emit("error", { message: "Failed to send" });
              }

              db.run(
                `UPDATE chat_rooms SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [roomId],
              );

              const messageData = {
                id: this.lastID,
                room_id: roomId,
                sender_id: senderId,
                sender_name:
                  room.client_id === senderId
                    ? room.client_name
                    : room.provider_name || room.business_name,
                message,
                created_at: new Date().toISOString(),
                expires_at: expiresAt,
              };

              io.to(`room:${roomId}`).emit("new_message", messageData);

              const recipientId =
                room.client_id === senderId ? room.provider_id : room.client_id;

              io.to(`user:${recipientId}`).emit("unread_count_update");
            },
          );
        },
      );
    });

    socket.on("mark_read", ({ roomId }) => {
      db.run(
        `UPDATE chat_messages SET is_read = 1 WHERE room_id = ? AND sender_id != ?`,
        [roomId, userId],
      );
    });

    socket.on("disconnect", () => {
      console.log(`❌ User ${userId} disconnected from Chat`);
      // ✅ Handle Disconnect
      onlineUsers.delete(userId);
      io.emit("user_disconnected", userId);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};
