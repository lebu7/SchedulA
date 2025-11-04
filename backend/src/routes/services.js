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

/* ------------------------------------------------
   ✅ Ensure closed_by_business column exists
------------------------------------------------ */
db.run(
  `ALTER TABLE services ADD COLUMN closed_by_business INTEGER DEFAULT 0`,
  (err) => {
    if (err && !err.message.includes("duplicate column")) {
      console.error("Error adding closed_by_business column:", err);
    }
  }
);

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
          return res.status(500).json({ error: "Failed to fetch sub-services" });

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
        if (err) {
          console.error("❌ Error inserting service:", err);
          return res.status(500).json({ error: "Failed to create service" });
        }

        const newServiceId = this.lastID;
        console.log("✅ New service created with ID:", newServiceId);

        db.get(
          `SELECT s.*, 
                  u.name AS provider_name, 
                  u.business_name, 
                  u.opening_time AS provider_opening_time, 
                  u.closing_time AS provider_closing_time
          FROM services s 
          JOIN users u ON s.provider_id = u.id
          WHERE s.id = ?`,
          [newServiceId],
          (err2, service) => {
            if (err2) {
              console.error("❌ Error fetching new service:", err2);
              return res.status(500).json({ error: "Failed to fetch service" });
            }

            // ✅ Ensure ID always included and numeric
            res.status(201).json({
              message: "Service created successfully",
              service: { ...service, id: newServiceId },
            });
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
   ✅ PATCH toggle single service (open/close)
--------------------------------------------- */
router.patch(
  "/:id/closure",
  authenticateToken,
  requireRole("provider"),
  (req, res) => {
    const serviceId = Number(req.params.id);
    const providerId = req.user.userId;
    const { is_closed } = req.body;

    // Validate ID
    if (!serviceId || isNaN(serviceId)) {
      return res.status(400).json({ error: "Invalid service ID" });
    }

    // Validate is_closed field
    const closedValue =
      is_closed === true || is_closed === 1 || is_closed === "1" ? 1 : 0;

    db.run(
      `UPDATE services 
       SET is_closed = ?, closed_by_business = 0
       WHERE id = ? AND provider_id = ?`,
      [closedValue, serviceId, providerId],
      function (err) {
        if (err) {
          console.error("❌ Error updating service:", err);
          return res.status(500).json({ error: "Failed to update service" });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: "Service not found or not owned by you" });
        }
        res.json({
          message: closedValue
            ? "✅ Service closed successfully."
            : "✅ Service reopened successfully.",
          service_id: serviceId,
          is_closed: closedValue,
        });
      }
    );
  }
);

/* ---------------------------------------------
   ✅ PATCH toggle all services for a provider
   - Close: closes all open services
   - Open: only reopens those closed by business
--------------------------------------------- */
router.patch(
  "/provider/:providerId/closure",
  authenticateToken,
  requireRole("provider"),
  (req, res) => {
    const providerId = req.params.providerId;
    const { is_closed } = req.body;

    if (is_closed === undefined)
      return res.status(400).json({ error: "is_closed is required (0 or 1)" });

    let query, params;

    if (is_closed) {
      // ✅ Close business: mark open services as closed & tag them
      query = `
        UPDATE services
        SET is_closed = 1, closed_by_business = 1
        WHERE provider_id = ? AND is_closed = 0
      `;
      params = [providerId];
    } else {
      // ✅ Reopen business: only open services that were closed by business
      query = `
        UPDATE services
        SET is_closed = 0, closed_by_business = 0
        WHERE provider_id = ? AND closed_by_business = 1
      `;
      params = [providerId];
    }

    db.run(query, params, function (err) {
      if (err) {
        console.error("❌ Error toggling business closure:", err);
        return res
          .status(500)
          .json({ error: "Failed to toggle business closure" });
      }

      res.json({
        message: is_closed
          ? "✅ Business closed — all active services have been temporarily closed."
          : "✅ Business reopened — only business-closed services reopened.",
        is_closed,
        affected: this.changes,
      });
    });
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
              return res
                .status(500)
                .json({ error: "Failed to add sub-service" });
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

/* ✅ Update a sub-service */
router.put(
  "/:serviceId/sub-services/:subId",
  authenticateToken,
  requireRole("provider"),
  (req, res) => {
    const { serviceId, subId } = req.params;
    const { name, description, additional_price } = req.body;

    if (!name || additional_price === undefined) {
      return res.status(400).json({ error: "Name and price are required" });
    }

    db.run(
      `UPDATE sub_services 
       SET name = ?, description = ?, price = ? 
       WHERE id = ? AND service_id = ?`,
      [name, description || "", additional_price, subId, serviceId],
      function (err) {
        if (err) {
          console.error("💥 Sub-service update error:", err);
          return res.status(500).json({ error: "Failed to update sub-service" });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: "Sub-service not found" });
        }
        res.json({
          message: "Sub-service updated successfully",
          sub_service: { id: subId, name, description, price: additional_price },
        });
      }
    );
  }
);

export default router;