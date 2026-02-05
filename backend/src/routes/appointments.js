/* backend/src/routes/appointments.js */
import express from "express";
import { body, validationResult } from "express-validator";
import { db } from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";
import smsService from "../services/smsService.js";
import {
  processPaystackRefund,
  sendRefundNotification,
  sendRefundRequestToProvider,
} from "../services/refundService.js";
import { createNotification } from "../services/notificationService.js";
import { predictNoShow } from "../services/aiPredictor.js";

const router = express.Router();

/* ---------------------------------------------
   🧠 Helper: Calculate No-Show Risk Score
--------------------------------------------- */
async function calculateNoShowRisk({
  client_id,
  service_id,
  appointment_date,
  amount_paid,
  total_price,
  deposit_amount,
}) {
  try {
    const clientHistory = await new Promise((resolve, reject) => {
      db.all(
        `SELECT status, total_price, amount_paid 
         FROM appointments 
         WHERE client_id = ? 
         ORDER BY appointment_date DESC 
         LIMIT 10`,
        [client_id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        },
      );
    });

    const totalAppointments = clientHistory.length;
    const noShowCount = clientHistory.filter(
      (a) => a.status === "no-show",
    ).length;
    const cancelCount = clientHistory.filter(
      (a) => a.status === "cancelled",
    ).length;
    const lastReceipt = clientHistory[0]?.total_price || 0;
    const recency = totalAppointments > 0 ? 7 : 30;

    const service = await new Promise((resolve, reject) => {
      db.get(
        `SELECT category FROM services WHERE id = ?`,
        [service_id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        },
      );
    });

    const appointmentTime = new Date(appointment_date).getHours();
    let timeOfDay = "morning";
    if (appointmentTime >= 12 && appointmentTime < 17) timeOfDay = "afternoon";
    else if (appointmentTime >= 17) timeOfDay = "evening";

    const dayOfWeek = new Date(appointment_date).toLocaleDateString("en-US", {
      weekday: "long",
    });

    const aiInput = {
      timeOfDay,
      dayOfWeek,
      category: service?.category || "Misc",
      recency,
      lastReceipt,
      historyNoShow: noShowCount,
      historyCancel: cancelCount,
    };

    const baseRisk = await predictNoShow(aiInput);

    const paymentRatio = amount_paid / total_price;
    let paymentAdjustment = 0;

    if (paymentRatio >= 1.0) {
      paymentAdjustment = -0.3;
    } else if (paymentRatio >= 0.5) {
      paymentAdjustment = -0.15;
    } else if (paymentRatio >= deposit_amount / total_price) {
      paymentAdjustment = 0;
    }

    let historyFactor = 0;
    if (totalAppointments > 0) {
      const reliabilityScore =
        1 - (noShowCount + cancelCount) / totalAppointments;
      if (reliabilityScore >= 0.9) historyFactor = -0.2;
      else if (reliabilityScore <= 0.5) historyFactor = +0.3;
    }

    const finalRisk = Math.max(
      0,
      Math.min(1, baseRisk + paymentAdjustment + historyFactor),
    );

    return {
      riskScore: finalRisk,
      baseRisk,
      paymentRatio,
      historyFactor,
    };
  } catch (error) {
    console.error("❌ Risk Calculation Error:", error);
    return {
      riskScore: 0.5,
      baseRisk: 0.5,
      paymentRatio: 0,
      historyFactor: 0,
    };
  }
}

/* ---------------------------------------------
   🧠 Helper: Process Multi-Transaction Refund
--------------------------------------------- */
async function processMultiTransactionRefund(appointmentId, totalRefundAmount) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM transactions 
       WHERE appointment_id = ? 
       AND type = 'payment' 
       AND status = 'success' 
       ORDER BY id ASC`,
      [appointmentId],
      async (err, transactions) => {
        if (err) return reject(err);
        if (!transactions || transactions.length === 0) {
          return reject(new Error("No payment transactions found"));
        }

        let remainingRefund = totalRefundAmount;
        const refundResults = [];

        for (
          let i = transactions.length - 1;
          i >= 0 && remainingRefund > 0;
          i--
        ) {
          const tx = transactions[i];
          const refundForThisTx = Math.min(remainingRefund, Number(tx.amount));

          try {
            const result = await processPaystackRefund(
              tx.reference,
              Math.round(refundForThisTx * 100),
            );

            if (result.success) {
              refundResults.push({
                reference: tx.reference,
                amount: refundForThisTx,
                refund_reference: result.refund_reference,
              });
              remainingRefund -= refundForThisTx;
            }
          } catch (error) {
            console.error(`Refund failed for ${tx.reference}:`, error.message);
          }
        }

        if (refundResults.length === 0) {
          return reject(new Error("All refund attempts failed"));
        }

        resolve({
          success: true,
          refunded: totalRefundAmount - remainingRefund,
          references: refundResults.map((r) => r.refund_reference),
        });
      },
    );
  });
}

/* ---------------------------------------------
   🧠 Helper: Check In-App Notification Preferences
--------------------------------------------- */
const shouldNotify = (prefsString, category) => {
  try {
    if (!prefsString) return true;
    const prefs = JSON.parse(prefsString);
    return prefs.in_app?.[category] !== false;
  } catch (e) {
    return true;
  }
};

/* ---------------------------------------------
   ✅ RESCHEDULE META HELPERS (NO DB MIGRATION)
   We store a small "system" blob inside notes:
   \n\n[SYS_RESCHEDULE]{"prev_date":"...","prev_status":"scheduled"}[/SYS_RESCHEDULE]
--------------------------------------------- */
const RES_META_OPEN = "[SYS_RESCHEDULE]";
const RES_META_CLOSE = "[/SYS_RESCHEDULE]";

function extractRescheduleMeta(notes) {
  if (!notes) return { meta: null, cleanNotes: notes || "" };
  const start = notes.lastIndexOf(RES_META_OPEN);
  const end = notes.lastIndexOf(RES_META_CLOSE);

  if (start === -1 || end === -1 || end < start) {
    return { meta: null, cleanNotes: notes };
  }

  const jsonPart = notes.substring(start + RES_META_OPEN.length, end).trim();
  let meta = null;

  try {
    meta = JSON.parse(jsonPart);
  } catch (e) {
    meta = null;
  }

  const before = notes.substring(0, start).trimEnd();
  const after = notes.substring(end + RES_META_CLOSE.length).trim();

  const cleanNotes = [before, after].filter(Boolean).join("\n").trim();
  return { meta, cleanNotes };
}

function appendRescheduleMeta(existingNotes, metaObj) {
  const safeNotes = (existingNotes || "").trim();
  const meta = `${RES_META_OPEN}${JSON.stringify(metaObj)}${RES_META_CLOSE}`;
  // keep user notes intact; append system block at end
  return safeNotes ? `${safeNotes}\n\n${meta}` : meta;
}

/* ---------------------------------------------
   ✅ Fetch appointments (client & provider)
--------------------------------------------- */
router.get("/", authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const userType = req.user.user_type;

  const query =
    userType === "client"
      ? `
      SELECT a.*, s.name AS service_name, s.duration, s.price, 
             u.name AS provider_name, u.business_name,
             r.id AS review_id, r.rating AS review_rating, r.comment AS review_comment
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      JOIN users u ON a.provider_id = u.id
      LEFT JOIN reviews r ON a.id = r.appointment_id
      WHERE a.client_id = ? AND a.client_deleted = 0
      ORDER BY a.appointment_date DESC`
      : `
      SELECT a.*, s.name AS service_name, s.duration, s.price,
             u.name AS client_name, u.phone AS client_phone,
             a.no_show_risk,
             r.id AS review_id, r.rating AS review_rating, r.comment AS review_comment
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      JOIN users u ON a.client_id = u.id
      LEFT JOIN reviews r ON a.id = r.appointment_id
      WHERE a.provider_id = ? AND a.provider_deleted = 0
      ORDER BY a.appointment_date DESC`;

  db.all(query, [userId], (err, appointments) => {
    if (err) {
      console.error("Fetch Appointments Error:", err);
      return res.status(500).json({ error: "Failed to fetch appointments" });
    }

    const now = new Date().toISOString();

    const pendingList = appointments.filter(
      (a) =>
        a.status === "pending" ||
        (a.status === "cancelled" &&
          (a.refund_status === "pending" || a.refund_status === "processing")),
    );

    const scheduledList = appointments.filter(
      (a) => a.status === "scheduled" && a.appointment_date > now,
    );

    const pastList = appointments.filter(
      (a) =>
        a.status === "completed" ||
        a.status === "no-show" ||
        a.status === "rebooked" ||
        (a.status === "cancelled" &&
          (a.refund_status === "completed" ||
            a.refund_status === "failed" ||
            a.refund_status === null)) ||
        (a.status === "scheduled" && a.appointment_date <= now),
    );

    if (userType === "client") {
      res.json({
        appointments: {
          pending: pendingList,
          scheduled: scheduledList,
          past: pastList,
        },
      });
    } else {
      res.json({
        appointments: {
          pending: pendingList,
          upcoming: scheduledList,
          past: pastList,
        },
      });
    }
  });
});

/* ---------------------------------------------
   🧾 GET Transaction History for Appointment
--------------------------------------------- */
router.get("/:id/transactions", authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  db.get(
    `SELECT client_id, provider_id FROM appointments WHERE id = ?`,
    [id],
    (err, apt) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (!apt) return res.status(404).json({ error: "Appointment not found" });

      if (apt.client_id !== userId && apt.provider_id !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      db.all(
        `SELECT * FROM transactions WHERE appointment_id = ? AND type = 'payment' AND status = 'success' ORDER BY id ASC`,
        [id],
        (err2, rows) => {
          if (err2)
            return res
              .status(500)
              .json({ error: "Failed to fetch transactions" });
          res.json({ transactions: rows || [] });
        },
      );
    },
  );
});

/* ---------------------------------------------
   📊 GET SMS Statistics
--------------------------------------------- */
router.get("/sms-stats", authenticateToken, async (req, res) => {
  try {
    const { getSMSStats } = smsService;
    const stats = await getSMSStats();

    const summary = {
      total_sent: 0,
      total_failed: 0,
      by_type: {},
    };

    stats.forEach((row) => {
      if (row.status === "sent") summary.total_sent += row.count;
      if (row.status === "failed") summary.total_failed += row.count;

      if (!summary.by_type[row.message_type]) {
        summary.by_type[row.message_type] = { sent: 0, failed: 0 };
      }

      summary.by_type[row.message_type][row.status] = row.count;
    });

    res.json({
      summary,
      detailed_logs: stats,
    });
  } catch (error) {
    console.error("Error fetching SMS stats:", error);
    res.status(500).json({ error: "Failed to fetch SMS statistics" });
  }
});

/* ---------------------------------------------
   👤 GET Client History (Provider Only) - ✅ NEW ENDPOINT
--------------------------------------------- */
router.get("/client-history/:clientId", authenticateToken, (req, res) => {
  const providerId = req.user.userId;
  const { clientId } = req.params;

  if (req.user.user_type !== "provider") {
    return res.status(403).json({ error: "Access denied. Providers only." });
  }

  db.get(
    `SELECT id, name, phone, email, created_at FROM users WHERE id = ?`,
    [clientId],
    (err, client) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (!client) return res.status(404).json({ error: "Client not found" });

      db.all(
        `SELECT a.*, s.name AS service_name
         FROM appointments a
         JOIN services s ON a.service_id = s.id
         WHERE a.client_id = ? AND a.provider_id = ?
         ORDER BY a.appointment_date DESC`,
        [clientId, providerId],
        (err2, history) => {
          if (err2)
            return res.status(500).json({ error: "Failed to fetch history" });

          const completedApts = history.filter((a) => a.status === "completed");
          const totalVisits = completedApts.length;
          const totalSpent = history.reduce(
            (sum, a) => sum + (a.amount_paid || 0),
            0,
          );
          const noShows = history.filter((a) => a.status === "no-show").length;
          const cancellations = history.filter(
            (a) => a.status === "cancelled",
          ).length;

          const stats = {
            total_visits: totalVisits,
            total_spent: totalSpent,
            no_shows: noShows,
            cancellations: cancellations,
            last_visit: history[0]?.appointment_date || null,
          };

          res.json({
            client,
            stats,
            history,
          });
        },
      );
    },
  );
});

/* ---------------------------------------------
   ✅ Check provider availability (UPDATED)
--------------------------------------------- */
router.get("/providers/:id/availability", (req, res) => {
  const providerId = req.params.id;
  const { date } = req.query;

  if (!date) return res.status(400).json({ error: "Date required" });

  db.get(
    `SELECT opening_time, closing_time FROM users WHERE id = ? AND user_type = 'provider'`,
    [providerId],
    (err, provider) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (!provider)
        return res.status(404).json({ error: "Provider not found" });

      db.get(
        `SELECT * FROM provider_closed_days WHERE provider_id = ? AND closed_date = ?`,
        [providerId, date],
        (err2, closedDay) => {
          if (err2) return res.status(500).json({ error: "Database error" });

          db.all(
            `SELECT a.appointment_date, s.duration 
             FROM appointments a
             JOIN services s ON a.service_id = s.id
             WHERE a.provider_id = ? 
             AND date(a.appointment_date) = ?
             AND a.status IN ('pending', 'scheduled', 'paid')`,
            [providerId, date],
            (err3, bookedRows) => {
              if (err3)
                return res
                  .status(500)
                  .json({ error: "Failed to fetch booked slots" });

              const bookedSlots = bookedRows.map((row) => {
                const start = new Date(row.appointment_date);
                const end = new Date(start.getTime() + row.duration * 60000);

                return {
                  start: start.toTimeString().slice(0, 5),
                  end: end.toTimeString().slice(0, 5),
                };
              });

              res.json({
                provider_id: providerId,
                date,
                is_closed: !!closedDay,
                closed_reason: closedDay?.reason || null,
                opening_time: provider.opening_time || "08:00",
                closing_time: provider.closing_time || "18:00",
                booked_slots: bookedSlots,
              });
            },
          );
        },
      );
    },
  );
});

/* ---------------------------------------------
   ✅ Create appointment (Updated Walk-In Status)
--------------------------------------------- */
router.post(
  "/",
  authenticateToken,
  [
    body("service_id").isInt({ min: 1 }),
    body("appointment_date").isISO8601(),
    body("notes").optional().trim(),
    body("rebook_from").optional().isInt(),
    body("is_walk_in").optional().isBoolean(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const {
      service_id,
      appointment_date,
      notes,
      rebook_from,
      payment_reference,
      payment_amount,
      addons,
      is_walk_in,
    } = req.body;

    const userType = req.user.user_type;

    if (is_walk_in && userType !== "provider") {
      return res
        .status(403)
        .json({ error: "Only providers can perform walk-ins." });
    }

    if (!is_walk_in) {
      if (
        !payment_reference ||
        !payment_amount ||
        Number(payment_amount) <= 0
      ) {
        return res.status(400).json({
          error: "Payment required before booking.",
        });
      }
    }

    const client_id = req.user.userId;
    const appointmentDate = new Date(appointment_date);
    if (appointmentDate <= new Date() && !is_walk_in) {
      return res
        .status(400)
        .json({ error: "Appointment date must be in the future" });
    }

    db.get(
      "SELECT * FROM services WHERE id = ?",
      [service_id],
      (err, service) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!service)
          return res.status(404).json({ error: "Service not found" });

        const day = appointmentDate.toISOString().split("T")[0];
        db.get(
          "SELECT * FROM provider_closed_days WHERE provider_id = ? AND closed_date = ?",
          [service.provider_id, day],
          (err2, closedDay) => {
            if (closedDay)
              return res.status(400).json({
                error: `Provider is closed on ${day}.`,
              });

            db.get(
              `SELECT opening_time, closing_time FROM users WHERE id = ?`,
              [service.provider_id],
              (err3, provider) => {
                if (err3)
                  return res
                    .status(500)
                    .json({ error: "Error checking provider hours" });

                const open = provider?.opening_time || "08:00";
                const close = provider?.closing_time || "18:00";

                const nairobiTime = new Date(
                  appointmentDate.toLocaleString("en-US", {
                    timeZone: "Africa/Nairobi",
                  }),
                );
                const bookingMinutes =
                  nairobiTime.getHours() * 60 + nairobiTime.getMinutes();

                const [openH, openM] = open.split(":").map(Number);
                const [closeH, closeM] = close.split(":").map(Number);
                const openTotal = openH * 60 + openM;
                const closeTotal = closeH * 60 + closeM;

                if (
                  bookingMinutes < openTotal ||
                  bookingMinutes >= closeTotal
                ) {
                  return res.status(400).json({
                    error: `Bookings are only allowed between ${open} and ${close}.`,
                  });
                }

                const newStartISO = appointmentDate.toISOString();
                const newEndISO = new Date(
                  appointmentDate.getTime() + service.duration * 60000,
                ).toISOString();

                db.all(
                  `SELECT a.id 
                 FROM appointments a
                 JOIN services s ON a.service_id = s.id
                 WHERE a.provider_id = ? 
                 AND a.status IN ('pending', 'scheduled', 'paid') 
                 AND (
                    (a.appointment_date < ? AND datetime(a.appointment_date, '+' || s.duration || ' minutes') > ?)
                 )`,
                  [service.provider_id, newEndISO, newStartISO],
                  async (errOverlap, existingBookings) => {
                    if (errOverlap)
                      return res
                        .status(500)
                        .json({ error: "Error checking availability" });

                    const maxCapacity = service.capacity || 1;

                    if (existingBookings.length >= maxCapacity) {
                      return res.status(400).json({
                        error: `This time slot is fully booked.`,
                      });
                    }

                    let addons_total = 0;
                    if (Array.isArray(addons) && addons.length > 0) {
                      addons_total = addons.reduce(
                        (sum, addon) =>
                          sum +
                          Number(addon.price ?? addon.additional_price ?? 0),
                        0,
                      );
                    }
                    const total_price =
                      Number(service.price || 0) + addons_total;
                    const deposit_amount = Math.round(total_price * 0.3);
                    const paymentAmt = Number(payment_amount || 0);

                    let payment_status;
                    let status;

                    if (is_walk_in) {
                      payment_status =
                        paymentAmt >= total_price ? "paid" : "deposit-paid";
                      status = "scheduled";
                    } else {
                      payment_status =
                        paymentAmt >= total_price ? "paid" : "deposit-paid";
                      status = "pending";
                    }

                    const { riskScore, baseRisk, paymentRatio, historyFactor } =
                      await calculateNoShowRisk({
                        client_id,
                        service_id,
                        appointment_date: appointmentDate,
                        amount_paid: paymentAmt,
                        total_price,
                        deposit_amount,
                      });

                    db.run(
                      `INSERT INTO appointments (
                        client_id, provider_id, service_id, appointment_date, notes, status,
                        payment_reference, payment_status,
                        total_price, deposit_amount, addons_total, addons, amount_paid,
                        no_show_risk
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                      [
                        client_id,
                        service.provider_id,
                        service_id,
                        appointment_date,
                        is_walk_in ? notes || "Walk-in Booking" : notes || "",
                        status,
                        is_walk_in ? "WALK-IN-CASH" : payment_reference || null,
                        payment_status,
                        total_price,
                        deposit_amount,
                        addons_total,
                        JSON.stringify(Array.isArray(addons) ? addons : []),
                        paymentAmt || 0,
                        is_walk_in ? 0 : riskScore || 0,
                      ],
                      function (err4) {
                        if (err4) {
                          console.error("❌ SQL Insert Error:", err4.message);
                          return res
                            .status(500)
                            .json({ error: "Failed to create appointment" });
                        }

                        const newId = this.lastID;

                        if (paymentAmt > 0) {
                          db.run(
                            `INSERT INTO transactions (appointment_id, amount, reference, type, status) VALUES (?, ?, ?, 'payment', 'success')`,
                            [
                              newId,
                              paymentAmt,
                              is_walk_in
                                ? `WALKIN_${Date.now()}`
                                : payment_reference,
                            ],
                          );
                        }

                        db.run(
                          `INSERT INTO ai_predictions (
                            appointment_id, predicted_risk, payment_amount,
                            base_risk_before_payment, payment_ratio, client_history_factor
                        ) VALUES (?, ?, ?, ?, ?, ?)`,
                          [
                            newId,
                            is_walk_in ? 0 : riskScore,
                            paymentAmt,
                            baseRisk,
                            paymentRatio,
                            historyFactor,
                          ],
                        );

                        if (rebook_from) {
                          db.run(
                            `UPDATE appointments SET status = 'rebooked' WHERE id = ? AND client_id = ?`,
                            [rebook_from, client_id],
                            (e) =>
                              e && console.error("Failed to mark rebooked:", e),
                          );
                        }

                        if (!is_walk_in) {
                          db.get(
                            `SELECT a.*, 
                                        c.name AS client_name, c.phone AS client_phone, c.notification_preferences AS client_prefs,
                                        s.name AS service_name,
                                        p.name AS provider_name, p.business_name, p.phone AS provider_phone, p.notification_preferences AS provider_prefs
                                FROM appointments a
                                JOIN users c ON a.client_id = c.id
                                JOIN services s ON a.service_id = s.id
                                JOIN users p ON a.provider_id = p.id
                                WHERE a.id = ?`,
                            [newId],
                            async (e, fullApt) => {
                              if (e) return;

                              const clientObj = {
                                name: fullApt.client_name,
                                phone: fullApt.client_phone,
                                notification_preferences: fullApt.client_prefs,
                              };
                              const providerObj = {
                                name: fullApt.provider_name,
                                business_name: fullApt.business_name,
                                phone: fullApt.provider_phone,
                                notification_preferences:
                                  fullApt.provider_prefs,
                              };

                              if (
                                shouldNotify(
                                  fullApt.client_prefs,
                                  "booking_alerts",
                                )
                              ) {
                                createNotification(
                                  client_id,
                                  "booking",
                                  "Booking Sent",
                                  `Your booking for ${service.name} is pending approval.`,
                                  newId,
                                );
                              }

                              let alertMsg = `${fullApt.client_name} booked ${service.name}.`;
                              if (fullApt.no_show_risk > 0.7) {
                                alertMsg += ` ⚠️ High No-Show Risk detected (${(fullApt.no_show_risk * 100).toFixed(0)}%).`;
                              }
                              if (
                                shouldNotify(
                                  fullApt.provider_prefs,
                                  "booking_alerts",
                                )
                              ) {
                                createNotification(
                                  service.provider_id,
                                  "booking",
                                  "New Booking Request",
                                  alertMsg,
                                  newId,
                                );
                              }

                              await smsService.sendBookingConfirmation(
                                {
                                  id: newId,
                                  appointment_date: fullApt.appointment_date,
                                  total_price: fullApt.total_price,
                                  amount_paid: fullApt.amount_paid,
                                },
                                clientObj,
                                { name: fullApt.service_name },
                                providerObj,
                              );

                              await smsService.sendProviderNotification(
                                {
                                  id: newId,
                                  appointment_date: fullApt.appointment_date,
                                  total_price: fullApt.total_price,
                                  amount_paid: fullApt.amount_paid,
                                },
                                providerObj,
                                clientObj,
                                { name: fullApt.service_name },
                              );
                            },
                          );
                        }

                        res.status(201).json({
                          message: "Appointment booked successfully",
                          appointmentId: newId,
                        });
                      },
                    );
                  },
                );
              },
            );
          },
        );
      },
    );
  },
);

/* ---------------------------------------------
   ✅ Provider toggle open/closed
--------------------------------------------- */
router.put("/providers/:id/closed", authenticateToken, (req, res) => {
  const providerId = req.params.id;
  const { is_closed } = req.body;
  db.run(
    `UPDATE services SET is_closed = ? WHERE provider_id = ?`,
    [is_closed ? 1 : 0, providerId],
    function (err) {
      if (err)
        return res
          .status(500)
          .json({ error: "Failed to update provider status" });
      res.json({
        message: is_closed
          ? "Provider marked as closed"
          : "Provider marked as open",
      });
    },
  );
});

/* ---------------------------------------------
   ✅ Provider sets business hours
--------------------------------------------- */
router.put(
  "/providers/:id/hours",
  authenticateToken,
  [
    body("opening_time")
      .isString()
      .matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
    body("closing_time")
      .isString()
      .matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
  ],
  (req, res) => {
    const providerId = req.params.id;
    const { opening_time, closing_time } = req.body;

    if (opening_time >= closing_time)
      return res
        .status(400)
        .json({ error: "Closing time must be later than opening time." });

    db.run(
      `UPDATE users 
       SET opening_time = ?, closing_time = ?
       WHERE id = ? AND user_type = 'provider'`,
      [opening_time, closing_time, providerId],
      function (err) {
        if (err)
          return res
            .status(500)
            .json({ error: "Failed to update business hours" });
        res.json({
          message: `Business hours updated for provider ${providerId}`,
          opening_time,
          closing_time,
        });
      },
    );
  },
);

/* ---------------------------------------------
   ✅ Update appointment (UPDATED FOR RESCHEDULE REJECTION + SAFE META)
--------------------------------------------- */
router.put("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  const userType = req.user.user_type;
  const { status, appointment_date, notes } = req.body;

  const accessQuery =
    userType === "client"
      ? "SELECT * FROM appointments WHERE id = ? AND client_id = ?"
      : "SELECT * FROM appointments WHERE id = ? AND provider_id = ?";

  db.get(accessQuery, [id, userId], async (err, apt) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!apt) return res.status(404).json({ error: "Appointment not found" });

    // Provider can't change locked appointments
    if (
      userType === "provider" &&
      ["completed", "cancelled", "no-show", "rebooked"].includes(apt.status)
    ) {
      return res.status(400).json({ error: "Appointment status locked." });
    }

    // ✅ Detect if this appointment currently holds a reschedule request meta
    const { meta: existingResMeta, cleanNotes: cleanExistingNotes } =
      extractRescheduleMeta(apt.notes);

    // ✅ SPECIAL CASE: Provider "rejects" a RESCHEDULE request
    // Frontend currently calls status="cancelled" for reject.
    // If appointment is pending and contains reschedule meta, we treat it as "reschedule rejected"
    // and revert to the previous date + previous status (pending OR scheduled).
    const isProviderRejectingReschedule =
      userType === "provider" &&
      status === "cancelled" &&
      apt.status === "pending" &&
      existingResMeta &&
      existingResMeta.prev_date &&
      existingResMeta.prev_status;

    if (isProviderRejectingReschedule) {
      const prevDateISO = existingResMeta.prev_date;
      const prevStatus = existingResMeta.prev_status;

      // Keep the rejected-requested date for messaging (what the client asked for)
      const rejectedRequestedDateISO = apt.appointment_date;

      // Optional reason typed by provider (your UI prompts sometimes)
      const providerReason =
        typeof notes === "string" && notes.trim() ? notes.trim() : null;

      // Restore appointment_date & status + remove SYS meta from notes
      db.run(
        `UPDATE appointments 
         SET appointment_date = ?, status = ?, notes = ?
         WHERE id = ? AND provider_id = ?`,
        [prevDateISO, prevStatus, cleanExistingNotes || "", id, userId],
        async (eUp) => {
          if (eUp) {
            console.error("Reschedule reject revert failed:", eUp);
            return res
              .status(500)
              .json({ error: "Failed to reject reschedule" });
          }

          // Fetch full appointment for notifications/SMS
          db.get(
            `SELECT a.*, 
                  c.name AS client_name, c.phone AS client_phone, c.notification_preferences AS client_prefs,
                  s.name AS service_name,
                  p.name AS provider_name, p.business_name, p.phone AS provider_phone, p.notification_preferences AS provider_prefs
           FROM appointments a
           JOIN users c ON a.client_id = c.id
           JOIN services s ON a.service_id = s.id
           JOIN users p ON a.provider_id = p.id
           WHERE a.id = ?`,
            [id],
            async (err3, fullApt) => {
              if (!err3 && fullApt) {
                const clientObj = {
                  name: fullApt.client_name,
                  phone: fullApt.client_phone,
                  notification_preferences: fullApt.client_prefs,
                };
                const providerObj = {
                  name: fullApt.provider_name,
                  business_name: fullApt.business_name,
                  phone: fullApt.provider_phone,
                  notification_preferences: fullApt.provider_prefs,
                };

                // In-app notify client (reschedule rejection)
                if (shouldNotify(fullApt.client_prefs, "booking_alerts")) {
                  createNotification(
                    fullApt.client_id,
                    "reschedule",
                    "Reschedule Rejected",
                    `Your reschedule request for #${id} was rejected. Your appointment has been restored to the original time.`,
                    id,
                  );
                }

                // Optional: notify provider side too (audit)
                if (shouldNotify(fullApt.provider_prefs, "booking_alerts")) {
                  createNotification(
                    fullApt.provider_id,
                    "reschedule",
                    "Reschedule Rejection Sent",
                    `You rejected the reschedule request for #${id}. Appointment restored to original time.`,
                    id,
                  );
                }

                // ✅ SMS to client: reschedule rejected, suggest next steps
                // (Fallback-safe: if helper isn't implemented yet, don't crash route)
                try {
                  if (
                    typeof smsService.sendRescheduleRejectedNotice ===
                    "function"
                  ) {
                    await smsService.sendRescheduleRejectedNotice(
                      { ...fullApt, id },
                      clientObj,
                      { name: fullApt.service_name },
                      providerObj,
                      prevDateISO, // restored/original time
                      rejectedRequestedDateISO, // requested time that was rejected
                      providerReason, // optional reason
                    );
                  } else {
                    // Keep silent to avoid breaking flows; smsService update will add this function
                    console.warn(
                      "smsService.sendRescheduleRejectedNotice not implemented yet",
                    );
                  }
                } catch (smsErr) {
                  console.error(
                    "Failed to send reschedule rejection SMS:",
                    smsErr,
                  );
                }
              }
            },
          );

          return res.json({
            message:
              "Reschedule rejected. Appointment restored to original time.",
            restored: {
              appointment_date: prevDateISO,
              status: prevStatus,
            },
          });
        },
      );

      return; // stop normal logic
    }

    // Normal update flow below
    let newRiskScore = null;

    if (appointment_date && appointment_date !== apt.appointment_date) {
      const newDate = new Date(appointment_date);
      if (newDate <= new Date())
        return res
          .status(400)
          .json({ error: "New date must be in the future" });

      const result = await calculateNoShowRisk({
        client_id: apt.client_id,
        service_id: apt.service_id,
        appointment_date: newDate,
        amount_paid: apt.amount_paid,
        total_price: apt.total_price,
        deposit_amount: apt.deposit_amount,
      });
      newRiskScore = result.riskScore;

      db.run(
        `INSERT INTO ai_predictions (
            appointment_id, predicted_risk, payment_amount,
            base_risk_before_payment, payment_ratio, client_history_factor
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          result.riskScore,
          apt.amount_paid,
          result.baseRisk,
          result.paymentRatio,
          result.historyFactor,
        ],
      );
    }

    const updates = [];
    const params = [];

    let effectiveStatus = status;
    const isReschedule =
      appointment_date && appointment_date !== apt.appointment_date;

    // Client reschedule → always becomes pending for provider approval
    if (isReschedule && userType === "client") {
      effectiveStatus = "pending";
    }

    if (effectiveStatus) {
      updates.push("status = ?");
      params.push(effectiveStatus);
    }

    if (appointment_date) {
      updates.push("appointment_date = ?");
      params.push(appointment_date);
    }

    // ✅ Notes update:
    // - If caller sends notes explicitly, keep them.
    // - If client is rescheduling, ALWAYS append SYS meta (even if they sent notes),
    //   and ensure we don't double-stack old SYS blocks.
    let finalNotesToSave = null;

    if (isReschedule && userType === "client") {
      const resMeta = {
        prev_date: apt.appointment_date,
        prev_status: apt.status || "scheduled",
      };

      // Choose the base notes to preserve:
      // - If client provided notes, use that
      // - Otherwise preserve existing notes
      const baseNotes = typeof notes === "string" ? notes : apt.notes || "";

      // Remove any existing SYS_RESCHEDULE block (avoid stacking multiple)
      const { cleanNotes: cleanedBaseNotes } = extractRescheduleMeta(baseNotes);

      finalNotesToSave = appendRescheduleMeta(cleanedBaseNotes, resMeta);
    } else if (typeof notes === "string") {
      finalNotesToSave = notes;
    }

    if (finalNotesToSave !== null) {
      updates.push("notes = ?");
      params.push(finalNotesToSave);
    }

    if (newRiskScore !== null) {
      updates.push("no_show_risk = ?");
      params.push(newRiskScore);
    }

    if (!updates.length)
      return res.status(400).json({ error: "No fields to update" });

    params.push(id, userId);

    const q =
      userType === "client"
        ? `UPDATE appointments SET ${updates.join(", ")} WHERE id = ? AND client_id = ?`
        : `UPDATE appointments SET ${updates.join(", ")} WHERE id = ? AND provider_id = ?`;

    db.run(q, params, async (err2) => {
      if (err2)
        return res.status(500).json({ error: "Failed to update appointment" });

      if (["completed", "no-show", "cancelled"].includes(effectiveStatus)) {
        db.run(
          `UPDATE ai_predictions SET actual_outcome = ? WHERE appointment_id = ?`,
          [effectiveStatus, id],
        );
      }

      // IMPORTANT: This remains for true cancellations (not reschedule rejection)
      if (status === "cancelled") {
        try {
          await handleAutomaticRefund(id, userType, notes);
        } catch (refundErr) {
          console.error("Refund processing error:", refundErr);
        }
      }

      db.get(
        `SELECT a.*, 
                  c.name AS client_name, c.phone AS client_phone, c.notification_preferences AS client_prefs,
                  s.name AS service_name,
                  p.name AS provider_name, p.business_name, p.phone AS provider_phone, p.notification_preferences AS provider_prefs
           FROM appointments a
           JOIN users c ON a.client_id = c.id
           JOIN services s ON a.service_id = s.id
           JOIN users p ON a.provider_id = p.id
           WHERE a.id = ?`,
        [id],
        async (err3, fullApt) => {
          if (!err3 && fullApt) {
            const clientObj = {
              name: fullApt.client_name,
              phone: fullApt.client_phone,
              notification_preferences: fullApt.client_prefs,
            };
            const providerObj = {
              name: fullApt.provider_name,
              business_name: fullApt.business_name,
              phone: fullApt.provider_phone,
              notification_preferences: fullApt.provider_prefs,
            };

            if (status === "scheduled" && apt.status === "pending") {
              if (shouldNotify(fullApt.client_prefs, "booking_alerts")) {
                createNotification(
                  fullApt.client_id,
                  "booking",
                  "Booking Confirmed",
                  `Your booking for ${fullApt.service_name} has been confirmed.`,
                  id,
                );
              }
              await smsService.sendBookingAccepted(
                { ...fullApt, id: id },
                clientObj,
                { name: fullApt.service_name },
                providerObj,
              );
            }

            if (status === "cancelled") {
              if (userType === "client") {
                if (shouldNotify(fullApt.client_prefs, "booking_alerts")) {
                  createNotification(
                    fullApt.client_id,
                    "cancellation",
                    "Booking Cancelled",
                    `You cancelled appointment #${id}. Refund request sent.`,
                    id,
                  );
                }

                if (shouldNotify(fullApt.provider_prefs, "booking_alerts")) {
                  createNotification(
                    fullApt.provider_id,
                    "cancellation",
                    "Booking Cancelled",
                    `${fullApt.client_name} cancelled appointment #${id}.`,
                    id,
                  );
                }
              } else {
                if (shouldNotify(fullApt.client_prefs, "booking_alerts")) {
                  createNotification(
                    fullApt.client_id,
                    "cancellation",
                    "Booking Cancelled",
                    `Provider cancelled your appointment #${id}.`,
                    id,
                  );
                }
              }

              await smsService.sendCancellationNotice(
                {
                  ...fullApt,
                  id: id,
                  amount_paid: fullApt.amount_paid,
                  provider_name: fullApt.provider_name,
                },
                clientObj,
                { name: fullApt.service_name },
                notes,
                userType,
              );
            }

            if (isReschedule) {
              const targetUser =
                userType === "client" ? fullApt.provider_id : fullApt.client_id;
              const targetPrefs =
                userType === "client"
                  ? fullApt.provider_prefs
                  : fullApt.client_prefs;
              const title =
                userType === "client"
                  ? "Reschedule Request"
                  : "Appointment Rescheduled";
              const msg =
                userType === "client"
                  ? `${fullApt.client_name} requested to reschedule #${id}.`
                  : `Provider moved appointment #${id} to a new time.`;

              if (shouldNotify(targetPrefs, "booking_alerts")) {
                createNotification(targetUser, "reschedule", title, msg, id);
              }

              if (newRiskScore && newRiskScore > 0.7 && userType === "client") {
                if (shouldNotify(fullApt.provider_prefs, "booking_alerts")) {
                  createNotification(
                    fullApt.provider_id,
                    "reschedule",
                    "High Risk Reschedule",
                    `⚠️ ${fullApt.client_name}'s rescheduled slot has High No-Show Risk.`,
                    id,
                  );
                }
              }

              await smsService.sendRescheduleNotification(
                { ...fullApt, id: id, appointment_date: appointment_date },
                clientObj,
                { name: fullApt.service_name },
                providerObj,
                apt.appointment_date,
                effectiveStatus,
              );
            }
          }
        },
      );

      res.json({ message: "Appointment updated successfully" });
    });
  });
});

/* ---------------------------------------------
   ✅ Soft delete appointment (WITH 6-MONTH CHECK & NO DATA LOSS)
--------------------------------------------- */
router.delete("/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  const userType = req.user.user_type;
  const delField =
    userType === "client" ? "client_deleted" : "provider_deleted";

  db.get(
    "SELECT appointment_date, status FROM appointments WHERE id = ? AND (client_id = ? OR provider_id = ?)",
    [id, userId, userId],
    (err, apt) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (!apt) return res.status(404).json({ error: "Appointment not found" });

      const aptDate = new Date(apt.appointment_date);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      if (aptDate > sixMonthsAgo) {
        return res.status(403).json({
          error:
            "To ensure accurate history for AI predictions, appointments can only be removed from your dashboard if they are older than 6 months.",
        });
      }

      db.run(
        `UPDATE appointments SET ${delField} = 1 WHERE id = ? AND ${userType}_id = ?`,
        [id, userId],
        function (err2) {
          if (err2)
            return res
              .status(500)
              .json({ error: "Failed to remove appointment" });

          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

          if (aptDate < oneYearAgo) {
            db.get(
              "SELECT client_deleted, provider_deleted FROM appointments WHERE id = ?",
              [id],
              (e3, row) => {
                if (row && row.client_deleted && row.provider_deleted) {
                  db.run("DELETE FROM appointments WHERE id = ?", [id]);
                }
              },
            );
          }

          res.json({ message: "Appointment removed from dashboard" });
        },
      );
    },
  );
});

/* ---------------------------------------------
   ✅ Update payment (With Notification Check)
--------------------------------------------- */
router.put("/:id/payment", authenticateToken, (req, res) => {
  const { id } = req.params;
  const { payment_reference, amount_paid, payment_status } = req.body;

  if (!payment_reference)
    return res.status(400).json({ error: "Missing payment reference" });

  const paid = Number(amount_paid || 0);

  db.get(`SELECT * FROM appointments WHERE id = ?`, [id], async (err, row) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!row) return res.status(404).json({ error: "Appointment not found" });

    const finalStatus = paid >= row.total_price ? "paid" : "deposit-paid";

    const { riskScore, baseRisk, paymentRatio, historyFactor } =
      await calculateNoShowRisk({
        client_id: row.client_id,
        service_id: row.service_id,
        appointment_date: row.appointment_date,
        amount_paid: paid,
        total_price: row.total_price,
        deposit_amount: row.deposit_amount,
      });

    let updateQuery = `
        UPDATE appointments
        SET payment_reference = ?,
            amount_paid = ?, 
            payment_status = ?,
            no_show_risk = ?
        WHERE id = ?
      `;
    const updateParams = [payment_reference, paid, finalStatus, riskScore, id];

    db.run(updateQuery, updateParams, function (err2) {
      if (err2)
        return res.status(500).json({ error: "Failed to update payment info" });

      db.run(
        `INSERT INTO transactions (appointment_id, amount, reference, type, status) VALUES (?, ?, ?, 'payment', 'success')`,
        [id, paid, payment_reference],
      );

      db.run(
        `UPDATE ai_predictions 
                  SET predicted_risk = ?, payment_amount = ?, base_risk_before_payment = ?, payment_ratio = ?, client_history_factor = ? 
                  WHERE appointment_id = ?`,
        [riskScore, paid, baseRisk, paymentRatio, historyFactor, id],
      );

      db.get(
        `SELECT provider_id FROM appointments WHERE id=?`,
        [id],
        (e, r) => {
          db.get(
            `SELECT notification_preferences FROM users WHERE id=?`,
            [r.provider_id],
            (e2, u) => {
              if (shouldNotify(u?.notification_preferences, "payment_alerts")) {
                createNotification(
                  r.provider_id,
                  "payment",
                  "Payment Received",
                  `Payment of KES ${paid} received for Appt #${id}.`,
                  id,
                );
              }
            },
          );
        },
      );

      return res.json({
        message: "Payment updated successfully",
        amount_paid: paid,
        payment_status: finalStatus,
      });
    });
  });
});

/* ---------------------------------------------
   ✅ Pay remaining balance (With Notification Check)
--------------------------------------------- */
router.put("/:id/pay-balance", authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  const { payment_reference, amount_paid } = req.body;

  if (!payment_reference || !amount_paid || Number(amount_paid) <= 0) {
    return res.status(400).json({
      error: "payment_reference and positive amount_paid are required",
    });
  }

  db.get(`SELECT * FROM appointments WHERE id = ?`, [id], async (err, row) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!row) return res.status(404).json({ error: "Appointment not found" });

    if (row.client_id !== userId && row.provider_id !== userId) {
      return res.status(403).json({
        error: "Forbidden: You are not authorized to update this appointment.",
      });
    }

    const prevPaid = Number(row.amount_paid || 0);
    const newPaid = prevPaid + Number(amount_paid);
    const finalStatus =
      newPaid >= Number(row.total_price || 0) ? "paid" : "deposit-paid";

    const { riskScore, baseRisk, paymentRatio, historyFactor } =
      await calculateNoShowRisk({
        client_id: row.client_id,
        service_id: row.service_id,
        appointment_date: row.appointment_date,
        amount_paid: newPaid,
        total_price: row.total_price,
        deposit_amount: row.deposit_amount,
      });

    let updateQuery = `
      UPDATE appointments
      SET amount_paid = ?, payment_reference = ?, payment_status = ?, no_show_risk = ?
      WHERE id = ?
    `;
    const updateParams = [
      newPaid,
      payment_reference,
      finalStatus,
      riskScore,
      id,
    ];

    db.run(updateQuery, updateParams, function (err2) {
      if (err2)
        return res
          .status(500)
          .json({ error: "Failed to update balance payment" });

      db.run(
        `INSERT INTO transactions (appointment_id, amount, reference, type, status) VALUES (?, ?, ?, 'payment', 'success')`,
        [id, amount_paid, payment_reference],
      );

      db.run(
        `UPDATE ai_predictions 
                SET predicted_risk = ?, payment_amount = ?, base_risk_before_payment = ?, payment_ratio = ?, client_history_factor = ? 
                WHERE appointment_id = ?`,
        [riskScore, newPaid, baseRisk, paymentRatio, historyFactor, id],
      );

      db.get(
        `SELECT notification_preferences FROM users WHERE id=?`,
        [row.provider_id],
        (e2, u) => {
          if (shouldNotify(u?.notification_preferences, "payment_alerts")) {
            createNotification(
              row.provider_id,
              "payment",
              "Balance Paid",
              `Balance payment of KES ${amount_paid} received for Appt #${id}.`,
              id,
            );
          }
        },
      );

      db.get(
        `SELECT c.name, c.phone, c.notification_preferences, s.name AS service_name, a.*
           FROM appointments a
           JOIN users c ON a.client_id = c.id
           JOIN services s ON a.service_id = s.id
           WHERE a.id = ?`,
        [id],
        async (err3, fullApt) => {
          if (!err3 && fullApt && fullApt.phone) {
            await smsService.sendPaymentReceipt(
              {
                id: id,
                amount_paid: amount_paid,
                total_price: fullApt.total_price,
                payment_reference: payment_reference,
              },
              {
                name: fullApt.name,
                phone: fullApt.phone,
                notification_preferences: fullApt.notification_preferences,
              },
              { name: fullApt.service_name },
            );
          }
        },
      );

      res.json({
        message: "Balance payment recorded",
        amount_paid: newPaid,
        payment_status: finalStatus,
      });
    });
  });
});

/* ---------------------------------------------
   ✅ Provider can prompt client for remaining balance
--------------------------------------------- */
router.post("/:id/request-balance", authenticateToken, (req, res) => {
  const { id } = req.params;
  const providerId = req.user.userId;
  const { amount_requested, note } = req.body;

  if (!amount_requested || Number(amount_requested) <= 0) {
    return res
      .status(400)
      .json({ error: "amount_requested must be a positive number" });
  }

  db.get(
    `SELECT provider_id, client_id FROM appointments WHERE id = ?`,
    [id],
    (err, row) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (!row) return res.status(404).json({ error: "Appointment not found" });
      if (row.provider_id !== providerId)
        return res.status(403).json({ error: "Forbidden" });

      db.run(
        `INSERT INTO payment_requests (appointment_id, provider_id, client_id, amount_requested, note)
       VALUES (?, ?, ?, ?, ?)`,
        [id, providerId, row.client_id, Number(amount_requested), note || null],
        function (err2) {
          if (err2)
            return res
              .status(500)
              .json({ error: "Failed to create payment request" });

          db.get(
            `SELECT notification_preferences FROM users WHERE id=?`,
            [row.client_id],
            (e2, u) => {
              if (shouldNotify(u?.notification_preferences, "payment_alerts")) {
                createNotification(
                  row.client_id,
                  "payment",
                  "Balance Request",
                  `Provider requested balance payment of KES ${amount_requested}.`,
                  id,
                );
              }
            },
          );

          res.json({
            message: "Payment request created",
            request_id: this.lastID,
          });
        },
      );
    },
  );
});

/* ---------------------------------------------
   ✅ MANUAL REFUND PROCESSING (Provider Only)
--------------------------------------------- */
router.post("/:id/process-refund", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const providerId = req.user.userId;

  if (req.user.user_type !== "provider") {
    return res
      .status(403)
      .json({ error: "Only providers can process refunds" });
  }

  db.get(
    `SELECT a.*, 
            c.name AS client_name, c.phone AS client_phone, c.notification_preferences AS client_prefs
     FROM appointments a
     JOIN users c ON a.client_id = c.id
     WHERE a.id = ? AND a.provider_id = ?`,
    [id, providerId],
    async (err, apt) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (!apt) return res.status(404).json({ error: "Appointment not found" });

      if (apt.refund_status !== "pending") {
        return res.status(400).json({
          error: "No pending refund request found for this appointment",
        });
      }

      const amountToRefund = Number(apt.refund_amount || apt.amount_paid || 0);
      if (amountToRefund <= 0)
        return res.status(400).json({ error: "No amount to refund" });

      db.run(
        `UPDATE appointments SET refund_status = 'processing' WHERE id = ?`,
        [id],
      );

      try {
        const result = await processMultiTransactionRefund(id, amountToRefund);

        db.run(
          `UPDATE appointments 
             SET refund_status = 'completed',
                 refund_reference = ?,
                 refund_completed_at = datetime('now'),
                 payment_status = 'refunded'
             WHERE id = ?`,
          [result.references.join(","), id],
        );

        if (shouldNotify(apt.client_prefs, "payment_alerts")) {
          createNotification(
            apt.client_id,
            "refund",
            "Refund Processed",
            `Your refund of KES ${amountToRefund} has been processed.`,
            id,
          );
        }

        await sendRefundNotification(
          { id, payment_reference: apt.payment_reference },
          {
            name: apt.client_name,
            phone: apt.client_phone,
            notification_preferences: apt.client_prefs,
          },
          amountToRefund,
          "completed",
        );

        res.json({
          message: "Refund processed successfully",
          refund_references: result.references,
        });
      } catch (error) {
        console.error("Manual refund failed:", error);
        db.run(
          `UPDATE appointments SET refund_status = 'failed' WHERE id = ?`,
          [id],
        );
        res
          .status(500)
          .json({ error: "Refund processing failed", details: error.message });
      }
    },
  );
});

/* ---------------------------------------------
   ✅ AUTOMATIC REFUND HANDLER FUNCTION
--------------------------------------------- */
async function handleAutomaticRefund(appointmentId, cancelledBy, reason) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT a.*, 
              c.name AS client_name, c.phone AS client_phone, c.notification_preferences AS client_prefs,
              p.name AS provider_name, p.phone AS provider_phone, p.notification_preferences AS provider_prefs,
              s.name AS service_name
       FROM appointments a
       JOIN users c ON a.client_id = c.id
       JOIN users p ON a.provider_id = p.id
       JOIN services s ON a.service_id = s.id
       WHERE a.id = ?`,
      [appointmentId],
      async (err, apt) => {
        if (err || !apt) return reject(err);

        const amountPaid = Number(apt.amount_paid || 0);
        if (amountPaid <= 0) return resolve();

        const clientObj = {
          name: apt.client_name,
          phone: apt.client_phone,
          notification_preferences: apt.client_prefs,
        };
        const providerObj = {
          name: apt.provider_name,
          phone: apt.provider_phone,
          notification_preferences: apt.provider_prefs,
        };

        if (cancelledBy === "provider") {
          console.log(`Processing auto-refund for Appt #${appointmentId}`);

          db.run(
            `UPDATE appointments 
             SET refund_status = 'processing', 
                 refund_amount = ?, 
                 refund_initiated_at = datetime('now'),
                 payment_status = 'refund-pending'
             WHERE id = ?`,
            [amountPaid, appointmentId],
          );

          try {
            const result = await processMultiTransactionRefund(
              appointmentId,
              amountPaid,
            );

            db.run(
              `UPDATE appointments 
               SET refund_status = 'completed',
                   refund_reference = ?,
                   refund_completed_at = datetime('now'),
                   payment_status = 'refunded'
               WHERE id = ?`,
              [result.references.join(","), appointmentId],
            );

            if (shouldNotify(apt.client_prefs, "payment_alerts")) {
              createNotification(
                apt.client_id,
                "refund",
                "Refund Processed",
                `Your refund of KES ${amountPaid} for Appt #${appointmentId} is complete.`,
                appointmentId,
              );
            }

            await sendRefundNotification(
              { id: appointmentId, payment_reference: apt.payment_reference },
              clientObj,
              amountPaid,
              "completed",
            );
            resolve();
          } catch (refundError) {
            console.error("❌ Auto-Refund Failed:", refundError);
            db.run(
              `UPDATE appointments SET refund_status = 'failed' WHERE id = ?`,
              [appointmentId],
            );

            if (shouldNotify(apt.provider_prefs, "payment_alerts")) {
              createNotification(
                apt.provider_id,
                "refund",
                "Auto-Refund Failed",
                `Automatic refund for Appt #${appointmentId} failed. Please process it manually from dashboard.`,
                appointmentId,
              );
            }
            resolve();
          }
        } else if (cancelledBy === "client") {
          console.log(
            `Client cancelled. Requesting refund for Appt #${appointmentId}`,
          );

          db.run(
            `UPDATE appointments 
             SET refund_status = 'pending', 
                 refund_amount = ?, 
                 refund_initiated_at = datetime('now'),
                 payment_status = 'refund-pending'
             WHERE id = ?`,
            [amountPaid, appointmentId],
          );

          if (shouldNotify(apt.provider_prefs, "payment_alerts")) {
            createNotification(
              apt.provider_id,
              "refund",
              "Refund Request",
              `Client cancelled Appt #${appointmentId}. Please process refund.`,
              appointmentId,
            );
          }

          await sendRefundRequestToProvider(
            { id: appointmentId },
            providerObj,
            clientObj,
            amountPaid,
          );
          resolve();
        }
      },
    );
  });
}

export default router;
