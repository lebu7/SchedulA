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

// ✅ Import SMS Scheduled Reminders
import { sendScheduledReminders } from "./services/smsService.js";

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

cron.schedule("*/10 * * * *", async () => {
  console.log("🔔 CRON: Checking for SMS reminders...");
  try {
    await sendScheduledReminders();
  } catch (error) {
    console.error("❌ SMS Scheduler Error:", error);
  }
});

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
  console.log(`⏰ Scheduler active: Reminders (Every 10m), Cleanup (Hourly)`);
  console.log(`💬 Socket.IO ready`);
});
