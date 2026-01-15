import './src/config/database.js';

// Test database operations
const db = await import('./src/config/database.js').then(module => module.db);

// Test query to verify connection
db.get("SELECT name FROM sqlite_master WHERE type='table'", (err, row) => {
  if (err) {
    console.error('❌ Database test failed:', err);
  } else {
    console.log('✅ Database connection test passed');
    console.log('📋 Tables in database:', row);
    
    // List all tables
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
      if (err) {
        console.error('Error listing tables:', err);
      } else {
        console.log('📊 Available tables:');
        tables.forEach(table => console.log(`   - ${table.name}`));
      }
      
      // Close database connection
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        } else {
          console.log('🔒 Database connection closed');
        }
      });
    });
  }
});