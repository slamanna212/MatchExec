const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'app_data/data/matchexec.db');
const db = new sqlite3.Database(dbPath);

console.log('🎮 Checking Game Data Versions...\n');

// Check the data_versions table schema first
db.all(`PRAGMA table_info(data_versions)`, (err, schema) => {
  if (err) {
    console.error('❌ Error checking data_versions schema:', err);
    db.close();
    return;
  }

  console.log('📋 DATA_VERSIONS TABLE SCHEMA:');
  console.log('===============================');
  schema.forEach(col => {
    console.log(`${col.name}: ${col.type}`);
  });

  // Check all data in data_versions table
  db.all(`SELECT * FROM data_versions`, (err, versions) => {
    if (err) {
      console.error('❌ Error checking versions:', err);
      db.close();
      return;
    }

    console.log('\n📋 ALL DATA_VERSIONS ENTRIES:');
    console.log('=============================');
    
    if (versions.length === 0) {
      console.log('❌ No versions found!');
    } else {
      versions.forEach(v => {
        console.log(`Type: ${v.data_type}, Game: ${v.game_id || 'N/A'}, Version: ${v.data_version || v.version || 'unknown'}`);
      });
    }

    console.log('\n🔍 EXPECTED: overwatch2 should update to version 1.6.5 on next restart');
    console.log('🔄 Now restart one process to test if seeding detects the version change');
    
    db.close();
  });
});