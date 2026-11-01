/** match_participants: signups, listing, commander flags and the racing setup phase (grid order / qualifying times). */
import { and, asc, count, eq, gte, inArray, isNotNull, lt, notInArray, sql } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { games, matchParticipants, matchTeams, matches } from '../../../lib/db/schema';
import { genId } from './ids';
import { lockMatch } from './teams';

export type ParticipantRow = typeof matchParticipants.$inferSelect;

/** Participants in signup order. */
export async function listParticipants(ex: Executor, matchId: string): Promise<ParticipantRow[]> {
  return ex.select().from(matchParticipants).where(eq(matchParticipants.match_id, matchId))
    .orderBy(asc(matchParticipants.joined_at), asc(matchParticipants.id));
}

export async function getParticipant(ex: Executor, matchId: string, participantId: string): Promise<ParticipantRow | undefined> {
  const [row] = await ex.select().from(matchParticipants)
    .where(and(eq(matchParticipants.id, participantId), eq(matchParticipants.match_id, matchId))).limit(1);
  return row;
}

export async function isSignedUp(ex: Executor, matchId: string, userId: string): Promise<boolean> {
  const [row] = await ex.select({ id: matchParticipants.id }).from(matchParticipants)
    .where(and(eq(matchParticipants.match_id, matchId), eq(matchParticipants.user_id, userId))).limit(1);
  return !!row;
}

export async function countParticipants(ex: Executor, matchId: string): Promise<number> {
  const [row] = await ex.select({ cnt: count() }).from(matchParticipants).where(eq(matchParticipants.match_id, matchId));
  return row?.cnt ?? 0;
}

/** Signup cap for a match: the game's `max_signups`, or undefined when the match / game is unknown. */
export async function getMatchSignupLimit(ex: Executor, matchId: string): Promise<{ game_id: string; max_signups: number | null } | undefined> {
  const [row] = await ex.select({ game_id: matches.game_id, max_signups: games.max_signups })
    .from(matches).innerJoin(games, eq(matches.game_id, games.id)).where(eq(matches.id, matchId)).limit(1);
  return row;
}

export interface AddParticipantInput {
  matchId: string;
  userId: string;
  discordUserId: string | null;
  username: string;
  signupData: Record<string, unknown> | null;
  avatarUrl: string | null;
}

/**
 * Sign a user up. Capacity is enforced under the match row lock so two simultaneous signups can't both take the last
 * slot (`ignoreCapacity` skips it). Returns `{ status: 'added' | 'duplicate' | 'full' }`; the match's `updated_at` is
 * bumped so ETag pollers see the change.
 */
export async function addParticipant(
  ex: Executor,
  input: AddParticipantInput,
  opts: { capacity?: number | null } = {},
): Promise<{ status: 'added'; id: string } | { status: 'duplicate' | 'full' }> {
  return ex.transaction(async (tx) => {
    await lockMatch(tx, input.matchId);
    if (await isSignedUp(tx, input.matchId, input.userId)) return { status: 'duplicate' as const };
    if (opts.capacity != null && (await countParticipants(tx, input.matchId)) >= opts.capacity) return { status: 'full' as const };
    const id = genId('participant');
    const inserted = await tx.insert(matchParticipants).values({
      id, match_id: input.matchId, user_id: input.userId, discord_user_id: input.discordUserId, username: input.username,
      signup_data: input.signupData, avatar_url: input.avatarUrl, last_avatar_check: new Date(),
    }).onConflictDoNothing().returning({ id: matchParticipants.id });
    if (inserted.length === 0) return { status: 'duplicate' as const };
    await tx.update(matches).set({ updated_at: new Date() }).where(eq(matches.id, input.matchId));
    return { status: 'added' as const, id };
  });
}

export interface BulkParticipantInput {
  user_id: string;
  discord_user_id: string | null;
  username: string;
  receives_map_codes?: boolean;
}

/**
 * Add several players to a match at once (tournament rosters), optionally linked to a match_teams row. Players already
 * in the match are left alone (unique match + user). Returns how many rows were inserted.
 */
export async function addParticipantsBulk(ex: Executor, matchId: string, members: BulkParticipantInput[], matchTeamId?: string | null): Promise<number> {
  if (members.length === 0) return 0;
  const inserted = await ex.insert(matchParticipants).values(members.map((m) => ({
    id: genId('participant'), match_id: matchId, user_id: m.user_id, discord_user_id: m.discord_user_id, username: m.username,
    receives_map_codes: !!m.receives_map_codes, team_id: matchTeamId ?? null,
  }))).onConflictDoNothing().returning({ id: matchParticipants.id });
  return inserted.length;
}

/** Remove a signup by user id; returns whether a row was removed. */
export async function removeParticipantByUser(ex: Executor, matchId: string, userId: string): Promise<boolean> {
  return ex.transaction(async (tx) => {
    const rows = await tx.delete(matchParticipants)
      .where(and(eq(matchParticipants.match_id, matchId), eq(matchParticipants.user_id, userId)))
      .returning({ id: matchParticipants.id });
    if (rows.length > 0) await tx.update(matches).set({ updated_at: new Date() }).where(eq(matches.id, matchId));
    return rows.length > 0;
  });
}

export async function setReceivesMapCodes(ex: Executor, matchId: string, participantId: string, value: boolean): Promise<void> {
  await ex.update(matchParticipants).set({ receives_map_codes: value })
    .where(and(eq(matchParticipants.id, participantId), eq(matchParticipants.match_id, matchId)));
}

/** Players who get map-code / winner-vote DMs (commanders with a Discord account). */
export async function listCommanders(ex: Executor, matchId: string): Promise<ParticipantRow[]> {
  return ex.select().from(matchParticipants)
    .where(and(eq(matchParticipants.match_id, matchId), eq(matchParticipants.receives_map_codes, true), isNotNull(matchParticipants.discord_user_id)))
    .orderBy(asc(matchParticipants.username), asc(matchParticipants.id));
}

export async function countCommanders(ex: Executor, matchId: string): Promise<number> {
  const [row] = await ex.select({ cnt: count() }).from(matchParticipants)
    .where(and(eq(matchParticipants.match_id, matchId), eq(matchParticipants.receives_map_codes, true), isNotNull(matchParticipants.discord_user_id)));
  return row?.cnt ?? 0;
}

/** Ids of the given participants that belong to the match. */
export async function filterMatchParticipantIds(ex: Executor, matchId: string, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await ex.select({ id: matchParticipants.id }).from(matchParticipants)
    .where(and(eq(matchParticipants.match_id, matchId), inArray(matchParticipants.id, [...ids])));
  return new Set(rows.map((r) => r.id));
}

export async function listParticipantIds(ex: Executor, matchId: string): Promise<Set<string>> {
  const rows = await ex.select({ id: matchParticipants.id }).from(matchParticipants).where(eq(matchParticipants.match_id, matchId));
  return new Set(rows.map((r) => r.id));
}

// ─── Setup phase (grid order / qualifying) ───────────────────────────────────

export async function listSetupParticipants(ex: Executor, matchId: string) {
  return ex.select({
    id: matchParticipants.id, username: matchParticipants.username, avatar_url: matchParticipants.avatar_url,
    grid_position: matchParticipants.grid_position, qualifying_time_ms: matchParticipants.qualifying_time_ms,
  }).from(matchParticipants).where(eq(matchParticipants.match_id, matchId))
    .orderBy(sql`${matchParticipants.grid_position} ASC NULLS LAST`, asc(matchParticipants.joined_at), asc(matchParticipants.id));
}

export class SetupStatusError extends Error {
  constructor(public status: string) {
    super(`Setup can only be changed while the match is in gather or assign (current: ${status})`);
    this.name = 'SetupStatusError';
  }
}

/**
 * Persist grid order / qualifying times atomically. The status check is repeated under the match row lock so a
 * concurrent transition to battle can't interleave with the writes. Throws SetupStatusError outside gather/assign.
 */
export async function saveSetup(
  ex: Executor,
  matchId: string,
  input: { gridOrder?: string[]; qualifyingTimes?: Record<string, number | null> },
): Promise<void> {
  await ex.transaction(async (tx) => {
    const match = await lockMatch(tx, matchId);
    if (match && match.status !== 'gather' && match.status !== 'assign') throw new SetupStatusError(match.status);
    if (input.gridOrder !== undefined) {
      await tx.update(matchParticipants).set({ grid_position: null }).where(eq(matchParticipants.match_id, matchId));
      for (let i = 0; i < input.gridOrder.length; i++) {
        await tx.update(matchParticipants).set({ grid_position: i + 1 })
          .where(and(eq(matchParticipants.id, input.gridOrder[i]), eq(matchParticipants.match_id, matchId)));
      }
    }
    if (input.qualifyingTimes !== undefined) {
      for (const [id, ms] of Object.entries(input.qualifyingTimes)) {
        await tx.update(matchParticipants).set({ qualifying_time_ms: ms === null ? null : Math.round(ms) })
          .where(and(eq(matchParticipants.id, id), eq(matchParticipants.match_id, matchId)));
      }
    }
  });
}

export type ParticipantDto = Omit<ParticipantRow, 'match_id' | 'last_avatar_check' | 'failed_avatar_checks' | 'grid_position' | 'qualifying_time_ms'> & {
  team_assignment: 'blue' | 'red' | 'reserve' | null;
};

/**
 * Participants as the API returns them. `team_assignment` ('blue' | 'red' | 'reserve') is derived from the team
 * (team_order 0 / 1 / reserve) because the legacy column is gone; it is null for other teams and unassigned players.
 */
export async function listParticipantDtos(ex: Executor, matchId: string): Promise<ParticipantDto[]> {
  const rows = await ex
    .select({
      id: matchParticipants.id, user_id: matchParticipants.user_id, discord_user_id: matchParticipants.discord_user_id,
      username: matchParticipants.username, avatar_url: matchParticipants.avatar_url, joined_at: matchParticipants.joined_at,
      signup_data: matchParticipants.signup_data, team_id: matchParticipants.team_id, receives_map_codes: matchParticipants.receives_map_codes,
      team_order: matchTeams.team_order, is_reserve: matchTeams.is_reserve,
    })
    .from(matchParticipants).leftJoin(matchTeams, eq(matchTeams.id, matchParticipants.team_id))
    .where(eq(matchParticipants.match_id, matchId))
    .orderBy(asc(matchParticipants.joined_at), asc(matchParticipants.id));
  return rows.map(({ team_order, is_reserve, ...p }) => ({
    ...p,
    team_assignment: is_reserve ? 'reserve' : team_order === 0 ? 'blue' : team_order === 1 ? 'red' : null,
  }));
}

export type TeamSideLabel = 'blue' | 'red' | 'reserve';

export interface DmRecipient {
  id: string;
  discord_user_id: string;
  username: string;
  /** 'blue' (team_order 0), 'red' (team_order 1), 'reserve', or undefined when unassigned / a further team. */
  team_assignment: TeamSideLabel | undefined;
  signup_data: Record<string, unknown> | null;
}

/** Participants with a Discord account (optionally only the commanders that receive map codes), with their team side. */
export async function listDmRecipients(ex: Executor, matchId: string, opts: { commandersOnly?: boolean } = {}): Promise<DmRecipient[]> {
  const rows = await ex
    .select({
      id: matchParticipants.id, discord_user_id: matchParticipants.discord_user_id, username: matchParticipants.username,
      signup_data: matchParticipants.signup_data, team_order: matchTeams.team_order, is_reserve: matchTeams.is_reserve,
    })
    .from(matchParticipants).leftJoin(matchTeams, eq(matchTeams.id, matchParticipants.team_id))
    .where(and(
      eq(matchParticipants.match_id, matchId), isNotNull(matchParticipants.discord_user_id),
      opts.commandersOnly ? eq(matchParticipants.receives_map_codes, true) : undefined,
    ))
    .orderBy(asc(matchParticipants.joined_at), asc(matchParticipants.id));
  return rows.map((r) => ({
    id: r.id,
    discord_user_id: r.discord_user_id as string,
    username: r.username,
    signup_data: r.signup_data,
    team_assignment: r.is_reserve ? 'reserve' : r.team_order === 0 ? 'blue' : r.team_order === 1 ? 'red' : undefined,
  }));
}

// ─── Avatar refresh (scheduler) ──────────────────────────────────────────────

const AVATAR_FAILURE_LIMIT = 3;

/** Distinct Discord users in active matches whose avatar is still worth refreshing (< 3 consecutive failures). */
export async function listAvatarRefreshUsers(ex: Executor): Promise<string[]> {
  const rows = await ex.select({ discord_user_id: matchParticipants.discord_user_id }).from(matchParticipants)
    .innerJoin(matches, eq(matches.id, matchParticipants.match_id))
    .where(and(isNotNull(matchParticipants.discord_user_id), lt(matchParticipants.failed_avatar_checks, AVATAR_FAILURE_LIMIT), notInArray(matches.status, ['complete', 'cancelled'])))
    .groupBy(matchParticipants.discord_user_id)
    .orderBy(sql`min(${matchParticipants.joined_at})`, asc(matchParticipants.discord_user_id));
  return rows.map((r) => r.discord_user_id as string);
}

/** Distinct users in active matches skipped for having too many failed avatar checks. */
export async function countAvatarUsersSkipped(ex: Executor): Promise<number> {
  const [row] = await ex.select({ cnt: sql<number>`count(distinct ${matchParticipants.discord_user_id})`.mapWith(Number) }).from(matchParticipants)
    .innerJoin(matches, eq(matches.id, matchParticipants.match_id))
    .where(and(isNotNull(matchParticipants.discord_user_id), gte(matchParticipants.failed_avatar_checks, AVATAR_FAILURE_LIMIT), notInArray(matches.status, ['complete', 'cancelled'])));
  return row?.cnt ?? 0;
}

/** Store a fresh avatar for every participant record of this Discord user; success resets the failure count. */
export async function recordAvatarRefreshed(ex: Executor, discordUserId: string, avatarUrl: string | null): Promise<void> {
  await ex.update(matchParticipants).set({ avatar_url: avatarUrl, last_avatar_check: new Date(), failed_avatar_checks: 0 }).where(eq(matchParticipants.discord_user_id, discordUserId));
}

/** A failed fetch: remember the attempt but keep the old avatar. */
export async function recordAvatarCheckFailed(ex: Executor, discordUserId: string): Promise<void> {
  await ex.update(matchParticipants).set({ last_avatar_check: new Date() }).where(eq(matchParticipants.discord_user_id, discordUserId));
}

export async function incrementAvatarFailures(ex: Executor, discordUserId: string): Promise<void> {
  await ex.update(matchParticipants).set({ failed_avatar_checks: sql`${matchParticipants.failed_avatar_checks} + 1` }).where(eq(matchParticipants.discord_user_id, discordUserId));
}
