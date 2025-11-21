import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';
import type { DiscordSettingsDbRow } from '@/shared/types';
import { logger } from '@/lib/logger';

/**
 * Field configuration for Discord settings updates
 */
const DISCORD_SETTINGS_FIELDS = [
  { key: 'application_id', default: '' },
  { key: 'guild_id', default: '' },
  { key: 'announcement_role_id', default: '' },
  { key: 'mention_everyone', default: false, transform: (v: boolean) => v ? 1 : 0 },
  { key: 'event_duration_minutes', default: 45 },
  { key: 'match_reminder_minutes', default: 10 },
  { key: 'player_reminder_minutes', default: 120 },
  { key: 'announcer_voice', default: 'wrestling-announcer' },
  { key: 'voice_announcements_enabled', default: false, transform: (v: boolean) => v ? 1 : 0 },
  { key: 'voice_channel_category_id', default: '' },
  { key: 'voice_channel_cleanup_delay_minutes', default: 10 }
] as const;

/**
 * Builds update query fields and values from request body
 */
function buildDiscordSettingsUpdate(body: Record<string, unknown>): { updateFields: string[]; updateValues: unknown[] } {
  const updateFields: string[] = [];
  const updateValues: unknown[] = [];

  // Process standard fields
  for (const field of DISCORD_SETTINGS_FIELDS) {
    if (body[field.key] !== undefined) {
      updateFields.push(`${field.key} = ?`);
      const value = body[field.key] || field.default;
      updateValues.push('transform' in field ? field.transform(value as boolean) : value);
    }
  }

  // Handle bot token separately (don't update if it's the masked value)
  if (body.bot_token && body.bot_token !== '••••••••') {
    updateFields.push('bot_token = ?');
    updateValues.push(body.bot_token);
  }

  // Always update the timestamp
  updateFields.push('updated_at = CURRENT_TIMESTAMP');

  return { updateFields, updateValues };
}

/**
 * Restarts the Discord bot process
 * Development: Uses PM2 for instant restart
 * Production: Kills process, s6-overlay auto-restarts it
 */
async function restartDiscordBot(): Promise<void> {
  try {
    const { exec } = await import('child_process');
    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
      // Development: Use PM2
      const processName = 'discord-bot-dev';

      // Check if process exists first
      exec(`npx pm2 describe ${processName}`, (error) => {
        if (error) {
          // Process doesn't exist, start it
          logger.debug(`🚀 Starting ${processName} process (not currently running)`);
          exec(`npx pm2 start ecosystem.config.js --only ${processName}`, (startError) => {
            if (startError) {
              logger.error(`❌ Error starting ${processName}:`, startError.message);
            } else {
              logger.debug(`✅ Successfully started ${processName} process`);
            }
          });
        } else {
          // Process exists, restart it
          logger.debug(`🔄 Restarting ${processName} process due to Discord settings change`);
          exec(`npx pm2 restart ${processName}`, (restartError) => {
            if (restartError) {
              logger.error(`❌ Error restarting ${processName}:`, restartError.message);
            } else {
              logger.debug(`✅ Successfully restarted ${processName} process`);
            }
          });
        }
      });
    } else {
      // Production: Kill the process, s6-overlay will restart it automatically
      logger.debug('🔄 Restarting Discord bot process due to Discord settings change');
      exec('pkill -TERM -f "tsx processes/discord-bot/index.ts"', (error) => {
        if (error) {
          logger.error('❌ Error restarting Discord bot:', error.message);
        } else {
          logger.debug('✅ Discord bot restart triggered, s6-overlay will restart it');
        }
      });
    }
  } catch (error) {
    logger.error('❌ Error managing Discord bot process:', error);
  }
}

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
        voice_announcements_enabled,
        voice_channel_category_id,
        voice_channel_cleanup_delay_minutes
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
      voice_announcements_enabled: Boolean(settings.voice_announcements_enabled),
      voice_channel_category_id: settings.voice_channel_category_id || '',
      voice_channel_cleanup_delay_minutes: settings.voice_channel_cleanup_delay_minutes || 10
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
      voice_announcements_enabled: false,
      voice_channel_category_id: '',
      voice_channel_cleanup_delay_minutes: 10
    };

    return NextResponse.json(safeSettings);
  } catch (error) {
    logger.error('Error fetching Discord settings:', error);
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

    // First ensure we have a settings row
    await db.run(`
      INSERT INTO discord_settings (id, guild_id, bot_token) VALUES (1, '', '')
      ON CONFLICT(id) DO NOTHING
    `);

    // Build update query using helper function
    const { updateFields, updateValues } = buildDiscordSettingsUpdate(body);

    // Execute update if there are fields to update (more than just timestamp)
    if (updateFields.length > 1) {
      const updateQuery = `
        UPDATE discord_settings SET
          ${updateFields.join(', ')}
        WHERE id = 1
      `;

      await db.run(updateQuery, updateValues);

      // Restart Discord bot when settings change
      await restartDiscordBot();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error updating Discord settings:', error);
    return NextResponse.json(
      { error: 'Failed to update Discord settings' },
      { status: 500 }
    );
  }
}