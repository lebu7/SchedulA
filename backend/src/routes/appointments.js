import express from 'express';
import { body, validationResult } from 'express-validator';
import { db } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import smsService from '../services/smsService.js';

const router = express.Router();

/* ---------------------------------------------
   ✅ Ensure "rebooked" status exists
--------------------------------------------- */
db.get(
  `SELECT sql FROM sqlite_master WHERE type='table' AND name='appointments'`,
  [],
  (err, row) => {
    if (err || !row) return;
    if (!row.sql.includes("'rebooked'")) {
      console.log('⚙️ Updating appointments table to support status = rebooked...');
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
            payment_status TEXT DEFAULT 'unpaid',
            payment_reference TEXT,
            amount_paid REAL DEFAULT 0,
            total_price REAL DEFAULT 0,
            reminder_sent INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES users(id),
            FOREIGN KEY (provider_id) REFERENCES users(id),
            FOREIGN KEY (service_id) REFERENCES services(id)
          );
        `);
        db.run(`INSERT INTO appointments_new SELECT * FROM appointments;`);
        db.run('DROP TABLE appointments;');
        db.run('ALTER TABLE appointments_new RENAME TO appointments;');
        db.run('PRAGMA foreign_keys=on;');
        console.log('✅ Appointments table supports rebooked status.');
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
      console.log('✅ payment_requests table created');
    }
  }
);

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
             u.name AS client_name, u.phone AS client_phone
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      JOIN users u ON a.client_id = u.id
      WHERE a.provider_id = ? AND a.provider_deleted = 0
      ORDER BY a.appointment_date DESC`;

  db.all(query, [userId], (err, appointments) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch appointments' });

    const now = new Date().toISOString();
    const filter = (arr, status, futureOnly = true) =>
      arr.filter((a) => a.status === status && (!futureOnly || a.appointment_date > now));

    if (userType === 'client') {
      res.json({
        appointments: {
          pending: filter(appointments, 'pending'),
          scheduled: filter(appointments, 'scheduled'),
          past: appointments.filter(
            (a) =>
              ['completed', 'cancelled', 'no-show', 'rebooked'].includes(a.status) ||
              a.appointment_date <= now
          ),
        },
      });
    } else {
      res.json({
        appointments: {
          pending: filter(appointments, 'pending'),
          upcoming: filter(appointments, 'scheduled'),
          past: appointments.filter(
            (a) =>
              ['completed', 'cancelled', 'no-show', 'rebooked'].includes(a.status) ||
              a.appointment_date <= now
          ),
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
    
    // Calculate summary
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
   ✅ Check provider availability (Frontend uses this for grid)
--------------------------------------------- */
router.get('/providers/:id/availability', (req, res) => {
  const providerId = req.params.id;
  const { date } = req.query; // YYYY-MM-DD

  if (!date) return res.status(400).json({ error: 'Date required' });

  // 1. Get Business Hours
  db.get(
    `SELECT opening_time, closing_time FROM users WHERE id = ? AND user_type = 'provider'`,
    [providerId],
    (err, provider) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!provider) return res.status(404).json({ error: 'Provider not found' });

      // 2. Check if Day is Closed
      db.get(
        `SELECT * FROM provider_closed_days WHERE provider_id = ? AND closed_date = ?`,
        [providerId, date],
        (err2, closedDay) => {
          if (err2) return res.status(500).json({ error: 'Database error' });

          // 3. Fetch Booked Slots
          // We need start time AND duration to calculate the full booked range
          db.all(
            `SELECT a.appointment_date, s.duration 
             FROM appointments a
             JOIN services s ON a.service_id = s.id
             WHERE a.provider_id = ? 
             AND date(a.appointment_date) = ?
             AND a.status IN ('pending', 'scheduled', 'paid')`, // Ignore cancelled
            [providerId, date],
            (err3, bookedRows) => {
              if (err3) return res.status(500).json({ error: 'Failed to fetch booked slots' });

              const bookedSlots = bookedRows.map(row => {
                const start = new Date(row.appointment_date);
                const end = new Date(start.getTime() + row.duration * 60000); 
                
                return {
                  start: start.toTimeString().slice(0, 5), // "10:00"
                  end: end.toTimeString().slice(0, 5)      // "11:00"
                };
              });

              res.json({
                provider_id: providerId,
                date,
                is_closed: !!closedDay,
                closed_reason: closedDay?.reason || null,
                opening_time: provider.opening_time || '08:00',
                closing_time: provider.closing_time || '18:00',
                booked_slots: bookedSlots // Frontend logic calculates remaining capacity
              });
            }
          );
        }
      );
    }
  );
});

/* ---------------------------------------------
   ✅ Create appointment (With Capacity Check)
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
        error: 'Payment required before booking. Provide payment_reference and payment_amount.',
      });
    }

    const client_id = req.user.userId;
    const appointmentDate = new Date(appointment_date);
    if (appointmentDate <= new Date())
      return res.status(400).json({ error: 'Appointment date must be in the future' });

    // 1. Get Service Details (needed for duration & capacity)
    db.get('SELECT * FROM services WHERE id = ?', [service_id], (err, service) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!service) return res.status(404).json({ error: 'Service not found' });

      // 2. Check Provider Closed Days
      const day = appointmentDate.toISOString().split('T')[0];
      db.get(
        'SELECT * FROM provider_closed_days WHERE provider_id = ? AND closed_date = ?',
        [service.provider_id, day],
        (err2, closedDay) => {
          if (closedDay)
            return res.status(400).json({
              error: `Provider is closed on ${day}.`,
            });

          // 3. Check Provider Business Hours
          db.get(
            `SELECT opening_time, closing_time FROM users WHERE id = ? AND user_type = 'provider'`,
            [service.provider_id],
            (err3, provider) => {
              if (err3)
                return res.status(500).json({ error: 'Error checking provider hours' });

              const open = provider?.opening_time || '08:00';
              const close = provider?.closing_time || '18:00';

              // Convert times to minutes for easier comparison
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

              // 4. 🛡️ CHECK CAPACITY (Count Overlaps)
              const newStartISO = appointmentDate.toISOString();
              // Calculate End Time based on duration
              const newEndISO = new Date(appointmentDate.getTime() + service.duration * 60000).toISOString();

              // Fetch ALL overlapping appointments for this provider
              db.all(
                `SELECT a.id 
                 FROM appointments a
                 JOIN services s ON a.service_id = s.id
                 WHERE a.provider_id = ? 
                 AND a.status IN ('pending', 'scheduled', 'paid') 
                 AND (
                    -- Check overlaps
                    (a.appointment_date < ? AND datetime(a.appointment_date, '+' || s.duration || ' minutes') > ?)
                 )`,
                [service.provider_id, newEndISO, newStartISO],
                (errOverlap, existingBookings) => {
                    if (errOverlap) return res.status(500).json({ error: 'Error checking availability' });
                    
                    // ✅ CRITICAL UPDATE: Count overlaps against Capacity
                    const maxCapacity = service.capacity || 1; // Default to 1 if not set
                    
                    if (existingBookings.length >= maxCapacity) {
                        return res.status(400).json({ 
                            error: `This time slot is fully booked (Max ${maxCapacity} people). Please choose another time.` 
                        });
                    }

                    // 5. Proceed to Create Appointment
                    const status = 'pending';
                    const total_price = Number(service.price || 0);
                    const deposit_amount = Math.round(total_price * 0.3);
                    const paymentAmt = Number(payment_amount || 0);
                    let payment_status = paymentAmt >= total_price ? 'paid' : 'deposit-paid';

                    db.run(
                        `INSERT INTO appointments (
                        client_id, provider_id, service_id, appointment_date, notes, status,
                        payment_reference, payment_amount, payment_status,
                        total_price, deposit_amount, addons_total, addons, amount_paid
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
                        paymentAmt || 0,
                        payment_status,
                        total_price,
                        deposit_amount,
                        0, // addons_total placeholder
                        JSON.stringify([]), // addons placeholder
                        paymentAmt || 0,
                        ],
                        function (err4) {
                        if (err4) {
                            console.error('❌ SQL Insert Error:', err4.message);
                            return res.status(500).json({ error: 'Failed to create appointment' });
                        }

                        const newId = this.lastID;

                        if (rebook_from) {
                            db.run(
                            `UPDATE appointments SET status = 'rebooked' WHERE id = ? AND client_id = ?`,
                            [rebook_from, client_id],
                            (e) => e && console.error('Failed to mark rebooked:', e)
                            );
                        }

                        // ✅ Fetch & Send SMS Notifications
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
                            if (e) {
                                console.error('❌ Fetch after insert failed:', e);
                                return;
                            }

                            const clientObj = { 
                                name: fullApt.client_name, 
                                phone: fullApt.client_phone, 
                                notification_preferences: fullApt.client_prefs 
                            };
                            const providerObj = { 
                                name: fullApt.provider_name, 
                                business_name: fullApt.business_name, 
                                phone: fullApt.provider_phone, 
                                notification_preferences: fullApt.provider_prefs
                            };

                            // SMS to Client
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

                            // SMS to Provider
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
                            message: 'Appointment booked successfully (pending provider confirmation)',
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
   ✅ Update appointment (Accept/Cancel/Reschedule)
--------------------------------------------- */
router.put('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  const userType = req.user.user_type;
  const { status, appointment_date, notes } = req.body;

  const accessQuery =
    userType === 'client'
      ? 'SELECT * FROM appointments WHERE id = ? AND client_id = ?'
      : 'SELECT * FROM appointments WHERE id = ? AND provider_id = ?';

  db.get(accessQuery, [id, userId], (err, apt) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!apt) return res.status(404).json({ error: 'Appointment not found' });

    if (
      userType === 'provider' &&
      ['completed', 'cancelled', 'no-show', 'rebooked'].includes(apt.status)
    ) {
      return res.status(400).json({ error: 'Appointment status locked.' });
    }

    const updates = [];
    const params = [];
    if (status) {
      updates.push('status = ?');
      params.push(status);
    }
    if (appointment_date) {
      updates.push('appointment_date = ?');
      params.push(appointment_date);
    }
    if (notes) {
      updates.push('notes = ?');
      params.push(notes);
    }

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    
    params.push(id, userId);

    const q =
      userType === 'client'
        ? `UPDATE appointments SET ${updates.join(', ')} WHERE id = ? AND client_id = ?`
        : `UPDATE appointments SET ${updates.join(', ')} WHERE id = ? AND provider_id = ?`;

    db.run(q, params, (err2) => {
      if (err2) return res.status(500).json({ error: 'Failed to update appointment' });

      // 4. 🚀 SMS TRIGGER LOGIC
      if (status === 'scheduled' || status === 'cancelled') {
        db.get(
          `SELECT a.*, 
                  c.name AS client_name, c.phone AS client_phone, c.notification_preferences AS client_prefs,
                  s.name AS service_name,
                  p.name AS provider_name, p.business_name
           FROM appointments a
           JOIN users c ON a.client_id = c.id
           JOIN services s ON a.service_id = s.id
           JOIN users p ON a.provider_id = p.id
           WHERE a.id = ?`,
          [id],
          async (err3, fullApt) => {
            if (!err3 && fullApt) {
              
              if (!fullApt.client_phone) {
                 console.warn(`⚠️ SMS Skipped: Client (ID ${fullApt.client_id}) has no phone number.`);
                 return;
              }

              const clientObj = { 
                  name: fullApt.client_name, 
                  phone: fullApt.client_phone, 
                  notification_preferences: fullApt.client_prefs 
              };
              const providerObj = { name: fullApt.provider_name, business_name: fullApt.business_name };

              // A) Provider ACCEPTED the booking (Pending -> Scheduled)
              if (status === 'scheduled' && apt.status === 'pending') {
                console.log(`✅ Sending Acceptance SMS for Appt #${id}`);
                await smsService.sendBookingAccepted(
                  { ...fullApt, id: id }, // ✅ CRITICAL FIX: Ensuring ID is passed
                  clientObj,
                  { name: fullApt.service_name },
                  providerObj
                );
              }

              // B) Appointment CANCELLED
              if (status === 'cancelled') {
                console.log(`✅ Sending Cancellation SMS for Appt #${id}`);
                await smsService.sendCancellationNotice(
                  { ...fullApt, id: id }, // ✅ CRITICAL FIX: Ensuring ID is passed
                  clientObj,
                  { name: fullApt.service_name },
                  notes // Reason for cancellation
                );
              }
            }
          }
        );
      }

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
   ✅ Update payment (Initial or partial)
--------------------------------------------- */
router.put('/:id/payment', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { payment_reference, amount_paid, payment_status } = req.body;

  if (!payment_reference)
    return res.status(400).json({ error: "Missing payment reference" });

  const paid = Number(amount_paid || 0);

  // Get total_price (used to decide paid or deposit-paid)
  db.get(
    `SELECT total_price FROM appointments WHERE id = ?`,
    [id],
    (err, row) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (!row) return res.status(404).json({ error: "Appointment not found" });

      const finalStatus = paid >= row.total_price ? "paid" : "deposit-paid";

      db.run(
        `
        UPDATE appointments
        SET payment_reference = ?,
            amount_paid = ?, 
            payment_amount = ?, 
            payment_status = ?
        WHERE id = ?
        `,
        [payment_reference, paid, paid, finalStatus, id],
        function (err2) {
          if (err2) return res.status(500).json({ error: "Failed to update payment info" });

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
   ✅ Pay remaining balance
   (Includes SMS Receipt)
--------------------------------------------- */
router.put('/:id/pay-balance', authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  const { payment_reference, amount_paid } = req.body;

  if (!payment_reference || !amount_paid || Number(amount_paid) <= 0) {
    return res.status(400).json({ error: 'payment_reference and positive amount_paid are required' });
  }

  db.get(`SELECT client_id, provider_id, total_price, amount_paid FROM appointments WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) return res.status(404).json({ error: 'Appointment not found' });

    if (row.client_id !== userId && row.provider_id !== userId) {
      return res.status(403).json({ error: 'Forbidden: You are not authorized to update this appointment.' });
    }

    const prevPaid = Number(row.amount_paid || 0);
    const newPaid = prevPaid + Number(amount_paid);
    const finalStatus = newPaid >= Number(row.total_price || 0) ? 'paid' : 'deposit-paid';

    db.run(
      `UPDATE appointments
       SET amount_paid = ?, payment_reference = ?, payment_status = ?
       WHERE id = ?`,
      [newPaid, payment_reference, finalStatus, id],
      function (err2) {
        if (err2) return res.status(500).json({ error: 'Failed to update balance payment' });

        // 📱 Send Payment Receipt SMS
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
        res.json({ message: 'Payment request created', request_id: this.lastID });
      }
    );
  });
});

export default router;