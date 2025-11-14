#!/usr/bin/env node

/**
 * Script to manually fix the discord_bot_requests table schema
 * This applies the fix from migration 007 to an existing development database
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'app_data', 'data', 'matchexec.db');

console.log('Fixing discord_bot_requests table schema...');
console.log('Database path:', DB_PATH);

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
});

// Run the fix in a transaction
db.serialize(() => {
  db.run('BEGIN TRANSACTION', (err) => {
    if (err) {
      console.error('Error starting transaction:', err);
      process.exit(1);
    }
  });

  // Create new table with correct schema
  db.run(`
    CREATE TABLE IF NOT EXISTS discord_bot_requests_new (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      data TEXT,
      result TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
      retry_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating new table:', err);
      db.run('ROLLBACK');
      process.exit(1);
    }
    console.log('Created new table schema');
  });

  // Copy existing data
  db.run(`
    INSERT INTO discord_bot_requests_new (id, type, data, result, status, retry_count, created_at, processed_at, updated_at)
    SELECT
      id,
      COALESCE(type, request_type) as type,
      COALESCE(data, request_data) as data,
      result,
      status,
      retry_count,
      created_at,
      processed_at,
      updated_at
    FROM discord_bot_requests
  `, (err) => {
    if (err) {
      console.error('Error copying data:', err);
      db.run('ROLLBACK');
      process.exit(1);
    }
    console.log('Copied existing data');
  });

  // Drop old table
  db.run('DROP TABLE discord_bot_requests', (err) => {
    if (err) {
      console.error('Error dropping old table:', err);
      db.run('ROLLBACK');
      process.exit(1);
    }
    console.log('Dropped old table');
  });

  // Rename new table
  db.run('ALTER TABLE discord_bot_requests_new RENAME TO discord_bot_requests', (err) => {
    if (err) {
      console.error('Error renaming table:', err);
      db.run('ROLLBACK');
      process.exit(1);
    }
    console.log('Renamed new table');
  });

  // Recreate index
  db.run('CREATE INDEX IF NOT EXISTS idx_discord_bot_requests_status ON discord_bot_requests(status)', (err) => {
    if (err) {
      console.error('Error creating index:', err);
      db.run('ROLLBACK');
      process.exit(1);
    }
    console.log('Created index');
  });

  // Commit transaction
  db.run('COMMIT', (err) => {
    if (err) {
      console.error('Error committing transaction:', err);
      db.run('ROLLBACK');
      process.exit(1);
    }
    console.log('✅ Schema fix completed successfully!');

    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
        process.exit(1);
      }
    });
  });
});
