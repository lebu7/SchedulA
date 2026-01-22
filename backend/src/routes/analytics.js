import express from "express";
import { db } from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

/* --------------------------------------------------------------------------
   📊 GET /analytics/summary
   Returns key metrics: Total Bookings, Earnings, Cancellations, Clients
-------------------------------------------------------------------------- */
router.get("/summary", authenticateToken, (req, res) => {
  const providerId = req.user.userId;

  if (req.user.user_type !== "provider") {
    return res.status(403).json({ error: "Access denied. Providers only." });
  }

  const query = `
        SELECT 
            COUNT(a.id) as total_appointments,
            SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN a.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
            SUM(CASE WHEN a.status = 'no-show' THEN 1 ELSE 0 END) as no_shows,
            SUM(a.amount_paid) as total_earnings,
            SUM(a.refund_amount) as total_refunds,
            COUNT(DISTINCT a.client_id) as unique_clients
        FROM appointments a
        WHERE a.provider_id = ?
    `;

  const servicesQuery = `SELECT COUNT(*) as total_services FROM services WHERE provider_id = ?`;

  db.get(query, [providerId], (err, stats) => {
    if (err)
      return res
        .status(500)
        .json({ error: "Database error", details: err.message });

    db.get(servicesQuery, [providerId], (err2, serviceStats) => {
      if (err2) return res.status(500).json({ error: "Database error" });

      res.json({
        ...stats,
        total_services: serviceStats.total_services || 0,
        // Net earnings = Total Paid - Refunds
        net_earnings: (stats.total_earnings || 0) - (stats.total_refunds || 0),
      });
    });
  });
});

/* --------------------------------------------------------------------------
   📈 GET /analytics/trends
   Returns monthly earnings and appointment counts for charts
-------------------------------------------------------------------------- */
router.get("/trends", authenticateToken, (req, res) => {
  const providerId = req.user.userId;

  // Group by Month (SQLite syntax: strftime)
  const query = `
        SELECT 
            strftime('%Y-%m', appointment_date) as month,
            COUNT(id) as count,
            SUM(amount_paid) as revenue
        FROM appointments
        WHERE provider_id = ? AND status != 'cancelled'
        GROUP BY month
        ORDER BY month ASC
        LIMIT 12
    `;

  db.all(query, [providerId], (err, rows) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(rows);
  });
});

export default router;
