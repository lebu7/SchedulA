import express from 'express';
import { db } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// 📥 Get Notifications for Logged-in User
router.get('/', authenticateToken, (req, res) => {
  const userId = req.user.userId;
  
  // Fetch notifications
  db.all(
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
    [userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      
      // Count unread
      db.get(
        `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`,
        [userId],
        (err2, countRow) => {
          res.json({
            notifications: rows,
            unread_count: countRow ? countRow.count : 0
          });
        }
      );
    }
  );
});

// ✅ Mark specific notification as read
router.put('/:id/read', authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  db.run(
    `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
    [id, userId],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to update' });
      res.json({ success: true });
    }
  );
});

// ✅ Mark ALL as read
router.put('/mark-all-read', authenticateToken, (req, res) => {
  const userId = req.user.userId;

  db.run(
    `UPDATE notifications SET is_read = 1 WHERE user_id = ?`,
    [userId],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to update' });
      res.json({ success: true });
    }
  );
});

export default router;