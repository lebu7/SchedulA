import express from 'express';
import { body, validationResult } from 'express-validator';
import { db } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get user's appointments
router.get('/', authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const userType = req.user.user_type;

  let query = '';
  let params = [userId];

  if (userType === 'client') {
    query = `
      SELECT a.*, s.name as service_name, s.duration, s.price,
             u.name as provider_name, u.business_name
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      JOIN users u ON a.provider_id = u.id
      WHERE a.client_id = ? AND a.client_deleted = 0
      ORDER BY a.appointment_date DESC
    `;
  } else {
    query = `
      SELECT a.*, s.name as service_name, s.duration, s.price,
             u.name as client_name, u.phone as client_phone
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

    // Separate into pending and past appointments for clients
    if (userType === 'client') {
      const now = new Date().toISOString();
      const pending = appointments.filter(apt => 
        apt.status === 'scheduled' && apt.appointment_date > now
      );
      const past = appointments.filter(apt => 
        apt.status !== 'scheduled' || apt.appointment_date <= now
      );

      res.json({ appointments: { pending, past } });
    } else {
      res.json({ appointments });
    }
  });
});

// Create new appointment (client only)
router.post('/',
  authenticateToken,
  [
    body('service_id').isInt({ min: 1 }),
    body('appointment_date').isISO8601(),
    body('notes').optional().trim()
  ],
  (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { service_id, appointment_date, notes } = req.body;
      const client_id = req.user.userId;

      // First get service details to calculate end time and get provider_id
      db.get(
        'SELECT * FROM services WHERE id = ?',
        [service_id],
        (err, service) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }
          if (!service) {
            return res.status(404).json({ error: 'Service not found' });
          }

          // Check for scheduling conflicts
          const appointmentEnd = new Date(new Date(appointment_date).getTime() + service.duration * 60000);

          db.get(
            `SELECT id FROM appointments 
             WHERE provider_id = ? 
             AND appointment_date < ? 
             AND datetime(appointment_date, '+' || duration || ' minutes') > ? 
             AND status = 'scheduled'`,
            [service.provider_id, appointmentEnd.toISOString(), appointment_date],
            (err, conflict) => {
              if (err) {
                return res.status(500).json({ error: 'Database error during conflict check' });
              }
              if (conflict) {
                return res.status(409).json({ error: 'Time slot not available' });
              }

              // Create appointment
              db.run(
                `INSERT INTO appointments (client_id, provider_id, service_id, appointment_date, notes) 
                 VALUES (?, ?, ?, ?, ?)`,
                [client_id, service.provider_id, service_id, appointment_date, notes],
                function(err) {
                  if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Failed to create appointment' });
                  }

                  // Return the created appointment with details
                  db.get(
                    `SELECT a.*, s.name as service_name, s.duration, s.price,
                            u.name as provider_name, u.business_name
                     FROM appointments a
                     JOIN services s ON a.service_id = s.id
                     JOIN users u ON a.provider_id = u.id
                     WHERE a.id = ?`,
                    [this.lastID],
                    (err, appointment) => {
                      if (err) {
                        return res.status(500).json({ error: 'Failed to fetch created appointment' });
                      }
                      res.status(201).json({
                        message: 'Appointment booked successfully',
                        appointment
                      });
                    }
                  );
                }
              );
            }
          );
        }
      );
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Update appointment
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const appointmentId = req.params.id;
    const userId = req.user.userId;
    const userType = req.user.user_type;
    const { status, appointment_date, notes } = req.body;

    // First verify the user has access to this appointment
    let accessQuery = '';
    if (userType === 'client') {
      accessQuery = 'SELECT * FROM appointments WHERE id = ? AND client_id = ?';
    } else {
      accessQuery = 'SELECT * FROM appointments WHERE id = ? AND provider_id = ?';
    }

    db.get(accessQuery, [appointmentId, userId], (err, appointment) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!appointment) {
        return res.status(404).json({ error: 'Appointment not found or access denied' });
      }

      // Build dynamic update query
      const updates = [];
      const params = [];

      if (status !== undefined) {
        updates.push('status = ?');
        params.push(status);
      }
      if (appointment_date !== undefined) {
        updates.push('appointment_date = ?');
        params.push(appointment_date);
      }
      if (notes !== undefined) {
        updates.push('notes = ?');
        params.push(notes);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      params.push(appointmentId, userId);

      let updateQuery = '';
      if (userType === 'client') {
        updateQuery = `UPDATE appointments SET ${updates.join(', ')} WHERE id = ? AND client_id = ?`;
      } else {
        updateQuery = `UPDATE appointments SET ${updates.join(', ')} WHERE id = ? AND provider_id = ?`;
      }

      db.run(updateQuery, params, function(err) {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to update appointment' });
        }

        res.json({ message: 'Appointment updated successfully' });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Soft delete appointment
router.delete('/:id', authenticateToken, (req, res) => {
  const appointmentId = req.params.id;
  const userId = req.user.userId;
  const userType = req.user.user_type;

  let query = '';
  if (userType === 'client') {
    query = 'UPDATE appointments SET client_deleted = 1 WHERE id = ? AND client_id = ?';
  } else {
    query = 'UPDATE appointments SET provider_deleted = 1 WHERE id = ? AND provider_id = ?';
  }

  db.run(query, [appointmentId, userId], function(err) {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to delete appointment' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Appointment not found or access denied' });
    }

    res.json({ message: 'Appointment deleted successfully' });
  });
});

// Get available time slots for a service
router.get('/available/:serviceId', (req, res) => {
  const serviceId = req.params.id;
  const { date } = req.query; // YYYY-MM-DD format

  if (!date) {
    return res.status(400).json({ error: 'Date parameter required' });
  }

  // Get service details and provider's appointments for the date
  db.get(
    `SELECT s.*, u.business_name 
     FROM services s 
     JOIN users u ON s.provider_id = u.id 
     WHERE s.id = ?`,
    [serviceId],
    (err, service) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!service) {
        return res.status(404).json({ error: 'Service not found' });
      }

      const startDate = `${date} 00:00:00`;
      const endDate = `${date} 23:59:59`;

      db.all(
        `SELECT appointment_date, duration 
         FROM appointments 
         WHERE provider_id = ? 
         AND appointment_date BETWEEN ? AND ? 
         AND status = 'scheduled'`,
        [service.provider_id, startDate, endDate],
        (err, appointments) => {
          if (err) {
            return res.status(500).json({ error: 'Failed to fetch appointments' });
          }

          // For now, return booked slots
          // In a real implementation, you'd generate available slots based on business hours
          const bookedSlots = appointments.map(apt => ({
            start: apt.appointment_date,
            end: new Date(new Date(apt.appointment_date).getTime() + apt.duration * 60000).toISOString()
          }));

          res.json({
            service,
            booked_slots: bookedSlots,
            date
          });
        }
      );
    }
  );
});

export default router;