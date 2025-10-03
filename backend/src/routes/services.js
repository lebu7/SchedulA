import express from 'express';
import { body, validationResult } from 'express-validator';
import { db } from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Helper: Format JS Date -> SQLite datetime string
const formatForSQLite = (date) =>
  date.toISOString().replace('T', ' ').substring(0, 19);

// Get all services with search/filter
router.get('/', (req, res) => {
  const { search, category, provider } = req.query;
  let query = `
    SELECT s.*, u.name as provider_name, u.business_name 
    FROM services s 
    JOIN users u ON s.provider_id = u.id 
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ` AND (s.name LIKE ? OR s.description LIKE ? OR u.name LIKE ? OR u.business_name LIKE ?)`;
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  if (category) {
    query += ` AND s.category = ?`;
    params.push(category);
  }

  if (provider) {
    query += ` AND u.name LIKE ?`;
    params.push(`%${provider}%`);
  }

  query += ` ORDER BY s.created_at DESC`;

  db.all(query, params, (err, services) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to fetch services' });
    }
    res.json({ services });
  });
});

// Create new service (provider only)
router.post('/', 
  authenticateToken, 
  requireRole('provider'),
  [
    body('name').notEmpty().trim(),
    body('category').notEmpty().trim(),
    body('duration').isInt({ min: 1 }),
    body('price').optional().isFloat({ min: 0 }),
    body('opening_time').optional().matches(/^\d{2}:\d{2}$/),
    body('closing_time').optional().matches(/^\d{2}:\d{2}$/),
    body('slot_interval').optional().isInt({ min: 5 })
  ],
  (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, description, category, duration, price, opening_time = '08:00', closing_time = '18:00', slot_interval = 30 } = req.body;
      const provider_id = req.user.userId;

      db.run(
        `INSERT INTO services (provider_id, name, description, category, duration, price, opening_time, closing_time, slot_interval) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [provider_id, name, description, category, duration, price, opening_time, closing_time, slot_interval],
        function(err) {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to create service' });
          }

          db.get(
            `SELECT s.*, u.name as provider_name, u.business_name 
             FROM services s 
             JOIN users u ON s.provider_id = u.id 
             WHERE s.id = ?`,
            [this.lastID],
            (err, service) => {
              if (err) {
                return res.status(500).json({ error: 'Failed to fetch created service' });
              }
              res.status(201).json({
                message: 'Service created successfully',
                service
              });
            }
          );
        }
      );
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Update service (provider only)
router.put('/:id',
  authenticateToken,
  requireRole('provider'),
  [
    body('name').optional().notEmpty().trim(),
    body('category').optional().notEmpty().trim(),
    body('duration').optional().isInt({ min: 1 }),
    body('price').optional().isFloat({ min: 0 }),
    body('opening_time').optional().matches(/^\d{2}:\d{2}$/),
    body('closing_time').optional().matches(/^\d{2}:\d{2}$/),
    body('slot_interval').optional().isInt({ min: 5 }),
    body('is_closed').optional().isInt({ min: 0, max: 1 })
  ],
  (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const serviceId = req.params.id;
      const { name, description, category, duration, price, opening_time, closing_time, slot_interval, is_closed } = req.body;
      const provider_id = req.user.userId;

      db.get(
        'SELECT * FROM services WHERE id = ? AND provider_id = ?',
        [serviceId, provider_id],
        (err, service) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }
          if (!service) {
            return res.status(404).json({ error: 'Service not found or access denied' });
          }

          const updates = [];
          const params = [];

          if (name !== undefined) { updates.push('name = ?'); params.push(name); }
          if (description !== undefined) { updates.push('description = ?'); params.push(description); }
          if (category !== undefined) { updates.push('category = ?'); params.push(category); }
          if (duration !== undefined) { updates.push('duration = ?'); params.push(duration); }
          if (price !== undefined) { updates.push('price = ?'); params.push(price); }
          if (opening_time !== undefined) { updates.push('opening_time = ?'); params.push(opening_time); }
          if (closing_time !== undefined) { updates.push('closing_time = ?'); params.push(closing_time); }
          if (slot_interval !== undefined) { updates.push('slot_interval = ?'); params.push(slot_interval); }
          if (is_closed !== undefined) { updates.push('is_closed = ?'); params.push(is_closed); }

          if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
          }

          params.push(serviceId, provider_id);

          db.run(
            `UPDATE services SET ${updates.join(', ')} WHERE id = ? AND provider_id = ?`,
            params,
            function(err) {
              if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Failed to update service' });
              }

              if (this.changes === 0) {
                return res.status(404).json({ error: 'Service not found' });
              }

              res.json({ message: 'Service updated successfully' });
            }
          );
        }
      );
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Delete service (provider only)
router.delete('/:id', authenticateToken, requireRole('provider'), (req, res) => {
  const serviceId = req.params.id;
  const provider_id = req.user.userId;

  db.run(
    'DELETE FROM services WHERE id = ? AND provider_id = ?',
    [serviceId, provider_id],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to delete service' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Service not found or access denied' });
      }

      res.json({ message: 'Service deleted successfully' });
    }
  );
});

// Get provider profile with their services
router.get('/providers/:id', (req, res) => {
  const providerId = req.params.id;

  db.get(
    'SELECT id, name, email, phone, business_name, created_at FROM users WHERE id = ? AND user_type = "provider"',
    [providerId],
    (err, provider) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!provider) {
        return res.status(404).json({ error: 'Provider not found' });
      }

      db.all(
        'SELECT * FROM services WHERE provider_id = ? ORDER BY created_at DESC',
        [providerId],
        (err, services) => {
          if (err) {
            return res.status(500).json({ error: 'Failed to fetch services' });
          }

          res.json({ provider, services });
        }
      );
    }
  );
});

// Toggle closure (provider only)
router.patch('/:id/closure', authenticateToken, requireRole('provider'), (req, res) => {
  const serviceId = req.params.id;
  const provider_id = req.user.userId;
  const { is_closed } = req.body;

  if (is_closed === undefined) {
    return res.status(400).json({ error: 'is_closed is required (0 or 1)' });
  }

  db.run(
    'UPDATE services SET is_closed = ? WHERE id = ? AND provider_id = ?',
    [is_closed ? 1 : 0, serviceId, provider_id],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to update closure status' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Service not found or access denied' });
      }
      res.json({ message: 'Closure status updated', is_closed: is_closed ? 1 : 0 });
    }
  );
});

export default router;
