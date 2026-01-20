import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { db } from './config/database.js';

// Import routes
import authRoutes from './routes/auth.js';
import serviceRoutes from './routes/services.js';
import appointmentRoutes from './routes/appointments.js';

// ✅ Import SMS Scheduled Reminders
import { sendScheduledReminders } from './services/smsService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/appointments', appointmentRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Schedula API is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
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
    console.log('🕒 Auto-cancelled past pending appointments');
  } catch (error) {
    console.error('❌ Error auto-cancelling appointments:', error);
  }
};

/* =====================================================
   📱 SMS REMINDER SCHEDULER
   Runs every hour to check for appointments
   happening in 24-26 hours and sends reminders
===================================================== */
const checkAndSendReminders = async () => {
  try {
    console.log('🔔 Checking for appointments needing reminders...');
    await sendScheduledReminders();
  } catch (error) {
    console.error('❌ Error in reminder scheduler:', error);
  }
};

// Run tasks once when server starts
autoCancelPastAppointments();
console.log('📱 Initializing SMS reminder scheduler...');
checkAndSendReminders();

// Schedule to run every hour
setInterval(() => {
  autoCancelPastAppointments();
  checkAndSendReminders();
}, 60 * 60 * 1000); // every 1 hour

app.listen(PORT, () => {
  console.log(`🚀 Schedula backend running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`📱 SMS notifications: ENABLED`);
});