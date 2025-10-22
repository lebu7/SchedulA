// backend/routes/appointments.js
import express from 'express';
import { body, validationResult } from 'express-validator';
import { db } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

/* ---------------------------------------------
   ✅ Ensure "rebooked" status exists in table
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
            status TEXT DEFAULT 'scheduled' 
              CHECK(status IN ('pending', 'scheduled', 'completed', 'cancelled', 'no-show', 'rebooked')),
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
   ✅ Fetch appointments (client or provider)
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
   ✅ Create new appointment (with hours check)
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

    const { service_id, appointment_date, notes, rebook_from } = req.body;
    const client_id = req.user.userId;
    const appointmentDate = new Date(appointment_date);

    if (appointmentDate <= new Date())
      return res.status(400).json({ error: 'Appointment date must be in the future' });

    db.get('SELECT * FROM services WHERE id = ?', [service_id], (err, service) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!service) return res.status(404).json({ error: 'Service not found' });

      // ❌ Provider globally closed
      if (service.is_closed)
        return res.status(400).json({ error: `${service.name}'s provider is currently closed.` });

      const day = appointmentDate.toISOString().split('T')[0];

      db.get(
        'SELECT * FROM provider_closed_days WHERE provider_id = ? AND closed_date = ?',
        [service.provider_id, day],
        (err2, closedDay) => {
          if (closedDay)
            return res.status(400).json({
              error: `Provider is closed on ${day}. Please select another date.`,
            });

          // ✅ Get provider hours from users table
          db.get(
            `SELECT opening_time, closing_time FROM users WHERE id = ? AND user_type = 'provider'`,
            [service.provider_id],
            (err3, provider) => {
              if (err3)
                return res.status(500).json({ error: 'Error checking provider hours' });
              if (!provider)
                return res.status(404).json({ error: 'Provider not found' });

              const open = provider.opening_time || '08:00';
              const close = provider.closing_time || '18:00';

              const [hour, minute] = appointmentDate.toISOString().split('T')[1].split(':');
              const currentTime = `${hour}:${minute}`;
              if (currentTime < open || currentTime > close)
                return res.status(400).json({
                  error: `Bookings are only allowed between ${open} and ${close}.`,
                });

              // ✅ Insert appointment
              db.run(
                `INSERT INTO appointments (client_id, provider_id, service_id, appointment_date, notes, status)
                 VALUES (?, ?, ?, ?, ?, 'pending')`,
                [client_id, service.provider_id, service_id, appointment_date, notes || ''],
                function (err4) {
                  if (err4)
                    return res.status(500).json({ error: 'Failed to create appointment' });

                  const newId = this.lastID;

                  if (rebook_from) {
                    db.run(
                      `UPDATE appointments SET status = 'rebooked' WHERE id = ? AND client_id = ?`,
                      [rebook_from, client_id],
                      (e) => e && console.error('Failed to mark rebooked:', e)
                    );
                  }

                  db.get(
                    `SELECT a.*, s.name AS service_name, s.duration, s.price,
                            u.name AS provider_name, u.business_name
                     FROM appointments a
                     JOIN services s ON a.service_id = s.id
                     JOIN users u ON a.provider_id = u.id
                     WHERE a.id = ?`,
                    [newId],
                    (e, appointment) => {
                      if (e)
                        return res
                          .status(500)
                          .json({ error: 'Appointment created but fetch failed' });
                      res.status(201).json({
                        message:
                          'Appointment requested successfully (pending provider confirmation)',
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
   ✅ Provider toggles open/closed status
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
   ✅ Provider sets business hours (✅ fixed)
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
      return res
        .status(400)
        .json({ error: 'Closing time must be later than opening time.' });

    db.run(
      `UPDATE users 
       SET opening_time = ?, closing_time = ?
       WHERE id = ? AND user_type = 'provider'`,
      [opening_time, closing_time, providerId],
      function (err) {
        if (err) return res.status(500).json({ error: 'Failed to update business hours' });
        if (this.changes === 0) return res.status(404).json({ error: 'Provider not found' });
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
   ✅ Provider adds closed day
--------------------------------------------- */
router.post('/providers/:id/closed-days', authenticateToken, (req, res) => {
  const providerId = req.params.id;
  const { closed_date, reason } = req.body;
  if (!closed_date)
    return res.status(400).json({ error: 'closed_date is required (YYYY-MM-DD)' });

  db.run(
    `INSERT INTO provider_closed_days (provider_id, closed_date, reason)
     VALUES (?, ?, ?)`,
    [providerId, closed_date, reason || null],
    (err) => {
      if (err) return res.status(500).json({ error: 'Failed to set closed day' });
      res.json({ message: `Provider closed on ${closed_date}` });
    }
  );
});

/* ---------------------------------------------
   ✅ Check provider availability (✅ fixed)
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

export default router;
