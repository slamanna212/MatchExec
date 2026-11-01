/**
 * Activity feed (`activity_feed`): logging, queries and retention. Used by the web app, bot, scheduler and stats-processor.
 * Logging never throws (a feed failure must not disrupt match operations). `logFeedEvent` / `deleteFeedEvents` take the
 * executor LAST (default `db`) so a caller that wants the event to commit with its own transaction can pass its `tx`;
 * most callers log after their transaction commits. Inside a transaction use `insertFeedEvent` in a `bestEffort` savepoint
 * (a failed statement would otherwise abort the whole transaction).
 */
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, not, sql, type SQL } from 'drizzle-orm';
import { db as defaultDb, type Executor } from '../../lib/db';
import { activityFeed, matches } from '../../lib/db/schema';
import { logger } from '@/lib/logger';
import type { FeedEventType, FeedPriority } from '@/shared/types';

export type FeedEventRow = typeof activityFeed.$inferSelect;

/** Action-required feed events tied to a match; they are cleared when the match is deleted. */
export const MATCH_ACTION_EVENTS = ['match_scoring_required', 'scorecard_player_matching_required'] as const;

export interface LogFeedEventOptions {
  eventType: FeedEventType;
  priority: FeedPriority;
  title: string;
  description?: string;
  matchId?: string;
  tournamentId?: string;
  metadata?: Record<string, unknown>;
}

/** Insert a feed event; throws on failure (use `bestEffort` when calling inside a transaction). */
export async function insertFeedEvent(ex: Executor, options: LogFeedEventOptions): Promise<void> {
  const id = `feed_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  await ex.insert(activityFeed).values({
    id,
    event_type: options.eventType,
    priority: options.priority,
    title: options.title,
    description: options.description ?? null,
    match_id: options.matchId ?? null,
    tournament_id: options.tournamentId ?? null,
    metadata: options.metadata ?? null,
  });
}

/**
 * Log an event to the activity feed.
 * Never throws — feed logging must not disrupt match operations.
 */
export async function logFeedEvent(options: LogFeedEventOptions, ex: Executor = defaultDb): Promise<void> {
  try {
    await insertFeedEvent(ex, options);
    logger.debug(`Feed event logged: [${options.eventType}] ${options.title}`);
  } catch (error) {
    // Intentionally swallowed — feed logging is non-critical infrastructure
    logger.error('Failed to log feed event:', error);
  }
}

/** Remove feed events of the given types for a match; throws on failure (use `bestEffort` inside a transaction). */
export async function removeFeedEvents(ex: Executor, matchId: string, eventTypes: readonly string[]): Promise<void> {
  if (eventTypes.length === 0) return;
  await ex.delete(activityFeed).where(and(inArray(activityFeed.event_type, [...eventTypes]), eq(activityFeed.match_id, matchId)));
}

/** Remove feed events of the given types for a match (e.g. the "map scoring required" action items). Never throws. */
export async function deleteFeedEvents(matchId: string, eventTypes: readonly string[], ex: Executor = defaultDb): Promise<void> {
  try {
    await removeFeedEvents(ex, matchId, eventTypes);
  } catch (error) {
    logger.error('Error deleting feed events:', error);
  }
}

/** True when an event of this type already exists for the match. */
export async function hasFeedEvent(ex: Executor, eventType: string, matchId: string): Promise<boolean> {
  const [row] = await ex.select({ id: activityFeed.id }).from(activityFeed)
    .where(and(eq(activityFeed.event_type, eventType), eq(activityFeed.match_id, matchId))).limit(1);
  return !!row;
}

export interface FeedQuery {
  limit: number;
  offset: number;
  eventType?: string;
  matchId?: string;
  tournamentId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface FeedPage {
  events: FeedEventRow[];
  total: number;
}

/** A page of the feed, newest first. Action items pointing at a deleted match are hidden. */
export async function listFeed(ex: Executor, query: FeedQuery): Promise<FeedPage> {
  const conditions: SQL[] = [
    not(and(eq(activityFeed.event_type, 'match_scoring_required'), isNotNull(activityFeed.match_id), isNull(matches.id))!),
  ];
  if (query.eventType) conditions.push(eq(activityFeed.event_type, query.eventType));
  if (query.matchId) conditions.push(eq(activityFeed.match_id, query.matchId));
  if (query.tournamentId) conditions.push(eq(activityFeed.tournament_id, query.tournamentId));
  if (query.dateFrom) conditions.push(gte(activityFeed.created_at, query.dateFrom));
  if (query.dateTo) conditions.push(lte(activityFeed.created_at, query.dateTo));
  const where = and(...conditions);

  const events = await ex.select({ af: activityFeed }).from(activityFeed)
    .leftJoin(matches, eq(matches.id, activityFeed.match_id))
    .where(where).orderBy(desc(activityFeed.created_at), desc(activityFeed.id)).limit(query.limit).offset(query.offset);
  const [totalRow] = await ex.select({ total: count() }).from(activityFeed)
    .leftJoin(matches, eq(matches.id, activityFeed.match_id)).where(where);
  return { events: events.map((e) => e.af), total: totalRow?.total ?? 0 };
}

/** Delete action-required events of `eventType` older than `olderThan`. Returns how many were removed. */
export async function purgeFeedEventsOfType(ex: Executor, eventType: string, olderThan: Date): Promise<number> {
  const rows = await ex.delete(activityFeed)
    .where(and(eq(activityFeed.event_type, eventType), lt(activityFeed.created_at, olderThan)))
    .returning({ id: activityFeed.id });
  return rows.length;
}

/** Retention: delete every event older than `retentionDays`. Returns how many were removed. */
export async function purgeFeedEventsOlderThan(ex: Executor, retentionDays: number): Promise<number> {
  const rows = await ex.delete(activityFeed)
    .where(lt(activityFeed.created_at, sql`now() - make_interval(days => ${retentionDays})`))
    .returning({ id: activityFeed.id });
  return rows.length;
}
