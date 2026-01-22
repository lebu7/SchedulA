import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import cron from "node-cron"; // ✅ Import Cron
import { db } from "./config/database.js";

// Import routes
import authRoutes from "./routes/auth.js";
import serviceRoutes from "./routes/services.js";
import appointmentRoutes from "./routes/appointments.js";
import notificationRoutes from "./routes/notifications.js"; // ✅ Import Notification Routes
import analyticsRoutes from "./routes/analytics.js"; // ✅ Import Analytics Routes (File name stays same)

// ✅ Import SMS Scheduled Reminders
import { sendScheduledReminders } from "./services/smsService.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/notifications", notificationRoutes);
// 🔄 RENAMED ROUTE to avoid 'blocked by client' errors
app.use("/api/insights", analyticsRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Schedula API is running",
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Something went wrong!",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Internal server error",
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
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

// 1. SMS Reminders: Runs every 10 minutes
// Checks for appointments 24-26 hours away and sends SMS
cron.schedule("*/10 * * * *", async () => {
  console.log("🔔 CRON: Checking for SMS reminders...");
  try {
    await sendScheduledReminders();
  } catch (error) {
    console.error("❌ SMS Scheduler Error:", error);
  }
});

// 2. Cleanup: Runs every hour (at minute 0)
// Cancels stale pending appointments
cron.schedule("0 * * * *", async () => {
  console.log("🧹 CRON: Running cleanup tasks...");
  try {
    await autoCancelPastAppointments();
  } catch (error) {
    console.error("❌ Cleanup Scheduler Error:", error);
  }
});

// ---------------------------------------------------------

// Run tasks immediately on startup
console.log("🚀 Initializing background tasks...");
autoCancelPastAppointments();
sendScheduledReminders();

app.listen(PORT, () => {
  console.log(`🚀 Schedula backend running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`⏰ Scheduler active: Reminders (Every 10m), Cleanup (Hourly)`);
});
