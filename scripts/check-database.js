#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'app_data', 'data', 'matchexec.db');

console.log('🔍 Checking database schema...');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to database');
});

// Check match_games table schema
db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='match_games'", (err, row) => {
  if (err) {
    console.error('❌ Error getting match_games schema:', err.message);
  } else if (row) {
    console.log('\n📋 Current match_games table schema:');
    console.log(row.sql);
  } else {
    console.log('\n❌ match_games table does not exist');
  }

  // Check indexes
  db.all("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='match_games'", (err, rows) => {
    if (err) {
      console.error('❌ Error getting indexes:', err.message);
    } else {
      console.log('\n📋 Current match_games indexes:');
      if (rows.length === 0) {
        console.log('No indexes found');
      } else {
        rows.forEach(row => {
          console.log(`- ${row.name}: ${row.sql || 'AUTO'}`);
        });
      }
    }

    // Check migrations table
    db.all("SELECT * FROM migrations ORDER BY id", (err, rows) => {
      if (err) {
        console.error('❌ Error getting migrations:', err.message);
      } else {
        console.log('\n📋 Applied migrations:');
        rows.forEach(row => {
          console.log(`- ${row.filename} (executed: ${row.executed_at})`);
        });
      }

      // Check if problematic indexes exist
      db.get("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_match_games_scores'", (err, row) => {
        if (err) {
          console.error('❌ Error checking problematic index:', err.message);
        } else if (row) {
          console.log('\n⚠️  Found problematic index: idx_match_games_scores');
          console.log('This index needs to be dropped manually');
        } else {
          console.log('\n✅ No problematic idx_match_games_scores index found');
        }

        db.close((err) => {
          if (err) {
            console.error('❌ Error closing database:', err.message);
          } else {
            console.log('\n✅ Database connection closed');
          }
        });
      });
    });
  });
});