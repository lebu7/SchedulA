import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { db } from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

/* ---------------------------------------------
   ✅ Register
--------------------------------------------- */
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('name').notEmpty().trim(),
    body('user_type').isIn(['client', 'provider'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, name, phone, user_type, business_name } = req.body;

      // Check for duplicate email
      db.get('SELECT id FROM users WHERE email = ?', [email], async (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (row) return res.status(400).json({ error: 'User already exists' });

        const hashedPassword = await bcrypt.hash(password, 12);

        // Add default business hours for providers
        const defaultOpening = user_type === 'provider' ? '08:00' : null;
        const defaultClosing = user_type === 'provider' ? '18:00' : null;

        db.run(
          `INSERT INTO users (email, password, name, phone, user_type, business_name, opening_time, closing_time)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [email, hashedPassword, name, phone, user_type, business_name, defaultOpening, defaultClosing],
          function (err) {
            if (err) return res.status(500).json({ error: 'Failed to create user' });

            const token = jwt.sign(
              { userId: this.lastID, email, user_type },
              process.env.JWT_SECRET,
              { expiresIn: '24h' }
            );

            res.status(201).json({
              message: 'User created successfully',
              token,
              user: {
                id: this.lastID,
                email,
                name,
                user_type,
                business_name,
                opening_time: defaultOpening,
                closing_time: defaultClosing
              }
            });
          }
        );
      });
    } catch (error) {
      res.status(500).json({ error: 'Server error during registration' });
    }
  }
);

/* ---------------------------------------------
   ✅ Login
--------------------------------------------- */
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').exists()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign(
          { userId: user.id, email: user.email, user_type: user.user_type },
          process.env.JWT_SECRET,
          { expiresIn: '24h' }
        );

        res.json({
          message: 'Login successful',
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            user_type: user.user_type,
            business_name: user.business_name,
            phone: user.phone,
            opening_time: user.opening_time || '08:00',
            closing_time: user.closing_time || '18:00'
          }
        });
      });
    } catch (error) {
      res.status(500).json({ error: 'Server error during login' });
    }
  }
);

/* ---------------------------------------------
   ✅ Get Profile
--------------------------------------------- */
router.get('/profile', authenticateToken, (req, res) => {
  db.get(
    `SELECT id, email, name, phone, user_type, business_name, 
            opening_time, closing_time, created_at 
     FROM users WHERE id = ?`,
    [req.user.userId],
    (err, user) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json({ user });
    }
  );
});

/* ---------------------------------------------
   ✅ NEW: Update Provider Business Hours
   Endpoint used by frontend ServiceManager.jsx
   Method: PUT /auth/business-hours
--------------------------------------------- */
router.put(
  '/business-hours',
  authenticateToken,
  requireRole('provider'),
  [
    body('opening_time')
      .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
      .withMessage('Invalid opening time format (HH:MM)'),
    body('closing_time')
      .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
      .withMessage('Invalid closing time format (HH:MM)')
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { opening_time, closing_time } = req.body;
    const providerId = req.user.userId;

    if (closing_time <= opening_time) {
      return res.status(400).json({ error: 'Closing time must be later than opening time' });
    }

    db.run(
      `UPDATE users SET opening_time = ?, closing_time = ? WHERE id = ? AND user_type = 'provider'`,
      [opening_time, closing_time, providerId],
      function (err) {
        if (err) return res.status(500).json({ error: 'Failed to update business hours' });
        if (this.changes === 0) return res.status(404).json({ error: 'Provider not found' });

        res.json({ message: 'Business hours updated successfully' });
      }
    );
  }
);

export default router;
