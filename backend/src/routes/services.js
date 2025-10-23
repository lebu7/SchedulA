import express from "express";
import { body, validationResult } from "express-validator";
import { db } from "../config/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";

const router = express.Router();

/* ------------------------------------------------
   🧱 Ensure sub_services table exists
------------------------------------------------ */
db.run(`
  CREATE TABLE IF NOT EXISTS sub_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
  )
`);

/* ---------------------------------------------
   ✅ GET all services (includes sub-services + provider hours)
--------------------------------------------- */
router.get("/", (req, res) => {
  const { search, category, provider } = req.query;
  let query = `
    SELECT 
      s.*, 
      u.name AS provider_name, 
      u.business_name, 
      u.opening_time AS provider_opening_time, 
      u.closing_time AS provider_closing_time
    FROM services s 
    JOIN users u ON s.provider_id = u.id 
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ` AND (s.name LIKE ? OR s.description LIKE ? OR u.name LIKE ? OR u.business_name LIKE ?)`;
    const term = `%${search}%`;
    params.push(term, term, term, term);
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
    if (err) return res.status(500).json({ error: "Failed to fetch services" });

    if (!services.length) return res.json({ services: [] });

    // 🔹 Fetch sub-services for all main services
    const serviceIds = services.map((s) => s.id);
    const placeholders = serviceIds.map(() => "?").join(",");

    db.all(
      `SELECT * FROM sub_services WHERE service_id IN (${placeholders})`,
      serviceIds,
      (subErr, subs) => {
        if (subErr)
          return res
            .status(500)
            .json({ error: "Failed to fetch sub-services" });

        // Group sub-services by service_id
        const subsByService = {};
        subs.forEach((sub) => {
          if (!subsByService[sub.service_id]) subsByService[sub.service_id] = [];
          subsByService[sub.service_id].push(sub);
        });

        // Attach sub-services to main services
        const combined = services.map((s) => ({
          ...s,
          subservices: subsByService[s.id] || [],
        }));

        res.json({ services: combined });
      }
    );
  });
});

/* ---------------------------------------------
   ✅ POST create service
--------------------------------------------- */
router.post(
  "/",
  authenticateToken,
  requireRole("provider"),
  [
    body("name").notEmpty(),
    body("category").notEmpty(),
    body("duration").isInt({ min: 1 }),
    body("price").optional().isFloat({ min: 0 }),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { name, description, category, duration, price } = req.body;
    const provider_id = req.user.userId;

    db.run(
      `INSERT INTO services (provider_id, name, description, category, duration, price)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [provider_id, name, description, category, duration, price],
      function (err) {
        if (err)
          return res.status(500).json({ error: "Failed to create service" });
        db.get(
          `SELECT s.*, u.name AS provider_name, u.business_name, 
                  u.opening_time AS provider_opening_time, 
                  u.closing_time AS provider_closing_time
           FROM services s JOIN users u ON s.provider_id = u.id
           WHERE s.id = ?`,
          [this.lastID],
          (err2, service) => {
            if (err2)
              return res.status(500).json({ error: "Failed to fetch service" });
            res.status(201).json({ message: "Service created", service });
          }
        );
      }
    );
  }
);

/* ---------------------------------------------
   ✅ PUT update service
--------------------------------------------- */
router.put("/:id", authenticateToken, requireRole("provider"), (req, res) => {
  const serviceId = req.params.id;
  const provider_id = req.user.userId;
  const updates = [];
  const params = [];

  for (const [key, val] of Object.entries(req.body)) {
    if (val !== undefined) {
      updates.push(`${key} = ?`);
      params.push(val);
    }
  }

  if (!updates.length)
    return res.status(400).json({ error: "No fields to update" });
  params.push(serviceId, provider_id);

  db.run(
    `UPDATE services SET ${updates.join(", ")} WHERE id = ? AND provider_id = ?`,
    params,
    function (err) {
      if (err)
        return res.status(500).json({ error: "Failed to update service" });
      if (this.changes === 0)
        return res.status(404).json({ error: "Service not found" });
      res.json({ message: "Service updated successfully" });
    }
  );
});

/* ---------------------------------------------
   ✅ PATCH toggle single service
--------------------------------------------- */
router.patch(
  "/:id/closure",
  authenticateToken,
  requireRole("provider"),
  (req, res) => {
    const serviceId = req.params.id;
    const provider_id = req.user.userId;
    const { is_closed } = req.body;

    if (is_closed === undefined)
      return res
        .status(400)
        .json({ error: "is_closed is required (0 or 1)" });

    db.run(
      "UPDATE services SET is_closed = ? WHERE id = ? AND provider_id = ?",
      [is_closed ? 1 : 0, serviceId, provider_id],
      function (err) {
        if (err)
          return res
            .status(500)
            .json({ error: "Failed to update service status" });
        if (this.changes === 0)
          return res.status(404).json({ error: "Service not found" });
        res.json({ message: "Service status updated", is_closed });
      }
    );
  }
);

/* ---------------------------------------------
   ✅ DELETE service
--------------------------------------------- */
router.delete(
  "/:id",
  authenticateToken,
  requireRole("provider"),
  (req, res) => {
    const serviceId = req.params.id;
    const provider_id = req.user.userId;

    db.run(
      "DELETE FROM services WHERE id = ? AND provider_id = ?",
      [serviceId, provider_id],
      function (err) {
        if (err)
          return res.status(500).json({ error: "Failed to delete service" });
        if (this.changes === 0)
          return res.status(404).json({ error: "Service not found" });
        res.json({ message: "Service deleted successfully" });
      }
    );
  }
);

/* =====================================================
   🧩 SUB-SERVICES (Add-ons under each main service)
===================================================== */

/* ✅ Create sub-service */
router.post(
  "/:id/sub-services",
  authenticateToken,
  requireRole("provider"),
  (req, res) => {
    const serviceId = req.params.id;
    const providerId = req.user.userId;
    const { name, description, additional_price } = req.body;

    if (!name) return res.status(400).json({ error: "Name is required" });

    db.get(
      "SELECT id FROM services WHERE id = ? AND provider_id = ?",
      [serviceId, providerId],
      (err, row) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!row)
          return res
            .status(404)
            .json({ error: "Service not found or not owned by you" });

        db.run(
          `INSERT INTO sub_services (service_id, name, description, price)
           VALUES (?, ?, ?, ?)`,
          [serviceId, name, description || "", additional_price || 0],
          function (err2) {
            if (err2) {
              console.error("💥 Sub-service insert error:", err2);
              return res.status(500).json({ error: "Failed to add sub-service" });
            }
            res.status(201).json({
              message: "Sub-service created",
              sub_service: {
                id: this.lastID,
                name,
                description,
                additional_price,
              },
            });
          }
        );
      }
    );
  }
);


/* ✅ Get sub-services for one service */
router.get("/:id/sub-services", (req, res) => {
  const serviceId = req.params.id;
  db.all(
    "SELECT * FROM sub_services WHERE service_id = ? ORDER BY created_at DESC",
    [serviceId],
    (err, subs) => {
      if (err)
        return res.status(500).json({ error: "Failed to fetch sub-services" });
      res.json({ sub_services: subs });
    }
  );
});

/* ✅ Delete a sub-service */
router.delete(
  "/:serviceId/sub-services/:subId",
  authenticateToken,
  requireRole("provider"),
  (req, res) => {
    const { serviceId, subId } = req.params;
    db.run(
      "DELETE FROM sub_services WHERE id = ? AND service_id = ?",
      [subId, serviceId],
      function (err) {
        if (err)
          return res.status(500).json({ error: "Failed to delete sub-service" });
        if (this.changes === 0)
          return res.status(404).json({ error: "Sub-service not found" });
        res.json({ message: "Sub-service deleted successfully" });
      }
    );
  }
);

export default router;
