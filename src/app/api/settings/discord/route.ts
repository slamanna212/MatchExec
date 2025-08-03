import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/database-init';

export async function GET() {
  try {
    const db = await getDbInstance();
    
    const settings = await db.get(`
      SELECT 
        application_id,
        bot_token,
        guild_id,
        announcement_channel_id,
        results_channel_id,
        participant_role_id
      FROM discord_settings 
      WHERE id = 1
    `);

    // Don't expose the bot token in the response for security
    const safeSettings = settings ? {
      ...settings,
      bot_token: settings.bot_token ? '••••••••' : null
    } : null;

    return NextResponse.json(safeSettings || {});
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
      participant_role_id
    } = body;

    // Update the settings (there should only be one row with id = 1)
    await db.run(`
      UPDATE discord_settings SET
        application_id = ?,
        bot_token = COALESCE(?, bot_token),
        guild_id = ?,
        announcement_channel_id = ?,
        results_channel_id = ?,
        participant_role_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `, [
      application_id,
      bot_token === '••••••••' ? null : bot_token, // Don't update if masked
      guild_id,
      announcement_channel_id,
      results_channel_id,
      participant_role_id
    ]);

    // If bot token was updated, trigger bot restart
    if (bot_token && bot_token !== '••••••••') {
      try {
        // Attempt to restart the Discord bot process via PM2
        const { exec } = require('child_process');
        const isDev = process.env.NODE_ENV === 'development';
        const processName = isDev ? 'discord-bot-dev' : 'discord-bot';
        
        // First check if the process exists
        exec(`npx pm2 describe ${processName}`, (error, stdout, stderr) => {
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