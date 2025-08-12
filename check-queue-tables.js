const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'app_data/data/matchexec.db');
const db = new sqlite3.Database(dbPath);

console.log('🔍 Checking Queue Table Schemas...\n');

const queueTables = [
  'discord_announcement_queue',
  'discord_deletion_queue', 
  'discord_status_update_queue',
  'discord_reminder_queue'
];

let tablesChecked = 0;

function checkComplete() {
  tablesChecked++;
  if (tablesChecked >= queueTables.length) {
    console.log('\n✅ Queue table analysis complete!');
    db.close();
  }
}

queueTables.forEach(tableName => {
  // Check if table exists
  db.all(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`, (err, tables) => {
    if (err) {
      console.error(`❌ Error checking ${tableName}:`, err);
      checkComplete();
      return;
    }

    if (tables.length === 0) {
      console.log(`❌ Table ${tableName} does not exist!`);
      checkComplete();
      return;
    }

    console.log(`📋 ${tableName.toUpperCase()}:`);
    console.log('='.repeat(tableName.length + 1));

    // Get table schema
    db.all(`PRAGMA table_info(${tableName})`, (err, schema) => {
      if (err) {
        console.error(`❌ Error getting schema for ${tableName}:`, err);
        checkComplete();
        return;
      }

      console.log('Columns:');
      schema.forEach(col => {
        console.log(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''}`);
      });

      // Get sample data
      db.all(`SELECT * FROM ${tableName} LIMIT 3`, (err, rows) => {
        if (err) {
          console.log(`  ❌ Error querying data: ${err.message}`);
        } else {
          console.log(`  📊 Rows: ${rows.length}`);
          if (rows.length > 0) {
            console.log('  Sample columns in data:', Object.keys(rows[0]).join(', '));
          }
        }
        console.log('');
        checkComplete();
      });
    });
  });
});