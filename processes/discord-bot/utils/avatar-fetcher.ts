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
  logger.debug(`Fetching avatar for user ${discordUserId}`);
  const user = await client.users.fetch(discordUserId);
  if (!user.avatar) {
    return null;
  }
  const format = user.avatar.startsWith('a_') ? 'gif' : 'webp';
  const url = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${format}?size=128`;
  logger.debug(`Resolved avatar URL for user ${discordUserId}`);
  return url;
}
