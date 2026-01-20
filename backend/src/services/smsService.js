import AfricasTalking from 'africastalking';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------
// 🔧 INITIALIZATION & CONFIG
// ---------------------------------------------------------

// Force load .env from the backend root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const credentials = {
  apiKey: process.env.AFRICAS_TALKING_API_KEY,
  username: process.env.AFRICAS_TALKING_USERNAME || 'sandbox', 
};

// Diagnostics
if (!credentials.apiKey) {
  console.error("❌ FATAL: Africa's Talking API Key is missing. Check your .env file.");
}

// Initialize Library
const africastalking = AfricasTalking({
  apiKey: credentials.apiKey,
  username: credentials.username
});

const sms = africastalking.SMS;

// ---------------------------------------------------------
// 🛠️ HELPER FUNCTIONS
// ---------------------------------------------------------

function formatPhoneNumber(phoneNumber) {
  if (!phoneNumber) return null;
  let cleaned = phoneNumber.toString().replace(/[\s-]/g, '');
  
  if (cleaned.startsWith('0')) cleaned = '+254' + cleaned.substring(1);
  else if (cleaned.startsWith('254')) cleaned = '+' + cleaned;
  else if (cleaned.startsWith('7') || cleaned.startsWith('1')) cleaned = '+254' + cleaned;
  else if (!cleaned.startsWith('+')) cleaned = '+254' + cleaned;
  
  return cleaned;
}

async function logSMS(phone, message, status, details) {
  try {
    const { db } = await import('../config/database.js');
    let messageType = 'general';
    if (message.toLowerCase().includes('confirmed')) messageType = 'confirmation';
    else if (message.toLowerCase().includes('reminder')) messageType = 'reminder';
    else if (message.toLowerCase().includes('payment received')) messageType = 'receipt';
    else if (message.toLowerCase().includes('cancelled')) messageType = 'cancellation';
    
    // Safety check: Ensure db is ready
    if (db) {
        db.run(
        `INSERT INTO sms_logs (recipient_phone, message_type, message_content, status, details, sent_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [phone, messageType, message, status, JSON.stringify(details)]
        );
    }
  } catch (error) {
    console.error('⚠️ Failed to log SMS (DB Error):', error.message);
  }
}

// ---------------------------------------------------------
// 🚀 MAIN SENDING FUNCTION
// ---------------------------------------------------------

async function sendSMS(phoneNumber, message) {
  try {
    const formattedPhone = formatPhoneNumber(phoneNumber);
    if (!formattedPhone) return { success: false, error: 'Invalid phone number' };

    console.log(`📱 Sending SMS to ${formattedPhone} (User: ${credentials.username})...`);

    const options = {
      to: [formattedPhone],
      message: message
      // ⚠️ 'from' parameter is intentionally OMITTED.
      // Sandbox: Defaults to 'AFRICASTKNG'
      // Live: Defaults to Shared Shortcode (e.g. 20414)
    };

    const result = await sms.send(options);
    const recipient = result.SMSMessageData.Recipients[0];

    // Handle "Success", "Queued", or "Sent" as success states
    if (['Success', 'Queued', 'Sent'].includes(recipient.status)) {
      console.log('✅ SMS Sent Successfully');
      await logSMS(formattedPhone, message, 'sent', result);
      return { success: true, data: result, messageId: recipient.messageId };
    } else {
      console.error('❌ SMS Failed:', recipient.status);
      
      // Specific error help
      if (recipient.status === 'PBUserInsufficientBalance') {
          console.error('   👉 ACTION: Top up your Airtime wallet on the Africa\'s Talking Dashboard.');
      }

      await logSMS(formattedPhone, message, 'failed', result);
      return { success: false, error: recipient.status };
    }
  } catch (error) {
    console.error('❌ SMS Network Error:', error.message);
    await logSMS(phoneNumber, message, 'error', { error: error.message });
    return { success: false, error: error.message };
  }
}

// ---------------------------------------------------------
// 📤 EXPORTS (Business Logic Preserved)
// ---------------------------------------------------------

export async function sendBookingConfirmation(appointment, client, service, provider) {
  if (!client.phone) return { success: false, error: 'No phone number' };
  const date = new Date(appointment.appointment_date).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
  const msg = `Confirmed! ${service.name} with ${provider.business_name || provider.name} on ${date}. Total: KES ${appointment.total_price}. Paid: KES ${appointment.amount_paid}.`;
  return await sendSMS(client.phone, msg);
}

export async function sendAppointmentReminder(appointment, client, service, provider) {
  if (!client.phone) return { success: false, error: 'No phone number' };
  const date = new Date(appointment.appointment_date).toLocaleString('en-KE', { timeStyle: 'short' });
  const msg = `Reminder: Appointment tomorrow at ${date} for ${service.name} with ${provider.business_name || provider.name}.`;
  return await sendSMS(client.phone, msg);
}

export async function sendPaymentReceipt(appointment, client, service) {
  if (!client.phone) return { success: false, error: 'No phone number' };
  const msg = `Payment Received: KES ${appointment.amount_paid} for ${service.name}. Ref: ${appointment.payment_reference}. Thanks!`;
  return await sendSMS(client.phone, msg);
}

export async function sendCancellationNotice(appointment, client, service, reason) {
  if (!client.phone) return { success: false, error: 'No phone number' };
  const msg = `Update: Your appointment for ${service.name} has been cancelled.${reason ? ' Reason: ' + reason : ''}`;
  return await sendSMS(client.phone, msg);
}

export async function sendProviderNotification(appointment, provider, client, service) {
  if (!provider.phone) return { success: false, error: 'No phone number' };
  const date = new Date(appointment.appointment_date).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' });
  const msg = `New Booking: ${client.name} for ${service.name} on ${date}. Paid: KES ${appointment.amount_paid}.`;
  return await sendSMS(provider.phone, msg);
}

export async function sendScheduledReminders() {
  try {
    const { db } = await import('../config/database.js');
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const windowEnd = new Date(now.getTime() + 26 * 60 * 60 * 1000).toISOString();

    console.log(`🔍 Checking reminders for: ${tomorrow}`);

    db.all(
      `SELECT a.*, c.phone as client_phone, c.name as client_name, s.name as service_name, p.business_name, p.name as provider_name
       FROM appointments a
       JOIN users c ON a.client_id = c.id
       JOIN services s ON a.service_id = s.id
       JOIN users p ON a.provider_id = p.id
       WHERE a.status = 'scheduled' AND a.appointment_date BETWEEN ? AND ? AND a.reminder_sent = 0`,
      [tomorrow, windowEnd],
      async (err, rows) => {
        if (err || !rows) return;
        for (const row of rows) {
          await sendAppointmentReminder(row, { phone: row.client_phone, name: row.client_name }, { name: row.service_name }, { business_name: row.business_name, name: row.provider_name });
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
    sendAppointmentReminder, 
    sendPaymentReceipt, 
    sendCancellationNotice, 
    sendProviderNotification, 
    sendScheduledReminders, 
    getSMSStats 
};