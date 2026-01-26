/* backend/src/routes/analytics.js */
import express from "express";
import { db } from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

/* --------------------------------------------------------------------------
   📊 GET /insights/summary
   Returns combined metrics for:
   1. Dashboard Overview (Today's stats, Next Client, Peak Hours, Top Services)
   2. Analytics Page (Historical totals, Earnings, Retention)
-------------------------------------------------------------------------- */
router.get("/summary", authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const userType = req.user.user_type;

  // ✅ 1. CLIENT LOGIC (Unchanged)
  if (userType === "client") {
    const nextApptQuery = `
      SELECT a.id, a.appointment_date, s.name as service_name, u.name as provider_name, u.business_name
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      JOIN users u ON a.provider_id = u.id
      WHERE a.client_id = ? 
      AND a.status IN ('scheduled', 'pending') 
      AND a.appointment_date >= datetime('now', 'localtime')
      ORDER BY a.appointment_date ASC 
      LIMIT 1
    `;

    const rebookQuery = `
      SELECT DISTINCT s.id, s.name, s.price, u.business_name as provider_name, u.name as provider_real_name
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      JOIN users u ON a.provider_id = u.id
      WHERE a.client_id = ? AND a.status = 'completed'
      ORDER BY a.appointment_date DESC
      LIMIT 4
    `;

    db.get(nextApptQuery, [userId], (err, nextApt) => {
      if (err) return res.status(500).json({ error: "Database error" });
      db.all(rebookQuery, [userId], (err2, rebookSuggestions) => {
        if (err2) return res.status(500).json({ error: "Database error" });
        res.json({
          next_appointment: nextApt || null,
          rebook_suggestions: rebookSuggestions || [],
        });
      });
    });
    return;
  }

  // ✅ 2. PROVIDER LOGIC (Expanded)
  if (userType === "provider") {
    // Query A: HISTORICAL STATS
    const overallStatsQuery = `
        SELECT 
            COUNT(a.id) as total_appointments,
            SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN a.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
            SUM(CASE WHEN a.status = 'no-show' THEN 1 ELSE 0 END) as no_shows,
            COALESCE(SUM(a.amount_paid), 0) as total_earnings,
            COALESCE(SUM(CASE WHEN a.refund_status = 'completed' THEN a.refund_amount ELSE 0 END), 0) as total_refunds,
            COUNT(DISTINCT a.client_id) as unique_clients
        FROM appointments a
        WHERE a.provider_id = ?
    `;

    // Query B: SERVICE STATS
    const servicesQuery = `
      SELECT COUNT(*) as total_services, COALESCE(SUM(capacity), 0) as total_staff
      FROM services WHERE provider_id = ?
    `;

    // Query C: TODAY'S STATS
    const todayStatsQuery = `
        SELECT 
            COUNT(*) as today_count,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as today_pending,
            COALESCE(SUM(CASE WHEN status IN ('scheduled', 'completed') THEN amount_paid ELSE 0 END), 0) as today_revenue
        FROM appointments 
        WHERE provider_id = ? AND date(appointment_date) = date('now', 'localtime') 
    `;

    // Query D: NEXT CLIENT
    const nextClientQuery = `
        SELECT c.name as client_name, a.appointment_date
        FROM appointments a
        JOIN users c ON a.client_id = c.id
        WHERE a.provider_id = ? 
        AND a.appointment_date > datetime('now', 'localtime')
        AND a.status IN ('scheduled', 'pending')
        ORDER BY a.appointment_date ASC LIMIT 1
    `;

    // Query E: TODAY'S VISUAL SCHEDULE
    const todayScheduleQuery = `
        SELECT a.id, a.appointment_date, a.status, c.name as client_name, s.name as service_name, s.duration
        FROM appointments a
        JOIN users c ON a.client_id = c.id
        JOIN services s ON a.service_id = s.id
        WHERE a.provider_id = ? AND date(a.appointment_date) = date('now', 'localtime')
        ORDER BY a.appointment_date ASC
    `;

    // 🆕 Query F: PEAK HOURS (Aggregated by hour of day)
    const peakHoursQuery = `
        SELECT strftime('%H', appointment_date) as hour, COUNT(*) as count
        FROM appointments
        WHERE provider_id = ? AND status != 'cancelled'
        GROUP BY hour
        ORDER BY count DESC
        LIMIT 5
    `;

    // 🆕 Query G: SERVICE POPULARITY (Top 5 services)
    const topServicesQuery = `
        SELECT s.name, COUNT(a.id) as booking_count, SUM(a.total_price) as revenue
        FROM appointments a
        JOIN services s ON a.service_id = s.id
        WHERE a.provider_id = ? AND a.status = 'completed'
        GROUP BY s.name
        ORDER BY booking_count DESC
        LIMIT 5
    `;

    // Execution Chain
    db.get(overallStatsQuery, [userId], (err, overall) => {
      if (err) return res.status(500).json({ error: "Database error" });
      db.get(servicesQuery, [userId], (err2, services) => {
        if (err2) return res.status(500).json({ error: "Database error" });
        db.get(todayStatsQuery, [userId], (err3, today) => {
          if (err3) return res.status(500).json({ error: "Database error" });
          db.get(nextClientQuery, [userId], (err4, nextClient) => {
            if (err4) return res.status(500).json({ error: "Database error" });
            db.all(todayScheduleQuery, [userId], (err5, schedule) => {
              if (err5)
                return res.status(500).json({ error: "Database error" });

              // 🆕 Execute New Queries
              db.all(peakHoursQuery, [userId], (err6, peakHours) => {
                if (err6)
                  return res.status(500).json({ error: "Database error" });
                db.all(topServicesQuery, [userId], (err7, topServices) => {
                  if (err7)
                    return res.status(500).json({ error: "Database error" });

                  res.json({
                    // Analytics Page Data
                    total_appointments: overall.total_appointments || 0,
                    completed: overall.completed || 0,
                    cancelled: overall.cancelled || 0,
                    no_shows: overall.no_shows || 0,
                    total_earnings: overall.total_earnings || 0,
                    total_refunds: overall.total_refunds || 0,
                    net_earnings:
                      (overall.total_earnings || 0) -
                      (overall.total_refunds || 0),
                    unique_clients: overall.unique_clients || 0,
                    total_services: services.total_services || 0,
                    total_staff: services.total_staff || 0,

                    // Dashboard Overview Data
                    today_metrics: {
                      count: today ? today.today_count : 0,
                      pending: today ? today.today_pending : 0,
                      today_revenue: today ? today.today_revenue : 0,
                    },
                    next_client: nextClient || null,
                    today_schedule: schedule || [],

                    // 🆕 New Data
                    peak_hours: peakHours || [],
                    top_services: topServices || [],
                  });
                });
              });
            });
          });
        });
      });
    });
    return;
  }

  res.status(403).json({ error: "Invalid user type" });
});

router.get("/trends", authenticateToken, (req, res) => {
  if (req.user.user_type !== "provider") {
    return res.status(403).json({ error: "Access denied" });
  }
  const providerId = req.user.userId;
  const query = `
        SELECT strftime('%Y-%m', appointment_date) as month, COUNT(id) as count, SUM(amount_paid) as revenue
        FROM appointments WHERE provider_id = ? AND status != 'cancelled'
        GROUP BY month ORDER BY month ASC LIMIT 12
    `;
  db.all(query, [providerId], (err, rows) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(rows);
  });
});

export default router;
