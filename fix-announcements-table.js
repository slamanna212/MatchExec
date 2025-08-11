const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Open database
const dbPath = path.join(__dirname, 'matchexec.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Fixing Announcements Table...\n');

// First create the original table (migration 008)
const createOriginalTable = `
-- Add table to track Discord announcement requests
CREATE TABLE IF NOT EXISTS discord_announcement_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'posted', 'failed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  posted_at DATETIME,
  error_message TEXT,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  UNIQUE(match_id)
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_discord_announcements_status ON discord_announcement_queue(status);
CREATE INDEX IF NOT EXISTS idx_discord_announcements_created_at ON discord_announcement_queue(created_at);
`;

// Then apply the fix (migration 039) to remove UNIQUE constraint and add new fields
const fixTable = `
-- Recreate discord_announcement_queue table without UNIQUE constraint on match_id
-- This allows multiple timed announcements per match

-- Create new table with the desired structure
CREATE TABLE discord_announcement_queue_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'posted', 'failed', 'completed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  posted_at DATETIME,
  error_message TEXT,
  announcement_type TEXT DEFAULT 'standard',
  announcement_data TEXT,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Copy existing data (if any)
INSERT INTO discord_announcement_queue_new (id, match_id, status, created_at, posted_at, error_message, announcement_type, announcement_data)
SELECT id, match_id, status, created_at, posted_at, error_message, 
       COALESCE(announcement_type, 'standard') as announcement_type,
       announcement_data
FROM discord_announcement_queue;

-- Drop old table
DROP TABLE discord_announcement_queue;

-- Rename new table
ALTER TABLE discord_announcement_queue_new RENAME TO discord_announcement_queue;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_discord_announcements_status ON discord_announcement_queue(status);
CREATE INDEX IF NOT EXISTS idx_discord_announcements_created_at ON discord_announcement_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_discord_announcements_match_id ON discord_announcement_queue(match_id);
`;

console.log('Step 1: Creating original table...');
db.exec(createOriginalTable, (err) => {
  if (err) {
    console.error('❌ Error creating original table:', err);
    return;
  }
  
  console.log('✅ Original table created');
  console.log('Step 2: Applying fix for multiple announcements...');
  
  db.exec(fixTable, (err) => {
    if (err) {
      console.error('❌ Error applying fix:', err);
      return;
    }
    
    console.log('✅ Table fix applied successfully');
    console.log('Step 3: Verifying final table structure...');
    
    // Verify the final table
    db.all(`PRAGMA table_info(discord_announcement_queue)`, (err, schema) => {
      if (err) {
        console.error('❌ Error checking final schema:', err);
        return;
      }

      console.log('\n📋 Final Table Schema:');
      console.log('======================');
      schema.forEach(col => {
        console.log(`${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
      });

      // Check for constraints
      db.all(`SELECT sql FROM sqlite_master WHERE type='table' AND name='discord_announcement_queue'`, (err, tableInfo) => {
        if (err) {
          console.error('❌ Error checking constraints:', err);
          return;
        }

        console.log('\n🔧 Final Table Definition:');
        console.log('==========================');
        if (tableInfo.length > 0) {
          console.log(tableInfo[0].sql);
          
          if (tableInfo[0].sql.includes('UNIQUE(match_id)')) {
            console.log('❌ WARNING: UNIQUE constraint still exists!');
          } else {
            console.log('✅ UNIQUE constraint removed successfully');
          }
        }

        console.log('\n🎉 Table fix completed! You can now restart the bot.');
        db.close();
      });
    });
  });
});