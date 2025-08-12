import { Database } from '../../../lib/database/connection';
import { DiscordSettings } from '../../../shared/types';

export class SettingsManager {
  constructor(private db: Database) {}

  async loadSettings(): Promise<DiscordSettings | null> {
    console.log('🔍 Loading Discord settings...');
    
    if (!this.db) {
      console.error('❌ Database not initialized in SettingsManager');
      return null;
    }

    try {
      console.log('📊 Querying discord_settings table...');
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

      console.log('📋 Settings query result:', settings ? 'Found' : 'Not found');
      
      if (!settings?.bot_token) {
        console.log('⚠️ No bot token found in database settings');
        return null;
      }

      console.log(`✅ Bot token loaded: ${settings.bot_token.substring(0, 20)}...`);
      return settings;
    } catch (error) {
      console.error('❌ Error loading Discord settings:', error);
      return null;
    }
  }
}