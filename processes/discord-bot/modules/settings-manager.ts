import type { Database } from '../../../lib/database/connection';
import type { DiscordSettings } from '../../../shared/types';
import { logger } from '../../../src/lib/logger/server';

export class SettingsManager {
  constructor(private db: Database) {}

  async loadSettings(): Promise<DiscordSettings | null> {
    if (!this.db) {
      logger.error('❌ Database not initialized in SettingsManager');
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
        return null;
      }

      return settings;
    } catch (error) {
      logger.error('❌ Error loading Discord settings:', error);
      return null;
    }
  }
}