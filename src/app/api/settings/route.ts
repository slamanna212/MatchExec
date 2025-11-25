import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../lib/database-init';
import { logger } from '@/lib/logger';

interface DiscordSettings {
  application_id: string;
  bot_token: string;
  guild_id: string;
  announcement_role_id: string;
  mention_everyone: number;
  event_duration_minutes: number;
  match_reminder_minutes: number;
  player_reminder_minutes: number;
  announcer_voice: string;
  voice_announcements_enabled: number;
}

export async function GET() {
  try {
    const db = await getDbInstance();
    
    // Single query to get all settings data with joins
    const [discordSettings, uiSettings, schedulerSettings, voices] = await Promise.all([
      db.get(`
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
      `) as Promise<DiscordSettings | undefined>,
      db.get(`SELECT * FROM ui_settings WHERE id = 1`),
      db.get(`SELECT * FROM scheduler_settings WHERE id = 1`),
      db.all(`SELECT id, name, path FROM voices ORDER BY name ASC`)
    ]);

    // Process Discord settings with security masking
    const safeDiscordSettings = discordSettings ? {
      application_id: discordSettings.application_id || '',
      bot_token: discordSettings.bot_token ? '••••••••' : '',
      guild_id: discordSettings.guild_id || '',
      announcement_role_id: discordSettings.announcement_role_id || '',
      mention_everyone: Boolean(discordSettings.mention_everyone),
      event_duration_minutes: discordSettings.event_duration_minutes || 45,
      match_reminder_minutes: discordSettings.match_reminder_minutes || 10,
      player_reminder_minutes: discordSettings.player_reminder_minutes || 120,
      announcer_voice: discordSettings.announcer_voice || 'wrestling-announcer',
      voice_announcements_enabled: Boolean(discordSettings.voice_announcements_enabled)
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

    // Process UI settings
    const safeUiSettings = uiSettings || { auto_refresh_interval_seconds: 10 };

    // Process Scheduler settings
    const safeSchedulerSettings = schedulerSettings || {
      match_check_cron: '0 */1 * * * *',
      cleanup_check_cron: '0 0 2 * * *',
      channel_refresh_cron: '0 0 0 * * *'
    };

    // Return all settings in one response
    return NextResponse.json({
      discord: safeDiscordSettings,
      announcer: {
        announcer_voice: safeDiscordSettings.announcer_voice,
        voice_announcements_enabled: safeDiscordSettings.voice_announcements_enabled
      },
      ui: safeUiSettings,
      scheduler: safeSchedulerSettings,
      voices: voices || []
    });
  } catch (error) {
    logger.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}