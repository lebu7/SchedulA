const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
  constructor() {
    this.dbPath = path.join(__dirname, 'data', 'schedulA.db');
    this.db = null;
    this.init();
  }

  init() {
    // Ensure data directory exists
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        console.error('❌ Error opening database:', err.message);
      } else {
        console.log('✅ Connected to SQLite database:', this.dbPath);
        this.createTables();
        this.enableForeignKeys();
      }
    });
  }

  enableForeignKeys() {
    this.db.run('PRAGMA foreign_keys = ON');
  }

  createTables() {
    // Users table
    this.db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      user_type TEXT CHECK(user_type IN ('provider', 'client')) NOT NULL DEFAULT 'client',
      phone TEXT,
      business_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Services table
    this.db.run(`CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      duration_minutes INTEGER DEFAULT 60,
      price DECIMAL(10,2),
      category TEXT NOT NULL,
      is_available BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (provider_id) REFERENCES users (id) ON DELETE CASCADE
    )`);

    // Appointments table
    this.db.run(`CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      provider_id INTEGER NOT NULL,
      appointment_date DATETIME NOT NULL,
      end_date DATETIME NOT NULL,
      status TEXT CHECK(status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no-show')) DEFAULT 'scheduled',
      client_notes TEXT,
      provider_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users (id),
      FOREIGN KEY (service_id) REFERENCES services (id),
      FOREIGN KEY (provider_id) REFERENCES users (id),
      UNIQUE(provider_id, appointment_date)
    )`);

    console.log('✅ Database tables initialized');
  }

  // Generic query method
  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Get single row
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Run INSERT/UPDATE/DELETE
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  // Close database connection
  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

// Create singleton instance
const database = new Database();
module.exports = database;