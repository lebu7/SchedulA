/* backend/scripts/inspect_db_compare.js */
import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const currentDbPath = path.join(
  __dirname,
  "../../backend/database/schedula.db",
);
const sourceDbPath = path.join(
  __dirname,
  "../../backend/database/schedula (Test 2).db",
);

if (!fs.existsSync(sourceDbPath)) {
  console.error(`❌ Source database not found at: ${sourceDbPath}`);
  console.error("   Make sure the file name matches exactly.");
  process.exit(1);
}

const dbCurrent = new sqlite3.Database(currentDbPath, sqlite3.OPEN_READONLY);
const dbSource = new sqlite3.Database(sourceDbPath, sqlite3.OPEN_READONLY);

const query = (db, sql) => {
  return new Promise((resolve, reject) => {
    db.all(sql, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

async function inspect() {
  console.log("🔍 === DATABASE COMPARISON REPORT ===\n");

  try {
    // 1. Compare User Counts
    const usersCurrent = await query(
      dbCurrent,
      "SELECT count(*) as count FROM users",
    );
    const usersSource = await query(
      dbSource,
      "SELECT count(*) as count FROM users",
    );

    // 2. Check Specific Users (1 & 2) in Source
    const keyUsersSource = await query(
      dbSource,
      "SELECT id, name, email FROM users WHERE id IN (1, 2)",
    );

    // 3. Compare Appointment Counts
    const aptCurrent = await query(
      dbCurrent,
      "SELECT count(*) as count FROM appointments",
    );
    const aptSource = await query(
      dbSource,
      "SELECT count(*) as count FROM appointments",
    );

    // 4. Check for Favorites in Current (To be saved)
    const favCurrent = await query(
      dbCurrent,
      "SELECT count(*) as count FROM favorites",
    );

    // 5. Check Table Schemas (Columns)
    const usersColsSource = await query(dbSource, "PRAGMA table_info(users)");
    const usersColsCurrent = await query(dbCurrent, "PRAGMA table_info(users)");

    const aptColsSource = await query(
      dbSource,
      "PRAGMA table_info(appointments)",
    );
    const aptColsCurrent = await query(
      dbCurrent,
      "PRAGMA table_info(appointments)",
    );

    // --- REPORTING ---

    console.log(`📊 **ROW COUNTS**`);
    console.log(
      `   Users:        Current [${usersCurrent[0].count}] vs Source [${usersSource[0].count}]`,
    );
    console.log(
      `   Appointments: Current [${aptCurrent[0].count}] vs Source [${aptSource[0].count}]`,
    );
    console.log(
      `   Favorites:    Current [${favCurrent[0].count}] (To be migrated)`,
    );
    console.log("");

    console.log(`👤 **KEY USERS IN SOURCE (ID 1 & 2)**`);
    if (keyUsersSource.length > 0) {
      keyUsersSource.forEach((u) =>
        console.log(`   [ID ${u.id}] ${u.name} (${u.email})`),
      );
    } else {
      console.log("   ⚠️  WARNING: Users 1 and 2 NOT FOUND in source DB!");
    }
    console.log("");

    console.log(`🛠  **SCHEMA DIFFERENCES (Missing Columns in Source)**`);

    const compareColumns = (tableName, currentCols, sourceCols) => {
      const sNames = sourceCols.map((c) => c.name);
      const missing = currentCols
        .filter((c) => !sNames.includes(c.name))
        .map((c) => c.name);
      if (missing.length > 0) {
        console.log(`   Table '${tableName}' is missing columns in Source:`);
        console.log(`   ⚠️  ${missing.join(", ")}`);
      } else {
        console.log(`   ✅ Table '${tableName}' schema matches.`);
      }
    };

    compareColumns("users", usersColsCurrent, usersColsSource);
    compareColumns("appointments", aptColsCurrent, aptColsSource);
  } catch (err) {
    console.error("❌ Inspection failed:", err.message);
  } finally {
    dbCurrent.close();
    dbSource.close();
  }
}

inspect();
