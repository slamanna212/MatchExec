const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../app_data/data/matchexec.db');

console.log('Checking database at:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    return;
  }
  console.log('Connected to database');
});

// Check if app_settings table exists
db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'", (err, row) => {
  if (err) {
    console.error('Error checking for app_settings table:', err);
  } else if (row) {
    console.log('✅ app_settings table exists');
    
    // Check the contents
    db.all("SELECT * FROM app_settings", (err, rows) => {
      if (err) {
        console.error('Error reading app_settings:', err);
      } else {
        console.log('app_settings contents:', rows);
      }
      db.close();
    });
  } else {
    console.log('❌ app_settings table does not exist');
    db.close();
  }
});