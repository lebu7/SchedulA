import express from "express";
import { db } from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

router.post("/rooms", authenticateToken, (req, res) => {
  const { recipientId, contextType, contextId } = req.body;
  const userId = req.user.userId;
  const userType = req.user.user_type;

  const clientId = userType === "client" ? userId : recipientId;
  const providerId = userType === "provider" ? userId : recipientId;

  if (clientId === providerId) {
    return res
      .status(400)
      .json({ error: "Client and provider cannot be the same user" });
  }

  db.get(
    `SELECT * FROM chat_rooms WHERE client_id = ? AND provider_id = ? AND context_type = ? AND context_id = ?`,
    [clientId, providerId, contextType, contextId || null],
    (err, existing) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (existing) return res.json({ room: existing });

      db.run(
        `INSERT INTO chat_rooms (client_id, provider_id, context_type, context_id)
         VALUES (?, ?, ?, ?)`,
        [clientId, providerId, contextType, contextId || null],
        function (insertErr) {
          if (insertErr)
            return res.status(500).json({ error: "Failed to create room" });

          db.get(
            `SELECT * FROM chat_rooms WHERE id = ?`,
            [this.lastID],
            (getErr, newRoom) => {
              if (getErr)
                return res.status(500).json({ error: "Database error" });
              res.status(201).json({ room: newRoom });
            },
          );
        },
      );
    },
  );
});

router.get("/rooms", authenticateToken, (req, res) => {
  const userId = req.user.userId;

  db.all(
    `SELECT cr.*,

            u1.name as client_name,
            u1.last_seen as client_last_seen,

            u2.name as provider_name,
            u2.business_name as business_name,
            u2.last_seen as provider_last_seen,

            /* ✅ Guaranteed display names */
            COALESCE(NULLIF(u1.name,''), NULLIF(u1.business_name,''), 'Client') as client_display_name,
            COALESCE(NULLIF(u2.business_name,''), NULLIF(u2.name,''), 'Provider') as provider_display_name,

            (SELECT COUNT(*)
              FROM chat_messages
              WHERE room_id = cr.id
                AND sender_id != ?
                AND is_read = 0
                AND expires_at > datetime('now')
            ) as unread_count,

            (SELECT message
              FROM chat_messages
              WHERE room_id = cr.id
                AND expires_at > datetime('now')
              ORDER BY created_at DESC
              LIMIT 1
            ) as last_msg_content,

            (SELECT sender_id
              FROM chat_messages
              WHERE room_id = cr.id
                AND expires_at > datetime('now')
              ORDER BY created_at DESC
              LIMIT 1
            ) as last_msg_sender,

            (SELECT created_at
              FROM chat_messages
              WHERE room_id = cr.id
                AND expires_at > datetime('now')
              ORDER BY created_at DESC
              LIMIT 1
            ) as last_msg_time,

            (SELECT is_read
              FROM chat_messages
              WHERE room_id = cr.id
                AND expires_at > datetime('now')
              ORDER BY created_at DESC
              LIMIT 1
            ) as last_msg_read

     FROM chat_rooms cr
     JOIN users u1 ON cr.client_id = u1.id
     JOIN users u2 ON cr.provider_id = u2.id

     WHERE (cr.client_id = ? OR cr.provider_id = ?)

     /* ✅ IMPORTANT: hide rooms with no messages */
     AND EXISTS (
        SELECT 1 FROM chat_messages m
        WHERE m.room_id = cr.id
          AND m.expires_at > datetime('now')
     )

     ORDER BY cr.last_message_at DESC`,
    [userId, userId, userId],
    (err, rooms) => {
      if (err) return res.status(500).json({ error: "Database error" });

      const formattedRooms = rooms.map((room) => ({
        ...room,
        last_message: room.last_msg_content
          ? {
              message: room.last_msg_content,
              sender_id: room.last_msg_sender,
              created_at: room.last_msg_time,
              is_read: room.last_msg_read,
            }
          : null,
      }));

      res.json({ rooms: formattedRooms });
    },
  );
});

router.get("/rooms/:roomId/messages", authenticateToken, (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.userId;

  db.get(
    `SELECT * FROM chat_rooms WHERE id = ? AND (client_id = ? OR provider_id = ?)`,
    [roomId, userId, userId],
    (err, room) => {
      if (err || !room) return res.status(403).json({ error: "Access denied" });

      db.all(
        `SELECT m.*, u.name as sender_name
         FROM chat_messages m
         JOIN users u ON m.sender_id = u.id
         WHERE m.room_id = ?
           AND m.expires_at > datetime('now')
         ORDER BY m.created_at ASC`,
        [roomId],
        (msgErr, messages) => {
          if (msgErr)
            return res.status(500).json({ error: "Failed to load messages" });
          res.json({ messages });
        },
      );
    },
  );
});

router.get("/context/:type/:id", authenticateToken, (req, res) => {
  const { type, id } = req.params;

  if (type === "appointment") {
    db.get(
      `SELECT a.id, a.appointment_date, a.status, s.name as service_name,
              u.name as provider_name, u.business_name, a.total_price
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       JOIN users u ON a.provider_id = u.id
       WHERE a.id = ?`,
      [id],
      (err, data) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json({ context: data });
      },
    );
  } else if (type === "service") {
    db.get(
      `SELECT s.id, s.name, s.price, s.duration, u.business_name
       FROM services s
       JOIN users u ON s.provider_id = u.id
       WHERE s.id = ?`,
      [id],
      (err, data) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json({ context: data });
      },
    );
  } else {
    res.status(400).json({ error: "Invalid context type" });
  }
});

router.get("/unread-count", authenticateToken, (req, res) => {
  const userId = req.user.userId;

  db.get(
    `SELECT COUNT(*) as count
     FROM chat_messages m
     JOIN chat_rooms r ON m.room_id = r.id
     WHERE (r.client_id = ? OR r.provider_id = ?)
       AND m.sender_id != ?
       AND m.is_read = 0
       AND m.expires_at > datetime('now')`,
    [userId, userId, userId],
    (err, result) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json({ count: result.count });
    },
  );
});

router.get("/status/:userId", authenticateToken, (req, res) => {
  const targetId = req.params.userId;
  db.get(`SELECT last_seen FROM users WHERE id = ?`, [targetId], (err, row) => {
    if (err) return res.status(500).json({ error: "DB Error" });
    if (!row) return res.json({ last_seen: null });
    res.json({ last_seen: row.last_seen });
  });
});

export default router;
