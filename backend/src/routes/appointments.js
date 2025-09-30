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

// Get appointments by provider ID (for availability checking)
router.get('/provider/:providerId', (req, res) => {
  const providerId = req.params.providerId;
  
  db.all(
    `SELECT a.*, s.name as service_name, s.duration,
            u.name as client_name, u.phone as client_phone
     FROM appointments a
     JOIN services s ON a.service_id = s.id
     JOIN users u ON a.client_id = u.id
     WHERE a.provider_id = ? AND a.status = 'scheduled'
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

      // Validate appointment date is in the future
      const appointmentDate = new Date(appointment_date);
      const now = new Date();
      
      if (appointmentDate <= now) {
        return res.status(400).json({ error: 'Appointment date must be in the future' });
      }

      // First get service details to calculate end time and get provider_id
      db.get(
        'SELECT * FROM services WHERE id = ?',
        [service_id],
        (err, service) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          if (!service) {
            return res.status(404).json({ error: 'Service not found' });
          }

          // Calculate appointment end time
          const appointmentEnd = new Date(appointmentDate.getTime() + service.duration * 60000);

          // Check for scheduling conflicts - FIXED VERSION
          db.get(
            `SELECT a.id 
             FROM appointments a
             JOIN services s ON a.service_id = s.id
             WHERE a.provider_id = ? 
             AND a.status = 'scheduled'
             AND (
               (a.appointment_date BETWEEN ? AND datetime(?, '-1 second')) OR
               (datetime(a.appointment_date, '+' || s.duration || ' minutes') BETWEEN ? AND datetime(?, '-1 second')) OR
               (? BETWEEN a.appointment_date AND datetime(a.appointment_date, '+' || s.duration || ' minutes')) OR
               (? BETWEEN a.appointment_date AND datetime(a.appointment_date, '+' || s.duration || ' minutes'))
             )`,
            [
              service.provider_id,
              appointment_date, appointmentEnd.toISOString(),
              appointment_date, appointmentEnd.toISOString(),
              appointment_date,
              appointmentEnd.toISOString()
            ],
            (err, conflict) => {
              if (err) {
                console.error('Database error during conflict check:', err);
                return res.status(500).json({ error: 'Failed to check appointment availability' });
              }
              
              if (conflict) {
                return res.status(409).json({ 
                  error: 'This time slot conflicts with an existing appointment. Please choose a different time.' 
                });
              }

              // Create appointment
              db.run(
                `INSERT INTO appointments (client_id, provider_id, service_id, appointment_date, notes) 
                 VALUES (?, ?, ?, ?, ?)`,
                [client_id, service.provider_id, service_id, appointment_date, notes || ''],
                function(err) {
                  if (err) {
                    console.error('Database error creating appointment:', err);
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
                        console.error('Database error fetching created appointment:', err);
                        return res.status(500).json({ 
                          error: 'Appointment created but failed to fetch details' 
                        });
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
      console.error('Server error:', error);
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
        console.error('Database error:', err);
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
        // Validate new appointment date if provided
        const newAppointmentDate = new Date(appointment_date);
        const now = new Date();
        if (newAppointmentDate <= now) {
          return res.status(400).json({ error: 'Appointment date must be in the future' });
        }
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
    console.error('Server error:', error);
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
  const serviceId = req.params.serviceId;
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'Date parameter required' });
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
  }

  try {
    // Get service details
    db.get(
      `SELECT s.*, u.name as provider_name, u.business_name 
       FROM services s 
       JOIN users u ON s.provider_id = u.id 
       WHERE s.id = ?`,
      [serviceId],
      (err, service) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        if (!service) {
          return res.status(404).json({ error: 'Service not found' });
        }

        const startDate = `${date} 00:00:00`;
        const endDate = `${date} 23:59:59`;

        // Get provider's appointments for the date
        db.all(
          `SELECT a.appointment_date, s.duration 
           FROM appointments a
           JOIN services s ON a.service_id = s.id
           WHERE a.provider_id = ? 
           AND a.appointment_date BETWEEN ? AND ? 
           AND a.status = 'scheduled'
           ORDER BY a.appointment_date ASC`,
          [service.provider_id, startDate, endDate],
          (err, appointments) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ error: 'Failed to fetch appointments' });
            }

            const bookedSlots = appointments.map(apt => ({
              start: apt.appointment_date,
              end: new Date(new Date(apt.appointment_date).getTime() + apt.duration * 60000).toISOString(),
              duration: apt.duration
            }));

            res.json({
              service: {
                id: service.id,
                name: service.name,
                duration: service.duration,
                price: service.price,
                provider_name: service.provider_name,
                business_name: service.business_name
              },
              booked_slots: bookedSlots,
              date: date
            });
          }
        );
      }
    );
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get latest appointment for user
router.get('/latest', authenticateToken, (req, res) => {
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
      LIMIT 1
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
      LIMIT 1
    `;
  }

  db.get(query, params, (err, appointment) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to fetch latest appointment' });
    }

    res.json({ appointment });
  });
});

// Health check endpoint for appointments
router.get('/health', (req, res) => {
  db.get('SELECT COUNT(*) as count FROM appointments', (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database connection failed' });
    }
    res.json({ 
      status: 'OK', 
      message: 'Appointments API is working',
      total_appointments: row.count
    });
  });
});

export default router;