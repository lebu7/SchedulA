/* backend/src/routes/favorites.js */
import express from "express";
import { db } from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

/**
 * ✅ GET /api/favorites
 * Fetch all favorites for the logged-in client.
 */
router.get("/", authenticateToken, (req, res) => {
  const userId = req.user.userId;

  // 1. Fetch Favorite Services
  const servicesQuery = `
    SELECT f.id as favorite_id, f.item_id, f.created_at,
           s.name, s.description, s.price, s.duration, s.category,
           u.business_name, u.name as provider_name, u.id as provider_id
    FROM favorites f
    JOIN services s ON f.item_id = s.id
    JOIN users u ON s.provider_id = u.id
    WHERE f.user_id = ? AND f.type = 'service'
    ORDER BY f.created_at DESC
  `;

  // 2. Fetch Favorite Providers
  const providersQuery = `
    SELECT f.id as favorite_id, f.item_id, f.created_at,
           u.name, u.business_name, u.suburb, u.phone, u.opening_time, u.closing_time
    FROM favorites f
    JOIN users u ON f.item_id = u.id
    WHERE f.user_id = ? AND f.type = 'provider'
    ORDER BY f.created_at DESC
  `;

  db.all(servicesQuery, [userId], (err, services) => {
    if (err)
      return res
        .status(500)
        .json({ error: "Failed to fetch favorite services" });

    db.all(providersQuery, [userId], (err2, providers) => {
      if (err2)
        return res
          .status(500)
          .json({ error: "Failed to fetch favorite providers" });

      res.json({
        services: services || [],
        providers: providers || [],
      });
    });
  });
});

/**
 * ✅ POST /api/favorites/toggle
 * Toggle favorite status (Add if not exists, Remove if exists).
 * Body: { itemId: 123, type: 'service' | 'provider' }
 */
router.post("/toggle", authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const { itemId, type } = req.body;

  if (!itemId || !["service", "provider"].includes(type)) {
    return res.status(400).json({ error: "Invalid item ID or type" });
  }

  // Check if exists
  db.get(
    `SELECT id FROM favorites WHERE user_id = ? AND item_id = ? AND type = ?`,
    [userId, itemId, type],
    (err, row) => {
      if (err) return res.status(500).json({ error: "Database error" });

      if (row) {
        // Exists -> Remove it (Unfavorite)
        db.run(`DELETE FROM favorites WHERE id = ?`, [row.id], (delErr) => {
          if (delErr)
            return res.status(500).json({ error: "Failed to remove favorite" });
          res.json({ message: "Removed from favorites", isFavorite: false });
        });
      } else {
        // Doesn't exist -> Add it (Favorite)
        db.run(
          `INSERT INTO favorites (user_id, item_id, type) VALUES (?, ?, ?)`,
          [userId, itemId, type],
          function (insErr) {
            if (insErr)
              return res.status(500).json({ error: "Failed to add favorite" });
            res.json({
              message: "Added to favorites",
              isFavorite: true,
              id: this.lastID,
            });
          },
        );
      }
    },
  );
});

export default router;
