/**
 * Typed enqueue functions, one per queue. Each takes an `Executor` first so callers can run them inside their
 * business transaction (`await db.transaction(tx => { ...; await enqueueAnnouncement(tx, ...) })`): the queue row
 * then commits together with the state change that caused it.
 *
 * Every function returns the new row id, or `null` when a dedupe rule suppressed the insert.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import {
  discordAnnouncementQueue, discordBotRequests, discordDeletionQueue, discordHealthAlertQueue, discordMapCodeQueue,
  discordMatchEditQueue, discordMatchStartQueue, discordMatchWinnerQueue, discordPlayerReminderQueue,
  discordReminderQueue, discordScoreNotificationQueue, discordScorecardPromptQueue, discordStatsReportQueue,
  discordStatusUpdateQueue, discordVoiceAnnouncementQueue, discordWinnerVoteQueue, statsImageQueue, statsProcessingQueue,
} from '../../../lib/db/schema';

const newId = (prefix: string): string => `${prefix}_${randomUUID()}`;

/** Statuses that count as "still in the queue" for dedupe purposes. */
const LIVE_STATUSES = ['pending', 'processing'] as const;

// ─── Announcements ───────────────────────────────────────────────────────────

export type AnnouncementType = 'standard' | 'match_start' | 'tournament' | 'timed';

export interface EnqueueAnnouncementInput {
  /** Match id, or tournament id for `tournament` announcements. */
  matchId: string;
  type: AnnouncementType;
  data?: Record<string, unknown> | null;
  scheduledFor?: Date | null;
  /**
   * Skip the insert when a row of the same match + type (+ same data for `timed`) already exists in one of these
   * statuses. Omit for no dedupe.
   */
  dedupe?: ReadonlyArray<'pending' | 'processing' | 'completed' | 'failed'>;
}

/** Insert an announcement unless the dedupe rule finds an existing one. A single statement (INSERT ... WHERE NOT EXISTS). */
export async function enqueueAnnouncement(ex: Executor, input: EnqueueAnnouncementInput): Promise<string | null> {
  const id = newId('announce');
  const t = discordAnnouncementQueue;
  const values = {
    id,
    match_id: input.matchId,
    announcement_type: input.type,
    announcement_data: input.data ?? null,
    scheduled_for: input.scheduledFor ?? null,
  };
  if (!input.dedupe) {
    await ex.insert(t).values(values);
    return id;
  }
  const statuses = sql.join(input.dedupe.map((s) => sql`${s}`), sql`, `);
  const sameData = input.data ? sql`AND ${t.announcement_data} = ${JSON.stringify(input.data)}::jsonb` : sql``;
  const rows = await ex.execute<{ id: string }>(sql`
    INSERT INTO ${t} (id, match_id, announcement_type, announcement_data, scheduled_for)
    SELECT ${id}, ${input.matchId}, ${input.type}, ${input.data ? JSON.stringify(input.data) : null}::jsonb, ${input.scheduledFor ?? null}::timestamptz
    WHERE NOT EXISTS (
      SELECT 1 FROM ${t}
      WHERE ${t.match_id} = ${input.matchId} AND ${t.announcement_type} = ${input.type}
        AND ${t.status} IN (${statuses}) ${sameData}
    )
    RETURNING id`);
  return (rows as unknown as { rows: unknown[] }).rows.length > 0 ? id : null;
}

/** Existing queued announcement for a match + type in the given statuses (reads, e.g. for "already announced"). */
export async function hasAnnouncement(
  ex: Executor,
  matchId: string,
  type: AnnouncementType,
  statuses: ReadonlyArray<'pending' | 'processing' | 'completed' | 'failed'> = LIVE_STATUSES,
): Promise<boolean> {
  const t = discordAnnouncementQueue;
  const rows = await ex
    .select({ id: t.id })
    .from(t)
    .where(and(eq(t.match_id, matchId), eq(t.announcement_type, type), inArray(t.status, [...statuses])))
    .limit(1);
  return rows.length > 0;
}

/** Status of a timed announcement (matched by its exact timing payload), for the match announcements API. */
export async function getTimedAnnouncement(ex: Executor, matchId: string, data: Record<string, unknown>) {
  const t = discordAnnouncementQueue;
  const rows = await ex
    .select({ status: t.status, posted_at: t.posted_at, last_error: t.last_error })
    .from(t)
    .where(and(eq(t.match_id, matchId), eq(t.announcement_type, 'timed'), sql`${t.announcement_data} = ${JSON.stringify(data)}::jsonb`))
    .limit(1);
  return rows[0];
}

/** True when a non-failed timed announcement with exactly this payload exists (scheduler dedupe). */
export async function hasTimedAnnouncement(ex: Executor, matchId: string, data: Record<string, unknown>): Promise<boolean> {
  const t = discordAnnouncementQueue;
  const rows = await ex
    .select({ id: t.id })
    .from(t)
    .where(and(
      eq(t.match_id, matchId),
      eq(t.announcement_type, 'timed'),
      sql`${t.announcement_data} = ${JSON.stringify(data)}::jsonb`,
      sql`${t.status} <> 'failed'`,
    ))
    .limit(1);
  return rows.length > 0;
}

// ─── Simple per-match queues ─────────────────────────────────────────────────

export async function enqueueStatusUpdate(ex: Executor, matchId: string, newStatus: string): Promise<string> {
  const id = newId('discord_update');
  await ex.insert(discordStatusUpdateQueue).values({ id, match_id: matchId, new_status: newStatus });
  return id;
}

export async function enqueueDeletion(ex: Executor, matchId: string): Promise<string> {
  const id = newId('deletion');
  await ex.insert(discordDeletionQueue).values({ id, match_id: matchId });
  return id;
}

export async function enqueueMatchEdit(ex: Executor, matchId: string): Promise<string> {
  const id = newId('match_edit');
  await ex.insert(discordMatchEditQueue).values({ id, match_id: matchId });
  return id;
}

export async function enqueueMatchStart(ex: Executor, matchId: string): Promise<string> {
  const id = newId('match_start');
  await ex.insert(discordMatchStartQueue).values({ id, match_id: matchId });
  return id;
}

export async function enqueueMapCode(ex: Executor, input: { matchId: string; mapName: string; mapCode: string; userId?: string | null }): Promise<string> {
  const id = newId('map_codes');
  await ex.insert(discordMapCodeQueue).values({ id, match_id: input.matchId, map_name: input.mapName, map_code: input.mapCode, user_id: input.userId ?? null });
  return id;
}

export interface EnqueueScoreNotificationInput {
  matchId: string;
  /** `match_games.id` of the map that was scored. */
  gameId: string;
  mapId: string | null;
  gameNumber: number | null;
  winner: string | null;
  winningTeamName: string | null;
  winningPlayers: string[];
}

export async function enqueueScoreNotification(ex: Executor, input: EnqueueScoreNotificationInput): Promise<string> {
  const id = newId('score_notification');
  await ex.insert(discordScoreNotificationQueue).values({
    id, match_id: input.matchId, game_id: input.gameId, map_id: input.mapId, game_number: input.gameNumber,
    winner: input.winner, winning_team_name: input.winningTeamName, winning_players: input.winningPlayers,
  });
  return id;
}

export interface EnqueueMatchWinnerInput {
  /** Match id, or the tournament id for tournament winner notifications (`winner = 'tournament'`). */
  matchId: string;
  matchName: string;
  gameId: string;
  winner: string;
  winningTeamName: string | null;
  winningPlayers: string[];
  team1Score: number;
  team2Score: number;
  totalMaps: number;
}

export async function enqueueMatchWinner(ex: Executor, input: EnqueueMatchWinnerInput): Promise<string> {
  const id = newId(input.winner === 'tournament' ? 'tournament_winner' : 'match_winner');
  await ex.insert(discordMatchWinnerQueue).values({
    id, match_id: input.matchId, match_name: input.matchName, game_id: input.gameId, winner: input.winner,
    winning_team_name: input.winningTeamName, winning_players: input.winningPlayers,
    team1_score: input.team1Score, team2_score: input.team2Score, total_maps: input.totalMaps,
  });
  return id;
}

export interface EnqueueVoiceAnnouncementInput {
  matchId: string;
  type: string;
  blueChannel: string | null;
  redChannel: string | null;
  firstTeam: string;
}

/** Voice announcements retry up to 3 times after a timeout (1 + 3 attempts), as before. */
export async function enqueueVoiceAnnouncement(ex: Executor, input: EnqueueVoiceAnnouncementInput): Promise<string> {
  const id = newId('voice_announcement');
  await ex.insert(discordVoiceAnnouncementQueue).values({
    id, match_id: input.matchId, announcement_type: input.type, blue_team_voice_channel: input.blueChannel,
    red_team_voice_channel: input.redChannel, first_team: input.firstTeam, max_attempts: 4,
  });
  return id;
}

export async function enqueueScorecardPrompt(ex: Executor, input: { matchId: string; matchGameId: string; mapName: string }): Promise<string> {
  const id = newId('scorecard_prompt');
  await ex.insert(discordScorecardPromptQueue).values({ id, match_id: input.matchId, match_game_id: input.matchGameId, map_name: input.mapName });
  return id;
}

export async function enqueueWinnerVote(ex: Executor, input: { matchId: string; matchGameId: string; mapName: string }): Promise<string> {
  const id = newId('winner_vote');
  await ex.insert(discordWinnerVoteQueue).values({ id, match_id: input.matchId, match_game_id: input.matchGameId, map_name: input.mapName });
  return id;
}

/** One stats report per match (unique match_id): returns null when it was already queued. */
export async function enqueueStatsReport(ex: Executor, matchId: string): Promise<string | null> {
  const id = newId('stats_report');
  const rows = await ex.insert(discordStatsReportQueue).values({ id, match_id: matchId }).onConflictDoNothing().returning({ id: discordStatsReportQueue.id });
  return rows.length > 0 ? id : null;
}

export async function enqueueStatsImage(ex: Executor, matchId: string): Promise<string> {
  const id = randomUUID();
  await ex.insert(statsImageQueue).values({ id, match_id: matchId });
  return id;
}

/** AI extraction jobs: 1 attempt + `maxRetries` retries (default 3, retried after 30s / 60s / 2m). */
export async function enqueueStatsProcessing(
  ex: Executor,
  input: { submissionId: string; matchId: string; matchGameId: string; maxRetries?: number },
): Promise<string> {
  const id = randomUUID();
  await ex.insert(statsProcessingQueue).values({
    id, submission_id: input.submissionId, match_id: input.matchId, match_game_id: input.matchGameId,
    max_attempts: (input.maxRetries ?? 3) + 1,
  });
  return id;
}

export async function findStatsProcessingBySubmission(ex: Executor, submissionId: string): Promise<{ id: string } | undefined> {
  const rows = await ex.select({ id: statsProcessingQueue.id }).from(statsProcessingQueue).where(eq(statsProcessingQueue.submission_id, submissionId)).limit(1);
  return rows[0];
}

export async function enqueueHealthAlert(ex: Executor, input: { severity?: 'critical' | 'warning'; title: string; description?: string | null }): Promise<string> {
  const id = newId('health_alert');
  await ex.insert(discordHealthAlertQueue).values({ id, severity: input.severity ?? 'critical', title: input.title, description: input.description ?? null });
  return id;
}

// ─── Reminders ───────────────────────────────────────────────────────────────

/** Match reminder; the partial unique index (match_id, reminder_type WHERE status <> 'failed') dedupes. */
export async function enqueueMatchReminder(
  ex: Executor,
  input: { matchId: string; minutesBefore: number; reminderTime: Date },
): Promise<string | null> {
  const id = newId('reminder');
  const rows = await ex
    .insert(discordReminderQueue)
    .values({
      id, match_id: input.matchId, reminder_type: 'match_reminder', minutes_before: input.minutesBefore,
      reminder_time: input.reminderTime, scheduled_for: input.reminderTime,
    })
    .onConflictDoNothing()
    .returning({ id: discordReminderQueue.id });
  return rows.length > 0 ? id : null;
}

export async function enqueuePlayerReminder(ex: Executor, input: { matchId: string; reminderTime: Date }): Promise<string> {
  const id = newId('player_reminder');
  await ex.insert(discordPlayerReminderQueue).values({
    id, match_id: input.matchId, user_id: 'all', reminder_type: 'player_reminder',
    reminder_time: input.reminderTime, scheduled_for: input.reminderTime,
  });
  return id;
}

/** Subset of `matchIds` that already have a non-failed match reminder queued. */
export async function matchIdsWithLiveReminder(ex: Executor, matchIds: readonly string[]): Promise<Set<string>> {
  if (matchIds.length === 0) return new Set();
  const rows = await ex
    .select({ id: discordReminderQueue.match_id })
    .from(discordReminderQueue)
    .where(and(inArray(discordReminderQueue.match_id, [...matchIds]), sql`${discordReminderQueue.status} <> 'failed'`));
  return new Set(rows.map((r) => r.id));
}

/** Subset of `matchIds` that already have a non-failed player reminder queued. */
export async function matchIdsWithLivePlayerReminder(ex: Executor, matchIds: readonly string[]): Promise<Set<string>> {
  if (matchIds.length === 0) return new Set();
  const rows = await ex
    .select({ id: discordPlayerReminderQueue.match_id })
    .from(discordPlayerReminderQueue)
    .where(and(inArray(discordPlayerReminderQueue.match_id, [...matchIds]), sql`${discordPlayerReminderQueue.status} <> 'failed'`));
  return new Set(rows.map((r) => r.id));
}

// ─── Bot requests (request/response RPC to the Discord bot) ──────────────────

export type BotRequestType = 'voice_channel_create' | 'voice_channel_delete' | 'voice_test' | 'commander_dm';

export async function enqueueBotRequest(ex: Executor, type: BotRequestType, data: Record<string, unknown>): Promise<string> {
  const id = newId(type === 'voice_channel_create' ? 'voice_create' : type === 'voice_channel_delete' ? 'voice_delete' : type === 'commander_dm' ? 'cmdr_dm' : 'voice_test');
  await ex.insert(discordBotRequests).values({ id, type, data });
  return id;
}

export async function getBotRequest(ex: Executor, id: string) {
  const rows = await ex.select().from(discordBotRequests).where(eq(discordBotRequests.id, id)).limit(1);
  return rows[0];
}

/** A live (pending/processing, created within `maxAgeMs`) voice test request for this user, if any. */
export async function findActiveVoiceTest(ex: Executor, userId: string, maxAgeMs = 2 * 60_000): Promise<{ id: string } | undefined> {
  const t = discordBotRequests;
  const rows = await ex
    .select({ id: t.id })
    .from(t)
    .where(and(
      eq(t.type, 'voice_test'),
      inArray(t.status, [...LIVE_STATUSES]),
      sql`${t.data}->>'userId' = ${userId}`,
      sql`${t.created_at} >= now() - ${Math.round(maxAgeMs)}::double precision * interval '1 millisecond'`,
    ))
    .limit(1);
  return rows[0];
}

/** Fail stale pending voice test requests of a user (older than `maxAgeMs`). */
export async function failStaleVoiceTests(ex: Executor, userId: string, maxAgeMs = 2 * 60_000): Promise<void> {
  const t = discordBotRequests;
  await ex
    .update(t)
    .set({ status: 'failed', result: { success: false, message: 'Request timed out and was cleaned up' } })
    .where(and(
      eq(t.type, 'voice_test'),
      eq(t.status, 'pending'),
      sql`${t.data}->>'userId' = ${userId}`,
      sql`${t.created_at} < now() - ${Math.round(maxAgeMs)}::double precision * interval '1 millisecond'`,
    ));
}

/** Time out a request the caller gave up on (only while it is still pending/processing). */
export async function failBotRequest(ex: Executor, id: string, result: Record<string, unknown>): Promise<boolean> {
  const t = discordBotRequests;
  const rows = await ex
    .update(t)
    .set({ status: 'failed', result, processed_at: sql`now()` })
    .where(and(eq(t.id, id), inArray(t.status, [...LIVE_STATUSES])))
    .returning({ id: t.id });
  return rows.length > 0;
}

/** Bot requests the web side has abandoned waiting for: older than `maxAgeMs` and still open. */
export async function expireOldBotRequests(ex: Executor, maxAgeMs = 5 * 60_000): Promise<number> {
  const t = discordBotRequests;
  const rows = await ex
    .update(t)
    .set({ status: 'failed', result: { success: false, message: 'Request abandoned - too old' }, processed_at: sql`now()` })
    .where(and(
      inArray(t.status, [...LIVE_STATUSES]),
      sql`${t.created_at} < now() - ${Math.round(maxAgeMs)}::double precision * interval '1 millisecond'`,
    ))
    .returning({ id: t.id });
  return rows.length;
}
