/* backend/src/routes/auth.js */
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { body, validationResult } from "express-validator";
import { db } from "../config/database.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import { createNotification } from "../services/notificationService.js";

const router = express.Router();

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
    // 🔞 Age Validation (Backend)
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
        // Return the first error message so frontend displays it correctly
        return res
          .status(400)
          .json({ error: errors.array()[0].msg, details: errors.array() });
      }

      // Destructure new fields
      const {
        email,
        password,
        name,
        phone,
        gender,
        dob,
        user_type,
        business_name,
      } = req.body;

      // Check for duplicate email
      db.get(
        "SELECT id FROM users WHERE email = ?",
        [email],
        async (err, row) => {
          if (err) return res.status(500).json({ error: "Database error" });

          // 🆕 Updated Error Message
          if (row)
            return res
              .status(400)
              .json({ error: "User already exists. Try logging in." });

          const hashedPassword = await bcrypt.hash(password, 12);

          // Add default business hours for providers
          const defaultOpening = user_type === "provider" ? "08:00" : null;
          const defaultClosing = user_type === "provider" ? "18:00" : null;

          // Default Notification Preferences (All ON)
          const defaultPrefs = JSON.stringify({
            confirmation: true,
            acceptance: true,
            reminder: true,
            cancellation: true,
            receipt: true,
            new_request: true,
          });

          // Insert gender and dob into database
          db.run(
            `INSERT INTO users (email, password, name, phone, gender, dob, user_type, business_name, opening_time, closing_time, notification_preferences)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              email,
              hashedPassword,
              name,
              phone,
              gender,
              dob,
              user_type,
              business_name,
              defaultOpening,
              defaultClosing,
              defaultPrefs,
            ],
            function (err) {
              if (err)
                return res.status(500).json({ error: "Failed to create user" });

              const newUserId = this.lastID;

              // 🔔 Welcome Notification
              createNotification(
                newUserId,
                "system",
                "Welcome to Schedula!",
                `Hello ${name}, your account has been successfully created.`
              );

              const token = jwt.sign(
                { userId: newUserId, email, user_type },
                process.env.JWT_SECRET,
                { expiresIn: "24h" }
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
                  opening_time: defaultOpening,
                  closing_time: defaultClosing,
                },
              });
            }
          );
        }
      );
    } catch (error) {
      res.status(500).json({ error: "Server error during registration" });
    }
  }
);

/* ---------------------------------------------
   ✅ Login
--------------------------------------------- */
router.post(
  "/login",
  [body("email").isEmail().normalizeEmail(), body("password").exists()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      db.get(
        "SELECT * FROM users WHERE email = ?",
        [email],
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
            { expiresIn: "24h" }
          );

          // Parse notification preferences safely
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
              opening_time: user.opening_time || "08:00",
              closing_time: user.closing_time || "18:00",
              notification_preferences: prefs,
            },
          });
        }
      );
    } catch (error) {
      res.status(500).json({ error: "Server error during login" });
    }
  }
);

/* ---------------------------------------------
   ✅ Get Profile
--------------------------------------------- */
router.get("/profile", authenticateToken, (req, res) => {
  db.get(
    `SELECT id, email, name, phone, gender, dob, user_type, business_name, 
            opening_time, closing_time, notification_preferences, created_at 
     FROM users WHERE id = ?`,
    [req.user.userId],
    (err, user) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (!user) return res.status(404).json({ error: "User not found" });

      // Parse JSON for frontend
      try {
        user.notification_preferences = JSON.parse(
          user.notification_preferences || "{}"
        );
      } catch (e) {}

      res.json({ user });
    }
  );
});

/* ---------------------------------------------
   ✅ UPDATE PROFILE
--------------------------------------------- */
router.put(
  "/profile",
  authenticateToken,
  [
    body("name").notEmpty(),
    body("phone")
      .matches(/^\+254\d{9}$/)
      .withMessage("Phone must start with +254 and have 9 digits"),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { name, phone, business_name, gender, dob } = req.body;
    db.run(
      `UPDATE users SET name = ?, phone = ?, business_name = ?, gender = ?, dob = ? WHERE id = ?`,
      [name, phone, business_name || null, gender, dob, req.user.userId],
      function (err) {
        if (err)
          return res.status(500).json({ error: "Failed to update profile" });

        // 🔔 Notification
        createNotification(
          req.user.userId,
          "system",
          "Profile Updated",
          "Your profile details have been successfully updated."
        );

        res.json({
          message: "Profile updated",
          user: { name, phone, business_name, gender, dob },
        });
      }
    );
  }
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

            // 🔔 Notification
            createNotification(
              userId,
              "system",
              "Password Changed",
              "Your account password was recently changed."
            );

            res.json({ message: "Password changed successfully" });
          }
        );
      }
    );
  }
);

/* ---------------------------------------------
   ✅ UPDATE NOTIFICATION PREFERENCES
--------------------------------------------- */
router.put("/notifications", authenticateToken, (req, res) => {
  const { preferences } = req.body;
  const safePrefs = { ...preferences, confirmation: true }; // Force confirmation ON

  db.run(
    `UPDATE users SET notification_preferences = ? WHERE id = ?`,
    [JSON.stringify(safePrefs), req.user.userId],
    function (err) {
      if (err)
        return res.status(500).json({ error: "Failed to save preferences" });

      // 🔔 Notification
      createNotification(
        req.user.userId,
        "system",
        "Settings Updated",
        "Your notification preferences have been saved."
      );

      res.json({ message: "Settings saved", preferences: safePrefs });
    }
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

    const { opening_time, closing_time } = req.body;
    if (closing_time <= opening_time)
      return res
        .status(400)
        .json({ error: "Closing time must be later than opening time" });

    db.run(
      `UPDATE users SET opening_time = ?, closing_time = ? WHERE id = ?`,
      [opening_time, closing_time, req.user.userId],
      function (err) {
        if (err)
          return res.status(500).json({ error: "Failed to update hours" });

        // 🔔 Notification
        createNotification(
          req.user.userId,
          "system",
          "Schedule Update",
          `Your business hours are now ${opening_time} - ${closing_time}.`
        );

        res.json({ message: "Business hours updated" });
      }
    );
  }
);

export default router;
