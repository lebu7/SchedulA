/* backend/src/services/socketService.js */
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { db } from "../config/database.js";

let io;

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
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error"));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userType = decoded.user_type;
      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`✅ User ${socket.userId} connected to Chat`);

    socket.join(`user:${socket.userId}`);

    // ✅ Step 7: Updated join_room to provide enriched room info
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
        [roomId, socket.userId, socket.userId],
        (err, room) => {
          if (err || !room) {
            socket.emit("error", { message: "Access denied" });
            return;
          }
          socket.join(`room:${roomId}`);
          // ✅ Send enriched room info back to client
          socket.emit("joined_room", { roomId, roomInfo: room });
        },
      );
    });

    socket.on("send_message", async ({ roomId, message }) => {
      db.get(
        `SELECT * FROM chat_rooms WHERE id = ? AND (client_id = ? OR provider_id = ?)`,
        [roomId, socket.userId, socket.userId],
        (err, room) => {
          if (err || !room) {
            socket.emit("error", { message: "Invalid room" });
            return;
          }

          const expiresAt = new Date(
            Date.now() + 12 * 60 * 60 * 1000,
          ).toISOString();

          db.run(
            `INSERT INTO chat_messages (room_id, sender_id, message, expires_at) VALUES (?, ?, ?, ?)`,
            [roomId, socket.userId, message, expiresAt],
            function (insertErr) {
              if (insertErr)
                return socket.emit("error", { message: "Failed to send" });

              db.run(
                `UPDATE chat_rooms SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [roomId],
              );

              const messageData = {
                id: this.lastID,
                room_id: roomId,
                sender_id: socket.userId,
                message,
                created_at: new Date().toISOString(),
                expires_at: expiresAt,
              };

              io.to(`room:${roomId}`).emit("new_message", messageData);
              const recipientId =
                room.client_id === socket.userId
                  ? room.provider_id
                  : room.client_id;
              io.to(`user:${recipientId}`).emit("unread_count_update");
            },
          );
        },
      );
    });

    socket.on("mark_read", ({ roomId }) => {
      db.run(
        `UPDATE chat_messages SET is_read = 1 WHERE room_id = ? AND sender_id != ?`,
        [roomId, socket.userId],
      );
    });

    socket.on("disconnect", () => {
      console.log(`❌ User ${socket.userId} disconnected from Chat`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};
