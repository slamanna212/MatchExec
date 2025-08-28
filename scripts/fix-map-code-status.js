#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'app_data', 'data', 'matchexec.db');

console.log('🔍 Checking map code queue status constraint...');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err);
    process.exit(1);
  }
  console.log('✅ Connected to database');
});

// Check current schema
db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='discord_map_code_queue'", (err, row) => {
  if (err) {
    console.error('❌ Error checking schema:', err);
    db.close();
    return;
  }

  if (!row) {
    console.log('❌ Table discord_map_code_queue not found');
    db.close();
    return;
  }

  console.log('📋 Current schema:', row.sql);
  
  if (row.sql.includes("'processing'")) {
    console.log('✅ Table already supports "processing" status');
    db.close();
    return;
  }

  console.log('🔧 Updating table to support "processing" status...');

  db.serialize(() => {
    // Create backup
    db.run("CREATE TABLE discord_map_code_queue_backup AS SELECT * FROM discord_map_code_queue", (err) => {
      if (err) {
        console.error('❌ Error creating backup:', err);
        db.close();
        return;
      }
      console.log('💾 Backup created');
    });

    // Drop original table
    db.run("DROP TABLE discord_map_code_queue", (err) => {
      if (err) {
        console.error('❌ Error dropping table:', err);
        db.close();
        return;
      }
      console.log('🗑️ Original table dropped');
    });

    // Create new table with correct constraint
    db.run(`
      CREATE TABLE discord_map_code_queue (
        id TEXT PRIMARY KEY,
        match_id TEXT NOT NULL,
        map_name TEXT NOT NULL,
        map_code TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME,
        error_message TEXT,
        FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) {
        console.error('❌ Error creating new table:', err);
        db.close();
        return;
      }
      console.log('🆕 New table created with correct constraint');
    });

    // Restore data from backup
    db.run("INSERT INTO discord_map_code_queue SELECT * FROM discord_map_code_queue_backup", (err) => {
      if (err) {
        console.error('❌ Error restoring data:', err);
        db.close();
        return;
      }
      console.log('📦 Data restored from backup');
    });

    // Drop backup table
    db.run("DROP TABLE discord_map_code_queue_backup", (err) => {
      if (err) {
        console.error('❌ Error dropping backup:', err);
        db.close();
        return;
      }
      console.log('🧹 Backup table cleaned up');
    });

    // Recreate indexes
    db.run("CREATE INDEX IF NOT EXISTS idx_discord_map_code_queue_match_id ON discord_map_code_queue(match_id)", (err) => {
      if (err) {
        console.error('❌ Error creating match_id index:', err);
      } else {
        console.log('📇 Match ID index created');
      }
    });

    db.run("CREATE INDEX IF NOT EXISTS idx_discord_map_code_queue_status ON discord_map_code_queue(status)", (err) => {
      if (err) {
        console.error('❌ Error creating status index:', err);
      } else {
        console.log('📇 Status index created');
      }
    });

    // Final verification
    db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='discord_map_code_queue'", (err, row) => {
      if (err) {
        console.error('❌ Error verifying schema:', err);
      } else {
        console.log('✅ Updated schema:', row.sql);
        console.log('🎉 Database constraint fixed! The bot should now be able to process map codes.');
      }
      
      db.close();
    });
  });
});