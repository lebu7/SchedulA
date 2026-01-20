import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

if (!PAYSTACK_SECRET_KEY) {
  console.warn("⚠️ Paystack Secret Key is missing in .env. Refunds will fail.");
}

/**
 * ✅ Process refund via Paystack API
 * Handles "Already Refunded" gracefully without logging errors.
 */
export async function processPaystackRefund(transactionReference, amountKobo) {
  try {
    const response = await axios.post(
      'https://api.paystack.co/refund',
      {
        transaction: transactionReference,
        amount: amountKobo,
        currency: 'KES',
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.status === true) {
      console.log(`✅ Paystack Refund Initiated: ${response.data.data.id}`);
      return {
        success: true,
        refund_reference: response.data.data.id || response.data.data.transaction?.reference,
        message: response.data.message,
        data: response.data.data
      };
    } else {
      return {
        success: false,
        error: response.data.message || 'Refund initiation failed'
      };
    }
  } catch (error) {
    const errorData = error.response?.data || {};
    const errorCode = errorData.code;
    const errorMessage = errorData.message || error.message || 'Unknown error';

    // ✅ Case 1: Already Refunded (Treat as Success)
    if (
        errorCode === 'transaction_reversed' || 
        errorMessage.toLowerCase().includes('refund already exist') ||
        errorMessage.toLowerCase().includes('transaction has been fully reversed')
    ) {
        // Log as info, not error
        console.log(`ℹ️ Refund Skipped: Transaction ${transactionReference} is already refunded.`);
        return {
            success: false,
            status: 'already_refunded', 
            error: errorMessage
        };
    }

    // ✅ Case 2: Amount Exceeds (Likely Legacy Data Issue)
    if (errorMessage.toLowerCase().includes('refund amount exceeds') || 
        errorMessage.toLowerCase().includes('amount is invalid')) {
       console.warn(`⚠️ Refund Skipped: Amount exceeds transaction for ${transactionReference}.`);
       return {
           success: false,
           status: 'amount_exceeded',
           error: errorMessage
       };
    }

    // ❌ Case 3: Genuine Error
    console.error('❌ Paystack Refund Error:', errorData);
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * ✅ Check refund status from Paystack
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
        status: response.data.data.status,
        data: response.data.data
      };
    } else {
      return { success: false, error: 'Failed to fetch refund status' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * ✅ SMS Refund Notifications
 */
export async function sendRefundNotification(appointment, client, amount, status = 'completed') {
  if (!client.phone) return;

  const messages = {
    'completed': `✅ REFUND PROCESSED\nKES ${amount.toLocaleString()} has been refunded for Appointment #${appointment.id}. Check your account in 5-10 mins.`,
    'processing': `⏳ REFUND STARTED\nRefund of KES ${amount.toLocaleString()} for Appointment #${appointment.id} initiated.`,
    'failed': `❌ REFUND ISSUE\nManual check required for refund of KES ${amount.toLocaleString()} (Appt #${appointment.id}). Reference: ${appointment.payment_reference}`
  };

  const message = messages[status] || messages['completed'];
  const smsModule = await import('./smsService.js');
  return await smsModule.default.sendSMS(client.phone, message);
}

/**
 * ✅ Send Refund Request Notification to Provider
 */
export async function sendRefundRequestToProvider(appointment, provider, client, amount) {
  if (!provider.phone) return;
  const message = `💰 REFUND REQUEST\n${client.name} cancelled Appt #${appointment.id}. Please process refund of KES ${amount.toLocaleString()} via your dashboard.`;
  const smsModule = await import('./smsService.js');
  return await smsModule.default.sendSMS(provider.phone, message);
}

export default { 
  processPaystackRefund, 
  checkRefundStatus, 
  sendRefundNotification, 
  sendRefundRequestToProvider 
};