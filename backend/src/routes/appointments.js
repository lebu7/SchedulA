import express from 'express';
import { body, validationResult } from 'express-validator';
import { db } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// ✅ Automatically ensure 'rebooked' is in the schema
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
          CREATE TABLE IF NOT EXISTS appointments_new (
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
            FOREIGN KEY (client_id) REFERENCES users (id),
            FOREIGN KEY (provider_id) REFERENCES users (id),
            FOREIGN KEY (service_id) REFERENCES services (id)
          );
        `);
        db.run(`
          INSERT INTO appointments_new (id, client_id, provider_id, service_id, appointment_date, status, notes, client_deleted, provider_deleted, created_at)
          SELECT id, client_id, provider_id, service_id, appointment_date, status, notes, client_deleted, provider_deleted, created_at FROM appointments;
        `);
        db.run('DROP TABLE appointments;');
        db.run('ALTER TABLE appointments_new RENAME TO appointments;');
        db.run('PRAGMA foreign_keys=on;');
        console.log('✅ Appointments table updated to support rebooked status.');
      });
    }
  }
);

// ✅ Get user's appointments
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
      ORDER BY a.appointment_date DESC
    `
      : `
      SELECT a.*, s.name AS service_name, s.duration, s.price,
             u.name AS client_name, u.phone AS client_phone
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      JOIN users u ON a.client_id = u.id
      WHERE a.provider_id = ? AND a.provider_deleted = 0
      ORDER BY a.appointment_date DESC
    `;

  db.all(query, [userId], (err, appointments) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch appointments' });

    const now = new Date().toISOString();

    if (userType === 'client') {
      const pending = appointments.filter(
        (a) => a.status === 'pending' && a.appointment_date > now
      );
      const scheduled = appointments.filter(
        (a) => a.status === 'scheduled' && a.appointment_date > now
      );
      const past = appointments.filter(
        (a) =>
          ['completed', 'cancelled', 'no-show', 'rebooked'].includes(a.status) ||
          a.appointment_date <= now
      );
      res.json({ appointments: { pending, scheduled, past } });
    } else {
      const pending = appointments.filter(
        (a) => a.status === 'pending' && a.appointment_date > now
      );
      const upcoming = appointments.filter(
        (a) => a.status === 'scheduled' && a.appointment_date > now
      );
      const past = appointments.filter(
        (a) =>
          ['completed', 'cancelled', 'no-show', 'rebooked'].includes(a.status) ||
          a.appointment_date <= now
      );
      res.json({ appointments: { pending, upcoming, past } });
    }
  });
});

// ✅ Create appointment (normal + rebook)
router.post(
  '/',
  authenticateToken,
  [
    body('service_id').isInt({ min: 1 }),
    body('appointment_date').isISO8601(),
    body('notes').optional().trim(),
    body('rebook_from').optional().isInt()
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

      db.run(
        `INSERT INTO appointments (client_id, provider_id, service_id, appointment_date, notes, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [client_id, service.provider_id, service_id, appointment_date, notes || ''],
        function (err) {
          if (err)
            return res.status(500).json({ error: 'Failed to create appointment' });

          const newAppointmentId = this.lastID;

          // ✅ If rebooked, mark old appointment safely
          if (rebook_from) {
            db.run(
              `UPDATE appointments SET status = 'rebooked' WHERE id = ? AND client_id = ?`,
              [rebook_from, client_id],
              (err2) => {
                if (err2)
                  console.error('Failed to mark old appointment as rebooked:', err2);
              }
            );
          }

          db.get(
            `SELECT a.*, s.name AS service_name, s.duration, s.price,
                    u.name AS provider_name, u.business_name
             FROM appointments a
             JOIN services s ON a.service_id = s.id
             JOIN users u ON a.provider_id = u.id
             WHERE a.id = ?`,
            [newAppointmentId],
            (err, appointment) => {
              if (err)
                return res.status(500).json({
                  error: 'Appointment created but failed to fetch details'
                });

              res.status(201).json({
                message: 'Appointment requested successfully (pending provider confirmation)',
                appointment
              });
            }
          );
        }
      );
    });
  }
);

// ✅ Update appointment
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
      return res
        .status(400)
        .json({ error: 'This appointment status is locked and cannot be modified.' });
    }

    const updates = [];
    const params = [];

    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }

    if (appointment_date) {
      const newDate = new Date(appointment_date);
      if (newDate <= new Date())
        return res.status(400).json({ error: 'Date must be in the future' });
      updates.push('appointment_date = ?');
      params.push(appointment_date);
    }

    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes);
    }

    if (updates.length === 0)
      return res.status(400).json({ error: 'No fields to update' });

    params.push(id, userId);

    const query =
      userType === 'client'
        ? `UPDATE appointments SET ${updates.join(', ')} WHERE id = ? AND client_id = ?`
        : `UPDATE appointments SET ${updates.join(', ')} WHERE id = ? AND provider_id = ?`;

    db.run(query, params, function (err) {
      if (err) return res.status(500).json({ error: 'Failed to update appointment' });
      res.json({ message: 'Appointment updated successfully' });
    });
  });
});

// ✅ Soft delete (until both users delete)
router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  const userType = req.user.user_type;
  const deleteField = userType === 'client' ? 'client_deleted' : 'provider_deleted';

  db.run(
    `UPDATE appointments SET ${deleteField} = 1 WHERE id = ? AND ${userType}_id = ?`,
    [id, userId],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to delete appointment' });
      if (this.changes === 0)
        return res.status(404).json({ error: 'Appointment not found or unauthorized' });

      db.get(
        'SELECT client_deleted, provider_deleted FROM appointments WHERE id = ?',
        [id],
        (err, row) => {
          if (row && row.client_deleted && row.provider_deleted) {
            db.run('DELETE FROM appointments WHERE id = ?', [id]);
          }
          res.json({ message: 'Appointment deleted from your dashboard' });
        }
      );
    }
  );
});

export default router;
