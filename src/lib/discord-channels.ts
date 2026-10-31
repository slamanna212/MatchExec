/**
 * Discord channels domain module: the `discord_channels` table (the "channels" settings page).
 * Notification flags (`send_*`) decide which text channels the bot posts to. Voice channels are created by the
 * bot per match and are only ever read here (global voice-channel fallback lookup).
 */
import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import type { Executor } from '../../lib/db';
import { discordChannels } from '../../lib/db/schema';

export type DiscordChannelRow = typeof discordChannels.$inferSelect;

export type NotificationType = 'announcements' | 'reminders' | 'match_start' | 'signup_updates' | 'health_alerts';

const NOTIFICATION_COLUMNS = {
  announcements: discordChannels.send_announcements,
  reminders: discordChannels.send_reminders,
  match_start: discordChannels.send_match_start,
  signup_updates: discordChannels.send_signup_updates,
  health_alerts: discordChannels.send_health_alerts,
} as const;

export interface DiscordChannelDto {
  id: string;
  discord_channel_id: string;
  channel_name: string | null;
  channel_type: 'text' | 'voice';
  send_announcements: boolean;
  send_reminders: boolean;
  send_match_start: boolean;
  send_signup_updates: boolean;
  send_health_alerts: boolean;
  last_name_refresh: string | null;
  created_at: string;
  updated_at: string;
}

export function toChannelDto(row: DiscordChannelRow): DiscordChannelDto {
  return {
    id: row.id,
    discord_channel_id: row.discord_channel_id,
    channel_name: row.channel_name,
    channel_type: row.channel_type as 'text' | 'voice',
    send_announcements: row.send_announcements,
    send_reminders: row.send_reminders,
    send_match_start: row.send_match_start,
    send_signup_updates: row.send_signup_updates,
    send_health_alerts: row.send_health_alerts,
    last_name_refresh: row.last_name_refresh ? row.last_name_refresh.toISOString() : null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/** All channels ordered by type then name (NULL names first, as SQLite sorted them). */
export async function listChannels(ex: Executor): Promise<DiscordChannelRow[]> {
  return ex
    .select()
    .from(discordChannels)
    .orderBy(asc(discordChannels.channel_type), sql`${discordChannels.channel_name} asc nulls first`, asc(discordChannels.id));
}

export async function getChannel(ex: Executor, id: string): Promise<DiscordChannelRow | undefined> {
  const rows = await ex.select().from(discordChannels).where(eq(discordChannels.id, id)).limit(1);
  return rows[0];
}

export async function channelExistsByDiscordId(ex: Executor, discordChannelId: string): Promise<boolean> {
  const rows = await ex
    .select({ id: discordChannels.id })
    .from(discordChannels)
    .where(eq(discordChannels.discord_channel_id, discordChannelId))
    .limit(1);
  return rows.length > 0;
}

export interface NewChannelInput {
  guild_id: string;
  discord_channel_id: string;
  channel_type: 'text' | 'voice';
  send_announcements: boolean;
  send_reminders: boolean;
  send_match_start: boolean;
  send_signup_updates: boolean;
  send_health_alerts: boolean;
}

/** Inserts a channel; notification flags only apply to text channels. Returns the new row id. */
export async function createChannel(ex: Executor, input: NewChannelInput): Promise<string> {
  const id = `discord_channel_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation
  const isText = input.channel_type === 'text';
  await ex.insert(discordChannels).values({
    id,
    guild_id: input.guild_id,
    discord_channel_id: input.discord_channel_id,
    name: `Channel ${input.discord_channel_id}`,
    type: isText ? 0 : 2,
    channel_type: input.channel_type,
    send_announcements: isText && input.send_announcements,
    send_reminders: isText && input.send_reminders,
    send_match_start: isText && input.send_match_start,
    send_signup_updates: isText && input.send_signup_updates,
    send_health_alerts: isText && input.send_health_alerts,
  });
  return id;
}

export interface ChannelFlags {
  send_announcements: boolean;
  send_reminders: boolean;
  send_match_start: boolean;
  send_signup_updates: boolean;
  send_health_alerts: boolean;
}

export async function updateChannelFlags(ex: Executor, id: string, flags: ChannelFlags): Promise<void> {
  await ex.update(discordChannels).set({ ...flags, updated_at: new Date() }).where(eq(discordChannels.id, id));
}

export async function deleteChannel(ex: Executor, id: string): Promise<void> {
  await ex.delete(discordChannels).where(eq(discordChannels.id, id));
}

export async function setChannelName(ex: Executor, id: string, name: string): Promise<void> {
  await ex.update(discordChannels).set({ channel_name: name, last_name_refresh: new Date() }).where(eq(discordChannels.id, id));
}

/** Text channels that opted in to a notification type (bot announcements, reminders, health alerts, ...). */
export async function listChannelsForNotification(ex: Executor, type: NotificationType): Promise<DiscordChannelRow[]> {
  const column = NOTIFICATION_COLUMNS[type];
  if (!column) throw new Error(`Invalid notification type: ${type}`);
  return ex.select().from(discordChannels).where(eq(column, true)).orderBy(asc(discordChannels.created_at), asc(discordChannels.id));
}

/**
 * Global voice-channel fallback when a match has none of its own: first voice channel (type 2) whose name looks
 * like the given team ('blue' / 'red' with the 'team 1' / 'team 2' alternative).
 */
export async function findGlobalVoiceChannelId(ex: Executor, team: 'blue' | 'red'): Promise<string | undefined> {
  const byColor = team === 'blue' ? '%blue%' : '%red%';
  const byNumber = team === 'blue' ? '%team%1%' : '%team%2%';
  const rows = await ex
    .select({ discord_channel_id: discordChannels.discord_channel_id })
    .from(discordChannels)
    .where(
      and(
        eq(discordChannels.type, 2),
        or(
          ilike(discordChannels.name, byColor),
          ilike(discordChannels.channel_name, byColor),
          ilike(discordChannels.name, byNumber),
          ilike(discordChannels.channel_name, byNumber),
        ),
      ),
    )
    .orderBy(asc(discordChannels.created_at), asc(discordChannels.id))
    .limit(1);
  return rows[0]?.discord_channel_id;
}
