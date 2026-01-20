import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Configure dotenv to read from the root backend .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

if (!PAYSTACK_SECRET_KEY) {
  console.warn("⚠️ Paystack Secret Key is missing in .env. Refunds will fail.");
}

/**
 * ✅ Process refund via Paystack API
 * @param {string} transactionReference - Original payment reference
 * @param {number} amountKobo - Amount in kobo (KES * 100)
 * @returns {Promise<Object>} - Refund response
 */
export async function processPaystackRefund(transactionReference, amountKobo) {
  try {
    const response = await axios.post(
      'https://api.paystack.co/refund',
      {
        transaction: transactionReference,
        amount: amountKobo, // Amount in kobo/cents
        currency: 'KES',
        // merchant_note: 'Refund initiated via SchedulA'
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.status === true) {
      console.log('✅ Paystack Refund Initiated:', response.data.data);
      return {
        success: true,
        refund_reference: response.data.data.id || response.data.data.transaction?.reference,
        message: response.data.message,
        data: response.data.data
      };
    } else {
      console.error('❌ Paystack Refund Failed:', response.data);
      return {
        success: false,
        error: response.data.message || 'Refund initiation failed'
      };
    }
  } catch (error) {
    console.error('❌ Paystack Refund Error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message || 'Refund processing error'
    };
  }
}

/**
 * ✅ Check refund status from Paystack
 * @param {string} refundReference - Paystack refund reference
 * @returns {Promise<Object>} - Refund status
 */
export async function checkRefundStatus(refundReference) {
  try {
    const response = await axios.get(
      `https://api.paystack.co/refund/${refundReference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.status === true) {
      return {
        success: true,
        status: response.data.data.status, // pending, processing, completed, failed
        data: response.data.data
      };
    } else {
      return {
        success: false,
        error: 'Failed to fetch refund status'
      };
    }
  } catch (error) {
    console.error('❌ Refund Status Check Error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * ✅ SMS Refund Notifications
 * Sends notification to Client
 */
export async function sendRefundNotification(appointment, client, amount, status = 'completed') {
  
  if (!client.phone) {
    console.warn(`⚠️ Cannot send refund SMS: Client has no phone number`);
    return;
  }

  // Refund notifications are typically mandatory for financial transparency
  const messages = {
    'completed': `✅ REFUND PROCESSED\nKES ${amount.toLocaleString()} has been refunded to your payment source for Appointment #${appointment.id}. Please allow 5-10 business days for the funds to reflect in your account.`,
    'processing': `⏳ REFUND IN PROGRESS\nYour refund of KES ${amount.toLocaleString()} for Appointment #${appointment.id} is being processed. You'll receive confirmation once completed.`,
    'failed': `❌ REFUND FAILED\nWe encountered an issue processing your refund of KES ${amount.toLocaleString()} for Appointment #${appointment.id}. Please contact support with reference: ${appointment.payment_reference}`
  };

  const message = messages[status] || messages['completed'];

  // Import SMS service dynamically to avoid circular dependency issues
  const smsModule = await import('./smsService.js');
  return await smsModule.default.sendSMS(client.phone, message);
}

/**
 * ✅ Send Refund Request Notification to Provider
 * Used when a client cancels a paid appointment
 */
export async function sendRefundRequestToProvider(appointment, provider, client, amount) {
  
  if (!provider.phone) {
    console.warn(`⚠️ Cannot send refund request: Provider has no phone number`);
    return;
  }

  const message = `💰 REFUND REQUEST\n${client.name} cancelled Appointment #${appointment.id}. Please process refund of KES ${amount.toLocaleString()} via your dashboard. Client expects refund within 5-7 business days.`;

  const smsModule = await import('./smsService.js');
  return await smsModule.default.sendSMS(provider.phone, message);
}

export default { 
  processPaystackRefund, 
  checkRefundStatus, 
  sendRefundNotification, 
  sendRefundRequestToProvider 
};