#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'app_data', 'data', 'matchexec.db');
const migrationPath = path.join(__dirname, '..', 'migrations', '042_simplify_scoring_system.sql');

console.log('🔍 Testing migration 042_simplify_scoring_system.sql...');

// Check if migration file exists
if (!fs.existsSync(migrationPath)) {
  console.error('❌ Migration file not found:', migrationPath);
  process.exit(1);
}

// Read migration content
const migrationContent = fs.readFileSync(migrationPath, 'utf8');
console.log('✅ Migration file loaded');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to database');
});

// Check if this migration was already applied
db.get("SELECT * FROM migrations WHERE filename = ?", ['042_simplify_scoring_system.sql'], (err, row) => {
  if (err) {
    console.error('❌ Error checking migrations table:', err.message);
    db.close();
    return;
  }

  if (row) {
    console.log('✅ Migration 042_simplify_scoring_system.sql was already applied at:', row.executed_at);
  } else {
    console.log('⚠️  Migration 042_simplify_scoring_system.sql has NOT been applied yet');
  }

  // Check current table structure to see if migration is needed
  db.get("PRAGMA table_info(match_games)", (err, rows) => {
    if (err) {
      console.error('❌ Error getting table info:', err.message);
    } else {
      console.log('\n📋 Current match_games columns:');
    }

    db.all("PRAGMA table_info(match_games)", (err, rows) => {
      if (err) {
        console.error('❌ Error getting table info:', err.message);
      } else {
        rows.forEach(col => {
          console.log(`- ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
        });
      }

      // Check if problematic columns exist
      const hasComplexColumns = rows.some(col => 
        ['team1_score', 'team2_score', 'score_data'].includes(col.name)
      );

      if (hasComplexColumns) {
        console.log('\n⚠️  Table still has complex scoring columns - migration needed');
      } else {
        console.log('\n✅ Table structure is already simplified');
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