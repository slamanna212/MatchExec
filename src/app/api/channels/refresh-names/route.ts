import type { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

type DbInstance = Awaited<ReturnType<typeof getDbInstance>>;
type ChannelRow = { id: string; discord_channel_id: string; channel_name?: string };
type RefreshResult = { updated: number; removed: number; error?: string };

async function refreshChannel(db: DbInstance, channel: ChannelRow, botToken: string): Promise<RefreshResult> {
  const response = await fetch(`https://discord.com/api/v10/channels/${channel.discord_channel_id}`, {
    method: 'GET',
    headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
  });

  if (response.ok) {
    const discordChannel = await response.json() as { name?: string };
    if (discordChannel?.name) {
      await db.run(
        'UPDATE discord_channels SET channel_name = ?, last_name_refresh = CURRENT_TIMESTAMP WHERE id = ?',
        [discordChannel.name, channel.id]
      );
      return { updated: 1, removed: 0 };
    }
    return { updated: 0, removed: 0 };
  }

  if (response.status === 404) {
    await db.run('DELETE FROM discord_channels WHERE id = ?', [channel.id]);
    logger.info(`Removed deleted Discord channel ${channel.discord_channel_id} from database`);
    return { updated: 0, removed: 1 };
  }

  return { updated: 0, removed: 0, error: `Failed to refresh channel ${channel.discord_channel_id}: HTTP ${response.status}` };
}

export async function POST(): Promise<NextResponse> {
  try {
    const db = await getDbInstance();

    const settings = await db.get<{ bot_token?: string; guild_id?: string }>(
      'SELECT bot_token, guild_id FROM discord_settings WHERE id = 1'
    );
    if (!settings?.bot_token || !settings?.guild_id) {
      return apiError('Discord bot not configured', 400);
    }

    const channels = await db.all<ChannelRow>('SELECT id, discord_channel_id, channel_name FROM discord_channels');

    let updatedCount = 0;
    let removedCount = 0;
    const errors: string[] = [];

    for (const channel of channels) {
      try {
        const result = await refreshChannel(db, channel, settings.bot_token);
        updatedCount += result.updated;
        removedCount += result.removed;
        if (result.error) { errors.push(result.error); logger.error(result.error); }
      } catch (error) {
        const errorMsg = `Failed to refresh channel ${channel.discord_channel_id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        logger.error(errorMsg);
      }
    }

    return apiOk({
      success: true,
      updated_count: updatedCount,
      removed_count: removedCount,
      total_channels: channels.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    logger.error('Error refreshing channel names:', error);
    return apiError('Failed to refresh channel names');
  }
}
