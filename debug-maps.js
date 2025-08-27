#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const dbPath = path.join(__dirname, 'app_data', 'data', 'matchexec.db');

console.log('🔍 Debugging maps table...');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err);
    process.exit(1);
  }
});

// Get maps that might be circuit royale
db.all(`
  SELECT id, name, game_id
  FROM game_maps 
  WHERE LOWER(name) LIKE '%circuit%' OR LOWER(id) LIKE '%circuit%'
  ORDER BY game_id, name
`, [], (err, maps) => {
  if (err) {
    console.error('❌ Error fetching maps:', err);
    db.close();
    return;
  }
  
  console.log('🗺️ Circuit maps found:');
  maps.forEach(map => {
    console.log(`- ID: "${map.id}", Name: "${map.name}", Game: ${map.game_id}`);
  });
  
  db.close();
});