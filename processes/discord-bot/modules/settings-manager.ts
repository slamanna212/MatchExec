import { Database } from '../../../lib/database/connection';
import { DiscordSettings } from '../../../shared/types';

export class SettingsManager {
  constructor(private db: Database) {}

  async loadSettings(): Promise<DiscordSettings | null> {
    if (!this.db) {
      console.error('❌ Database not initialized in SettingsManager');
      return null;
    }

    try {
      const settings = await this.db.get<DiscordSettings>(`
        SELECT 
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
      
      if (!settings?.bot_token) {
        console.log('⚠️ No bot token found in database settings');
        return null;
      }

      return settings;
    } catch (error) {
      console.error('❌ Error loading Discord settings:', error);
      return null;
    }
  }
}