import { db } from "../config/database.js";

export async function createNotification(
  userId,
  type,
  title,
  message,
  referenceId = null,
) {
  // ✅ Capture exact server time in ISO format (Real Time)
  const now = new Date().toISOString();

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO notifications (user_id, type, title, message, reference_id, created_at) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, type, title, message, referenceId, now],
      function (err) {
        if (err) {
          console.error("❌ Notification Error:", err);
          reject(err);
        } else {
          resolve(this.lastID);
        }
      },
    );
  });
}

export default { createNotification };
