/* backend/src/services/socketService.js */
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { db } from "../config/database.js";
import { sendSMS } from "./smsService.js";

let io;
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

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token"));

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) return next(new Error("Invalid token"));
      const id = user.id || user.userId;
      socket.user = user;
      socket.userId = Number(id);
      next();
    });
  });

  io.on("connection", (socket) => {
    const userId = socket.userId;
    console.log(`✅ User ${userId} connected to Chat`);

    onlineUsers.add(userId);
    socket.join(`user:${userId}`);

    // Broadcast status update
    io.emit("online_users", Array.from(onlineUsers));
    socket.broadcast.emit("user_connected", userId);

    socket.on("join_room", async ({ roomId }) => {
      socket.join(`room:${roomId}`);
    });

    socket.on("send_message", ({ roomId, message }) => {
      const senderId = userId;

      // ✅ Fetch Phone & Prefs for SMS
      db.get(
        `SELECT cr.*, 
                u1.name AS client_name, u1.phone AS client_phone, u1.notification_preferences AS client_prefs,
                u2.name AS provider_name, u2.business_name, u2.phone AS provider_phone, u2.notification_preferences AS provider_prefs
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

          const now = new Date().toISOString();
          const expiresAt = new Date(
            Date.now() + 12 * 60 * 60 * 1000,
          ).toISOString();

          db.run(
            `INSERT INTO chat_messages (room_id, sender_id, message, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?)`,
            [roomId, senderId, message, expiresAt, now],
            function (insertErr) {
              if (insertErr) {
                console.error(insertErr);
                return socket.emit("error", { message: "Failed to send" });
              }

              // ✅ FIX: Update last_message_at to 'now' to prevent early deletion
              db.run(`UPDATE chat_rooms SET last_message_at = ? WHERE id = ?`, [
                now,
                roomId,
              ]);

              const messageData = {
                id: this.lastID,
                room_id: roomId,
                sender_id: senderId,
                sender_name:
                  room.client_id === senderId
                    ? room.client_name
                    : room.provider_name || room.business_name,
                message,
                created_at: now,
                expires_at: expiresAt,
              };

              // Real-time message
              io.to(`room:${roomId}`).emit("new_message", messageData);

              const isSenderClient =
                String(room.client_id) === String(senderId);
              const recipientId = isSenderClient
                ? room.provider_id
                : room.client_id;

              // Unread notification
              io.to(`user:${recipientId}`).emit("unread_count_update");

              // ✅ OFFLINE SMS CHECK
              if (!onlineUsers.has(Number(recipientId))) {
                const recipientPhone = isSenderClient
                  ? room.provider_phone
                  : room.client_phone;
                const rawPrefs = isSenderClient
                  ? room.provider_prefs
                  : room.client_prefs;
                const senderName = messageData.sender_name;

                let prefs = {};
                try {
                  if (rawPrefs) prefs = JSON.parse(rawPrefs);
                } catch (e) {}

                // Default enabled unless explicitly false
                if (prefs.chat_msg !== false && recipientPhone) {
                  console.log(
                    `📴 User ${recipientId} is offline. Sending SMS...`,
                  );
                  const cleanMsg =
                    message.length > 30
                      ? message.substring(0, 30) + "..."
                      : message;
                  const smsText = `New message from ${senderName} on Schedula: "${cleanMsg}". Log in to reply.`;
                  sendSMS(recipientPhone, smsText);
                }
              }
            },
          );
        },
      );
    });

    socket.on("mark_read", ({ roomId }) => {
      db.run(
        `UPDATE chat_messages SET is_read = 1 WHERE room_id = ? AND sender_id != ?`,
        [roomId, userId],
        (err) => {
          if (!err) {
            // ✅ Notify sender that messages were read
            io.to(`room:${roomId}`).emit("messages_read", {
              roomId,
              readerId: userId,
            });
          }
        },
      );
    });

    socket.on("disconnect", () => {
      console.log(`❌ User ${userId} disconnected`);
      onlineUsers.delete(userId);
      // ✅ Broadcast update immediately
      io.emit("online_users", Array.from(onlineUsers));
      io.emit("user_disconnected", userId);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};
