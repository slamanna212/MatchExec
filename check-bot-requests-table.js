const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'app_data/data/matchexec.db');
const db = new sqlite3.Database(dbPath);

console.log('🔍 Checking discord_bot_requests table...\n');

// Check if table exists
db.all(`SELECT name FROM sqlite_master WHERE type='table' AND name='discord_bot_requests'`, (err, tables) => {
  if (err) {
    console.error('❌ Error:', err);
    db.close();
    return;
  }

  if (tables.length === 0) {
    console.log('❌ discord_bot_requests table does not exist!');
    db.close();
    return;
  }

  console.log('✅ discord_bot_requests table exists');

  // Get table schema
  db.all(`PRAGMA table_info(discord_bot_requests)`, (err, schema) => {
    if (err) {
      console.error('❌ Error getting schema:', err);
      db.close();
      return;
    }

    console.log('\n📋 DISCORD_BOT_REQUESTS TABLE:');
    console.log('=============================');
    console.log('Columns:');
    schema.forEach(col => {
      console.log(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''}`);
    });

    // Get sample data
    db.all(`SELECT * FROM discord_bot_requests LIMIT 3`, (err, rows) => {
      if (err) {
        console.log(`  ❌ Error querying data: ${err.message}`);
      } else {
        console.log(`  📊 Rows: ${rows.length}`);
        if (rows.length > 0) {
          console.log('  Sample columns:', Object.keys(rows[0]).join(', '));
        }
      }
      
      db.close();
    });
  });
});