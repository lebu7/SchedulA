/* backend/src/routes/appointments.js */
import express from 'express';
import { body, validationResult } from 'express-validator';
import { db } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import smsService from '../services/smsService.js';
import { processPaystackRefund, sendRefundNotification, sendRefundRequestToProvider } from '../services/refundService.js';
import { createNotification } from '../services/notificationService.js';
import { predictNoShow } from '../services/aiPredictor.js'; // 🧠 AI Import

const router = express.Router();

/* ---------------------------------------------
   ✅ Ensure "rebooked", "Refund", & "AI Risk" columns exist
--------------------------------------------- */
db.get(
  `SELECT sql FROM sqlite_master WHERE type='table' AND name='appointments'`,
  [],
  (err, row) => {
    if (err || !row) return;
    
    const missingRebooked = !row.sql.includes("'rebooked'");
    const missingRefund = !row.sql.includes("'refund-pending'");
    const missingRisk = !row.sql.includes("no_show_risk"); 

    if (missingRebooked || missingRefund || missingRisk) {
      console.log('⚙️ Updating appointments table schema to support AI & Refunds...');
      db.serialize(() => {
        db.run('PRAGMA foreign_keys=off;');
        db.run(`
          CREATE TABLE appointments_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL,
            provider_id INTEGER NOT NULL,
            service_id INTEGER NOT NULL,
            appointment_date DATETIME NOT NULL,
            status TEXT DEFAULT 'scheduled' CHECK(status IN ('pending', 'scheduled', 'completed', 'cancelled', 'no-show', 'rebooked')),
            notes TEXT,
            client_deleted BOOLEAN DEFAULT 0,
            provider_deleted BOOLEAN DEFAULT 0,
            payment_status TEXT DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid', 'deposit-paid', 'paid', 'refunded', 'refund-pending')),
            payment_reference TEXT,
            amount_paid REAL DEFAULT 0,
            total_price REAL DEFAULT 0,
            deposit_amount REAL DEFAULT 0,
            addons_total REAL DEFAULT 0,
            addons TEXT DEFAULT '[]',
            reminder_sent INTEGER DEFAULT 0,
            refund_status TEXT DEFAULT NULL,
            refund_reference TEXT,
            refund_amount REAL DEFAULT 0,
            refund_initiated_at DATETIME,
            refund_completed_at DATETIME,
            no_show_risk REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES users(id),
            FOREIGN KEY (provider_id) REFERENCES users(id),
            FOREIGN KEY (service_id) REFERENCES services(id)
          );
        `);
        
        db.run(`INSERT INTO appointments_new (
          id, client_id, provider_id, service_id, appointment_date, status, notes, 
          client_deleted, provider_deleted, payment_status, payment_reference, 
          amount_paid, total_price, reminder_sent, created_at
        ) SELECT 
          id, client_id, provider_id, service_id, appointment_date, status, notes, 
          client_deleted, provider_deleted, payment_status, payment_reference, 
          amount_paid, total_price, reminder_sent, created_at 
        FROM appointments;`, (err) => {
            if (err) console.log("⚠️ Partial data migration (some columns might be reset)");
        });

        db.run('DROP TABLE appointments;');
        db.run('ALTER TABLE appointments_new RENAME TO appointments;');
        db.run('PRAGMA foreign_keys=on;');
        console.log('✅ Appointments table updated with AI Risk Column.');
      });
    }
  }
);

/* ---------------------------------------------
   Create payment_requests table if not exists
--------------------------------------------- */
db.get(
  `SELECT name FROM sqlite_master WHERE type='table' AND name='payment_requests'`,
  [],
  (err, row) => {
    if (err) return;
    if (!row) {
      db.run(
        `CREATE TABLE IF NOT EXISTS payment_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          appointment_id INTEGER NOT NULL,
          provider_id INTEGER NOT NULL,
          client_id INTEGER NOT NULL,
          amount_requested REAL NOT NULL,
          note TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (appointment_id) REFERENCES appointments(id),
          FOREIGN KEY (provider_id) REFERENCES users(id),
          FOREIGN KEY (client_id) REFERENCES users(id)
        )`
      );
    }
  }
);

/* ---------------------------------------------
   ✅ Helper: Process Multi-Transaction Refunds
--------------------------------------------- */
async function processMultiTransactionRefund(appointmentId, totalAmountToRefund) {
  const transactions = await new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM transactions WHERE appointment_id = ? AND status = 'success' AND type = 'payment' ORDER BY id ASC`,
      [appointmentId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });

  if (transactions.length === 0) {
    const apt = await new Promise((resolve) => {
        db.get(`SELECT payment_reference, amount_paid FROM appointments WHERE id = ?`, [appointmentId], (e, r) => resolve(r));
    });
    if(apt && apt.payment_reference) {
        transactions.push({ reference: apt.payment_reference, amount: apt.amount_paid });
    }
  }

  let remaining = totalAmountToRefund;
  let refundedTotal = 0;
  const refundRefs = [];

  for (const tx of transactions) {
    if (remaining <= 0) break;

    const refundAmount = Math.min(tx.amount, remaining);
    
    try {
        const result = await processPaystackRefund(tx.reference, Math.round(refundAmount * 100));
        
        if (result.success || result.status === 'already_refunded') {
            refundedTotal += refundAmount;
            remaining -= refundAmount;
            const refToStore = result.refund_reference || `existing-${tx.reference}`;
            refundRefs.push(refToStore);

            await new Promise(resolve => {
               db.get(`SELECT id FROM transactions WHERE reference = ? AND type = 'refund'`, [refToStore], (e, row) => {
                  if (!row) {
                      db.run(`INSERT INTO transactions (appointment_id, amount, reference, type, status) VALUES (?, ?, ?, 'refund', 'success')`, 
                          [appointmentId, refundAmount, refToStore], resolve);
                  } else {
                      resolve();
                  }
               });
            });

        } else if (result.status === 'amount_exceeded') {
            console.warn(`⚠️ Skipped tx ${tx.reference} (Amount Mismatch)`);
        }
    } catch (e) {
        console.error(`Error processing tx ${tx.reference}:`, e);
    }
  }

  if (refundedTotal === 0 && totalAmountToRefund > 0) {
      throw new Error("Unable to verify any refunds for this appointment. Please check Paystack dashboard.");
  }

  return { success: true, refundedAmount: refundedTotal, references: refundRefs };
}

/* ---------------------------------------------
   ✅ Fetch appointments (client & provider)
--------------------------------------------- */
router.get('/', authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const userType = req.user.user_type;

  const query =
    userType === 'client'
      ? `
      SELECT a.*, s.name AS service_name, s.duration, s.price, 
             u.name AS provider_name, u.business_name
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      JOIN users u ON a.provider_id = u.id
      WHERE a.client_id = ? AND a.client_deleted = 0
      ORDER BY a.appointment_date DESC`
      : `
      SELECT a.*, s.name AS service_name, s.duration, s.price,
             u.name AS client_name, u.phone AS client_phone,
             a.no_show_risk 
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      JOIN users u ON a.client_id = u.id
      WHERE a.provider_id = ? AND a.provider_deleted = 0
      ORDER BY a.appointment_date DESC`;

  db.all(query, [userId], (err, appointments) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch appointments' });

    const now = new Date().toISOString();

    const pendingList = appointments.filter(a => 
        a.status === 'pending' || 
        (a.status === 'cancelled' && (a.refund_status === 'pending' || a.refund_status === 'processing'))
    );

    const scheduledList = appointments.filter(a => 
        a.status === 'scheduled' && a.appointment_date > now
    );

    const pastList = appointments.filter(a => 
        (a.status === 'completed' || 
         a.status === 'no-show' || 
         a.status === 'rebooked' || 
         (a.status === 'cancelled' && (a.refund_status === 'completed' || a.refund_status === 'failed' || a.refund_status === null)) ||
         (a.status === 'scheduled' && a.appointment_date <= now))
    );

    if (userType === 'client') {
      res.json({
        appointments: {
          pending: pendingList,
          scheduled: scheduledList,
          past: pastList,
        },
      });
    } else {
      res.json({
        appointments: {
          pending: pendingList,
          upcoming: scheduledList,
          past: pastList,
        },
      });
    }
  });
});

/* ---------------------------------------------
   📊 GET SMS Statistics (Provider only)
--------------------------------------------- */
router.get('/sms-stats', authenticateToken, async (req, res) => {
  try {
    const { getSMSStats } = smsService;
    const stats = await getSMSStats();
    
    const summary = {
      total_sent: 0,
      total_failed: 0,
      by_type: {}
    };
    
    stats.forEach(row => {
      if (row.status === 'sent') summary.total_sent += row.count;
      if (row.status === 'failed') summary.total_failed += row.count;
      
      if (!summary.by_type[row.message_type]) {
        summary.by_type[row.message_type] = { sent: 0, failed: 0 };
      }
      
      summary.by_type[row.message_type][row.status] = row.count;
    });
    
    res.json({
      summary,
      detailed_logs: stats
    });
  } catch (error) {
    console.error('Error fetching SMS stats:', error);
    res.status(500).json({ error: 'Failed to fetch SMS statistics' });
  }
});

/* ---------------------------------------------
   ✅ Check provider availability
--------------------------------------------- */
router.get('/providers/:id/availability', (req, res) => {
  const providerId = req.params.id;
  const { date } = req.query; // YYYY-MM-DD

  if (!date) return res.status(400).json({ error: 'Date required' });

  db.get(
    `SELECT opening_time, closing_time FROM users WHERE id = ? AND user_type = 'provider'`,
    [providerId],
    (err, provider) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!provider) return res.status(404).json({ error: 'Provider not found' });

      db.get(
        `SELECT * FROM provider_closed_days WHERE provider_id = ? AND closed_date = ?`,
        [providerId, date],
        (err2, closedDay) => {
          if (err2) return res.status(500).json({ error: 'Database error' });

          db.all(
            `SELECT a.appointment_date, s.duration 
             FROM appointments a
             JOIN services s ON a.service_id = s.id
             WHERE a.provider_id = ? 
             AND date(a.appointment_date) = ?
             AND a.status IN ('pending', 'scheduled', 'paid')`, 
            [providerId, date],
            (err3, bookedRows) => {
              if (err3) return res.status(500).json({ error: 'Failed to fetch booked slots' });

              const bookedSlots = bookedRows.map(row => {
                const start = new Date(row.appointment_date);
                const end = new Date(start.getTime() + row.duration * 60000); 
                
                return {
                  start: start.toTimeString().slice(0, 5),
                  end: end.toTimeString().slice(0, 5)
                };
              });

              res.json({
                provider_id: providerId,
                date,
                is_closed: !!closedDay,
                closed_reason: closedDay?.reason || null,
                opening_time: provider.opening_time || '08:00',
                closing_time: provider.closing_time || '18:00',
                booked_slots: bookedSlots
              });
            }
          );
        }
      );
    }
  );
});

/* ---------------------------------------------
   ✅ Create appointment (With AI Prediction + Payment Override)
--------------------------------------------- */
router.post(
  '/',
  authenticateToken,
  [
    body('service_id').isInt({ min: 1 }),
    body('appointment_date').isISO8601(),
    body('notes').optional().trim(),
    body('rebook_from').optional().isInt(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      service_id,
      appointment_date,
      notes,
      rebook_from,
      payment_reference,
      payment_amount,
      addons,
    } = req.body;

    if (!payment_reference || !payment_amount || Number(payment_amount) <= 0) {
      return res.status(400).json({
        error: 'Payment required before booking.',
      });
    }

    const client_id = req.user.userId;
    const appointmentDate = new Date(appointment_date);
    if (appointmentDate <= new Date())
      return res.status(400).json({ error: 'Appointment date must be in the future' });

    db.get('SELECT * FROM services WHERE id = ?', [service_id], (err, service) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!service) return res.status(404).json({ error: 'Service not found' });

      // Check Provider Closed Days
      const day = appointmentDate.toISOString().split('T')[0];
      db.get(
        'SELECT * FROM provider_closed_days WHERE provider_id = ? AND closed_date = ?',
        [service.provider_id, day],
        (err2, closedDay) => {
          if (closedDay)
            return res.status(400).json({
              error: `Provider is closed on ${day}.`,
            });

          // Check Provider Business Hours
          db.get(
            `SELECT opening_time, closing_time FROM users WHERE id = ?`,
            [service.provider_id],
            (err3, provider) => {
              if (err3)
                return res.status(500).json({ error: 'Error checking provider hours' });

              const open = provider?.opening_time || '08:00';
              const close = provider?.closing_time || '18:00';

              const nairobiTime = new Date(
                appointmentDate.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })
              );
              const bookingMinutes = nairobiTime.getHours() * 60 + nairobiTime.getMinutes();
              
              const [openH, openM] = open.split(':').map(Number);
              const [closeH, closeM] = close.split(':').map(Number);
              const openTotal = openH * 60 + openM;
              const closeTotal = closeH * 60 + closeM;

              if (bookingMinutes < openTotal || bookingMinutes >= closeTotal) {
                return res.status(400).json({
                  error: `Bookings are only allowed between ${open} and ${close}.`,
                });
              }

              // CHECK CAPACITY
              const newStartISO = appointmentDate.toISOString();
              const newEndISO = new Date(appointmentDate.getTime() + service.duration * 60000).toISOString();

              db.all(
                `SELECT a.id 
                 FROM appointments a
                 JOIN services s ON a.service_id = s.id
                 WHERE a.provider_id = ? 
                 AND a.status IN ('pending', 'scheduled', 'paid') 
                 AND (
                    (a.appointment_date < ? AND datetime(a.appointment_date, '+' || s.duration || ' minutes') > ?)
                 )`,
                [service.provider_id, newEndISO, newStartISO],
                async (errOverlap, existingBookings) => {
                    if (errOverlap) return res.status(500).json({ error: 'Error checking availability' });
                    
                    const maxCapacity = service.capacity || 1;
                    
                    if (existingBookings.length >= maxCapacity) {
                        return res.status(400).json({ 
                            error: `This time slot is fully booked. Please choose another time.` 
                        });
                    }

                    // 🧠 AI PREDICTION: Calculate Features
                    let riskScore = 0;
                    try {
                        const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                        const dayName = daysOfWeek[appointmentDate.getDay()];
                        const hour = appointmentDate.getHours();
                        let tod = 'afternoon';
                        if (hour < 12) tod = 'morning';
                        else if (hour > 17) tod = 'evening';

                        // Fetch Client History for Features
                        const clientStats = await new Promise(resolve => {
                            db.get(
                                `SELECT 
                                    COUNT(CASE WHEN status='no-show' THEN 1 END) as noshows,
                                    COUNT(CASE WHEN status='cancelled' THEN 1 END) as cancels,
                                    MAX(appointment_date) as last_visit
                                 FROM appointments WHERE client_id = ?`,
                                [client_id],
                                (e, r) => resolve(r || {})
                            );
                        });

                        const recency = clientStats.last_visit 
                            ? Math.floor((new Date() - new Date(clientStats.last_visit)) / (1000 * 60 * 60 * 24)) 
                            : 30; 

                        // Get Base Prediction
                        riskScore = await predictNoShow({
                            timeOfDay: tod,
                            dayOfWeek: dayName,
                            category: service.category || 'MISC', 
                            recency: recency,
                            lastReceipt: 50, 
                            historyNoShow: clientStats.noshows || 0,
                            historyCancel: clientStats.cancels || 0
                        });

                        // 💰 PAYMENT OVERRIDE LOGIC
                        let addons_total = 0;
                        if (Array.isArray(addons) && addons.length > 0) {
                          addons_total = addons.reduce(
                            (sum, addon) => sum + Number(addon.price ?? addon.additional_price ?? 0),
                            0
                          );
                        }
                        const totalCost = Number(service.price || 0) + addons_total;
                        const depositReq = Math.round(totalCost * 0.3);
                        const paidAmt = Number(payment_amount || 0);

                        console.log(`🤖 Base AI Score: ${riskScore.toFixed(2)}`);

                        if (paidAmt >= totalCost && totalCost > 0) {
                            riskScore = riskScore * 0.2; 
                            console.log("💰 Full Payment: Reducing Risk significantly.");
                        } else if (paidAmt > depositReq) {
                            riskScore = riskScore * 0.7; 
                            console.log("💰 Extra Payment: Reducing Risk.");
                        }
                        
                        riskScore = Math.max(0, riskScore);

                    } catch (aiErr) {
                        console.error('AI Prediction skipped:', aiErr);
                    }

                    // Proceed to Create Appointment
                    const status = 'pending';
                    
                    let addons_total = 0;
                    if (Array.isArray(addons) && addons.length > 0) {
                      addons_total = addons.reduce(
                        (sum, addon) => sum + Number(addon.price ?? addon.additional_price ?? 0),
                        0
                      );
                    }

                    const total_price = Number(service.price || 0) + addons_total;
                    const deposit_amount = Math.round(total_price * 0.3);
                    const paymentAmt = Number(payment_amount || 0);
                    let payment_status = paymentAmt >= total_price ? 'paid' : 'deposit-paid';

                    db.run(
                        `INSERT INTO appointments (
                        client_id, provider_id, service_id, appointment_date, notes, status,
                        payment_reference, payment_status,
                        total_price, deposit_amount, addons_total, addons, amount_paid,
                        no_show_risk
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                        [
                        client_id,
                        service.provider_id,
                        service_id,
                        appointment_date,
                        notes || '',
                        status,
                        payment_reference || null,
                        payment_status,
                        total_price,
                        deposit_amount,
                        addons_total,
                        JSON.stringify(Array.isArray(addons) ? addons : []),
                        paymentAmt || 0,
                        riskScore || 0 
                        ],
                        function (err4) {
                        if (err4) {
                            console.error('❌ SQL Insert Error:', err4.message);
                            return res.status(500).json({ error: 'Failed to create appointment' });
                        }

                        const newId = this.lastID;

                        // ✅ Log Transaction to transactions table
                        db.run(`INSERT INTO transactions (appointment_id, amount, reference, type, status) VALUES (?, ?, ?, 'payment', 'success')`, 
                            [newId, paymentAmt, payment_reference]);

                        if (rebook_from) {
                            db.run(
                            `UPDATE appointments SET status = 'rebooked' WHERE id = ? AND client_id = ?`,
                            [rebook_from, client_id],
                            (e) => e && console.error('Failed to mark rebooked:', e)
                            );
                        }

                        // Notifications & SMS
                        db.get(
                            `SELECT a.*, 
                                    c.name AS client_name, c.phone AS client_phone, c.notification_preferences AS client_prefs,
                                    s.name AS service_name,
                                    p.name AS provider_name, p.business_name, p.phone AS provider_phone, p.notification_preferences AS provider_prefs
                            FROM appointments a
                            JOIN users c ON a.client_id = c.id
                            JOIN services s ON a.service_id = s.id
                            JOIN users p ON a.provider_id = p.id
                            WHERE a.id = ?`,
                            [newId],
                            async (e, fullApt) => {
                            if (e) return;

                            const clientObj = { name: fullApt.client_name, phone: fullApt.client_phone, notification_preferences: fullApt.client_prefs };
                            const providerObj = { name: fullApt.provider_name, business_name: fullApt.business_name, phone: fullApt.provider_phone, notification_preferences: fullApt.provider_prefs };

                            createNotification(client_id, 'booking', 'Booking Sent', `Your booking for ${service.name} is pending approval.`, newId);
                            
                            // 🧠 Alert Provider if Risk is High
                            let alertMsg = `${fullApt.client_name} booked ${service.name}.`;
                            if (fullApt.no_show_risk > 0.7) {
                                alertMsg += ` ⚠️ High No-Show Risk detected (${(fullApt.no_show_risk * 100).toFixed(0)}%).`;
                            }
                            createNotification(service.provider_id, 'booking', 'New Booking Request', alertMsg, newId);

                            await smsService.sendBookingConfirmation(
                                {
                                    id: newId, 
                                    appointment_date: fullApt.appointment_date,
                                    total_price: fullApt.total_price,
                                    amount_paid: fullApt.amount_paid
                                },
                                clientObj,
                                { name: fullApt.service_name },
                                providerObj
                            );

                            await smsService.sendProviderNotification(
                                {
                                    id: newId, 
                                    appointment_date: fullApt.appointment_date,
                                    total_price: fullApt.total_price,
                                    amount_paid: fullApt.amount_paid
                                },
                                providerObj,
                                clientObj,
                                { name: fullApt.service_name }
                            );
                            }
                        );

                        res.status(201).json({
                            message: 'Appointment booked successfully',
                            appointmentId: newId,
                        });
                        }
                    );
                }
              );
            }
          );
        }
      );
    });
  }
);

/* ---------------------------------------------
   ✅ Provider can toggle open/closed status
--------------------------------------------- */
router.put('/providers/:id/closed', authenticateToken, (req, res) => {
  const providerId = req.params.id;
  const { is_closed } = req.body;
  db.run(
    `UPDATE services SET is_closed = ? WHERE provider_id = ?`,
    [is_closed ? 1 : 0, providerId],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to update provider status' });
      res.json({
        message: is_closed ? 'Provider marked as closed' : 'Provider marked as open',
      });
    }
  );
});

/* ---------------------------------------------
   ✅ Provider sets global business hours
--------------------------------------------- */
router.put(
  '/providers/:id/hours',
  authenticateToken,
  [
    body('opening_time').isString().matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
    body('closing_time').isString().matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
  ],
  (req, res) => {
    const providerId = req.params.id;
    const { opening_time, closing_time } = req.body;

    if (opening_time >= closing_time)
      return res.status(400).json({ error: 'Closing time must be later than opening time.' });

    db.run(
      `UPDATE users 
       SET opening_time = ?, closing_time = ?
       WHERE id = ? AND user_type = 'provider'`,
      [opening_time, closing_time, providerId],
      function (err) {
        if (err) return res.status(500).json({ error: 'Failed to update business hours' });
        res.json({
          message: `Business hours updated for provider ${providerId}`,
          opening_time,
          closing_time,
        });
      }
    );
  }
);

/* ---------------------------------------------
   ✅ Update appointment (Accept/Cancel/Reschedule) with AI Recalculation
--------------------------------------------- */
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  const userType = req.user.user_type;
  const { status, appointment_date, notes } = req.body;

  const accessQuery =
    userType === 'client'
      ? 'SELECT * FROM appointments WHERE id = ? AND client_id = ?'
      : 'SELECT * FROM appointments WHERE id = ? AND provider_id = ?';

  db.get(accessQuery, [id, userId], async (err, apt) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!apt) return res.status(404).json({ error: 'Appointment not found' });

    if (
      userType === 'provider' &&
      ['completed', 'cancelled', 'no-show', 'rebooked'].includes(apt.status)
    ) {
      return res.status(400).json({ error: 'Appointment status locked.' });
    }

    // ✅ RESCHEDULE VALIDATION & AI RE-CALCULATION
    let newRiskScore = null;

    if (appointment_date && appointment_date !== apt.appointment_date) {
        const newDate = new Date(appointment_date);
        if (newDate <= new Date()) return res.status(400).json({ error: 'New date must be in the future' });

        // 🧠 RE-CALCULATE AI RISK
        try {
            // 1. Fetch Service Category, Client History AND Payment Info
            const riskData = await new Promise((resolve, reject) => {
                db.get(
                    `SELECT s.category, 
                            (SELECT COUNT(*) FROM appointments WHERE client_id = ? AND status='no-show') as noshows,
                            (SELECT COUNT(*) FROM appointments WHERE client_id = ? AND status='cancelled') as cancels,
                            (SELECT MAX(appointment_date) FROM appointments WHERE client_id = ?) as last_visit
                     FROM services s
                     WHERE s.id = ?`,
                    [apt.client_id, apt.client_id, apt.client_id, apt.service_id], // FIXED: Removed extra param
                    (e, r) => e ? reject(e) : resolve(r)
                );
            });

            if (riskData) {
                const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const dayName = daysOfWeek[newDate.getDay()];
                const hour = newDate.getHours();
                let tod = 'afternoon';
                if (hour < 12) tod = 'morning';
                else if (hour > 17) tod = 'evening';

                const recency = riskData.last_visit 
                    ? Math.floor((new Date() - new Date(riskData.last_visit)) / (1000 * 60 * 60 * 24)) 
                    : 30;

                newRiskScore = await predictNoShow({
                    timeOfDay: tod,
                    dayOfWeek: dayName,
                    category: riskData.category || 'MISC',
                    recency: recency,
                    lastReceipt: 50, // Placeholder
                    historyNoShow: riskData.noshows || 0,
                    historyCancel: riskData.cancels || 0
                });
                
                console.log(`🤖 Reschedule - Base AI Score: ${newRiskScore.toFixed(2)}`);

                // 💰 APPLY PAYMENT OVERRIDE ON RESCHEDULE TOO
                const totalCost = Number(apt.total_price || 0);
                const paidAmt = Number(apt.amount_paid || 0);
                const depositReq = Number(apt.deposit_amount || 0);

                if (paidAmt >= totalCost && totalCost > 0) {
                    newRiskScore = newRiskScore * 0.2; 
                    console.log("💰 Reschedule: Fully Paid -> Risk Lowered.");
                } else if (paidAmt > depositReq) {
                    newRiskScore = newRiskScore * 0.7; 
                    console.log("💰 Reschedule: Extra Paid -> Risk Lowered.");
                }

                newRiskScore = Math.max(0, newRiskScore);
            }
        } catch (e) {
            console.error("AI Recalc Failed:", e);
        }
    }

    // Update logic
    const updates = [];
    const params = [];
    
    let effectiveStatus = status;
    const isReschedule = appointment_date && appointment_date !== apt.appointment_date;

    if (isReschedule && userType === 'client') {
        effectiveStatus = 'pending';
    }

    if (effectiveStatus) { updates.push('status = ?'); params.push(effectiveStatus); }
    if (appointment_date) { updates.push('appointment_date = ?'); params.push(appointment_date); }
    if (notes) { updates.push('notes = ?'); params.push(notes); }
    
    // 🧠 Add Risk Score update if calculated
    if (newRiskScore !== null) {
        updates.push('no_show_risk = ?');
        params.push(newRiskScore);
    }

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(id, userId);

    const q = userType === 'client'
      ? `UPDATE appointments SET ${updates.join(', ')} WHERE id = ? AND client_id = ?`
      : `UPDATE appointments SET ${updates.join(', ')} WHERE id = ? AND provider_id = ?`;

    db.run(q, params, async (err2) => {
      if (err2) return res.status(500).json({ error: 'Failed to update appointment' });

      // ✅ AUTOMATIC REFUND LOGIC
      if (status === 'cancelled') {
        try {
          await handleAutomaticRefund(id, userType, notes);
        } catch (refundErr) {
          console.error('Refund processing error:', refundErr);
        }
      }

      // Notifications
      db.get(
          `SELECT a.*, 
                  c.name AS client_name, c.phone AS client_phone, c.notification_preferences AS client_prefs,
                  s.name AS service_name,
                  p.name AS provider_name, p.business_name, p.phone AS provider_phone, p.notification_preferences AS provider_prefs
           FROM appointments a
           JOIN users c ON a.client_id = c.id
           JOIN services s ON a.service_id = s.id
           JOIN users p ON a.provider_id = p.id
           WHERE a.id = ?`,
          [id],
          async (err3, fullApt) => {
            if (!err3 && fullApt) {
              const clientObj = { name: fullApt.client_name, phone: fullApt.client_phone, notification_preferences: fullApt.client_prefs };
              const providerObj = { name: fullApt.provider_name, business_name: fullApt.business_name, phone: fullApt.provider_phone };

              if (status === 'scheduled' && apt.status === 'pending') {
                createNotification(fullApt.client_id, 'booking', 'Booking Confirmed', `Your booking for ${fullApt.service_name} has been confirmed.`, id);
                await smsService.sendBookingAccepted({ ...fullApt, id: id }, clientObj, { name: fullApt.service_name }, providerObj);
              }
              
              if (status === 'cancelled') {
                if (userType === 'client') {
                    createNotification(fullApt.provider_id, 'cancellation', 'Booking Cancelled', `${fullApt.client_name} cancelled appointment #${id}.`, id);
                } else {
                    createNotification(fullApt.client_id, 'cancellation', 'Booking Cancelled', `Provider cancelled appointment #${id}.`, id);
                }
                
                await smsService.sendCancellationNotice(
                  { ...fullApt, id: id, amount_paid: fullApt.amount_paid, provider_name: fullApt.provider_name }, 
                  clientObj, 
                  { name: fullApt.service_name }, 
                  notes,
                  userType 
                );
              }

              if (isReschedule) {
                  const targetUser = userType === 'client' ? fullApt.provider_id : fullApt.client_id;
                  const title = userType === 'client' ? 'Reschedule Request' : 'Appointment Rescheduled';
                  const msg = userType === 'client' 
                    ? `${fullApt.client_name} requested to reschedule #${id}.` 
                    : `Provider moved appointment #${id} to a new time.`;
                  
                  createNotification(targetUser, 'reschedule', title, msg, id);
                  
                  // 🧠 Alert Provider if RISK CHANGED to HIGH
                  if (newRiskScore && newRiskScore > 0.7) {
                      createNotification(fullApt.provider_id, 'reschedule', 'High Risk Reschedule', `⚠️ ${fullApt.client_name}'s rescheduled slot has High No-Show Risk.`, id);
                  }

                  await smsService.sendRescheduleNotification(
                      { ...fullApt, id: id, appointment_date: appointment_date }, 
                      clientObj, 
                      { name: fullApt.service_name }, 
                      providerObj, 
                      apt.appointment_date, 
                      effectiveStatus 
                  );
              }
            }
          }
        );

      res.json({ message: 'Appointment updated successfully' });
    });
  });
});

/* ---------------------------------------------
   ✅ Soft delete appointment
--------------------------------------------- */
router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  const userType = req.user.user_type;
  const delField = userType === 'client' ? 'client_deleted' : 'provider_deleted';

  db.run(
    `UPDATE appointments SET ${delField} = 1 WHERE id = ? AND ${userType}_id = ?`,
    [id, userId],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to delete appointment' });
      if (this.changes === 0)
        return res.status(404).json({ error: 'Appointment not found' });
      db.get(
        'SELECT client_deleted, provider_deleted FROM appointments WHERE id = ?',
        [id],
        (e, row) => {
          if (row && row.client_deleted && row.provider_deleted)
            db.run('DELETE FROM appointments WHERE id = ?', [id]);
          res.json({ message: 'Appointment removed from dashboard' });
        }
      );
    }
  );
});

/* ---------------------------------------------
   ✅ Update payment (Includes 🧠 AI Risk Recalculation)
--------------------------------------------- */
router.put('/:id/payment', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { payment_reference, amount_paid, payment_status } = req.body;

  if (!payment_reference)
    return res.status(400).json({ error: "Missing payment reference" });

  const paid = Number(amount_paid || 0);

  db.get(
    `SELECT * FROM appointments WHERE id = ?`,
    [id],
    async (err, row) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (!row) return res.status(404).json({ error: "Appointment not found" });

      const finalStatus = paid >= row.total_price ? "paid" : "deposit-paid";

      // 🧠 RE-CALCULATE RISK ON PAYMENT
      let newRiskScore = null;
      try {
          const riskData = await new Promise((resolve, reject) => {
              db.get(
                  `SELECT s.category, 
                          (SELECT COUNT(*) FROM appointments WHERE client_id = ? AND status='no-show') as noshows,
                          (SELECT COUNT(*) FROM appointments WHERE client_id = ? AND status='cancelled') as cancels,
                          (SELECT MAX(appointment_date) FROM appointments WHERE client_id = ?) as last_visit
                   FROM services s
                   WHERE s.id = ?`,
                  [row.client_id, row.client_id, row.client_id, row.service_id], // FIXED: Removed extra param
                  (e, r) => e ? reject(e) : resolve(r)
              );
          });

          if (riskData) {
              const aptDate = new Date(row.appointment_date);
              const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
              const dayName = daysOfWeek[aptDate.getDay()];
              const hour = aptDate.getHours();
              let tod = 'afternoon';
              if (hour < 12) tod = 'morning';
              else if (hour > 17) tod = 'evening';

              const recency = riskData.last_visit 
                  ? Math.floor((new Date() - new Date(riskData.last_visit)) / (1000 * 60 * 60 * 24)) 
                  : 30;

              newRiskScore = await predictNoShow({
                  timeOfDay: tod,
                  dayOfWeek: dayName,
                  category: riskData.category || 'MISC',
                  recency: recency,
                  lastReceipt: 50, 
                  historyNoShow: riskData.noshows || 0,
                  historyCancel: riskData.cancels || 0
              });

              // Apply Payment Logic
              const totalCost = Number(row.total_price || 0);
              const depositReq = Number(row.deposit_amount || 0);
              
              if (paid >= totalCost && totalCost > 0) {
                  newRiskScore = newRiskScore * 0.2;
              } else if (paid > depositReq) {
                  newRiskScore = newRiskScore * 0.7;
              }
              newRiskScore = Math.max(0, newRiskScore);
          }
      } catch (e) {
          console.error("Payment Risk Recalc Failed:", e);
      }

      // Update Query
      let updateQuery = `
        UPDATE appointments
        SET payment_reference = ?,
            amount_paid = ?, 
            payment_status = ?
      `;
      const updateParams = [payment_reference, paid, finalStatus];

      if (newRiskScore !== null) {
          updateQuery += `, no_show_risk = ?`;
          updateParams.push(newRiskScore);
      }

      updateQuery += ` WHERE id = ?`;
      updateParams.push(id);

      db.run(
        updateQuery,
        updateParams,
        function (err2) {
          if (err2) return res.status(500).json({ error: "Failed to update payment info" });
          
          db.run(`INSERT INTO transactions (appointment_id, amount, reference, type, status) VALUES (?, ?, ?, 'payment', 'success')`, 
                [id, paid, payment_reference]);

          db.get(`SELECT provider_id FROM appointments WHERE id=?`, [id], (e, r) => {
             if(r) createNotification(r.provider_id, 'payment', 'Payment Received', `Payment of KES ${paid} received for Appt #${id}.`, id);
          });

          return res.json({
            message: "Payment updated successfully",
            amount_paid: paid,
            payment_status: finalStatus,
          });
        }
      );
    }
  );
});

/* ---------------------------------------------
   ✅ Pay remaining balance (Includes 🧠 AI Risk Recalculation)
--------------------------------------------- */
router.put('/:id/pay-balance', authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  const { payment_reference, amount_paid } = req.body;

  if (!payment_reference || !amount_paid || Number(amount_paid) <= 0) {
    return res.status(400).json({ error: 'payment_reference and positive amount_paid are required' });
  }

  db.get(`SELECT * FROM appointments WHERE id = ?`, [id], async (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) return res.status(404).json({ error: 'Appointment not found' });

    if (row.client_id !== userId && row.provider_id !== userId) {
      return res.status(403).json({ error: 'Forbidden: You are not authorized to update this appointment.' });
    }

    const prevPaid = Number(row.amount_paid || 0);
    const newPaid = prevPaid + Number(amount_paid);
    const finalStatus = newPaid >= Number(row.total_price || 0) ? 'paid' : 'deposit-paid';

    // 🧠 RE-CALCULATE RISK ON BALANCE PAYMENT
    let newRiskScore = null;
    try {
        const riskData = await new Promise((resolve, reject) => {
            db.get(
                `SELECT s.category, 
                        (SELECT COUNT(*) FROM appointments WHERE client_id = ? AND status='no-show') as noshows,
                        (SELECT COUNT(*) FROM appointments WHERE client_id = ? AND status='cancelled') as cancels,
                        (SELECT MAX(appointment_date) FROM appointments WHERE client_id = ?) as last_visit
                 FROM services s
                 WHERE s.id = ?`,
                [row.client_id, row.client_id, row.client_id, row.service_id], // FIXED: Removed extra param
                (e, r) => e ? reject(e) : resolve(r)
            );
        });

        if (riskData) {
            const aptDate = new Date(row.appointment_date);
            const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const dayName = daysOfWeek[aptDate.getDay()];
            const hour = aptDate.getHours();
            let tod = 'afternoon';
            if (hour < 12) tod = 'morning';
            else if (hour > 17) tod = 'evening';

            const recency = riskData.last_visit 
                ? Math.floor((new Date() - new Date(riskData.last_visit)) / (1000 * 60 * 60 * 24)) 
                : 30;

            newRiskScore = await predictNoShow({
                timeOfDay: tod,
                dayOfWeek: dayName,
                category: riskData.category || 'MISC',
                recency: recency,
                lastReceipt: 50, 
                historyNoShow: riskData.noshows || 0,
                historyCancel: riskData.cancels || 0
            });

            // Apply Payment Logic (Using newPaid which is current + previous)
            const totalCost = Number(row.total_price || 0);
            const depositReq = Number(row.deposit_amount || 0);
            
            if (newPaid >= totalCost && totalCost > 0) {
                newRiskScore = newRiskScore * 0.2;
            } else if (newPaid > depositReq) {
                newRiskScore = newRiskScore * 0.7;
            }
            newRiskScore = Math.max(0, newRiskScore);
        }
    } catch (e) {
        console.error("Balance Pay Risk Recalc Failed:", e);
    }

    let updateQuery = `
      UPDATE appointments
      SET amount_paid = ?, payment_reference = ?, payment_status = ?
    `;
    const updateParams = [newPaid, payment_reference, finalStatus];

    if (newRiskScore !== null) {
        updateQuery += `, no_show_risk = ?`;
        updateParams.push(newRiskScore);
    }

    updateQuery += ` WHERE id = ?`;
    updateParams.push(id);

    db.run(
      updateQuery,
      updateParams,
      function (err2) {
        if (err2) return res.status(500).json({ error: 'Failed to update balance payment' });

        db.run(`INSERT INTO transactions (appointment_id, amount, reference, type, status) VALUES (?, ?, ?, 'payment', 'success')`, 
                [id, amount_paid, payment_reference]);

        createNotification(row.provider_id, 'payment', 'Balance Paid', `Balance payment of KES ${amount_paid} received for Appt #${id}.`, id);

        db.get(
          `SELECT c.name, c.phone, c.notification_preferences, s.name AS service_name, a.*
           FROM appointments a
           JOIN users c ON a.client_id = c.id
           JOIN services s ON a.service_id = s.id
           WHERE a.id = ?`,
          [id],
          async (err3, fullApt) => {
            if (!err3 && fullApt && fullApt.phone) {
              await smsService.sendPaymentReceipt(
                {
                  id: id, 
                  amount_paid: amount_paid,
                  total_price: fullApt.total_price,
                  payment_reference: payment_reference
                },
                { name: fullApt.name, phone: fullApt.phone, notification_preferences: fullApt.notification_preferences },
                { name: fullApt.service_name }
              );
            }
          }
        );

        res.json({ message: 'Balance payment recorded', amount_paid: newPaid, payment_status: finalStatus });
      }
    );
  });
});

/* ---------------------------------------------
   ✅ Provider can prompt client for remaining balance
--------------------------------------------- */
router.post('/:id/request-balance', authenticateToken, (req, res) => {
  const { id } = req.params;
  const providerId = req.user.userId;
  const { amount_requested, note } = req.body;

  if (!amount_requested || Number(amount_requested) <= 0) {
    return res.status(400).json({ error: 'amount_requested must be a positive number' });
  }

  db.get(`SELECT provider_id, client_id FROM appointments WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) return res.status(404).json({ error: 'Appointment not found' });
    if (row.provider_id !== providerId) return res.status(403).json({ error: 'Forbidden' });

    db.run(
      `INSERT INTO payment_requests (appointment_id, provider_id, client_id, amount_requested, note)
       VALUES (?, ?, ?, ?, ?)`,
      [id, providerId, row.client_id, Number(amount_requested), note || null],
      function (err2) {
        if (err2) return res.status(500).json({ error: 'Failed to create payment request' });
        
        createNotification(row.client_id, 'payment', 'Balance Request', `Provider requested balance payment of KES ${amount_requested}.`, id);
        
        res.json({ message: 'Payment request created', request_id: this.lastID });
      }
    );
  });
});

/* ---------------------------------------------
   ✅ MANUAL REFUND PROCESSING (Provider Only)
--------------------------------------------- */
router.post('/:id/process-refund', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const providerId = req.user.userId;

  if (req.user.user_type !== 'provider') {
    return res.status(403).json({ error: 'Only providers can process refunds' });
  }

  db.get(
    `SELECT a.*, 
            c.name AS client_name, c.phone AS client_phone, c.notification_preferences AS client_prefs
     FROM appointments a
     JOIN users c ON a.client_id = c.id
     WHERE a.id = ? AND a.provider_id = ?`,
    [id, providerId],
    async (err, apt) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!apt) return res.status(404).json({ error: 'Appointment not found' });

      if (apt.refund_status !== 'pending') {
        return res.status(400).json({ error: 'No pending refund request found for this appointment' });
      }

      const amountToRefund = Number(apt.refund_amount || apt.amount_paid || 0);

      if (amountToRefund <= 0) {
        return res.status(400).json({ error: 'No amount to refund' });
      }

      db.run(`UPDATE appointments SET refund_status = 'processing' WHERE id = ?`, [id]);

      try {
          const result = await processMultiTransactionRefund(id, amountToRefund);
          
          db.run(
            `UPDATE appointments 
             SET refund_status = 'completed',
                 refund_reference = ?,
                 refund_completed_at = datetime('now'),
                 payment_status = 'refunded'
             WHERE id = ?`,
            [result.references.join(','), id] 
          );

          createNotification(apt.client_id, 'refund', 'Refund Processed', `Your refund of KES ${amountToRefund} has been processed.`, id);

          await sendRefundNotification(
            { id, payment_reference: apt.payment_reference },
            { name: apt.client_name, phone: apt.client_phone, notification_preferences: apt.client_prefs },
            amountToRefund,
            'completed'
          );

          res.json({ 
            message: 'Refund processed successfully', 
            refund_references: result.references 
          });

      } catch (error) {
          console.error("Manual refund failed:", error);
          db.run(`UPDATE appointments SET refund_status = 'failed' WHERE id = ?`, [id]);
          res.status(500).json({ error: 'Refund processing failed', details: error.message });
      }
    }
  );
});

/* ---------------------------------------------
   ✅ AUTOMATIC REFUND HANDLER FUNCTION
--------------------------------------------- */
async function handleAutomaticRefund(appointmentId, cancelledBy, reason) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT a.*, 
              c.name AS client_name, c.phone AS client_phone, c.notification_preferences AS client_prefs,
              p.name AS provider_name, p.phone AS provider_phone, p.notification_preferences AS provider_prefs,
              s.name AS service_name
       FROM appointments a
       JOIN users c ON a.client_id = c.id
       JOIN users p ON a.provider_id = p.id
       JOIN services s ON a.service_id = s.id
       WHERE a.id = ?`,
      [appointmentId],
      async (err, apt) => {
        if (err || !apt) return reject(err);

        const amountPaid = Number(apt.amount_paid || 0);
        if (amountPaid <= 0) return resolve(); 

        const clientObj = { name: apt.client_name, phone: apt.client_phone, notification_preferences: apt.client_prefs };
        const providerObj = { name: apt.provider_name, phone: apt.provider_phone, notification_preferences: apt.provider_prefs };

        if (cancelledBy === 'provider') {
          console.log(`Processing auto-refund for Appt #${appointmentId}`);
          
          db.run(
            `UPDATE appointments 
             SET refund_status = 'processing', 
                 refund_amount = ?, 
                 refund_initiated_at = datetime('now'),
                 payment_status = 'refund-pending'
             WHERE id = ?`,
            [amountPaid, appointmentId]
          );

          try {
            const result = await processMultiTransactionRefund(appointmentId, amountPaid);

            db.run(
              `UPDATE appointments 
               SET refund_status = 'completed',
                   refund_reference = ?,
                   refund_completed_at = datetime('now'),
                   payment_status = 'refunded'
               WHERE id = ?`,
              [result.references.join(','), appointmentId]
            );

            createNotification(apt.client_id, 'refund', 'Refund Processed', `Your refund of KES ${amountPaid} for Appt #${appointmentId} is complete.`, appointmentId);

            await sendRefundNotification(
              { id: appointmentId, payment_reference: apt.payment_reference },
              clientObj,
              amountPaid,
              'completed'
            );
            resolve();
          } catch (refundError) {
             console.error("❌ Auto-Refund Failed:", refundError);
             db.run(`UPDATE appointments SET refund_status = 'failed' WHERE id = ?`, [appointmentId]);
             
             createNotification(
                 apt.provider_id, 
                 'refund', 
                 'Auto-Refund Failed', 
                 `Automatic refund for Appt #${appointmentId} failed. Please process it manually from dashboard.`, 
                 appointmentId
             );
             resolve(); 
          }
        }
        else if (cancelledBy === 'client') {
          console.log(`Client cancelled. Requesting refund for Appt #${appointmentId}`);
          
          db.run(
            `UPDATE appointments 
             SET refund_status = 'pending', 
                 refund_amount = ?, 
                 refund_initiated_at = datetime('now'),
                 payment_status = 'refund-pending'
             WHERE id = ?`,
            [amountPaid, appointmentId]
          );

          createNotification(apt.provider_id, 'refund', 'Refund Request', `Client cancelled Appt #${appointmentId}. Please process refund.`, appointmentId);

          await sendRefundRequestToProvider(
            { id: appointmentId },
            providerObj,
            clientObj,
            amountPaid
          );
          resolve();
        }
      }
    );
  });
}

export default router;