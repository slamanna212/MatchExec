const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Open database
const dbPath = path.join(__dirname, 'app_data/data/matchexec.db');
const db = new sqlite3.Database(dbPath);

console.log('🔍 Full Database Debug Analysis...\n');
console.log(`Database path: ${dbPath}\n`);

// Check all tables
db.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`, (err, tables) => {
  if (err) {
    console.error('❌ Error listing tables:', err);
    return;
  }

  console.log('📋 ALL TABLES:');
  console.log('==============');
  tables.forEach(table => {
    console.log(`- ${table.name}`);
  });
  console.log(`Total: ${tables.length} tables\n`);

  // Check critical tables
  const criticalTables = [
    'migrations',
    'games', 
    'game_modes',
    'game_maps',
    'matches',
    'discord_announcement_queue',
    'discord_channels',
    'discord_settings'
  ];

  let checksCompleted = 0;
  const totalChecks = criticalTables.length + 2; // +2 for migrations check and games data check

  function checkComplete() {
    checksCompleted++;
    if (checksCompleted >= totalChecks) {
      console.log('✅ Database analysis complete!');
      db.close();
    }
  }

  // Check each critical table
  criticalTables.forEach(tableName => {
    const hasTable = tables.some(t => t.name === tableName);
    
    if (!hasTable) {
      console.log(`❌ Missing table: ${tableName}`);
      checkComplete();
      return;
    }

    // Get table schema
    db.all(`PRAGMA table_info(${tableName})`, (err, schema) => {
      if (err) {
        console.error(`❌ Error checking ${tableName} schema:`, err);
        checkComplete();
        return;
      }

      console.log(`📋 ${tableName.toUpperCase()} TABLE:`);
      console.log('='.repeat(tableName.length + 7));
      
      if (schema.length === 0) {
        console.log('❌ No schema found');
      } else {
        schema.forEach(col => {
          console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
        });
      }

      // Get row count
      db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, result) => {
        if (err) {
          console.log(`  ❌ Error counting rows: ${err.message}`);
        } else {
          console.log(`  📊 Rows: ${result.count}`);
        }
        console.log('');
        checkComplete();
      });
    });
  });

  // Check migrations specifically
  if (tables.some(t => t.name === 'migrations')) {
    db.all(`SELECT name FROM migrations ORDER BY name`, (err, migrations) => {
      if (err) {
        console.error('❌ Error checking migrations:', err);
        checkComplete();
        return;
      }

      console.log('🔧 EXECUTED MIGRATIONS:');
      console.log('======================');
      
      if (migrations.length === 0) {
        console.log('❌ No migrations executed!');
      } else {
        migrations.forEach(mig => {
          console.log(`✅ ${mig.name}`);
        });
      }
      console.log(`Total: ${migrations.length} migrations executed\n`);
      checkComplete();
    });
  } else {
    console.log('❌ MIGRATIONS TABLE MISSING!\n');
    checkComplete();
  }

  // Check games data specifically
  if (tables.some(t => t.name === 'games')) {
    db.all(`SELECT id, name FROM games LIMIT 5`, (err, games) => {
      if (err) {
        console.error('❌ Error checking games:', err);
        checkComplete();
        return;
      }

      console.log('🎮 GAMES DATA:');
      console.log('=============');
      
      if (games.length === 0) {
        console.log('❌ No games found!');
        console.log('This explains why game data is not seeded.');
      } else {
        games.forEach(game => {
          console.log(`✅ ${game.name} (${game.id})`);
        });
      }
      console.log(`Total games: ${games.length}\n`);
      checkComplete();
    });
  } else {
    console.log('❌ GAMES TABLE MISSING!\n');
    checkComplete();
  }
});