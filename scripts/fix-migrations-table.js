#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'app_data', 'data', 'matchexec.db');

console.log('🔧 Fixing migrations table schema...');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to database');
});

// First, check current migrations table schema
db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='migrations'", (err, row) => {
  if (err) {
    console.error('❌ Error getting migrations schema:', err.message);
    db.close();
    return;
  }

  console.log('\n📋 Current migrations table schema:');
  console.log(row ? row.sql : 'Table does not exist');

  // Check if filename column exists
  db.all("PRAGMA table_info(migrations)", (err, columns) => {
    if (err) {
      console.error('❌ Error getting table info:', err.message);
      db.close();
      return;
    }

    console.log('\n📋 Current migrations table columns:');
    columns.forEach(col => {
      console.log(`- ${col.name}: ${col.type}`);
    });

    const hasFilenameColumn = columns.some(col => col.name === 'filename');

    if (hasFilenameColumn) {
      console.log('\n✅ Migrations table already has filename column');
      db.close();
      return;
    }

    console.log('\n🔧 Adding filename column to migrations table...');

    // Create new migrations table with proper schema
    db.serialize(() => {
      // Get existing data
      db.all("SELECT * FROM migrations", (err, existingMigrations) => {
        if (err) {
          console.error('❌ Error reading existing migrations:', err.message);
          db.close();
          return;
        }

        console.log(`📋 Found ${existingMigrations.length} existing migration records`);

        // Create new table with proper schema
        db.run(`
          CREATE TABLE migrations_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL UNIQUE,
            executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            console.error('❌ Error creating new migrations table:', err.message);
            db.close();
            return;
          }

          console.log('✅ Created new migrations table with filename column');

          // Since we can't determine which migration each record was for,
          // we'll clear the migrations table and let the system re-run them
          console.log('⚠️  Clearing migration history (system will re-run migrations)');

          // Drop old table and rename new one
          db.run("DROP TABLE migrations", (err) => {
            if (err) {
              console.error('❌ Error dropping old migrations table:', err.message);
              db.close();
              return;
            }

            db.run("ALTER TABLE migrations_new RENAME TO migrations", (err) => {
              if (err) {
                console.error('❌ Error renaming migrations table:', err.message);
                db.close();
                return;
              }

              console.log('✅ Successfully fixed migrations table schema');
              console.log('💡 Migration system will now track filenames properly');
              
              db.close((err) => {
                if (err) {
                  console.error('❌ Error closing database:', err.message);
                } else {
                  console.log('✅ Database connection closed');
                }
              });
            });
          });
        });
      });
    });
  });
});