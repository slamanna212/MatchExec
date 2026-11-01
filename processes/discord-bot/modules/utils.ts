import * as path from 'path';
import type { DiscordChannel } from '../../../shared/types';
import { logger } from '../../../src/lib/logger/server';
import { db as pgDb } from '../../../lib/db';
import { listChannelsForNotification } from '../../../src/lib/discord-channels';

/** Truncate a string to fit Discord's title limit (embed: 256, modal: 45). */
export function capTitle(s: string, max = 256): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)  }…`;
}

/**
 * Resolve an imageUrl to a path inside public/, or return null if the resolved
 * path would escape that directory (path traversal guard).
 */
export function safePublicPath(imageUrl: string): string | null {
  const base = path.resolve(process.cwd(), 'public');
  const resolved = path.resolve(base, imageUrl.replace(/^\//, ''));
  if (!resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

export class Utils {
  async getChannelsForNotificationType(notificationType: 'announcements' | 'reminders' | 'match_start' | 'signup_updates'): Promise<DiscordChannel[]> {
    try {
      const channels = await listChannelsForNotification(pgDb, notificationType);

      return channels.map(channel => ({
        id: channel.id,
        discord_channel_id: channel.discord_channel_id,
        channel_name: channel.channel_name ?? undefined,
        channel_type: channel.channel_type as 'text' | 'voice',
        send_announcements: channel.send_announcements,
        send_reminders: channel.send_reminders,
        send_match_start: channel.send_match_start,
        send_signup_updates: channel.send_signup_updates,
        send_health_alerts: channel.send_health_alerts,
        last_name_refresh: channel.last_name_refresh?.toISOString(),
        created_at: channel.created_at.toISOString(),
        updated_at: channel.updated_at.toISOString()
      }));

    } catch (error) {
      logger.error(`Error fetching channels for ${notificationType}:`, error);
      return [];
    }
  }

  parseGameColor(colorString?: string): number {
    if (!colorString) return 0x4caf50; // default green
    
    try {
      const colorHex = colorString.replace('#', '');
      return parseInt(colorHex, 16);
    } catch (error) {
      logger.error('Error parsing game color:', error);
      return 0x4caf50;
    }
  }

  generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation
  }

  formatUptime(uptimeSeconds: number): string {
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);
    return `${hours}h ${minutes}m ${seconds}s`;
  }
}