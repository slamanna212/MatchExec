#!/usr/bin/env node
/**
 * Script to add signup_config_id column to tournaments table in existing database
 * Run this script manually to update the dev database without recreating it
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'app_data', 'data', 'matchexec.db');

console.log(`Connecting to database at: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to SQLite database.');
});

async function addSignupConfigColumn() {
  return new Promise((resolve, reject) => {
    // Check if column already exists
    db.all("PRAGMA table_info(tournaments)", (err, columns) => {
      if (err) {
        reject(err);
        return;
      }

      const hasSignupConfig = columns.some(col => col.name === 'signup_config_id');

      if (hasSignupConfig) {
        console.log('Column signup_config_id already exists in tournaments table.');
        resolve();
        return;
      }

      console.log('Adding signup_config_id column to tournaments table...');

      // Add the column
      db.run(`
        ALTER TABLE tournaments
        ADD COLUMN signup_config_id TEXT
        REFERENCES signup_configs(id) ON DELETE SET NULL
      `, (err) => {
        if (err) {
          reject(err);
          return;
        }

        console.log('Successfully added signup_config_id column to tournaments table.');
        resolve();
      });
    });
  });
}

async function main() {
  try {
    await addSignupConfigColumn();
    console.log('Database update completed successfully.');
  } catch (error) {
    console.error('Error updating database:', error.message);
    process.exit(1);
  } finally {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('Database connection closed.');
      }
    });
  }
}

main();