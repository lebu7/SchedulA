/* backend/src/routes/auth.js */
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { body, validationResult } from "express-validator";
import { db } from "../config/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import { createNotification } from "../services/notificationService.js";
import smsService from "../services/smsService.js"; // Import smsService

const router = express.Router();

/* ---------------------------------------------
   ✅ Public Provider Profile (For Clients)
--------------------------------------------- */
router.get("/public-profile/:id", authenticateToken, (req, res) => {
  const providerId = req.params.id;

  db.get(
    `SELECT id, name, business_name, phone, business_address, suburb, 
            google_maps_link, opening_time, closing_time, 
            is_open_sat, is_open_sun, created_at 
     FROM users WHERE id = ? AND user_type = 'provider'`,
    [providerId],
    (err, provider) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (!provider)
        return res.status(404).json({ error: "Provider not found" });

      db.all(
        `SELECT id, name, description, category, duration, price, is_closed 
         FROM services WHERE provider_id = ? AND is_closed = 0`,
        [providerId],
        (servErr, services) => {
          if (servErr)
            return res.status(500).json({ error: "Error fetching services" });

          db.get(
            `SELECT COALESCE(SUM(capacity), 0) as total_staff 
             FROM services 
             WHERE provider_id = ?`,
            [providerId],
            (staffErr, capacityRow) => {
              if (staffErr)
                return res
                  .status(500)
                  .json({ error: "Error calculating capacity" });

              res.json({
                provider,
                services: services || [],
                staff_count: capacityRow ? capacityRow.total_staff : 0,
              });
            },
          );
        },
      );
    },
  );
});

/* ---------------------------------------------
   ✅ Register
--------------------------------------------- */
router.post(
  "/register",
  [
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 6 }),
    body("name").notEmpty().trim(),
    body("phone").notEmpty().withMessage("Phone number is required"),
    body("gender").isIn(["Male", "Female", "Other", "Prefer not to say"]),
    body("dob")
      .isISO8601()
      .withMessage("Date of Birth must be a valid date")
      .custom((value) => {
        const birthDate = new Date(value);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        if (age < 18) {
          throw new Error("You must be at least 18 years old to register.");
        }
        return true;
      }),
    body("user_type").isIn(["client", "provider"]),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json({ error: errors.array()[0].msg, details: errors.array() });
      }

      const {
        email,
        password,
        name,
        phone,
        gender,
        dob,
        user_type,
        business_name,
        suburb,
        business_address,
        google_maps_link,
      } = req.body;

      db.get(
        "SELECT id FROM users WHERE email = ?",
        [email],
        async (err, row) => {
          if (err) return res.status(500).json({ error: "Database error" });

          if (row)
            return res
              .status(400)
              .json({ error: "User already exists. Try logging in." });

          const hashedPassword = await bcrypt.hash(password, 12);
          const defaultOpening = user_type === "provider" ? "08:00" : null;
          const defaultClosing = user_type === "provider" ? "18:00" : null;
          const defaultPrefs = JSON.stringify({
            confirmation: true,
            acceptance: true,
            reminder: true,
            cancellation: true,
            receipt: true,
            new_request: true,
          });

          db.run(
            `INSERT INTO users (
              email, password, name, phone, gender, dob, user_type, 
              business_name, suburb, business_address, google_maps_link,
              opening_time, closing_time, is_open_sat, is_open_sun, notification_preferences
            )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
            [
              email,
              hashedPassword,
              name,
              phone,
              gender,
              dob,
              user_type,
              business_name,
              suburb || null,
              business_address || null,
              google_maps_link || null,
              defaultOpening,
              defaultClosing,
              defaultPrefs,
            ],
            function (err) {
              if (err) {
                console.error("Registration Error:", err.message);
                return res.status(500).json({ error: "Failed to create user" });
              }

              const newUserId = this.lastID;
              createNotification(
                newUserId,
                "system",
                "Welcome to Schedula!",
                `Hello ${name}, your account has been successfully created.`,
              );

              const token = jwt.sign(
                { userId: newUserId, email, user_type },
                process.env.JWT_SECRET,
                { expiresIn: "24h" },
              );

              res.status(201).json({
                message: "User created successfully",
                token,
                user: {
                  id: newUserId,
                  email,
                  name,
                  phone,
                  gender,
                  user_type,
                  business_name,
                  suburb,
                  opening_time: defaultOpening,
                  closing_time: defaultClosing,
                  is_open_sat: 0,
                  is_open_sun: 0,
                },
              });
            },
          );
        },
      );
    } catch (error) {
      res.status(500).json({ error: "Server error during registration" });
    }
  },
);

/* ---------------------------------------------
   ✅ Login
--------------------------------------------- */
router.post(
  "/login",
  [
    body("identifier").exists().withMessage("Email or Phone is required"),
    body("password").exists(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { identifier, password } = req.body;

      db.get(
        "SELECT * FROM users WHERE email = ? OR phone = ?",
        [identifier, identifier],
        async (err, user) => {
          if (err) return res.status(500).json({ error: "Database error" });
          if (!user)
            return res.status(401).json({ error: "Invalid credentials" });

          const isMatch = await bcrypt.compare(password, user.password);
          if (!isMatch)
            return res.status(401).json({ error: "Invalid credentials" });

          const token = jwt.sign(
            { userId: user.id, email: user.email, user_type: user.user_type },
            process.env.JWT_SECRET,
            { expiresIn: "24h" },
          );

          let prefs = {};
          try {
            prefs = JSON.parse(user.notification_preferences || "{}");
          } catch (e) {}

          res.json({
            message: "Login successful",
            token,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              user_type: user.user_type,
              business_name: user.business_name,
              phone: user.phone,
              gender: user.gender,
              dob: user.dob,
              suburb: user.suburb,
              business_address: user.business_address,
              google_maps_link: user.google_maps_link,
              opening_time: user.opening_time || "08:00",
              closing_time: user.closing_time || "18:00",
              is_open_sat: user.is_open_sat || 0,
              is_open_sun: user.is_open_sun || 0,
              notification_preferences: prefs,
            },
          });
        },
      );
    } catch (error) {
      res.status(500).json({ error: "Server error during login" });
    }
  },
);

/* ---------------------------------------------
   ✅ Forgot Password - Request OTP
--------------------------------------------- */
router.post(
  "/forgot-password",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone").notEmpty().withMessage("Phone number is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, phone } = req.body;

      db.get(
        "SELECT * FROM users WHERE email = ? AND phone = ?",
        [email, phone],
        async (err, user) => {
          if (err) return res.status(500).json({ error: "Database error" });
          if (!user) {
            return res.status(404).json({
              error: "No account found matching this email and phone number.",
            });
          }

          const now = new Date();
          const otp = Math.floor(100000 + Math.random() * 900000).toString();
          const expiresAt = new Date(
            now.getTime() + 1 * 60 * 1000,
          ).toISOString();

          db.run(
            "UPDATE users SET reset_otp = ?, reset_otp_expires = ? WHERE id = ?",
            [otp, expiresAt, user.id],
            async (updateErr) => {
              if (updateErr)
                return res
                  .status(500)
                  .json({ error: "Failed to generate OTP" });

              const message = `Your Schedula password reset code is: ${otp}. It expires in 1 minute.`;
              const smsResult = await smsService.sendSMS(phone, message);

              if (smsResult.success) {
                res.json({ message: "OTP sent to your phone." });
              } else {
                res.status(500).json({
                  error: "Failed to send SMS. Please try again later.",
                });
              }
            },
          );
        },
      );
    } catch (error) {
      res.status(500).json({ error: "Server error" });
    }
  },
);

/* ---------------------------------------------
   ✅ Reset Password
--------------------------------------------- */
router.post(
  "/reset-password",
  [
    body("email").isEmail(),
    body("phone").notEmpty(),
    body("otp").isLength({ min: 6, max: 6 }),
    body("newPassword").isLength({ min: 6 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, phone, otp, newPassword } = req.body;

      db.get(
        "SELECT * FROM users WHERE email = ? AND phone = ?",
        [email, phone],
        async (err, user) => {
          if (err) return res.status(500).json({ error: "Database error" });
          if (!user) return res.status(404).json({ error: "User not found." });

          if (user.reset_otp !== otp) {
            return res.status(400).json({ error: "Invalid OTP." });
          }

          if (new Date() > new Date(user.reset_otp_expires)) {
            return res
              .status(400)
              .json({ error: "OTP has expired. Please request a new one." });
          }

          const hashedPassword = await bcrypt.hash(newPassword, 12);

          db.run(
            "UPDATE users SET password = ?, reset_otp = NULL, reset_otp_expires = NULL WHERE id = ?",
            [hashedPassword, user.id],
            (updateErr) => {
              if (updateErr)
                return res
                  .status(500)
                  .json({ error: "Failed to reset password." });

              createNotification(
                user.id,
                "system",
                "Password Reset",
                "Your password has been successfully reset.",
              );

              res.json({
                message: "Password reset successfully. Please login.",
              });
            },
          );
        },
      );
    } catch (error) {
      res.status(500).json({ error: "Server error" });
    }
  },
);

/* ---------------------------------------------
   ✅ GET Notifications
--------------------------------------------- */
router.get("/notifications", authenticateToken, (req, res) => {
  db.all(
    "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
    [req.user.userId],
    (err, rows) => {
      if (err) {
        console.error("Error fetching notifications:", err.message);
        return res.status(500).json({ error: "Database error" });
      }
      res.json({ notifications: rows || [] });
    },
  );
});

/* ---------------------------------------------
   ✅ MARK NOTIFICATIONS READ
--------------------------------------------- */
router.put("/notifications/read", authenticateToken, (req, res) => {
  db.run(
    "UPDATE notifications SET is_read = 1 WHERE user_id = ?",
    [req.user.userId],
    (err) => {
      if (err) return res.status(500).json({ error: "Failed to update" });
      res.json({ message: "Notifications marked as read" });
    },
  );
});

/* ---------------------------------------------
   ✅ Get Profile
--------------------------------------------- */
router.get("/profile", authenticateToken, (req, res) => {
  db.get(
    `SELECT id, email, name, phone, gender, dob, user_type, business_name, 
            business_address, suburb, google_maps_link, 
            opening_time, closing_time, is_open_sat, is_open_sun, 
            notification_preferences, created_at 
     FROM users WHERE id = ?`,
    [req.user.userId],
    (err, user) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (!user) return res.status(404).json({ error: "User not found" });

      try {
        user.notification_preferences = JSON.parse(
          user.notification_preferences || "{}",
        );
      } catch (e) {}

      res.json({ user });
    },
  );
});

/* ---------------------------------------------
   ✅ UPDATE PROFILE (Compulsory Location)
--------------------------------------------- */
router.put(
  "/profile",
  authenticateToken,
  [
    body("name").notEmpty(),
    body("phone")
      .matches(/^\+254\d{9}$/)
      .withMessage("Phone must start with +254 and have 9 digits"),
    body("suburb").custom((value, { req }) => {
      if (req.user.user_type === "provider" && !value) {
        throw new Error("Suburb is compulsory for business profiles.");
      }
      return true;
    }),
    body("business_address").custom((value, { req }) => {
      if (req.user.user_type === "provider" && !value) {
        throw new Error(
          "Business Address is compulsory for business profiles.",
        );
      }
      return true;
    }),
    body("google_maps_link")
      .optional({ checkFalsy: true })
      .isURL()
      .withMessage("Must be a valid URL"),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const {
      name,
      phone,
      business_name,
      gender,
      dob,
      business_address,
      suburb,
      google_maps_link,
    } = req.body;

    db.run(
      `UPDATE users 
       SET name = ?, phone = ?, business_name = ?, gender = ?, dob = ?,
           business_address = ?, suburb = ?, google_maps_link = ? 
       WHERE id = ?`,
      [
        name,
        phone,
        business_name || null,
        gender,
        dob,
        business_address || null,
        suburb || null,
        google_maps_link || null,
        req.user.userId,
      ],
      function (err) {
        if (err)
          return res.status(500).json({ error: "Failed to update profile" });

        createNotification(
          req.user.userId,
          "system",
          "Profile Updated",
          "Your profile details have been successfully updated.",
        );

        res.json({
          message: "Profile updated",
          user: {
            name,
            phone,
            business_name,
            gender,
            dob,
            business_address,
            suburb,
            google_maps_link,
          },
        });
      },
    );
  },
);

/* ---------------------------------------------
   ✅ CHANGE PASSWORD
--------------------------------------------- */
router.put(
  "/password",
  authenticateToken,
  [
    body("currentPassword").notEmpty(),
    body("newPassword").isLength({ min: 6 }),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    db.get(
      "SELECT password FROM users WHERE id = ?",
      [userId],
      async (err, user) => {
        if (err || !user)
          return res.status(404).json({ error: "User not found" });

        const valid = await bcrypt.compare(currentPassword, user.password);
        if (!valid)
          return res
            .status(400)
            .json({ error: "Current password is incorrect" });

        const hashed = await bcrypt.hash(newPassword, 12);
        db.run(
          "UPDATE users SET password = ? WHERE id = ?",
          [hashed, userId],
          (err2) => {
            if (err2)
              return res
                .status(500)
                .json({ error: "Failed to update password" });

            createNotification(
              userId,
              "system",
              "Password Changed",
              "Your account password was recently changed.",
            );

            res.json({ message: "Password changed successfully" });
          },
        );
      },
    );
  },
);

/* ---------------------------------------------
   ✅ UPDATE NOTIFICATION PREFERENCES
--------------------------------------------- */
router.put("/notifications", authenticateToken, (req, res) => {
  const { preferences } = req.body;
  const safePrefs = { ...preferences, confirmation: true };

  db.run(
    `UPDATE users SET notification_preferences = ? WHERE id = ?`,
    [JSON.stringify(safePrefs), req.user.userId],
    function (err) {
      if (err)
        return res.status(500).json({ error: "Failed to save preferences" });

      createNotification(
        req.user.userId,
        "system",
        "Settings Updated",
        "Your notification preferences have been saved.",
      );

      res.json({ message: "Settings saved", preferences: safePrefs });
    },
  );
});

/* ---------------------------------------------
   ✅ UPDATE BUSINESS HOURS (Provider Only)
--------------------------------------------- */
router.put(
  "/business-hours",
  authenticateToken,
  requireRole("provider"),
  [
    body("opening_time")
      .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
      .withMessage("Invalid opening time (HH:MM)"),
    body("closing_time")
      .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
      .withMessage("Invalid closing time (HH:MM)"),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { opening_time, closing_time, is_open_sat, is_open_sun } = req.body;
    if (closing_time <= opening_time)
      return res
        .status(400)
        .json({ error: "Closing time must be later than opening time" });

    db.run(
      `UPDATE users SET opening_time = ?, closing_time = ?, is_open_sat = ?, is_open_sun = ? WHERE id = ?`,
      [
        opening_time,
        closing_time,
        is_open_sat ? 1 : 0,
        is_open_sun ? 1 : 0,
        req.user.userId,
      ],
      function (err) {
        if (err)
          return res.status(500).json({ error: "Failed to update hours" });

        createNotification(
          req.user.userId,
          "system",
          "Schedule Update",
          `Your business hours and weekend status have been updated.`,
        );

        res.json({ message: "Business hours updated" });
      },
    );
  },
);

export default router;
