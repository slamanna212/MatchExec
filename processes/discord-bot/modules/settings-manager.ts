import type { DiscordSettings } from '../../../shared/types';
import { logger } from '../../../src/lib/logger/server';
import { getDiscordSettings } from '../../../src/lib/settings';

export class SettingsManager {
  async loadSettings(): Promise<DiscordSettings | null> {
    try {
      const settings = await getDiscordSettings();

      if (!settings?.bot_token) {
        return null;
      }

      return {
        bot_token: settings.bot_token.trim(),
        guild_id: settings.guild_id.trim(),
        announcement_role_id: settings.announcement_role_id?.trim(),
        mention_everyone: settings.mention_everyone,
        event_duration_minutes: settings.event_duration_minutes,
        match_reminder_minutes: settings.match_reminder_minutes,
        player_reminder_minutes: settings.player_reminder_minutes,
        announcer_voice: settings.announcer_voice ?? undefined,
        voice_announcements_enabled: settings.voice_announcements_enabled,
        signup_dm_enabled: settings.signup_dm_enabled,
        commander_dm_enabled: settings.commander_dm_enabled,
      };
    } catch (error) {
      logger.error('❌ Error loading Discord settings:', error);
      return null;
    }
  }
}
