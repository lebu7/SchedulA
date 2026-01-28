/* backend/src/routes/reviews.js */
import express from "express";
import { body, validationResult } from "express-validator";
import { db } from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";
import { createNotification } from "../services/notificationService.js";

const router = express.Router();

/* ---------------------------------------------
   ✅ POST: Submit OR Update a Review
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
    if (!errors.isEmpty()) {
      console.log("❌ Review Validation Failed:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { appointment_id, rating, comment } = req.body;
    const client_id = req.user.userId;

    console.log(
      `📝 Processing review: User ${client_id}, Appointment ${appointment_id}`,
    );

    // 1. Fetch Appointment Details
    db.get(
      `SELECT * FROM appointments WHERE id = ?`,
      [appointment_id],
      (err, apt) => {
        if (err) {
          console.error("❌ Database Error fetching appointment:", err);
          return res.status(500).json({ error: "Database error" });
        }
        if (!apt) {
          console.warn("❌ Appointment not found:", appointment_id);
          return res.status(404).json({ error: "Appointment not found" });
        }

        // 2. Validate Ownership & Status
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

        // 3. Check for Time Limit (2 Months)
        const appointmentDate = new Date(apt.appointment_date);
        const twoMonthsAgo = new Date();
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

        if (appointmentDate < twoMonthsAgo) {
          return res.status(400).json({
            error: "Reviews are closed for appointments older than 2 months.",
          });
        }

        // 4. Check if Review Exists (Upsert Logic)
        db.get(
          `SELECT id FROM reviews WHERE appointment_id = ?`,
          [appointment_id],
          (existingErr, existingReview) => {
            if (existingErr) {
              return res
                .status(500)
                .json({ error: "Error checking existing reviews" });
            }

            if (existingReview) {
              // ✅ UPDATE existing review
              console.log(
                `🔄 Updating existing review for Appointment ${appointment_id}`,
              );
              db.run(
                `UPDATE reviews 
                 SET rating = ?, comment = ?, created_at = CURRENT_TIMESTAMP 
                 WHERE appointment_id = ?`,
                [rating, comment || "", appointment_id],
                function (updateErr) {
                  if (updateErr) {
                    console.error("❌ Update Review Failed:", updateErr);
                    return res
                      .status(500)
                      .json({ error: "Failed to update review." });
                  }
                  res.json({ message: "Review updated successfully!" });
                },
              );
            } else {
              // ✅ INSERT new review
              console.log(
                `✨ Creating new review for Appointment ${appointment_id}`,
              );
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
                    console.error("❌ Insert Review Failed:", insertErr);
                    return res
                      .status(500)
                      .json({ error: "Failed to submit review." });
                  }

                  // Notify Provider only on NEW reviews
                  createNotification(
                    apt.provider_id,
                    "review",
                    "New Review Received",
                    `A client rated their recent appointment ${rating}/5 stars.`,
                    this.lastID,
                  );

                  res
                    .status(201)
                    .json({ message: "Review submitted successfully!" });
                },
              );
            }
          },
        );
      },
    );
  },
);

/* ---------------------------------------------
   ✅ GET: Reviews for a Provider (ALL)
--------------------------------------------- */
router.get("/provider/:providerId", (req, res) => {
  const { providerId } = req.params;

  db.all(
    `SELECT r.*, u.name as client_name, s.name as service_name
     FROM reviews r
     JOIN users u ON r.client_id = u.id
     JOIN services s ON r.service_id = s.id
     WHERE r.provider_id = ?
     ORDER BY r.created_at DESC`,
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
