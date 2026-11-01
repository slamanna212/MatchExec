/** Per-match aggregates (`match_player_stats`) built from approved scorecards, plus the dashboard overview counts. */
import { and, asc, count, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { matchParticipants, matchPlayerStats, matchTeams, matches, scorecardPlayerStats, scorecardSubmissions } from '../../../lib/db/schema';
import { logger } from '../logger';

export type MatchPlayerStatsRow = typeof matchPlayerStats.$inferSelect;

const APPROVED: Array<'approved' | 'auto_approved'> = ['approved', 'auto_approved'];

/** Approved, participant-assigned scorecard rows of a match (what every aggregate is built from). */
async function listApprovedRows(ex: Executor, matchId: string) {
  return ex.select({
    id: scorecardPlayerStats.id,
    participant_id: scorecardPlayerStats.participant_id,
    match_game_id: scorecardPlayerStats.match_game_id,
    stats_json: scorecardPlayerStats.stats_json,
  }).from(scorecardPlayerStats)
    .innerJoin(scorecardSubmissions, eq(scorecardSubmissions.id, scorecardPlayerStats.submission_id))
    .where(and(
      eq(scorecardPlayerStats.match_id, matchId), inArray(scorecardSubmissions.review_status, APPROVED),
      isNotNull(scorecardPlayerStats.participant_id),
    ))
    .orderBy(asc(scorecardPlayerStats.created_at), asc(scorecardPlayerStats.id));
}

/** Per-map stat rows for the stats visualisation (`stats_json` is the stored JSON object). */
export async function listPerMapStats(ex: Executor, matchId: string): Promise<Array<{ match_game_id: string; participant_id: string; stats_json: Record<string, unknown> }>> {
  const rows = await listApprovedRows(ex, matchId);
  return rows.flatMap((r) => (r.participant_id ? [{ match_game_id: r.match_game_id, participant_id: r.participant_id, stats_json: r.stats_json }] : []));
}

/**
 * Sum each participant's approved stats across the match's maps and upsert `match_player_stats`.
 * Returns the number of participants aggregated (0 when there is nothing approved). Idempotent; run it inside a
 * transaction that holds the match lock when it must not interleave with another review.
 */
export async function aggregateMatchStats(ex: Executor, matchId: string): Promise<number> {
  const rows = await listApprovedRows(ex, matchId);
  if (rows.length === 0) return 0;

  const perParticipant = new Map<string, { totalStats: Record<string, number>; mapsPlayed: Set<string> }>();
  for (const row of rows) {
    const participantId = row.participant_id as string;
    let entry = perParticipant.get(participantId);
    if (!entry) {
      entry = { totalStats: {}, mapsPlayed: new Set() };
      perParticipant.set(participantId, entry);
    }
    entry.mapsPlayed.add(row.match_game_id);
    // stats_json is AI output: anything that is not an object of numbers contributes nothing
    const stats = row.stats_json;
    if (stats && typeof stats === 'object' && !Array.isArray(stats)) {
      for (const [key, value] of Object.entries(stats)) {
        if (typeof value === 'number') entry.totalStats[key] = (entry.totalStats[key] || 0) + value;
      }
    }
  }

  for (const [participantId, data] of perParticipant) {
    await ex.insert(matchPlayerStats).values({
      id: crypto.randomUUID(), match_id: matchId, participant_id: participantId,
      total_stats_json: data.totalStats, maps_played: data.mapsPlayed.size,
    }).onConflictDoUpdate({
      target: [matchPlayerStats.match_id, matchPlayerStats.participant_id],
      set: { total_stats_json: data.totalStats, maps_played: data.mapsPlayed.size, updated_at: new Date() },
    });
  }

  logger.info(`Stats aggregated for match ${matchId}: ${perParticipant.size} participants`);
  return perParticipant.size;
}

export async function listMatchPlayerStats(ex: Executor, matchId: string): Promise<MatchPlayerStatsRow[]> {
  return ex.select().from(matchPlayerStats).where(eq(matchPlayerStats.match_id, matchId))
    .orderBy(asc(matchPlayerStats.created_at), asc(matchPlayerStats.id));
}

export async function setStatImageUrl(ex: Executor, id: string, url: string): Promise<void> {
  await ex.update(matchPlayerStats).set({ stat_image_url: url }).where(eq(matchPlayerStats.id, id));
}

export async function markStatsDmSent(ex: Executor, matchId: string, participantId: string): Promise<void> {
  await ex.update(matchPlayerStats).set({ stats_dm_sent: true })
    .where(and(eq(matchPlayerStats.match_id, matchId), eq(matchPlayerStats.participant_id, participantId)));
}

/** Dashboard totals: matches and match sign-ups (tournament sign-ups are counted by the tournaments domain). */
export async function getMatchOverviewCounts(ex: Executor): Promise<{ totalMatches: number; matchParticipants: number }> {
  const [m] = await ex.select({ n: count() }).from(matches);
  const [p] = await ex.select({ n: count() }).from(matchParticipants);
  return { totalMatches: m?.n ?? 0, matchParticipants: p?.n ?? 0 };
}

export interface StatImageRow {
  id: string;
  participant_id: string;
  total_stats_json: Record<string, unknown>;
  maps_played: number;
  username: string;
  team_order: number | null;
  is_reserve: boolean | null;
  team_color: string | null;
  team_name: string | null;
}

/** Aggregated stats with the player's name and team, for rendering the stat images (one query). */
export async function listStatImageRows(ex: Executor, matchId: string): Promise<StatImageRow[]> {
  return ex.select({
    id: matchPlayerStats.id,
    participant_id: matchPlayerStats.participant_id,
    total_stats_json: matchPlayerStats.total_stats_json,
    maps_played: matchPlayerStats.maps_played,
    username: matchParticipants.username,
    team_order: matchTeams.team_order,
    is_reserve: matchTeams.is_reserve,
    team_color: matchTeams.team_color,
    team_name: matchTeams.team_name,
  }).from(matchPlayerStats)
    .innerJoin(matchParticipants, eq(matchParticipants.id, matchPlayerStats.participant_id))
    .leftJoin(matchTeams, eq(matchTeams.id, matchParticipants.team_id))
    .where(eq(matchPlayerStats.match_id, matchId))
    .orderBy(asc(matchPlayerStats.created_at), asc(matchPlayerStats.id));
}

/** Stat rows plus the player's name / signup data / Discord id for the report DMs (unsent only). */
export interface StatReportRow {
  participant_id: string;
  discord_user_id: string;
  username: string;
  signup_data: Record<string, unknown> | null;
  team_order: number | null;
  is_reserve: boolean | null;
  total_stats_json: Record<string, unknown>;
  maps_played: number;
}

export async function listUnsentStatReportRows(ex: Executor, matchId: string): Promise<StatReportRow[]> {
  const rows = await ex.select({
    participant_id: matchPlayerStats.participant_id,
    discord_user_id: matchParticipants.discord_user_id,
    username: matchParticipants.username,
    signup_data: matchParticipants.signup_data,
    team_order: matchTeams.team_order,
    is_reserve: matchTeams.is_reserve,
    total_stats_json: matchPlayerStats.total_stats_json,
    maps_played: matchPlayerStats.maps_played,
  }).from(matchPlayerStats)
    .innerJoin(matchParticipants, eq(matchParticipants.id, matchPlayerStats.participant_id))
    .leftJoin(matchTeams, eq(matchTeams.id, matchParticipants.team_id))
    .where(and(eq(matchPlayerStats.match_id, matchId), eq(matchPlayerStats.stats_dm_sent, false), isNotNull(matchParticipants.discord_user_id)))
    .orderBy(asc(matchPlayerStats.created_at), asc(matchPlayerStats.id));
  return rows.map((r) => ({ ...r, discord_user_id: r.discord_user_id as string }));
}
