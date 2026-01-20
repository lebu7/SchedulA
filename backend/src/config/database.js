import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure database directory exists
const dbDir = path.join(__dirname, '../../database');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log('📁 Created database directory');
}

const dbPath = path.join(dbDir, 'schedula.db');
console.log(`📊 Database path: ${dbPath}`);

export const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
  } else {
    console.log('✅ Connected to SQLite database successfully');
    initializeDatabase();
  }
});

function initializeDatabase() {
  /* ---------------------------------------------
     🧱 USERS TABLE
  --------------------------------------------- */
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      user_type TEXT CHECK(user_type IN ('client', 'provider')) NOT NULL,
      business_name TEXT,
      opening_time TEXT DEFAULT '08:00',
      closing_time TEXT DEFAULT '18:00',
      notification_preferences TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  /* ---------------------------------------------
     💈 SERVICES TABLE
  --------------------------------------------- */
  db.run(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      duration INTEGER NOT NULL,
      price DECIMAL(10,2),
      capacity INTEGER DEFAULT 1,
      opening_time TEXT DEFAULT '08:00',
      closing_time TEXT DEFAULT '18:00',
      slot_interval INTEGER DEFAULT 30,
      is_closed INTEGER DEFAULT 0,
      closed_by_business INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (provider_id) REFERENCES users (id)
    )
  `);

  /* ---------------------------------------------
     📅 APPOINTMENTS TABLE
  --------------------------------------------- */
  db.run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      provider_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      appointment_date DATETIME NOT NULL,
      status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled','no-show','rebooked','pending')),
      notes TEXT,
      client_deleted BOOLEAN DEFAULT 0,
      provider_deleted BOOLEAN DEFAULT 0,
      payment_status TEXT DEFAULT 'unpaid',
      payment_reference TEXT,
      amount_paid REAL DEFAULT 0,
      total_price REAL DEFAULT 0,
      deposit_amount REAL DEFAULT 0,
      addons_total REAL DEFAULT 0,
      addons TEXT DEFAULT '[]',
      reminder_sent INTEGER DEFAULT 0,
      
      -- Refund Columns
      refund_status TEXT DEFAULT NULL CHECK(refund_status IN (NULL, 'pending', 'processing', 'completed', 'failed')),
      refund_reference TEXT,
      refund_amount REAL DEFAULT 0,
      refund_initiated_at DATETIME,
      refund_completed_at DATETIME,

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users (id),
      FOREIGN KEY (provider_id) REFERENCES users (id),
      FOREIGN KEY (service_id) REFERENCES services (id)
    )
  `);

  /* ---------------------------------------------
     🔔 NOTIFICATIONS TABLE (NEW)
  --------------------------------------------- */
  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL, -- e.g., 'booking', 'refund', 'system'
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT 0,
      reference_id INTEGER, -- e.g., appointment_id related to this notif
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  /* ---------------------------------------------
     📱 SMS LOGS TABLE (AUTO-MIGRATION)
  --------------------------------------------- */
  db.get(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='sms_logs'`,
    [],
    (err, row) => {
      if (err) return;

      // 1. If table doesn't exist, create it
      if (!row) {
        createSMSLogsTable();
        return;
      }

      // 2. If table exists but lacks new types, MIGRATE it
      if (!row.sql.includes("'refund'")) {
        console.log('⚙️ Migrating sms_logs table to support refund types...');
        db.serialize(() => {
          db.run("PRAGMA foreign_keys=off;");
          db.run("ALTER TABLE sms_logs RENAME TO sms_logs_old;");
          
          // Create new table with updated constraints
          db.run(`
            CREATE TABLE sms_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              recipient_phone TEXT NOT NULL,
              message_type TEXT CHECK(message_type IN ('confirmation', 'reminder', 'receipt', 'cancellation', 'notification', 'general', 'acceptance', 'refund', 'refund_request')),
              message_content TEXT,
              status TEXT CHECK(status IN ('sent', 'failed', 'error')),
              details TEXT,
              sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `);

          // Copy data back (mapping old types if needed)
          db.run(`
            INSERT INTO sms_logs (id, recipient_phone, message_type, message_content, status, details, sent_at)
            SELECT id, recipient_phone, 
                   CASE WHEN message_type NOT IN ('confirmation', 'reminder', 'receipt', 'cancellation', 'notification', 'general', 'acceptance', 'refund', 'refund_request') THEN 'general' ELSE message_type END,
                   message_content, status, details, sent_at
            FROM sms_logs_old
          `);

          db.run("DROP TABLE sms_logs_old;");
          db.run("PRAGMA foreign_keys=on;");
          console.log("✅ SMS Logs table migration completed.");
        });
      }
    }
  );

  function createSMSLogsTable() {
    db.run(`
      CREATE TABLE IF NOT EXISTS sms_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipient_phone TEXT NOT NULL,
        message_type TEXT CHECK(message_type IN ('confirmation', 'reminder', 'receipt', 'cancellation', 'notification', 'general', 'acceptance', 'refund', 'refund_request')),
        message_content TEXT,
        status TEXT CHECK(status IN ('sent', 'failed', 'error')),
        details TEXT,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('❌ Error creating sms_logs table:', err.message);
      else console.log('✅ SMS logs table ready');
    });
  }

  /* ---------------------------------------------
     🔍 Ensure missing columns exist (MIGRATIONS)
  --------------------------------------------- */
  // users
  tryAddColumn('users', 'opening_time', "TEXT DEFAULT '08:00'");
  tryAddColumn('users', 'closing_time', "TEXT DEFAULT '18:00'");
  tryAddColumn('users', 'notification_preferences', "TEXT");

  // services
  tryAddColumn('services', 'opening_time', "TEXT DEFAULT '08:00'");
  tryAddColumn('services', 'closing_time', "TEXT DEFAULT '18:00'");
  tryAddColumn('services', 'slot_interval', "INTEGER DEFAULT 30");
  tryAddColumn('services', 'is_closed', "INTEGER DEFAULT 0");
  tryAddColumn('services', 'closed_by_business', "INTEGER DEFAULT 0");
  tryAddColumn('services', 'capacity', "INTEGER DEFAULT 1"); 

  // appointments
  tryAddColumn('appointments', 'reminder_sent', "INTEGER DEFAULT 0");
  tryAddColumn('appointments', 'payment_status', "TEXT DEFAULT 'unpaid'");
  tryAddColumn('appointments', 'payment_reference', "TEXT");
  tryAddColumn('appointments', 'amount_paid', "REAL DEFAULT 0");
  tryAddColumn('appointments', 'total_price', "REAL DEFAULT 0");
  
  // ✅ NEW: Restore missing columns from previous failure
  tryAddColumn('appointments', 'deposit_amount', "REAL DEFAULT 0");
  tryAddColumn('appointments', 'addons_total', "REAL DEFAULT 0");
  tryAddColumn('appointments', 'addons', "TEXT DEFAULT '[]'");

  // Refund Columns
  tryAddColumn('appointments', 'refund_status', "TEXT DEFAULT NULL");
  tryAddColumn('appointments', 'refund_reference', "TEXT");
  tryAddColumn('appointments', 'refund_amount', "REAL DEFAULT 0");
  tryAddColumn('appointments', 'refund_initiated_at', "DATETIME");
  tryAddColumn('appointments', 'refund_completed_at', "DATETIME");

  console.log('🎯 Database initialization completed');
}

/**
 * ✅ Adds column to a table if it doesn’t already exist
 */
function tryAddColumn(table, column, definition) {
  db.all(`PRAGMA table_info(${table})`, (err, rows) => {
    if (err) {
      console.error(`⚠️ Failed to check columns for table ${table}:`, err.message);
      return;
    }

    const exists = rows.some(r => r.name === column);
    if (!exists) {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, (alterErr) => {
        if (alterErr) {
          console.error(`⚠️ Failed to add column ${column} to ${table}:`, alterErr.message);
        } else {
          console.log(`✅ Added missing column ${column} to ${table}`);
        }
      });
    }
  });
}