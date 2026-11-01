/**
 * `discord_match_messages`: the Discord message(s) the bot posted for a match or tournament (`match_id` holds either id;
 * there is deliberately no FK, the bot reads these rows after the match/tournament row is gone to clean Discord up).
 */
import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Executor } from '../../lib/db';
import { discordMatchMessages } from '../../lib/db/schema';

export type DiscordMessageRow = typeof discordMatchMessages.$inferSelect;

/** The announcement message of a match / tournament, if one was posted. */
export async function getAnnouncementMessage(ex: Executor, eventId: string): Promise<DiscordMessageRow | undefined> {
  const [row] = await ex.select().from(discordMatchMessages)
    .where(and(eq(discordMatchMessages.match_id, eventId), eq(discordMatchMessages.message_type, 'announcement')))
    .orderBy(asc(discordMatchMessages.created_at), asc(discordMatchMessages.id)).limit(1);
  return row;
}

export async function listAnnouncementMessages(ex: Executor, eventId: string): Promise<DiscordMessageRow[]> {
  return ex.select().from(discordMatchMessages)
    .where(and(eq(discordMatchMessages.match_id, eventId), eq(discordMatchMessages.message_type, 'announcement')))
    .orderBy(asc(discordMatchMessages.created_at), asc(discordMatchMessages.id));
}

/** Every tracked message of a match / tournament (all types). */
export async function listAllMessages(ex: Executor, eventId: string): Promise<DiscordMessageRow[]> {
  return ex.select().from(discordMatchMessages).where(eq(discordMatchMessages.match_id, eventId))
    .orderBy(asc(discordMatchMessages.created_at), asc(discordMatchMessages.id));
}

export async function recordMessage(
  ex: Executor,
  input: { eventId: string; messageId: string; channelId: string; threadId?: string | null; discordEventId?: string | null; type?: string },
): Promise<void> {
  await ex.insert(discordMatchMessages).values({
    id: `discord_msg_${randomUUID()}`, match_id: input.eventId, message_id: input.messageId, channel_id: input.channelId,
    thread_id: input.threadId ?? null, discord_event_id: input.discordEventId ?? null, message_type: input.type ?? 'announcement',
  });
}

export async function setAnnouncementThread(ex: Executor, eventId: string, threadId: string | null): Promise<void> {
  await ex.update(discordMatchMessages).set({ thread_id: threadId })
    .where(and(eq(discordMatchMessages.match_id, eventId), eq(discordMatchMessages.message_type, 'announcement')));
}

export async function deleteMessages(ex: Executor, eventId: string): Promise<void> {
  await ex.delete(discordMatchMessages).where(eq(discordMatchMessages.match_id, eventId));
}
