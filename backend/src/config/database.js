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
    console.error('Full error details:', err);
  } else {
    console.log('✅ Connected to SQLite database successfully');
    initializeDatabase();
  }
});

function initializeDatabase() {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    user_type TEXT CHECK(user_type IN ('client', 'provider')) NOT NULL,
    business_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('Error creating users table:', err);
    else console.log('✅ Users table ready');
  });

  // Services table - include opening_time, closing_time, slot_interval, is_closed
  db.run(`CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    duration INTEGER NOT NULL,
    price DECIMAL(10,2),
    opening_time TEXT DEFAULT '08:00', -- HH:MM (24h)
    closing_time TEXT DEFAULT '18:00', -- HH:MM (24h)
    slot_interval INTEGER DEFAULT 30, -- minutes
    is_closed INTEGER DEFAULT 0, -- provider-level closure toggle for this service
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES users (id)
  )`, (err) => {
    if (err) console.error('Error creating services table:', err);
    else console.log('✅ Services table ready');
  });

  // Appointments table
  db.run(`CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    provider_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL,
    appointment_date DATETIME NOT NULL,
    status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'completed', 'cancelled', 'no-show')),
    notes TEXT,
    client_deleted BOOLEAN DEFAULT 0,
    provider_deleted BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES users (id),
    FOREIGN KEY (provider_id) REFERENCES users (id),
    FOREIGN KEY (service_id) REFERENCES services (id)
  )`, (err) => {
    if (err) console.error('Error creating appointments table:', err);
    else console.log('✅ Appointments table ready');
  });

  // Attempt to add missing columns (safe on upgrades)
  tryAddColumn('services', 'opening_time', "TEXT DEFAULT '08:00'");
  tryAddColumn('services', 'closing_time', "TEXT DEFAULT '18:00'");
  tryAddColumn('services', 'slot_interval', "INTEGER DEFAULT 30");
  tryAddColumn('services', 'is_closed', "INTEGER DEFAULT 0");

  console.log('🎯 Database initialization completed');
}

function tryAddColumn(table, column, definition) {
  // Check whether column exists
  db.get(`PRAGMA table_info(${table})`, (err) => {
    // We'll attempt to run ALTER; if it fails because column exists, ignore
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, (alterErr) => {
      if (alterErr) {
        // Commonly "duplicate column name" -> ignore quietly
        if (/duplicate column name/i.test(alterErr.message) || /already exists/i.test(alterErr.message)) {
          // ok
        } else {
          // If other error, log it for debugging
          console.log(`ℹ️ Column "${column}" may already exist or couldn't be added: ${alterErr.message}`);
        }
      } else {
        console.log(`✅ Added column ${column} to ${table}`);
      }
    });
  });
}
