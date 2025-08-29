import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';
import { DiscordSettingsDbRow } from '@/shared/types';

export async function GET() {
  try {
    const db = await getDbInstance();
    
    const settings = await db.get<DiscordSettingsDbRow>(` 
      SELECT 
        application_id,
        bot_token,
        guild_id,
        announcement_role_id,
        mention_everyone,
        event_duration_minutes,
        match_reminder_minutes,
        player_reminder_minutes,
        announcer_voice,
        voice_announcements_enabled
      FROM discord_settings 
      WHERE id = 1
    `);

    // Don't expose the bot token in the response for security
    // Also ensure all null values are converted to appropriate defaults for React form inputs
    const safeSettings = settings ? {
      application_id: settings.application_id || '',
      bot_token: settings.bot_token ? '••••••••' : '',
      guild_id: settings.guild_id || '',
      announcement_role_id: settings.announcement_role_id || '',
      mention_everyone: Boolean(settings.mention_everyone),
      event_duration_minutes: settings.event_duration_minutes || 45,
      match_reminder_minutes: settings.match_reminder_minutes || 10,
      player_reminder_minutes: settings.player_reminder_minutes || 120,
      announcer_voice: settings.announcer_voice || 'wrestling-announcer',
      voice_announcements_enabled: Boolean(settings.voice_announcements_enabled)
    } : {
      application_id: '',
      bot_token: '',
      guild_id: '',
      announcement_role_id: '',
      mention_everyone: false,
      event_duration_minutes: 45,
      match_reminder_minutes: 10,
      player_reminder_minutes: 120,
      announcer_voice: 'wrestling-announcer',
      voice_announcements_enabled: false
    };

    return NextResponse.json(safeSettings);
  } catch (error) {
    console.error('Error fetching Discord settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Discord settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = await getDbInstance();
    const body = await request.json();
    
    const {
      application_id,
      bot_token,
      guild_id,
      announcement_role_id,
      mention_everyone,
      event_duration_minutes,
      match_reminder_minutes,
      player_reminder_minutes,
      announcer_voice,
      voice_announcements_enabled
    } = body;

    // First ensure we have a settings row
    await db.run(`
      INSERT INTO discord_settings (id, guild_id, bot_token) VALUES (1, '', '')
      ON CONFLICT(id) DO NOTHING
    `);

    // Build the update query dynamically to only update provided fields
    const updateFields = [];
    const updateValues = [];

    // Always update these fields if provided
    if (application_id !== undefined) {
      updateFields.push('application_id = ?');
      updateValues.push(application_id || ''); // Convert null/undefined to empty string
    }
    
    if (guild_id !== undefined) {
      updateFields.push('guild_id = ?');
      updateValues.push(guild_id || ''); // Convert null/undefined to empty string
    }
    
    if (announcement_role_id !== undefined) {
      updateFields.push('announcement_role_id = ?');
      updateValues.push(announcement_role_id || '');
    }
    
    if (mention_everyone !== undefined) {
      updateFields.push('mention_everyone = ?');
      updateValues.push(mention_everyone ? 1 : 0);
    }
    
    if (event_duration_minutes !== undefined) {
      updateFields.push('event_duration_minutes = ?');
      updateValues.push(event_duration_minutes || 45);
    }
    
    if (match_reminder_minutes !== undefined) {
      updateFields.push('match_reminder_minutes = ?');
      updateValues.push(match_reminder_minutes || 10);
    }
    
    if (player_reminder_minutes !== undefined) {
      updateFields.push('player_reminder_minutes = ?');
      updateValues.push(player_reminder_minutes || 120);
    }
    
    if (announcer_voice !== undefined) {
      updateFields.push('announcer_voice = ?');
      updateValues.push(announcer_voice || 'wrestling-announcer');
    }
    
    if (voice_announcements_enabled !== undefined) {
      updateFields.push('voice_announcements_enabled = ?');
      updateValues.push(voice_announcements_enabled ? 1 : 0);
    }

    // Handle bot token separately
    if (bot_token && bot_token !== '••••••••') {
      updateFields.push('bot_token = ?');
      updateValues.push(bot_token);
    }

    // Always update the timestamp
    updateFields.push('updated_at = CURRENT_TIMESTAMP');

    if (updateFields.length > 1) { // More than just the timestamp
      const updateQuery = `
        UPDATE discord_settings SET
          ${updateFields.join(', ')}
        WHERE id = 1
      `;
      
      await db.run(updateQuery, updateValues);
    }

    // If bot token was updated, trigger bot restart
    if (bot_token && bot_token !== '••••••••') {
      try {
        // Attempt to restart the Discord bot process via PM2
        const { exec } = await import('child_process');
        const isDev = process.env.NODE_ENV === 'development';
        const processName = isDev ? 'discord-bot-dev' : 'discord-bot';
        
        // First check if the process exists
        exec(`npx pm2 describe ${processName}`, (error) => {
          if (error) {
            // Process doesn't exist, start it
            console.log(`🚀 Starting ${processName} process (not currently running)`);
            exec(`npx pm2 start ecosystem${isDev ? '.dev' : ''}.config.js --only ${processName}`, (startError) => {
              if (startError) {
                console.error(`❌ Error starting ${processName}:`, startError.message);
              } else {
                console.log(`✅ Successfully started ${processName} process`);
              }
            });
          } else {
            // Process exists, restart it
            console.log(`🔄 Restarting ${processName} process`);
            exec(`npx pm2 restart ${processName}`, (restartError) => {
              if (restartError) {
                console.error(`❌ Error restarting ${processName}:`, restartError.message);
              } else {
                console.log(`✅ Successfully restarted ${processName} process`);
              }
            });
          }
        });
        
      } catch (error) {
        console.error('❌ Error managing Discord bot process:', error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating Discord settings:', error);
    return NextResponse.json(
      { error: 'Failed to update Discord settings' },
      { status: 500 }
    );
  }
}