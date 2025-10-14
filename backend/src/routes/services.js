// backend/routes/services.js
import express from 'express'
import { body, validationResult } from 'express-validator'
import { db } from '../config/database.js'
import { authenticateToken, requireRole } from '../middleware/auth.js'

const router = express.Router()

/* ---------------------------------------------
   ✅ GET all services
--------------------------------------------- */
router.get('/', (req, res) => {
  const { search, category, provider } = req.query
  let query = `
    SELECT s.*, u.name AS provider_name, u.business_name 
    FROM services s 
    JOIN users u ON s.provider_id = u.id 
    WHERE 1=1
  `
  const params = []

  if (search) {
    query += ` AND (s.name LIKE ? OR s.description LIKE ? OR u.name LIKE ? OR u.business_name LIKE ?)`
    const searchTerm = `%${search}%`
    params.push(searchTerm, searchTerm, searchTerm, searchTerm)
  }

  if (category) {
    query += ` AND s.category = ?`
    params.push(category)
  }

  if (provider) {
    query += ` AND u.name LIKE ?`
    params.push(`%${provider}%`)
  }

  query += ` ORDER BY s.created_at DESC`

  db.all(query, params, (err, services) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch services' })
    res.json({ services })
  })
})

/* ---------------------------------------------
   ✅ POST create service
--------------------------------------------- */
router.post(
  '/',
  authenticateToken,
  requireRole('provider'),
  [
    body('name').notEmpty(),
    body('category').notEmpty(),
    body('duration').isInt({ min: 1 }),
    body('price').optional().isFloat({ min: 0 }),
  ],
  (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const { name, description, category, duration, price } = req.body
    const provider_id = req.user.userId

    db.run(
      `INSERT INTO services (provider_id, name, description, category, duration, price)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [provider_id, name, description, category, duration, price],
      function (err) {
        if (err) return res.status(500).json({ error: 'Failed to create service' })
        db.get(
          `SELECT s.*, u.name AS provider_name, u.business_name
           FROM services s JOIN users u ON s.provider_id = u.id
           WHERE s.id = ?`,
          [this.lastID],
          (err2, service) => {
            if (err2) return res.status(500).json({ error: 'Failed to fetch service' })
            res.status(201).json({ message: 'Service created', service })
          }
        )
      }
    )
  }
)

/* ---------------------------------------------
   ✅ PUT update service
--------------------------------------------- */
router.put('/:id', authenticateToken, requireRole('provider'), (req, res) => {
  const serviceId = req.params.id
  const provider_id = req.user.userId
  const updates = []
  const params = []

  for (const [key, val] of Object.entries(req.body)) {
    if (val !== undefined) {
      updates.push(`${key} = ?`)
      params.push(val)
    }
  }

  if (!updates.length) return res.status(400).json({ error: 'No fields to update' })
  params.push(serviceId, provider_id)

  db.run(
    `UPDATE services SET ${updates.join(', ')} WHERE id = ? AND provider_id = ?`,
    params,
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to update service' })
      if (this.changes === 0) return res.status(404).json({ error: 'Service not found' })
      res.json({ message: 'Service updated successfully' })
    }
  )
})

/* ---------------------------------------------
   ✅ PATCH toggle single service (no business effect)
--------------------------------------------- */
router.patch('/:id/closure', authenticateToken, requireRole('provider'), (req, res) => {
  const serviceId = req.params.id
  const provider_id = req.user.userId
  const { is_closed } = req.body

  if (is_closed === undefined) return res.status(400).json({ error: 'is_closed is required (0 or 1)' })

  db.run(
    'UPDATE services SET is_closed = ? WHERE id = ? AND provider_id = ?',
    [is_closed ? 1 : 0, serviceId, provider_id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to update service status' })
      if (this.changes === 0) return res.status(404).json({ error: 'Service not found' })
      res.json({ message: 'Service status updated', is_closed })
    }
  )
})

/* ---------------------------------------------
   ✅ PATCH toggle all provider services
   Close all or reopen previously open ones
--------------------------------------------- */
router.patch('/provider/:id/closure', authenticateToken, requireRole('provider'), (req, res) => {
  const providerId = req.params.id
  const { is_closed } = req.body

  if (is_closed === undefined) return res.status(400).json({ error: 'is_closed required (0 or 1)' })

  if (is_closed) {
    // store open services before closing all
    db.all('SELECT id FROM services WHERE provider_id = ? AND is_closed = 0', [providerId], (err, openServices) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch open services' })
      const openIds = openServices.map(s => s.id)
      const serialized = JSON.stringify(openIds)

      db.run(`CREATE TABLE IF NOT EXISTS provider_service_state (provider_id INTEGER PRIMARY KEY, open_services TEXT)`)

      db.run(
        `INSERT OR REPLACE INTO provider_service_state (provider_id, open_services) VALUES (?, ?)`,
        [providerId, serialized],
        () => {
          db.run(`UPDATE services SET is_closed = 1 WHERE provider_id = ?`, [providerId], function (err2) {
            if (err2) return res.status(500).json({ error: 'Failed to close services' })
            res.json({ message: 'Business closed successfully', changes: this.changes })
          })
        }
      )
    })
  } else {
    // reopen only services that were previously open
    db.get(`SELECT open_services FROM provider_service_state WHERE provider_id = ?`, [providerId], (err, row) => {
      if (err) return res.status(500).json({ error: 'Failed to restore services' })
      if (!row || !row.open_services) {
        return res.json({ message: 'No previous open state found' })
      }
      const openIds = JSON.parse(row.open_services)
      if (!openIds.length) return res.json({ message: 'No open services to restore' })

      const placeholders = openIds.map(() => '?').join(',')
      db.run(
        `UPDATE services SET is_closed = 0 WHERE id IN (${placeholders}) AND provider_id = ?`,
        [...openIds, providerId],
        function (err2) {
          if (err2) return res.status(500).json({ error: 'Failed to reopen services' })
          res.json({ message: 'Business reopened successfully', restored: this.changes })
        }
      )
    })
  }
})

/* ---------------------------------------------
   ✅ DELETE service
--------------------------------------------- */
router.delete('/:id', authenticateToken, requireRole('provider'), (req, res) => {
  const serviceId = req.params.id
  const provider_id = req.user.userId

  db.run('DELETE FROM services WHERE id = ? AND provider_id = ?', [serviceId, provider_id], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to delete service' })
    if (this.changes === 0) return res.status(404).json({ error: 'Service not found' })
    res.json({ message: 'Service deleted successfully' })
  })
})

export default router
