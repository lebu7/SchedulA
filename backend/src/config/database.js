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
     🧱 USERS TABLE (with business hours)
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('❌ Error creating users table:', err.message);
    else console.log('✅ Users table ready');
  });

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
      opening_time TEXT DEFAULT '08:00',
      closing_time TEXT DEFAULT '18:00',
      slot_interval INTEGER DEFAULT 30,
      is_closed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (provider_id) REFERENCES users (id)
    )
  `, (err) => {
    if (err) console.error('❌ Error creating services table:', err.message);
    else console.log('✅ Services table ready');
  });

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
      status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled','no-show','rebooked')),
      notes TEXT,
      client_deleted BOOLEAN DEFAULT 0,
      provider_deleted BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users (id),
      FOREIGN KEY (provider_id) REFERENCES users (id),
      FOREIGN KEY (service_id) REFERENCES services (id)
    )
  `, (err) => {
    if (err) console.error('❌ Error creating appointments table:', err.message);
    else console.log('✅ Appointments table ready');
  });

  /* ---------------------------------------------
     📱 SMS LOGS TABLE (NEW for SMS Integration)
  --------------------------------------------- */
  db.run(`
    CREATE TABLE IF NOT EXISTS sms_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_phone TEXT NOT NULL,
      message_type TEXT CHECK(message_type IN ('confirmation', 'reminder', 'receipt', 'cancellation', 'notification', 'general')),
      message_content TEXT,
      status TEXT CHECK(status IN ('sent', 'failed', 'error')),
      details TEXT, -- JSON string with API response
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('❌ Error creating sms_logs table:', err.message);
    else console.log('✅ SMS logs table ready');
  });

  /* ---------------------------------------------
     🔍 Ensure missing columns exist
  --------------------------------------------- */
  // users
  tryAddColumn('users', 'opening_time', "TEXT DEFAULT '08:00'");
  tryAddColumn('users', 'closing_time', "TEXT DEFAULT '18:00'");

  // services
  tryAddColumn('services', 'opening_time', "TEXT DEFAULT '08:00'");
  tryAddColumn('services', 'closing_time', "TEXT DEFAULT '18:00'");
  tryAddColumn('services', 'slot_interval', "INTEGER DEFAULT 30");
  tryAddColumn('services', 'is_closed', "INTEGER DEFAULT 0");

  // appointments (New columns for SMS & Payment features)
  tryAddColumn('appointments', 'reminder_sent', "INTEGER DEFAULT 0"); // 👈 Added for SMS reminders
  
  // Note: These payment columns are often handled by migration logic in routes, 
  // but adding them here ensures safety if the table is fresh.
  tryAddColumn('appointments', 'payment_status', "TEXT DEFAULT 'unpaid'");
  tryAddColumn('appointments', 'payment_reference', "TEXT");
  tryAddColumn('appointments', 'amount_paid', "REAL DEFAULT 0");
  tryAddColumn('appointments', 'total_price', "REAL DEFAULT 0");

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