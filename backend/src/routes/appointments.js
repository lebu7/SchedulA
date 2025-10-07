import express from 'express';
import { body, validationResult } from 'express-validator';
import { db } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// ✅ Get user's appointments
router.get('/', authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const userType = req.user.user_type;

  let query = '';
  const params = [userId];

  if (userType === 'client') {
    query = `
      SELECT a.*, s.name AS service_name, s.duration, s.price,
             u.name AS provider_name, u.business_name
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      JOIN users u ON a.provider_id = u.id
      WHERE a.client_id = ? AND a.client_deleted = 0
      ORDER BY a.appointment_date DESC
    `;
  } else {
    query = `
      SELECT a.*, s.name AS service_name, s.duration, s.price,
             u.name AS client_name, u.phone AS client_phone
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      JOIN users u ON a.client_id = u.id
      WHERE a.provider_id = ? AND a.provider_deleted = 0
      ORDER BY a.appointment_date DESC
    `;
  }

  db.all(query, params, (err, appointments) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to fetch appointments' });
    }

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
          ['completed', 'cancelled', 'no-show'].includes(a.status) ||
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
          ['completed', 'cancelled', 'no-show'].includes(a.status) ||
          a.appointment_date <= now
      );

      res.json({ appointments: { pending, upcoming, past } });
    }
  });
});

// ✅ Get appointments by provider ID
router.get('/provider/:providerId', (req, res) => {
  const providerId = req.params.providerId;

  db.all(
    `SELECT a.*, s.name AS service_name, s.duration,
            u.name AS client_name, u.phone AS client_phone
     FROM appointments a
     JOIN services s ON a.service_id = s.id
     JOIN users u ON a.client_id = u.id
     WHERE a.provider_id = ?
     ORDER BY a.appointment_date ASC`,
    [providerId],
    (err, appointments) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ appointments });
    }
  );
});

// ✅ Create new appointment
router.post(
  '/',
  authenticateToken,
  [
    body('service_id').isInt({ min: 1 }),
    body('appointment_date').isISO8601(),
    body('notes').optional().trim(),
  ],
  (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { service_id, appointment_date, notes } = req.body;
      const client_id = req.user.userId;

      const appointmentDate = new Date(appointment_date);
      if (appointmentDate <= new Date()) {
        return res
          .status(400)
          .json({ error: 'Appointment date must be in the future' });
      }

      db.get('SELECT * FROM services WHERE id = ?', [service_id], (err, service) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!service) return res.status(404).json({ error: 'Service not found' });

        db.run(
          `INSERT INTO appointments (client_id, provider_id, service_id, appointment_date, notes, status)
           VALUES (?, ?, ?, ?, ?, 'pending')`,
          [client_id, service.provider_id, service_id, appointment_date, notes || ''],
          function (err) {
            if (err) return res.status(500).json({ error: 'Failed to create appointment' });

            db.get(
              `SELECT a.*, s.name AS service_name, s.duration, s.price,
                      u.name AS provider_name, u.business_name
               FROM appointments a
               JOIN services s ON a.service_id = s.id
               JOIN users u ON a.provider_id = u.id
               WHERE a.id = ?`,
              [this.lastID],
              (err, appointment) => {
                if (err)
                  return res.status(500).json({
                    error: 'Appointment created but failed to fetch details',
                  });

                res.status(201).json({
                  message:
                    'Appointment requested successfully (pending provider confirmation)',
                  appointment,
                });
              }
            );
          }
        );
      });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ✅ Update appointment
router.put('/:id', authenticateToken, (req, res) => {
  try {
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

      // Lock completed, cancelled, or no-show from provider editing
      if (
        userType === 'provider' &&
        ['completed', 'cancelled', 'no-show'].includes(apt.status)
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
          return res.status(400).json({ error: 'Date must be in future' });
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
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
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
