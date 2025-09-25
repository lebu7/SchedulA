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
    try {
      // Ensure data directory exists
      const dataDir = path.join(__dirname, 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('❌ Database connection error:', err.message);
          process.exit(1);
        } else {
          console.log('✅ Connected to SQLite database');
          this.createTables();
        }
      });

      // Enable foreign keys and better error handling
      this.db.configure('busyTimeout', 3000);
      this.db.run('PRAGMA foreign_keys = ON');
      
    } catch (error) {
      console.error('❌ Database initialization error:', error);
      process.exit(1);
    }
  }

  createTables() {
    const tables = [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        user_type TEXT CHECK(user_type IN ('provider', 'client')) NOT NULL DEFAULT 'client',
        phone TEXT,
        business_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        duration_minutes INTEGER DEFAULT 60,
        price DECIMAL(10,2),
        category TEXT NOT NULL,
        is_available BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES users (id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL,
        service_id INTEGER NOT NULL,
        provider_id INTEGER NOT NULL,
        appointment_date DATETIME NOT NULL,
        end_date DATETIME NOT NULL,
        status TEXT DEFAULT 'scheduled',
        client_notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES users (id),
        FOREIGN KEY (service_id) REFERENCES services (id),
        FOREIGN KEY (provider_id) REFERENCES users (id)
      )`
    ];

    tables.forEach((sql, index) => {
      this.db.run(sql, (err) => {
        if (err) {
          console.error(`❌ Table creation error ${index + 1}:`, err.message);
        }
      });
    });

    console.log('✅ Database tables initialized');
  }

  // Promise-based query methods
  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

module.exports = new Database();