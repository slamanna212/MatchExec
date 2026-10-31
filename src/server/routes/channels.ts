/** `/api/channels/**`: Discord notification channels (settings page + welcome flow). Thin handlers over `src/lib/discord-channels.ts`. */
import { Hono, type Context } from 'hono';
import { db } from '../../../lib/db';
import { logger } from '@/lib/logger';
import {
  channelExistsByDiscordId, createChannel, deleteChannel, getChannel, listChannels, setChannelName, toChannelDto,
  updateChannelFlags,
} from '@/lib/discord-channels';
import { getAnyDiscordSettings, getDiscordSettings } from '@/lib/settings';
import { jsonError } from '../http';

async function readBody(c: Context): Promise<Record<string, any>> {
  const body = await c.req.json();
  return body && typeof body === 'object' ? body : {};
}

function validId(id: string | undefined): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 100;
}

type RefreshResult = { updated: number; removed: number; error?: string };

async function refreshChannel(channel: { id: string; discord_channel_id: string }, botToken: string): Promise<RefreshResult> {
  const response = await fetch(`https://discord.com/api/v10/channels/${channel.discord_channel_id}`, {
    method: 'GET',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
  });

  if (response.ok) {
    const discordChannel = (await response.json()) as { name?: string };
    if (discordChannel?.name) {
      await setChannelName(db, channel.id, discordChannel.name);
      return { updated: 1, removed: 0 };
    }
    return { updated: 0, removed: 0 };
  }

  if (response.status === 404) {
    await deleteChannel(db, channel.id);
    logger.info(`Removed deleted Discord channel ${channel.discord_channel_id} from database`);
    return { updated: 0, removed: 1 };
  }

  return { updated: 0, removed: 0, error: `Failed to refresh channel ${channel.discord_channel_id}: HTTP ${response.status}` };
}

export const channels = new Hono()
  .get('/', async (c) => {
    try {
      return c.json((await listChannels(db)).map(toChannelDto));
    } catch (error) {
      logger.error('Error fetching Discord channels:', error);
      return jsonError(c, 'Failed to fetch Discord channels');
    }
  })
  .post('/', async (c) => {
    try {
      const body = await readBody(c);
      const discordChannelId = body.discord_channel_id as string;
      const channelType = body.channel_type as string;

      if (!discordChannelId || !channelType) return jsonError(c, 'Channel ID and type are required', 400);
      if (!['text', 'voice'].includes(channelType)) return jsonError(c, 'Channel type must be text or voice', 400);
      if (channelType === 'voice') {
        return jsonError(c, 'Voice channels are automatically created and cannot be manually added', 400);
      }
      if (await channelExistsByDiscordId(db, discordChannelId)) return jsonError(c, 'Channel already exists', 409);

      const guildId = (await getAnyDiscordSettings(db))?.guild_id;
      if (!guildId) return jsonError(c, 'Discord guild not configured', 400);

      const id = await createChannel(db, {
        guild_id: guildId,
        discord_channel_id: discordChannelId,
        channel_type: 'text',
        send_announcements: Boolean(body.send_announcements ?? false),
        send_reminders: Boolean(body.send_reminders ?? false),
        send_match_start: Boolean(body.send_match_start ?? false),
        send_signup_updates: Boolean(body.send_signup_updates ?? false),
        send_health_alerts: Boolean(body.send_health_alerts ?? false),
      });
      return c.json({ success: true, id, message: 'Channel created successfully' });
    } catch (error) {
      if (error instanceof SyntaxError) throw error;
      logger.error('Error creating Discord channel:', error);
      return jsonError(c, 'Failed to create Discord channel');
    }
  })
  .post('/refresh-names', async (c) => {
    try {
      const settings = await getDiscordSettings(db);
      if (!settings?.bot_token || !settings?.guild_id) return jsonError(c, 'Discord bot not configured', 400);

      const rows = await listChannels(db);
      let updatedCount = 0;
      let removedCount = 0;
      const errors: string[] = [];

      for (const channel of rows) {
        try {
          const result = await refreshChannel(channel, settings.bot_token);
          updatedCount += result.updated;
          removedCount += result.removed;
          if (result.error) { errors.push(result.error); logger.error(result.error); }
        } catch (error) {
          const message = `Failed to refresh channel ${channel.discord_channel_id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(message);
          logger.error(message);
        }
      }

      return c.json({
        success: true,
        updated_count: updatedCount,
        removed_count: removedCount,
        total_channels: rows.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      logger.error('Error refreshing channel names:', error);
      return jsonError(c, 'Failed to refresh channel names');
    }
  })
  .put('/:channelId', async (c) => {
    try {
      const channelId = c.req.param('channelId');
      if (!validId(channelId)) return jsonError(c, 'Invalid ID', 400);
      const body = await readBody(c);

      const channel = await getChannel(db, channelId);
      if (!channel) return jsonError(c, 'Channel not found', 404);
      if (channel.channel_type !== 'text') return jsonError(c, 'Notification settings only apply to text channels', 400);

      await updateChannelFlags(db, channelId, {
        send_announcements: Boolean(body.send_announcements ?? false),
        send_reminders: Boolean(body.send_reminders ?? false),
        send_match_start: Boolean(body.send_match_start ?? false),
        send_signup_updates: Boolean(body.send_signup_updates ?? false),
        send_health_alerts: Boolean(body.send_health_alerts ?? false),
      });
      return c.json({ success: true, message: 'Channel notification settings updated successfully' });
    } catch (error) {
      if (error instanceof SyntaxError) throw error;
      logger.error('Error updating Discord channel:', error);
      return jsonError(c, 'Failed to update Discord channel');
    }
  })
  .delete('/:channelId', async (c) => {
    try {
      const channelId = c.req.param('channelId');
      if (!validId(channelId)) return jsonError(c, 'Invalid ID', 400);

      if (!(await getChannel(db, channelId))) return jsonError(c, 'Channel not found', 404);
      await deleteChannel(db, channelId);
      return c.json({ success: true, message: 'Channel deleted successfully' });
    } catch (error) {
      logger.error('Error deleting Discord channel:', error);
      return jsonError(c, 'Failed to delete Discord channel');
    }
  });
