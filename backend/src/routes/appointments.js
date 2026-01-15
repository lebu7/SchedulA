// backend/routes/appointments.js
import express from 'express';
import { body, validationResult } from 'express-validator';
import { db } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

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
   (used when provider prompts client for remaining balance)
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
   ✅ Create appointment (checks closure & hours)
   NOTE: Strict payment enforcement:
   - Creation requires payment_reference && payment_amount > 0
   - If amount >= total_price => payment_status = 'paid'
   - If 0 < amount < total_price => payment_status = 'deposit-paid'
   - If payment fails or missing => reject creation (400)
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

    // Enforce payment provided at creation time (no "pay later")
    if (!payment_reference || !payment_amount || Number(payment_amount) <= 0) {
      return res.status(400).json({
        error: 'Payment required before booking. Provide payment_reference and payment_amount.',
      });
    }

    const client_id = req.user.userId;
    const appointmentDate = new Date(appointment_date);
    if (appointmentDate <= new Date())
      return res.status(400).json({ error: 'Appointment date must be in the future' });

    db.get('SELECT * FROM services WHERE id = ?', [service_id], (err, service) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!service) return res.status(404).json({ error: 'Service not found' });

      const day = appointmentDate.toISOString().split('T')[0];
      db.get(
        'SELECT * FROM provider_closed_days WHERE provider_id = ? AND closed_date = ?',
        [service.provider_id, day],
        (err2, closedDay) => {
          if (closedDay)
            return res.status(400).json({
              error: `Provider is closed on ${day}. Please select another date.`,
            });

          // ✅ Use provider hours from users table
          db.get(
            `SELECT opening_time, closing_time FROM users WHERE id = ? AND user_type = 'provider'`,
            [service.provider_id],
            (err3, provider) => {
              if (err3)
                return res.status(500).json({ error: 'Error checking provider hours' });

              const open = provider?.opening_time || '08:00';
              const close = provider?.closing_time || '18:00';

              // Convert appointment time to Nairobi local time
              const nairobiTime = new Date(
                appointmentDate.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })
              );

              const bookingHour = nairobiTime.getHours();
              const bookingMinute = nairobiTime.getMinutes();
              const bookingTotalMinutes = bookingHour * 60 + bookingMinute;

              const [openH, openM] = open.split(':').map(Number);
              const [closeH, closeM] = close.split(':').map(Number);
              const openMinutes = openH * 60 + openM;
              const closeMinutes = closeH * 60 + closeM;

              if (bookingTotalMinutes < openMinutes || bookingTotalMinutes >= closeMinutes) {
                return res.status(400).json({
                  error: `Bookings are only allowed between ${open} and ${close}.`,
                });
              }

              // ✅ Create appointment
              const status = 'pending'; // all new appointments start pending

              // 🧮 Calculate add-on totals
              let addons_total = 0;
              if (Array.isArray(addons) && addons.length > 0) {
                addons_total = addons.reduce(
                  (sum, addon) => sum + Number(addon.price ?? addon.price ?? 0),
                  0
                );
              }

              // 🧾 Compute totals based on service and addons
              const total_price = Number(service.price || 0) + addons_total;
              const deposit_amount = Math.round(total_price * 0.3);

              // Payment amount sanity
              const paymentAmt = Number(payment_amount || 0);

              // Determine payment_status
              let payment_status = 'unpaid';
              if (paymentAmt >= total_price) payment_status = 'paid';
              else if (paymentAmt > 0 && paymentAmt < total_price) payment_status = 'deposit-paid';

              // Insert into database (store addons JSON too)
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
                  addons_total,
                  JSON.stringify(Array.isArray(addons) ? addons : []),
                  paymentAmt || 0, // amount_paid column (some schemas may already have this)
                ],
                function (err4) {
                  if (err4) {
                    console.error('❌ SQL Insert Error:', err4.message);
                    return res
                      .status(500)
                      .json({ error: 'Failed to create appointment', details: err4.message });
                  }

                  const newId = this.lastID;

                  // existing rebook logic...
                  if (rebook_from) {
                    db.run(
                      `UPDATE appointments SET status = 'rebooked' WHERE id = ? AND client_id = ?`,
                      [rebook_from, client_id],
                      (e) => e && console.error('Failed to mark rebooked:', e)
                    );
                  }

                  // fetch created appointment (a.* includes addons now)
                  db.get(
                    `SELECT a.*, s.name AS service_name, s.duration, s.price,
                            u.name AS provider_name, u.business_name
                    FROM appointments a
                    JOIN services s ON a.service_id = s.id
                    JOIN users u ON a.provider_id = u.id
                    WHERE a.id = ?`,
                    [newId],
                    (e, appointment) => {
                      if (e) {
                        console.error('❌ Fetch after insert failed:', e);
                        return res
                          .status(500)
                          .json({ error: 'Appointment created but fetch failed' });
                      }

                      console.log('✅ Appointment created successfully:', {
                        id: newId,
                        total_price,
                        deposit_amount,
                        addons_total,
                      });

                      res.status(201).json({
                        message:
                          'Appointment booked successfully (pending provider confirmation)',
                        appointment,
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
   ✅ Check provider availability
--------------------------------------------- */
router.get('/providers/:id/availability', (req, res) => {
  const providerId = req.params.id;
  const { date } = req.query;
  if (!date)
    return res.status(400).json({ error: 'Date query parameter is required (YYYY-MM-DD)' });

  db.get(
    `SELECT opening_time, closing_time FROM users WHERE id = ? AND user_type = 'provider'`,
    [providerId],
    (err, provider) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!provider) return res.status(404).json({ error: 'Provider not found' });

      const opening_time = provider.opening_time || '08:00';
      const closing_time = provider.closing_time || '18:00';

      db.get(
        `SELECT * FROM provider_closed_days WHERE provider_id = ? AND closed_date = ?`,
        [providerId, date],
        (err2, closedDay) => {
          if (err2) return res.status(500).json({ error: 'Database error' });

          const is_closed = !!closedDay;
          res.json({
            provider_id: providerId,
            date,
            is_closed,
            closed_reason: closedDay?.reason || null,
            opening_time,
            closing_time,
          });
        }
      );
    }
  );
});

/* ---------------------------------------------
   ✅ Update appointment
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
   FIXED: Update payment without doubling
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
      if (err)
        return res.status(500).json({ error: "Database error" });

      if (!row)
        return res.status(404).json({ error: "Appointment not found" });

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
          if (err2)
            return res
              .status(500)
              .json({ error: "Failed to update payment info" });

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
   - Client pays remaining balance using same payment system
   - Requires payment_reference and amount_paid
   - Adds to amount_paid and updates payment_status to 'paid' when fully paid
--------------------------------------------- */
router.put('/:id/pay-balance', authenticateToken, (req, res) => {
  const { id } = req.params;
  const clientId = req.user.userId;
  const { payment_reference, amount_paid } = req.body;

  if (!payment_reference || !amount_paid || Number(amount_paid) <= 0) {
    return res.status(400).json({ error: 'payment_reference and positive amount_paid are required' });
  }

  db.get(`SELECT client_id, total_price, amount_paid FROM appointments WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!row) return res.status(404).json({ error: 'Appointment not found' });
    if (row.client_id !== clientId) return res.status(403).json({ error: 'Forbidden' });

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
        res.json({ message: 'Balance payment recorded', amount_paid: newPaid, payment_status: finalStatus });
      }
    );
  });
});

/* ---------------------------------------------
   ✅ Provider can prompt client for remaining balance
   - Adds an entry to payment_requests (provider -> client)
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

/* ---------------------------------------------
   FIXED: Update payment without doubling
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
      if (err)
        return res.status(500).json({ error: "Database error" });

      if (!row)
        return res.status(404).json({ error: "Appointment not found" });

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
          if (err2)
            return res
              .status(500)
              .json({ error: "Failed to update payment info" });

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

export default router;
