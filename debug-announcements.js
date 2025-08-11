const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Open database
const dbPath = path.join(__dirname, 'matchexec.db');
const db = new sqlite3.Database(dbPath);

console.log('🔍 Debugging Announcements Database...\n');

// First check what tables exist
db.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`, (err, tables) => {
  if (err) {
    console.error('❌ Error listing tables:', err);
    return;
  }

  console.log('📋 Available Tables:');
  console.log('===================');
  tables.forEach(table => {
    console.log(`- ${table.name}`);
  });

  // Check if discord_announcement_queue exists
  const hasAnnouncementQueue = tables.some(t => t.name === 'discord_announcement_queue');
  
  if (!hasAnnouncementQueue) {
    console.log('\n❌ discord_announcement_queue table does not exist!');
    console.log('The migration did not run properly.');
    console.log('Need to manually run migration or check migration system.');
    db.close();
    return;
  }

  console.log('\n✅ discord_announcement_queue table exists');
  
  // Check table schema
  db.all(`PRAGMA table_info(discord_announcement_queue)`, (err, schema) => {
    if (err) {
      console.error('❌ Error checking schema:', err);
      return;
    }

    console.log('\n📋 Table Schema:');
    console.log('================');
    schema.forEach(col => {
      console.log(`${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
    });

    // Check recent announcements
    db.all(`
      SELECT id, match_id, announcement_type, announcement_data, status, created_at, posted_at
      FROM discord_announcement_queue 
      ORDER BY created_at DESC 
      LIMIT 5
    `, (err, rows) => {
      if (err) {
        console.error('❌ Error querying announcements:', err);
        return;
      }

      console.log('\n📢 Recent Announcements:');
      console.log('========================');
      
      if (rows.length === 0) {
        console.log('No announcements found');
      } else {
        rows.forEach(row => {
          console.log(`ID: ${row.id}`);
          console.log(`Match: ${row.match_id}`);
          console.log(`Type: ${row.announcement_type || 'NULL'}`);
          console.log(`Status: ${row.status}`);
          console.log(`Created: ${row.created_at}`);
          console.log('---');
        });
      }

      // Check reminder channels
      db.all(`
        SELECT discord_channel_id, channel_name, send_reminders
        FROM discord_channels 
        WHERE send_reminders = 1
      `, (err, channels) => {
        if (err) {
          console.error('❌ Error querying reminder channels:', err);
          return;
        }

        console.log('\n📺 Reminder Channels:');
        console.log('=====================');
        
        if (channels.length === 0) {
          console.log('❌ No reminder channels configured!');
        } else {
          channels.forEach(channel => {
            console.log(`Channel: ${channel.channel_name} (${channel.discord_channel_id})`);
          });
        }

        db.close();
      });
    });
  });
});