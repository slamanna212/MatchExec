#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Path to the database
const dbPath = path.join(__dirname, '../app_data/data/matchexec.db');

console.log('🧹 Starting cleanup of incorrect reminder entries...');
console.log('📁 Database path:', dbPath);

// Open database connection
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to SQLite database');
});

// First, check what we have
db.get("SELECT COUNT(*) as count FROM discord_reminder_queue WHERE id LIKE 'reminder_%'", (err, row) => {
  if (err) {
    console.error('❌ Error checking reminder count:', err);
    return;
  }
  
  console.log(`📊 Found ${row.count} incorrect reminder entries to clean up`);
  
  if (row.count === 0) {
    console.log('✅ No incorrect reminders found - database is clean!');
    db.close();
    return;
  }
  
  // Show some examples of what we're going to delete
  db.all("SELECT id, match_id, reminder_time FROM discord_reminder_queue WHERE id LIKE 'reminder_%' LIMIT 5", (err, rows) => {
    if (err) {
      console.error('❌ Error fetching sample reminders:', err);
      return;
    }
    
    console.log('📋 Sample entries to be deleted:');
    rows.forEach(row => {
      console.log(`  - ${row.id} (match: ${row.match_id}, time: ${row.reminder_time})`);
    });
    
    // Delete the incorrect reminders
    db.run("DELETE FROM discord_reminder_queue WHERE id LIKE 'reminder_%'", function(err) {
      if (err) {
        console.error('❌ Error deleting incorrect reminders:', err);
        return;
      }
      
      console.log(`✅ Successfully deleted ${this.changes} incorrect reminder entries`);
      
      // Verify cleanup
      db.get("SELECT COUNT(*) as count FROM discord_reminder_queue", (err, row) => {
        if (err) {
          console.error('❌ Error verifying cleanup:', err);
          return;
        }
        
        console.log(`📊 Remaining entries in discord_reminder_queue: ${row.count}`);
        console.log('🎉 Cleanup completed successfully!');
        
        db.close((err) => {
          if (err) {
            console.error('❌ Error closing database:', err);
          } else {
            console.log('✅ Database connection closed');
          }
        });
      });
    });
  });
});