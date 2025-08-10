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
        announcement_channel_id,
        results_channel_id,
        participant_role_id,
        announcement_role_id,
        mention_everyone,
        event_duration_minutes,
        match_reminder_minutes
      FROM discord_settings 
      WHERE id = 1
    `);

    // Don't expose the bot token in the response for security
    // Also ensure all null values are converted to appropriate defaults for React form inputs
    const safeSettings = settings ? {
      application_id: settings.application_id || '',
      bot_token: settings.bot_token ? '••••••••' : '',
      guild_id: settings.guild_id || '',
      announcement_channel_id: settings.announcement_channel_id || '',
      results_channel_id: settings.results_channel_id || '',
      participant_role_id: settings.participant_role_id || '',
      announcement_role_id: settings.announcement_role_id || '',
      mention_everyone: Boolean(settings.mention_everyone),
      event_duration_minutes: settings.event_duration_minutes || 45,
      match_reminder_minutes: settings.match_reminder_minutes || 10
    } : {
      application_id: '',
      bot_token: '',
      guild_id: '',
      announcement_channel_id: '',
      results_channel_id: '',
      participant_role_id: '',
      announcement_role_id: '',
      mention_everyone: false,
      event_duration_minutes: 45,
      match_reminder_minutes: 10
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
      announcement_channel_id,
      results_channel_id,
      participant_role_id,
      announcement_role_id,
      mention_everyone,
      event_duration_minutes,
      match_reminder_minutes
    } = body;

    // First ensure we have a settings row
    await db.run(`
      INSERT INTO discord_settings (id) VALUES (1)
      ON CONFLICT(id) DO NOTHING
    `);

    // Update the settings - handle bot_token separately to avoid overwriting with null
    if (bot_token && bot_token !== '••••••••') {
      // Update with new bot token
      await db.run(`
        UPDATE discord_settings SET
          application_id = ?,
          bot_token = ?,
          guild_id = ?,
          announcement_channel_id = ?,
          results_channel_id = ?,
          participant_role_id = ?,
          announcement_role_id = ?,
          mention_everyone = ?,
          event_duration_minutes = ?,
          match_reminder_minutes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `, [
        application_id,
        bot_token,
        guild_id,
        announcement_channel_id,
        results_channel_id,
        participant_role_id,
        announcement_role_id,
        mention_everyone ? 1 : 0,
        event_duration_minutes || 45,
        match_reminder_minutes || 10
      ]);
    } else {
      // Update without changing bot token
      await db.run(`
        UPDATE discord_settings SET
          application_id = ?,
          guild_id = ?,
          announcement_channel_id = ?,
          results_channel_id = ?,
          participant_role_id = ?,
          announcement_role_id = ?,
          mention_everyone = ?,
          event_duration_minutes = ?,
          match_reminder_minutes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `, [
        application_id,
        guild_id,
        announcement_channel_id,
        results_channel_id,
        participant_role_id,
        announcement_role_id,
        mention_everyone ? 1 : 0,
        event_duration_minutes || 45,
        match_reminder_minutes || 10
      ]);
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