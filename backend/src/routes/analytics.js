import express from "express";
import { db } from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

/* --------------------------------------------------------------------------
   📊 GET /analytics/summary
   Returns metrics based on user role:
   - Provider: Services, Staff (Capacity), Earnings, etc.
   - Client: Upcoming Services count
-------------------------------------------------------------------------- */
router.get("/summary", authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const userType = req.user.user_type;

  // ✅ 1. CLIENT LOGIC: Get Upcoming Appointments
  if (userType === "client") {
    const query = `
      SELECT COUNT(*) as upcoming_services
      FROM appointments 
      WHERE client_id = ? 
      AND status = 'scheduled' 
      AND datetime(appointment_date) >= datetime('now')
    `;

    db.get(query, [userId], (err, row) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json({ upcoming_services: row?.upcoming_services || 0 });
    });
    return;
  }

  // ✅ 2. PROVIDER LOGIC
  if (userType === "provider") {
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

    // ✅ Fix: Use COALESCE to ensure SUM returns 0 instead of NULL if empty
    const servicesQuery = `
      SELECT 
          COUNT(*) as total_services, 
          COALESCE(SUM(capacity), 0) as total_capacity 
      FROM services 
      WHERE provider_id = ?
    `;

    db.get(query, [userId], (err, stats) => {
      if (err)
        return res
          .status(500)
          .json({ error: "Database error", details: err.message });

      db.get(servicesQuery, [userId], (err2, serviceStats) => {
        if (err2) return res.status(500).json({ error: "Database error" });

        res.json({
          ...stats,
          total_services: serviceStats.total_services || 0,
          total_staff: serviceStats.total_capacity || 0,
          net_earnings:
            (stats.total_earnings || 0) - (stats.total_refunds || 0),
        });
      });
    });
    return;
  }

  res.status(403).json({ error: "Invalid user type" });
});

/* --------------------------------------------------------------------------
   📈 GET /analytics/trends (Providers Only)
-------------------------------------------------------------------------- */
router.get("/trends", authenticateToken, (req, res) => {
  if (req.user.user_type !== "provider") {
    return res.status(403).json({ error: "Access denied" });
  }

  const providerId = req.user.userId;

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
