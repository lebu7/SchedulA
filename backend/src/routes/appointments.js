// backend/routes/appointments.js
import express from "express";
import { body, validationResult } from "express-validator";
import { db } from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

/* ---------------------------------------------
   ✅ Ensure appointment_addons table exists
--------------------------------------------- */
db.run(`
  CREATE TABLE IF NOT EXISTS appointment_addons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id INTEGER NOT NULL,
    addon_id INTEGER NOT NULL,
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    FOREIGN KEY (addon_id) REFERENCES sub_services(id) ON DELETE CASCADE
  );
`);

/* ---------------------------------------------
   ✅ Ensure rebooked status exists
--------------------------------------------- */
db.get(
  `SELECT sql FROM sqlite_master WHERE type='table' AND name='appointments'`,
  [],
  (err, row) => {
    if (err || !row) return;
    if (!row.sql.includes("'rebooked'")) {
      console.log("⚙️ Updating appointments table to support rebooked status...");
      db.serialize(() => {
        db.run("PRAGMA foreign_keys=off;");
        db.run(`
          CREATE TABLE appointments_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL,
            provider_id INTEGER NOT NULL,
            service_id INTEGER NOT NULL,
            appointment_date DATETIME NOT NULL,
            status TEXT DEFAULT 'scheduled' CHECK(status IN ('pending','scheduled','completed','cancelled','no-show','rebooked')),
            notes TEXT,
            client_deleted BOOLEAN DEFAULT 0,
            provider_deleted BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES users(id),
            FOREIGN KEY (provider_id) REFERENCES users(id),
            FOREIGN KEY (service_id) REFERENCES services(id)
          );
        `);
        db.run(`INSERT INTO appointments_new SELECT * FROM appointments;`);
        db.run("DROP TABLE appointments;");
        db.run("ALTER TABLE appointments_new RENAME TO appointments;");
        db.run("PRAGMA foreign_keys=on;");
        console.log("✅ Appointments table supports rebooked status.");
      });
    }
  }
);

/* ---------------------------------------------
   ✅ Fetch appointments (with add-ons)
--------------------------------------------- */
router.get("/", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const userType = req.user.user_type;

  const query =
    userType === "client"
      ? `
        SELECT a.*, s.name AS service_name, s.duration, s.price,
               u.name AS provider_name, u.business_name
        FROM appointments a
        JOIN services s ON a.service_id = s.id
        JOIN users u ON a.provider_id = u.id
        WHERE a.client_id = ? AND a.client_deleted = 0
        ORDER BY a.appointment_date DESC
      `
      : `
        SELECT a.*, s.name AS service_name, s.duration, s.price,
               u.name AS client_name, u.phone AS client_phone
        FROM appointments a
        JOIN services s ON a.service_id = s.id
        JOIN users u ON a.client_id = u.id
        WHERE a.provider_id = ? AND a.provider_deleted = 0
        ORDER BY a.appointment_date DESC
      `;

  try {
    const appointments = await new Promise((resolve, reject) => {
      db.all(query, [userId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // 🔹 Fetch and attach add-ons for each appointment
    for (const apt of appointments) {
      const addons = await new Promise((resolve) => {
        db.all(
          `SELECT sa.id, sa.name, sa.price
          FROM appointment_addons aa
          JOIN sub_services sa ON sa.id = aa.addon_id
          WHERE aa.appointment_id = ?`,
          [apt.id],
          (e, rows) => resolve(rows || [])
        );
      });
      apt.addons = addons;
    }

    // 🔹 Categorize appointments
    const now = new Date().toISOString();
    const filter = (arr, status, futureOnly = true) =>
      arr.filter(
        (a) =>
          a.status === status && (!futureOnly || a.appointment_date > now)
      );

    const categorized =
      userType === "client"
        ? {
            pending: filter(appointments, "pending"),
            scheduled: filter(appointments, "scheduled"),
            past: appointments.filter(
              (a) =>
                ["completed", "cancelled", "no-show", "rebooked"].includes(
                  a.status
                ) || a.appointment_date <= now
            ),
          }
        : {
            pending: filter(appointments, "pending"),
            upcoming: filter(appointments, "scheduled"),
            past: appointments.filter(
              (a) =>
                ["completed", "cancelled", "no-show", "rebooked"].includes(
                  a.status
                ) || a.appointment_date <= now
            ),
          };

    res.json({ appointments: categorized });
  } catch (error) {
    console.error("Error fetching appointments:", error);
    res.status(500).json({ error: "Failed to fetch appointments" });
  }
});

/* ---------------------------------------------
   ✅ Create appointment (with add-ons)
--------------------------------------------- */
router.post(
  "/",
  authenticateToken,
  [
    body("service_id").isInt({ min: 1 }),
    body("appointment_date").isISO8601(),
    body("notes").optional().trim(),
    body("addons").optional().isArray(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { service_id, appointment_date, notes, rebook_from, addons = [] } = req.body;
    const client_id = req.user.userId;
    const appointmentDate = new Date(appointment_date);
    if (appointmentDate <= new Date())
      return res.status(400).json({ error: "Appointment date must be in the future" });

    db.get("SELECT * FROM services WHERE id = ?", [service_id], (err, service) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (!service) return res.status(404).json({ error: "Service not found" });

      const providerId = service.provider_id;

      const day = appointmentDate.toISOString().split("T")[0];
      db.get(
        "SELECT * FROM provider_closed_days WHERE provider_id = ? AND closed_date = ?",
        [providerId, day],
        (err2, closedDay) => {
          if (closedDay)
            return res.status(400).json({
              error: `Provider is closed on ${day}. Please select another date.`,
            });

          db.get(
            `SELECT opening_time, closing_time FROM users WHERE id = ? AND user_type = 'provider'`,
            [providerId],
            (err3, provider) => {
              if (err3)
                return res.status(500).json({ error: "Error checking provider hours" });

              const open = provider?.opening_time || "08:00";
              const close = provider?.closing_time || "18:00";
              const utcHours = appointmentDate.getUTCHours();
              const utcMinutes = appointmentDate.getUTCMinutes();
              const eatHours = (utcHours + 3) % 24;
              const appointmentTime = `${eatHours.toString().padStart(2, "0")}:${utcMinutes
                .toString()
                .padStart(2, "0")}`;

              if (appointmentTime < open || appointmentTime > close)
                return res
                  .status(400)
                  .json({ error: `Bookings allowed between ${open} and ${close}.` });

              // ✅ Create appointment
              db.run(
                `INSERT INTO appointments (client_id, provider_id, service_id, appointment_date, notes, status)
                 VALUES (?, ?, ?, ?, ?, 'pending')`,
                [client_id, providerId, service_id, appointment_date, notes || ""],
                function (err4) {
                  if (err4)
                    return res.status(500).json({ error: "Failed to create appointment" });

                  const newId = this.lastID;

                  // ✅ Save add-ons
                  addons.forEach((addonId) => {
                    db.run(
                      `INSERT INTO appointment_addons (appointment_id, addon_id) VALUES (?, ?)`,
                      [newId, addonId]
                    );
                  });

                  // ✅ Mark old appointment as rebooked
                  if (rebook_from) {
                    db.run(
                      `UPDATE appointments SET status = 'rebooked' WHERE id = ? AND client_id = ?`,
                      [rebook_from, client_id]
                    );
                  }

                  // ✅ Return full appointment details with add-ons
                  db.all(
                    `SELECT sa.id, sa.name, sa.price
                     FROM appointment_addons aa
                     JOIN sub_services sa ON sa.id = aa.addon_id
                     WHERE aa.appointment_id = ?`,
                    [newId],
                    (err5, addonsData) => {
                      res.status(201).json({
                        message:
                          "Appointment requested successfully (pending provider confirmation)",
                        appointment: {
                          id: newId,
                          client_id,
                          provider_id: providerId,
                          service_id,
                          appointment_date,
                          status: "pending",
                          notes,
                          addons: addonsData || [],
                        },
                      });
                    }
                  );
                }
              );
            }
          );
        }
      );
    });
  }
);

/* ---------------------------------------------
   ✅ Update appointment (status / cancel)
--------------------------------------------- */
router.put("/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  const userType = req.user.user_type;
  const { status, appointment_date, notes } = req.body;

  const accessQuery =
    userType === "client"
      ? "SELECT * FROM appointments WHERE id = ? AND client_id = ?"
      : "SELECT * FROM appointments WHERE id = ? AND provider_id = ?";

  db.get(accessQuery, [id, userId], (err, apt) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!apt) return res.status(404).json({ error: "Appointment not found" });

    const updates = [];
    const params = [];
    if (status) {
      updates.push("status = ?");
      params.push(status);
    }
    if (appointment_date) {
      updates.push("appointment_date = ?");
      params.push(appointment_date);
    }
    if (notes) {
      updates.push("notes = ?");
      params.push(notes);
    }
    if (!updates.length) return res.status(400).json({ error: "No fields to update" });

    params.push(id, userId);

    const q =
      userType === "client"
        ? `UPDATE appointments SET ${updates.join(", ")} WHERE id = ? AND client_id = ?`
        : `UPDATE appointments SET ${updates.join(", ")} WHERE id = ? AND provider_id = ?`;

    db.run(q, params, (err2) => {
      if (err2) return res.status(500).json({ error: "Failed to update appointment" });
      res.json({ message: "Appointment updated successfully" });
    });
  });
});

/* ---------------------------------------------
   ✅ Soft delete (remove from dashboard)
--------------------------------------------- */
router.delete("/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  const userType = req.user.user_type;
  const delField = userType === "client" ? "client_deleted" : "provider_deleted";

  db.run(
    `UPDATE appointments SET ${delField} = 1 WHERE id = ? AND ${userType}_id = ?`,
    [id, userId],
    function (err) {
      if (err) return res.status(500).json({ error: "Failed to delete appointment" });
      if (this.changes === 0)
        return res.status(404).json({ error: "Appointment not found" });

      db.get(
        "SELECT client_deleted, provider_deleted FROM appointments WHERE id = ?",
        [id],
        (e, row) => {
          if (row && row.client_deleted && row.provider_deleted)
            db.run("DELETE FROM appointments WHERE id = ?", [id]);
          res.json({ message: "Appointment removed from dashboard" });
        }
      );
    }
  );
});

export default router;
