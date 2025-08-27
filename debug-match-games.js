#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const dbPath = path.join(__dirname, 'app_data', 'data', 'matchexec.db');

console.log('🔍 Debugging match_games table...');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err);
    process.exit(1);
  }
  console.log('✅ Connected to database');
});

// Get all matches in battle status (likely the ones with scoring issues)
db.all(`
  SELECT id, name, status, maps 
  FROM matches 
  WHERE status IN ('battle', 'assign', 'gather')
  ORDER BY created_at DESC
  LIMIT 10
`, [], (err, matches) => {
  if (err) {
    console.error('❌ Error fetching matches:', err);
    db.close();
    return;
  }
  
  console.log('\n📋 Recent active matches:');
  matches.forEach(match => {
    const maps = match.maps ? JSON.parse(match.maps) : [];
    console.log(`- ${match.id}: "${match.name}" (${match.status}) - ${maps.length} maps`);
    console.log(`  Maps: ${maps.join(', ')}`);
  });
  
  if (matches.length === 0) {
    console.log('No active matches found');
    db.close();
    return;
  }
  
  // Check match_games for the first match
  const firstMatch = matches[0];
  console.log(`\n🎮 Checking match_games for match: ${firstMatch.id}`);
  
  db.all(`
    SELECT mg.*, gm.name as map_name
    FROM match_games mg
    LEFT JOIN game_maps gm ON mg.map_id = gm.id
    WHERE mg.match_id = ?
    ORDER BY mg.round ASC, mg.created_at ASC
  `, [firstMatch.id], (err, games) => {
    if (err) {
      console.error('❌ Error fetching match games:', err);
      db.close();
      return;
    }
    
    console.log(`Found ${games.length} match_games entries:`);
    games.forEach(game => {
      console.log(`- ID: ${game.id}, Round: ${game.round}, Map: ${game.map_id}, Status: ${game.status}, Created: ${game.created_at}`);
      if (game.map_name) {
        console.log(`  Map Name: ${game.map_name}`);
      }
    });
    
    // Check for duplicates by round
    const roundCounts = {};
    games.forEach(game => {
      roundCounts[game.round] = (roundCounts[game.round] || 0) + 1;
    });
    
    console.log('\n📊 Round distribution:');
    Object.keys(roundCounts).forEach(round => {
      const count = roundCounts[round];
      const status = count > 1 ? '❌ DUPLICATE' : '✅ OK';
      console.log(`  Round ${round}: ${count} entries ${status}`);
    });
    
    db.close();
    console.log('\n✅ Database connection closed');
  });
});