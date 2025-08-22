import { Database } from '../../../lib/database/connection';
import { DiscordChannel } from '../../../shared/types';

export class Utils {
  constructor(private db: Database) {}

  async getChannelsForNotificationType(notificationType: 'announcements' | 'reminders' | 'match_start' | 'signup_updates'): Promise<DiscordChannel[]> {
    if (!this.db) {
      return [];
    }

    try {
      const columnMap = {
        'announcements': 'send_announcements',
        'reminders': 'send_reminders', 
        'match_start': 'send_match_start',
        'signup_updates': 'send_signup_updates'
      };

      const column = columnMap[notificationType];
      if (!column) {
        console.error(`Invalid notification type: ${notificationType}`);
        return [];
      }

      const channels = await this.db.all<{
        id: string;
        discord_channel_id: string;
        channel_name: string;
        channel_type: string;
        send_announcements: number;
        send_reminders: number;
        send_match_start: number;
        send_signup_updates: number;
        created_at: string;
        updated_at: string;
      }>(`
        SELECT id, discord_channel_id, channel_name, channel_type, 
               send_announcements, send_reminders, send_match_start, send_signup_updates,
               created_at, updated_at
        FROM discord_channels 
        WHERE ${column} = 1
      `);

      return channels.map(channel => ({
        id: channel.id,
        discord_channel_id: channel.discord_channel_id,
        channel_name: channel.channel_name,
        channel_type: channel.channel_type as 'text' | 'voice',
        send_announcements: Boolean(channel.send_announcements),
        send_reminders: Boolean(channel.send_reminders),
        send_match_start: Boolean(channel.send_match_start),
        send_signup_updates: Boolean(channel.send_signup_updates),
        created_at: channel.created_at,
        updated_at: channel.updated_at
      }));

    } catch (error) {
      console.error(`Error fetching channels for ${notificationType}:`, error);
      return [];
    }
  }

  parseGameColor(colorString?: string): number {
    if (!colorString) return 0x4caf50; // default green
    
    try {
      const colorHex = colorString.replace('#', '');
      return parseInt(colorHex, 16);
    } catch (error) {
      console.error('Error parsing game color:', error);
      return 0x4caf50;
    }
  }

  generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  formatUptime(uptimeSeconds: number): string {
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);
    return `${hours}h ${minutes}m ${seconds}s`;
  }
}