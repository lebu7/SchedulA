/* backend/src/services/notificationService.js */
import { db } from "../config/database.js";

export async function createNotification(
  userId,
  type,
  title,
  message,
  referenceId = null,
) {
  return new Promise((resolve, reject) => {
    // ✅ Explicitly using datetime('now') ensures UTC storage
    db.run(
      `INSERT INTO notifications (user_id, type, title, message, reference_id, created_at) 
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [userId, type, title, message, referenceId],
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
