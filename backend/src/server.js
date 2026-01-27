/* backend/src/server.js */
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import cron from "node-cron";
import { createServer } from "http";
import { db } from "./config/database.js";
import { initializeSocket } from "./services/socketService.js";

// Import routes
import authRoutes from "./routes/auth.js";
import serviceRoutes from "./routes/services.js";
import appointmentRoutes from "./routes/appointments.js";
import notificationRoutes from "./routes/notifications.js";
import analyticsRoutes from "./routes/analytics.js";
import chatRoutes from "./routes/chat.js";
import favoritesRoutes from "./routes/favorites.js";
import reviewsRoutes from "./routes/reviews.js";

// Services
import { sendScheduledReminders } from "./services/smsService.js";
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
app.use("/api/chat", chatRoutes);
app.use("/api/favorites", favoritesRoutes);
app.use("/api/reviews", reviewsRoutes);

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

/* =====================================================
   ⏰ BACKGROUND SCHEDULER (Cron Jobs)
===================================================== */

// 1. Auto-cleanup Inactive Chat Rooms (Every 10 mins)
cron.schedule("*/10 * * * *", () => {
  db.run("PRAGMA foreign_keys = ON;", (err) => {
    if (err) return console.error("❌ DB Pragma Error:", err);

    // This checks last_message_at, which is now updated on every send_message call
    db.run(
      `DELETE FROM chat_rooms WHERE last_message_at < datetime('now', '-12 hours')`,
      function (err) {
        if (err) console.error("❌ Cleanup Error:", err);
        else if (this.changes > 0) {
          console.log(
            `🧹 Cleanup: Deleted ${this.changes} inactive chat rooms (and their messages)`,
          );
        }
      },
    );
  });
});

// 2. Auto-cancel past pending appointments (Hourly)
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

// 3. SMS Reminders (Every 10 mins)
cron.schedule("*/10 * * * *", async () => {
  console.log("🔔 CRON: Checking for SMS reminders...");
  try {
    await sendScheduledReminders();
  } catch (error) {
    console.error("❌ SMS Scheduler Error:", error);
  }
});

// 4. Chat Expiry Warning (Every 10 mins)
cron.schedule("*/10 * * * *", () => {
  const startWindow = "datetime('now', '-11 hours', '-10 minutes')";
  const endWindow = "datetime('now', '-11 hours')";

  db.all(
    `SELECT id, client_id, provider_id 
     FROM chat_rooms 
     WHERE last_message_at BETWEEN ${startWindow} AND ${endWindow}`,
    [],
    (err, rows) => {
      if (err || !rows) return;

      rows.forEach((row) => {
        [row.client_id, row.provider_id].forEach((userId) => {
          createNotification(
            userId,
            "system",
            "Chat Session Ending",
            "This chat has been inactive for 11 hours and will be deleted in 1 hour.",
            row.id,
          );
        });
      });
    },
  );
});

// 5. Morning Brief for Providers (Daily at 7:00 AM)
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

// 6. General Cleanup Tasks (Hourly)
cron.schedule("0 * * * *", async () => {
  console.log("🧹 CRON: Running hourly maintenance...");
  try {
    await autoCancelPastAppointments();
  } catch (error) {
    console.error("❌ Cleanup Scheduler Error:", error);
  }
});

// 7. ✅ Review Prompts for Completed Appointments (Every 30 mins)
cron.schedule("*/30 * * * *", () => {
  console.log("⭐ CRON: Checking for review prompts...");

  const query = `
    SELECT a.id, a.client_id, s.name as service_name, u.notification_preferences
    FROM appointments a
    JOIN services s ON a.service_id = s.id
    JOIN users u ON a.client_id = u.id
    LEFT JOIN reviews r ON a.id = r.appointment_id
    WHERE a.status = 'completed'
    AND r.id IS NULL
    AND a.appointment_date >= datetime('now', '-1 hour')
  `;

  db.all(query, [], (err, rows) => {
    if (err || !rows) return;

    rows.forEach((row) => {
      let prefs = {};
      try {
        prefs =
          typeof row.notification_preferences === "string"
            ? JSON.parse(row.notification_preferences)
            : row.notification_preferences || {};
      } catch (e) {
        prefs = {};
      }

      const inApp = prefs.in_app || {};
      if (inApp.review_prompts !== false) {
        createNotification(
          row.client_id,
          "system",
          "How was your appointment? ⭐",
          `We hope you enjoyed your ${row.service_name}! Leave a review to help others.`,
          row.id,
        );
      }
    });
  });
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
    `⏰ Scheduler active: Reminders (10m), Chat Cleanup (10m), Morning Brief (Daily)`,
  );
  console.log(`💬 Socket.IO ready`);
});
