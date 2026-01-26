/* backend/src/server.js */
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import cron from "node-cron";
import { createServer } from "http"; // ✅ Added for Socket.IO
import { db } from "./config/database.js";
import { initializeSocket } from "./services/socketService.js"; // ✅ Added for Socket.IO

// Import routes
import authRoutes from "./routes/auth.js";
import serviceRoutes from "./routes/services.js";
import appointmentRoutes from "./routes/appointments.js";
import notificationRoutes from "./routes/notifications.js";
import analyticsRoutes from "./routes/analytics.js";
import chatRoutes from "./routes/chat.js"; // ✅ Added Chat Routes
import favoritesRoutes from "./routes/favorites.js"; // ✅ Added Favorites Routes

// ✅ Import SMS Scheduled Reminders
import { sendScheduledReminders } from "./services/smsService.js";
// ✅ Import Notification Service for Cron Jobs
import { createNotification } from "./services/notificationService.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ CREATE HTTP SERVER
const httpServer = createServer(app);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/insights", analyticsRoutes);
app.use("/api/chat", chatRoutes); // ✅ Mounted Chat Routes
app.use("/api/favorites", favoritesRoutes); // ✅ Mounted Favorites Routes

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Schedula API is running",
    timestamp: new Date().toISOString(),
  });
});

// ✅ INITIALIZE SOCKET.IO
initializeSocket(httpServer);

// ✅ Auto-cleanup expired chat messages (Runs hourly)
cron.schedule("0 * * * *", () => {
  db.run(
    `DELETE FROM chat_messages WHERE expires_at < datetime('now')`,
    (err) => {
      if (err) console.error("❌ Cleanup Error:", err);
      else console.log("🧹 12-hour cleanup: Expired messages deleted");
    },
  );
});

// ✅ Auto-cancel past pending appointments function
const autoCancelPastAppointments = async () => {
  try {
    await db.run(`
      UPDATE appointments
      SET status = 'cancelled'
      WHERE status = 'pending'
      AND datetime(appointment_date) < datetime('now')
    `);
    console.log("🕒 Auto-cancelled past pending appointments");
  } catch (error) {
    console.error("❌ Error auto-cancelling appointments:", error);
  }
};

/* =====================================================
   ⏰ BACKGROUND SCHEDULER (Cron Jobs)
===================================================== */

// 1. SMS Reminders (Every 10 mins)
cron.schedule("*/10 * * * *", async () => {
  console.log("🔔 CRON: Checking for SMS reminders...");
  try {
    await sendScheduledReminders();
  } catch (error) {
    console.error("❌ SMS Scheduler Error:", error);
  }
});

// 2. Chat Expiry Warning (Every 10 mins)
// Warns users 1 hour before messages disappear
cron.schedule("*/10 * * * *", () => {
  const startWindow = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // Now + 1h
  const endWindow = new Date(Date.now() + 70 * 60 * 1000).toISOString(); // Now + 1h 10m

  db.all(
    `SELECT DISTINCT m.room_id, m.sender_id, r.client_id, r.provider_id 
     FROM chat_messages m
     JOIN chat_rooms r ON m.room_id = r.id
     WHERE m.expires_at BETWEEN ? AND ?`,
    [startWindow, endWindow],
    (err, rows) => {
      if (err || !rows) return;

      const notifiedRooms = new Set();

      rows.forEach((row) => {
        if (notifiedRooms.has(row.room_id)) return;

        // Notify the recipient (the person who didn't send the message)
        const recipientId =
          row.sender_id === row.client_id ? row.provider_id : row.client_id;

        createNotification(
          recipientId,
          "system",
          "Chat Expiring Soon",
          "Messages in your chat will expire and disappear in about 1 hour.",
          row.room_id,
        );

        notifiedRooms.add(row.room_id);
      });
    },
  );
});

// 3. Morning Brief for Providers (Daily at 7:00 AM)
cron.schedule("0 7 * * *", () => {
  console.log("☀️ CRON: Sending Morning Briefs...");
  db.all(
    `SELECT provider_id, COUNT(*) as count, MIN(appointment_date) as first_appt 
     FROM appointments 
     WHERE date(appointment_date) = date('now') 
     AND status = 'scheduled'
     GROUP BY provider_id`,
    [],
    (err, rows) => {
      if (err || !rows) return;
      rows.forEach((row) => {
        const time = new Date(row.first_appt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        createNotification(
          row.provider_id,
          "system",
          "Morning Brief ☀️",
          `Good morning! You have ${row.count} appointments today. The first one starts at ${time}.`,
        );
      });
    },
  );
});

// 4. Cleanup Tasks (Hourly)
cron.schedule("0 * * * *", async () => {
  console.log("🧹 CRON: Running cleanup tasks...");
  try {
    await autoCancelPastAppointments();
  } catch (error) {
    console.error("❌ Cleanup Scheduler Error:", error);
  }
});

// ---------------------------------------------------------

console.log("🚀 Initializing background tasks...");
autoCancelPastAppointments();
sendScheduledReminders();

// ✅ Use httpServer instead of app.listen
httpServer.listen(PORT, () => {
  console.log(`🚀 Schedula backend running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(
    `⏰ Scheduler active: Reminders, Chat Expiry, Morning Brief, Cleanup`,
  );
  console.log(`💬 Socket.IO ready`);
});
