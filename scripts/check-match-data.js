#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const matchId = process.argv[2];
if (!matchId) {
  console.log('Usage: node check-match-data.js <match-id>');
  process.exit(1);
}

const dbPath = path.join(__dirname, '..', 'app_data', 'data', 'matchexec.db');

console.log(`🔍 Checking match data for: ${matchId}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err);
    process.exit(1);
  }
});

db.get(`
  SELECT 
    m.id, 
    m.game_id, 
    m.maps, 
    m.map_codes, 
    g.name as game_name, 
    g.map_codes_supported
  FROM matches m
  LEFT JOIN games g ON m.game_id = g.id
  WHERE m.id = ?
`, [matchId], (err, row) => {
  if (err) {
    console.error('❌ Error querying match:', err);
    db.close();
    return;
  }

  if (!row) {
    console.log('❌ Match not found');
    db.close();
    return;
  }

  console.log('📋 Match Data:');
  console.log('  Match ID:', row.id);
  console.log('  Game:', row.game_name, `(${row.game_id})`);
  console.log('  Map codes supported:', row.map_codes_supported);
  console.log('  Maps:', row.maps);
  console.log('  Map codes:', row.map_codes);
  
  if (row.maps) {
    const maps = JSON.parse(row.maps);
    console.log('  Parsed maps:', maps);
    if (maps.length > 0) {
      console.log('  First map:', maps[0]);
      const cleanFirstMap = maps[0].replace(/-\d+$/, '');
      console.log('  Clean first map:', cleanFirstMap);
    }
  }
  
  if (row.map_codes) {
    const mapCodes = JSON.parse(row.map_codes);
    console.log('  Parsed map codes:', mapCodes);
  }
  
  db.close();
});