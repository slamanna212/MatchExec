const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'app_data/data/matchexec.db');
const db = new sqlite3.Database(dbPath);

console.log('🔍 Checking Discord Settings...\n');

// Check if discord_settings table exists
db.all(`SELECT name FROM sqlite_master WHERE type='table' AND name='discord_settings'`, (err, tables) => {
  if (err) {
    console.error('❌ Error checking for discord_settings table:', err);
    db.close();
    return;
  }

  if (tables.length === 0) {
    console.log('❌ discord_settings table does not exist!');
    db.close();
    return;
  }

  console.log('✅ discord_settings table exists');

  // Check discord settings
  db.all(`SELECT id, bot_token, guild_id, announcement_role_id, mention_everyone FROM discord_settings`, (err, settings) => {
    if (err) {
      console.error('❌ Error querying discord_settings:', err);
      db.close();
      return;
    }

    console.log('\n📋 DISCORD SETTINGS:');
    console.log('===================');
    
    if (settings.length === 0) {
      console.log('❌ No discord settings found!');
    } else {
      settings.forEach((setting, index) => {
        console.log(`\nRecord ${index + 1}:`);
        console.log(`ID: ${setting.id}`);
        console.log(`Bot Token: ${setting.bot_token ? `${setting.bot_token.substring(0, 20)}...` : 'NOT SET'}`);
        console.log(`Guild ID: ${setting.guild_id || 'NOT SET'}`);
        console.log(`Announcement Role ID: ${setting.announcement_role_id || 'NOT SET'}`);
        console.log(`Mention Everyone: ${setting.mention_everyone ? 'Yes' : 'No'}`);
      });
    }
    
    db.close();
  });
});