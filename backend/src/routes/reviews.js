/* backend/src/routes/reviews.js */
import express from "express";
import { body, validationResult } from "express-validator";
import { db } from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";
import { createNotification } from "../services/notificationService.js";

const router = express.Router();

/* ---------------------------------------------
   ✅ POST: Submit a Review
--------------------------------------------- */
router.post(
  "/",
  authenticateToken,
  [
    body("appointment_id").isInt().withMessage("Valid Appointment ID required"),
    body("rating").isInt({ min: 1, max: 5 }).withMessage("Rating must be 1-5"),
    body("comment").optional().trim().escape(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { appointment_id, rating, comment } = req.body;
    const client_id = req.user.userId;

    db.get(
      `SELECT * FROM appointments WHERE id = ?`,
      [appointment_id],
      (err, apt) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!apt)
          return res.status(404).json({ error: "Appointment not found" });

        if (apt.client_id !== client_id) {
          return res
            .status(403)
            .json({ error: "You can only review your own appointments." });
        }
        if (apt.status !== "completed") {
          return res
            .status(400)
            .json({ error: "You can only review completed appointments." });
        }

        const appointmentDate = new Date(apt.appointment_date);
        const twoMonthsAgo = new Date();
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

        if (appointmentDate < twoMonthsAgo) {
          return res.status(400).json({
            error: "Reviews are closed for appointments older than 2 months.",
          });
        }

        db.run(
          `INSERT INTO reviews (appointment_id, client_id, provider_id, service_id, rating, comment)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            appointment_id,
            client_id,
            apt.provider_id,
            apt.service_id,
            rating,
            comment || "",
          ],
          function (insertErr) {
            if (insertErr) {
              if (insertErr.message.includes("UNIQUE")) {
                return res.status(400).json({
                  error: "You have already reviewed this appointment.",
                });
              }
              return res
                .status(500)
                .json({ error: "Failed to submit review." });
            }

            createNotification(
              apt.provider_id,
              "review",
              "New Review Received",
              `A client rated their recent appointment ${rating}/5 stars.`,
              this.lastID,
            );

            res.status(201).json({ message: "Review submitted successfully!" });
          },
        );
      },
    );
  },
);

/* ---------------------------------------------
   ✅ GET: Reviews for a Provider (ALL)
   REMOVED LIMIT 20 to support frontend filtering
--------------------------------------------- */
router.get("/provider/:providerId", (req, res) => {
  const { providerId } = req.params;

  db.all(
    `SELECT r.*, u.name as client_name, s.name as service_name
     FROM reviews r
     JOIN users u ON r.client_id = u.id
     JOIN services s ON r.service_id = s.id
     WHERE r.provider_id = ?
     ORDER BY r.created_at DESC`, // ✅ Limit removed
    [providerId],
    (err, rows) => {
      if (err)
        return res.status(500).json({ error: "Failed to fetch reviews" });
      res.json({ reviews: rows || [] });
    },
  );
});

/* ---------------------------------------------
   ✅ GET: Reviews for a Service (All)
--------------------------------------------- */
router.get("/service/:serviceId", (req, res) => {
  const { serviceId } = req.params;

  db.all(
    `SELECT r.*, u.name as client_name
     FROM reviews r
     JOIN users u ON r.client_id = u.id
     WHERE r.service_id = ?
     ORDER BY r.created_at DESC`,
    [serviceId],
    (err, rows) => {
      if (err)
        return res.status(500).json({ error: "Failed to fetch reviews" });
      res.json({ reviews: rows || [] });
    },
  );
});

export default router;
