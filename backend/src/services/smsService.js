import AfricasTalking from 'africastalking';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const credentials = {
  apiKey: process.env.AFRICAS_TALKING_API_KEY,
  username: process.env.AFRICAS_TALKING_USERNAME || 'sandbox',
};

// Diagnostics
if (!credentials.apiKey) {
  console.error("❌ FATAL: Africa's Talking API Key is missing.");
}

const africastalking = AfricasTalking({
  apiKey: credentials.apiKey,
  username: credentials.username
});

const sms = africastalking.SMS;

// --- Helpers ---

function formatPhoneNumber(phoneNumber) {
  if (!phoneNumber) return null;
  let cleaned = phoneNumber.toString().replace(/[\s-]/g, '');
  if (cleaned.startsWith('0')) cleaned = '+254' + cleaned.substring(1);
  else if (cleaned.startsWith('254')) cleaned = '+' + cleaned;
  else if (cleaned.startsWith('7') || cleaned.startsWith('1')) cleaned = '+254' + cleaned;
  else if (!cleaned.startsWith('+')) cleaned = '+254' + cleaned;
  return cleaned;
}

// ✅ CHECK PREFERENCES HELPER
function shouldSend(user, type) {
    if (!user || !user.phone) return false;
    
    // Critical messages are ALWAYS sent
    if (type === 'confirmation' || type === 'refund' || type === 'refund_request' || type === 'cancellation' || type === 'reschedule') return true;

    // Default to true if no preferences set
    if (!user.notification_preferences) return true;

    let prefs = {};
    if (typeof user.notification_preferences === 'string') {
        try { prefs = JSON.parse(user.notification_preferences); } catch(e) { return true; }
    } else {
        prefs = user.notification_preferences;
    }

    return prefs[type] !== false;
}

async function logSMS(phone, message, status, details) {
  try {
    const { db } = await import('../config/database.js');
    let messageType = 'general';
    
    if (message.includes('Confirmed') || message.includes('Received')) messageType = 'confirmation';
    else if (message.includes('Accepted')) messageType = 'acceptance';
    else if (message.includes('Reminder')) messageType = 'reminder';
    else if (message.includes('CANCELLED')) messageType = 'cancellation';
    else if (message.includes('REFUND')) messageType = 'refund'; 
    else if (message.includes('RESCHEDULE')) messageType = 'notification';
    
    if (db) {
        db.run(
        `INSERT INTO sms_logs (recipient_phone, message_type, message_content, status, details, sent_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [phone, messageType, message, status, JSON.stringify(details)]
        );
    }
  } catch (error) { console.error('⚠️ Failed to log SMS:', error.message); }
}

async function sendSMS(phoneNumber, message) {
    const formattedPhone = formatPhoneNumber(phoneNumber);
    if (!formattedPhone) return { success: false, error: 'Invalid phone number' };

    console.log(`📱 Sending SMS to ${formattedPhone}...`);
    
    try {
        const result = await sms.send({ to: [formattedPhone], message });
        const recipient = result.SMSMessageData.Recipients[0];

        if (['Success', 'Queued', 'Sent'].includes(recipient.status)) {
            console.log('✅ SMS Sent Successfully');
            await logSMS(formattedPhone, message, 'sent', result);
            return { success: true, data: result };
        } else {
            console.error('❌ SMS Failed:', recipient.status);
            await logSMS(formattedPhone, message, 'failed', result);
            return { success: false, error: recipient.status };
        }
    } catch (error) {
        console.error('❌ SMS Network Error:', error.message);
        await logSMS(phoneNumber, message, 'error', { error: error.message });
        return { success: false, error: error.message };
    }
}

// --- Exports ---

export async function sendBookingConfirmation(appointment, client, service, provider) {
  if (!shouldSend(client, 'confirmation')) return; 

  const date = new Date(appointment.appointment_date).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
  const paid = Number(appointment.amount_paid || 0);
  const total = Number(appointment.total_price || 0);
  const pending = Math.max(0, total - paid);

  const msg = `Booking Received! (Appt #${appointment.id}) for ${service.name} on ${date}. Paid: KES ${paid.toLocaleString()}. Balance: KES ${pending.toLocaleString()}. Status: Waiting Approval.`;
  
  return await sendSMS(client.phone, msg);
}

export async function sendBookingAccepted(appointment, client, service, provider) {
    if (!shouldSend(client, 'acceptance')) return; 

    const date = new Date(appointment.appointment_date).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
    const msg = `Good News! Your booking for ${service.name} (Appt #${appointment.id}) with ${provider.business_name || provider.name} on ${date} is ACCEPTED.`;
    return await sendSMS(client.phone, msg);
}

export async function sendAppointmentReminder(appointment, client, service, provider) {
  if (!shouldSend(client, 'reminder')) return;
  
  const date = new Date(appointment.appointment_date).toLocaleString('en-KE', { timeStyle: 'short' });
  const msg = `Reminder: Appointment tomorrow (Appt #${appointment.id}) at ${date} for ${service.name} with ${provider.business_name || provider.name}.`;
  return await sendSMS(client.phone, msg);
}

export async function sendPaymentReceipt(appointment, client, service) {
  if (!shouldSend(client, 'receipt')) return;
  
  const paid = Number(appointment.amount_paid || 0);
  const msg = `Payment Received: KES ${paid.toLocaleString()} for Appt #${appointment.id} (${service.name}). Ref: ${appointment.payment_reference}. Thanks!`;
  return await sendSMS(client.phone, msg);
}

export async function sendCancellationNotice(appointment, client, service, reason, cancelledBy) {
  if (!shouldSend(client, 'cancellation')) return;
  
  const date = new Date(appointment.appointment_date).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' });
  const refundAmount = Number(appointment.amount_paid || 0);
  
  let actorText = "The appointment";
  if (cancelledBy === 'provider') actorText = `${appointment.provider_name || 'The provider'} has cancelled the appointment`;
  if (cancelledBy === 'client') actorText = "You have cancelled the appointment";

  let refundText = "";
  if (refundAmount > 0) {
      refundText = " Refund processing initiated.";
  }

  const msg = `Update: ${actorText} (Appt #${appointment.id}) for ${service.name} on ${date}.${reason ? ' Reason: ' + reason : ''}${refundText}`;
  return await sendSMS(client.phone, msg);
}

export async function sendProviderNotification(appointment, provider, client, service) {
  if (!shouldSend(provider, 'new_request')) return;
  
  const date = new Date(appointment.appointment_date).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' });
  const msg = `New Booking Request (Appt #${appointment.id}): ${client.name} for ${service.name} on ${date}. Log in to Accept/Reject.`;
  return await sendSMS(provider.phone, msg);
}

export async function sendRefundNotification(appointment, client, amount, status = 'completed') {
  if (!shouldSend(client, 'refund')) return;

  const messages = {
    'completed': `✅ REFUND PROCESSED\nKES ${amount.toLocaleString()} has been refunded to your payment source for Appt #${appointment.id}. Funds reflect in 5-10 days.`,
    'processing': `⏳ REFUND IN PROGRESS\nYour refund of KES ${amount.toLocaleString()} for Appt #${appointment.id} is being processed.`,
    'failed': `❌ REFUND FAILED\nIssue processing refund of KES ${amount.toLocaleString()} for Appt #${appointment.id}. Contact support (Ref: ${appointment.payment_reference}).`
  };

  const msg = messages[status] || messages['completed'];
  return await sendSMS(client.phone, msg);
}

export async function sendRefundRequest(appointment, provider, client, amount) {
  if (!shouldSend(provider, 'refund_request')) return;

  const msg = `💰 REFUND REQUEST\n${client.name} cancelled Appt #${appointment.id}. Please process refund of KES ${amount.toLocaleString()} via your dashboard.`;
  return await sendSMS(provider.phone, msg);
}

// ✅ UPDATED: Send Reschedule Notification (Handles Pending Status)
export async function sendRescheduleNotification(appointment, client, service, provider, oldDateISO, status) {
    if (!shouldSend(client, 'reschedule')) return;

    const newDate = new Date(appointment.appointment_date).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
    const oldDate = new Date(oldDateISO).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });

    let msg = `📅 RESCHEDULED: Your booking (Appt #${appointment.id}) for ${service.name} has been moved from ${oldDate} to ${newDate}.`;
    
    // Customize message if it's back to pending
    if (status === 'pending') {
        msg = `📅 RESCHEDULE REQUEST: You moved Appt #${appointment.id} to ${newDate}. This is waiting provider approval.`;
    }
    
    // Send to Client
    await sendSMS(client.phone, msg);

    // Send to Provider
    if (provider && provider.phone) {
        let provMsg = `📅 APPT RESCHEDULED: ${client.name} moved Appt #${appointment.id} to ${newDate}.`;
        if (status === 'pending') {
            provMsg = `📅 RESCHEDULE REQUEST: ${client.name} wants to move Appt #${appointment.id} to ${newDate}. Log in to Accept/Reject.`;
        }
        await sendSMS(provider.phone, provMsg);
    }
}

export async function sendScheduledReminders() {
  try {
    const { db } = await import('../config/database.js');
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const windowEnd = new Date(now.getTime() + 26 * 60 * 60 * 1000).toISOString();

    db.all(
      `SELECT a.*, 
              c.phone as client_phone, c.name as client_name, c.notification_preferences as client_prefs,
              s.name as service_name, 
              p.business_name, p.name as provider_name
       FROM appointments a
       JOIN users c ON a.client_id = c.id
       JOIN services s ON a.service_id = s.id
       JOIN users p ON a.provider_id = p.id
       WHERE a.status = 'scheduled' AND a.appointment_date BETWEEN ? AND ? AND a.reminder_sent = 0`,
      [tomorrow, windowEnd],
      async (err, rows) => {
        if (err || !rows) return;
        for (const row of rows) {
          const client = { 
              phone: row.client_phone, 
              name: row.client_name, 
              notification_preferences: row.client_prefs 
          };
          await sendAppointmentReminder(row, client, { name: row.service_name }, { business_name: row.business_name, name: row.provider_name });
          db.run('UPDATE appointments SET reminder_sent = 1 WHERE id = ?', [row.id]);
        }
      }
    );
  } catch (e) { console.error(e); }
}

export async function getSMSStats() {
  const { db } = await import('../config/database.js');
  return new Promise((resolve) => {
    db.all('SELECT * FROM sms_logs ORDER BY sent_at DESC LIMIT 50', [], (e, r) => resolve(r || []));
  });
}

export default { 
    sendSMS, 
    sendBookingConfirmation, 
    sendBookingAccepted, 
    sendAppointmentReminder, 
    sendPaymentReceipt, 
    sendCancellationNotice, 
    sendProviderNotification, 
    sendRefundNotification, 
    sendRefundRequest,
    sendRescheduleNotification,
    sendScheduledReminders,
    getSMSStats 
};