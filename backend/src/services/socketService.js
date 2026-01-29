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

  // Authenticate socket connections
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

    // 1. Mark as Online Locally
    onlineUsers.add(userId);
    socket.join(`user:${userId}`);

    // 2. ✅ UPDATE LAST SEEN ON CONNECT
    // This ensures we have a valid timestamp even if the user crashes/closes tab without clean disconnect
    const now = new Date().toISOString();
    db.run(
      `UPDATE users SET last_seen = ? WHERE id = ?`,
      [now, userId],
      (err) => {
        if (err) console.error("Error updating connect time:", err);
      },
    );

    // 3. Broadcast online status
    io.emit("online_users", Array.from(onlineUsers));
    socket.broadcast.emit("user_connected", userId);

    // Join chat room
    socket.on("join_room", ({ roomId }) => {
      socket.join(`room:${roomId}`);
    });

    // Send message
    socket.on("send_message", ({ roomId, message }) => {
      const senderId = userId;

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

          const msgTime = new Date().toISOString();
          const expiresAt = new Date(
            Date.now() + 12 * 60 * 60 * 1000,
          ).toISOString();

          db.run(
            `INSERT INTO chat_messages (room_id, sender_id, message, expires_at, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [roomId, senderId, message, expiresAt, msgTime],
            function (insertErr) {
              if (insertErr) {
                console.error(insertErr);
                return socket.emit("error", { message: "Failed to send" });
              }

              db.run(`UPDATE chat_rooms SET last_message_at = ? WHERE id = ?`, [
                msgTime,
                roomId,
              ]);

              const senderName =
                senderId === room.client_id
                  ? room.client_name
                  : room.provider_name || room.business_name;

              const messageData = {
                id: this.lastID,
                room_id: roomId,
                sender_id: senderId,
                sender_name: senderName,
                message,
                created_at: msgTime,
                expires_at: expiresAt,
              };

              io.to(`room:${roomId}`).emit("new_message", messageData);

              const recipientId =
                senderId === room.client_id ? room.provider_id : room.client_id;
              io.to(`user:${recipientId}`).emit("unread_count_update");

              if (!onlineUsers.has(Number(recipientId))) {
                const recipientPhone =
                  senderId === room.client_id
                    ? room.provider_phone
                    : room.client_phone;
                const rawPrefs =
                  senderId === room.client_id
                    ? room.provider_prefs
                    : room.client_prefs;

                let prefs = {};
                try {
                  if (rawPrefs) prefs = JSON.parse(rawPrefs);
                } catch (e) {}

                if (prefs.chat_msg !== false && recipientPhone) {
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
            io.to(`room:${roomId}`).emit("messages_read", {
              roomId,
              readerId: userId,
            });
          }
        },
      );
    });

    socket.on("typing", ({ roomId, userName }) => {
      socket.to(`room:${roomId}`).emit("user_typing", { roomId, userName });
    });

    socket.on("stop_typing", ({ roomId, userName }) => {
      socket
        .to(`room:${roomId}`)
        .emit("user_stop_typing", { roomId, userName });
    });

    socket.on("disconnect", () => {
      console.log(`❌ User ${userId} disconnected`);
      const disconnectTime = new Date().toISOString();

      // ✅ UPDATE LAST SEEN ON DISCONNECT
      db.run(
        `UPDATE users SET last_seen = ? WHERE id = ?`,
        [disconnectTime, userId],
        (err) => {
          if (err) console.error("Error updating last_seen:", err);
        },
      );

      onlineUsers.delete(userId);

      io.emit("online_users", Array.from(onlineUsers));
      io.emit("user_disconnected", { userId, lastSeen: disconnectTime });
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};
