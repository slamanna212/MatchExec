import type { Client } from 'discord.js';
import { logger } from '../../../src/lib/logger';

/**
 * Fetches the Discord avatar URL for a given user
 * @param client Discord client instance
 * @param discordUserId Discord user ID
 * @returns Avatar URL from Discord CDN or null if no custom avatar
 */
export async function getDiscordAvatarUrl(
  client: Client,
  discordUserId: string
): Promise<string | null> {
  try {
    const user = await client.users.fetch(discordUserId);
    if (!user.avatar) {
      return null; // No custom avatar
    }
    const format = user.avatar.startsWith('a_') ? 'gif' : 'webp';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${format}?size=128`;
  } catch (error) {
    logger.error('Failed to fetch avatar for user:', discordUserId, error);
    return null;
  }
}
