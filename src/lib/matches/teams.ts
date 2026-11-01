/** match_teams: team creation per scoring_type at the gather -> assign transition, team lookups and assignment. */
import { and, asc, count, eq, isNull, notInArray, or, sql } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { matches, matchParticipants, matchTeams, gameModes } from '../../../lib/db/schema';
import { genId } from './ids';

export const MAX_VOICE_CHANNELS_PER_MATCH = 8;
export const MIN_TEAM_COUNT = 2;
export const MAX_TEAM_COUNT = 16;

const NORMAL_TEAMS = [
  { name: 'Blue', color: '#4A90E2', order: 0 },
  { name: 'Red', color: '#E04A4A', order: 1 },
];

export type MatchTeamRow = typeof matchTeams.$inferSelect;

/** Typed error for invalid team references so API routes can answer 400 instead of 500. */
export class TeamAssignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TeamAssignmentError';
  }
}

function clampTeamCount(n: number): number {
  if (!Number.isFinite(n)) return 2;
  return Math.min(MAX_TEAM_COUNT, Math.max(MIN_TEAM_COUNT, Math.floor(n)));
}

/** Serialise concurrent team (re)creation / assignment for one match. Must be called inside a transaction. */
export async function lockMatch(ex: Executor, matchId: string): Promise<typeof matches.$inferSelect | undefined> {
  const [row] = await ex.select().from(matches).where(eq(matches.id, matchId)).for('update');
  return row;
}

async function countActiveTeams(ex: Executor, matchId: string): Promise<number> {
  const [row] = await ex.select({ cnt: count() }).from(matchTeams)
    .where(and(eq(matchTeams.match_id, matchId), eq(matchTeams.is_reserve, false)));
  return row?.cnt ?? 0;
}

/**
 * Create match_teams rows for a match based on its game mode's scoring_type. Idempotent. Re-running fills gaps: a
 * Normal match missing its Reserve row gets one, and FFA/Position participants without a team (late joiners) get one.
 *
 * Team count (Normal mode): explicit `teamCount` > the match's own `team_count` > the mode's `max_teams` > 2, clamped
 * to 2..16. Position mode with `team_size > 1` groups participants into `max_teams` team-endurance teams round-robin
 * in join order; otherwise every participant gets their own one-person team, same as FFA.
 *
 * Race: runs under a row lock on the match so two concurrent callers (transition + teams GET safety net) cannot both
 * see "no teams yet" and double-create.
 */
export async function createMatchTeams(ex: Executor, matchId: string, teamCount?: number): Promise<void> {
  await ex.transaction(async (tx) => {
    const match = await lockMatch(tx, matchId);
    if (!match) return;

    const [mode] = match.mode_id
      ? await tx.select({ scoring_type: gameModes.scoring_type, max_teams: gameModes.max_teams, team_size: gameModes.team_size })
          .from(gameModes).where(and(eq(gameModes.id, match.mode_id), eq(gameModes.game_id, match.game_id))).limit(1)
      : [];
    const scoringType = mode?.scoring_type ?? 'Normal';
    const hasTeams = (await countActiveTeams(tx, matchId)) > 0;

    if (scoringType === 'Normal') {
      if (!hasTeams) {
        const resolved = teamCount ?? match.team_count ?? mode?.max_teams ?? 2;
        await createNormalTeams(tx, matchId, clampTeamCount(resolved > 0 ? resolved : 2));
      } else {
        await ensureReserveTeam(tx, matchId);
      }
    } else if (scoringType === 'Position' && (mode?.team_size ?? 1) > 1) {
      if (!hasTeams) {
        await createTeamEnduranceTeams(tx, matchId, clampTeamCount(mode?.max_teams ?? 2), mode!.team_size!);
      } else {
        await placeLateEnduranceJoiners(tx, matchId, mode!.team_size!);
      }
    } else {
      await createPerParticipantTeams(tx, matchId);
    }

    await tx.update(matches).set({ team_count: (await countActiveTeams(tx, matchId)) || 2 }).where(eq(matches.id, matchId));
  });
}

async function ensureReserveTeam(ex: Executor, matchId: string): Promise<string> {
  const find = async () => (await ex.select({ id: matchTeams.id }).from(matchTeams)
    .where(and(eq(matchTeams.match_id, matchId), eq(matchTeams.is_reserve, true))).limit(1))[0]?.id;
  const existing = await find();
  if (existing) return existing;
  const id = genId('mt');
  await ex.insert(matchTeams)
    .values({ id, match_id: matchId, team_name: 'Reserve', team_color: null, team_order: 99, is_reserve: true })
    .onConflictDoNothing();
  return (await find()) ?? id;
}

/**
 * Create (or reuse) N non-reserve teams with explicit names/colours; team_order = array index. Idempotent: existing
 * rows for an order are reused as-is. Returns the match_teams ids in order.
 */
export async function createNamedMatchTeams(
  ex: Executor,
  matchId: string,
  teams: Array<{ name: string; color?: string | null }>,
): Promise<string[]> {
  return ex.transaction(async (tx) => {
    await lockMatch(tx, matchId);
    const ids: string[] = [];
    for (let i = 0; i < teams.length; i++) {
      const [existing] = await tx.select({ id: matchTeams.id }).from(matchTeams)
        .where(and(eq(matchTeams.match_id, matchId), eq(matchTeams.team_order, i), eq(matchTeams.is_reserve, false)));
      if (existing) {
        ids.push(existing.id);
        continue;
      }
      const [row] = await tx.insert(matchTeams)
        .values({ id: genId('mt'), match_id: matchId, team_name: teams[i].name, team_color: teams[i].color ?? null, team_order: i, is_reserve: false })
        .returning({ id: matchTeams.id });
      ids.push(row.id);
    }
    await tx.update(matches).set({ team_count: (await countActiveTeams(tx, matchId)) || teams.length }).where(eq(matches.id, matchId));
    return ids;
  });
}

async function createNormalTeams(ex: Executor, matchId: string, teamCount: number): Promise<void> {
  const teams = teamCount <= 2
    ? NORMAL_TEAMS
    : Array.from({ length: teamCount }, (_, i) => ({ name: `Team ${i + 1}`, color: null as string | null, order: i }));
  await ex.insert(matchTeams)
    .values(teams.map((t) => ({ id: genId('mt'), match_id: matchId, team_name: t.name, team_color: t.color ?? null, team_order: t.order, is_reserve: false })))
    .onConflictDoNothing();
  await ensureReserveTeam(ex, matchId);
}

async function listParticipantsOrdered(ex: Executor, matchId: string) {
  return ex.select({ id: matchParticipants.id, username: matchParticipants.username, team_id: matchParticipants.team_id })
    .from(matchParticipants).where(eq(matchParticipants.match_id, matchId))
    .orderBy(asc(matchParticipants.joined_at), asc(matchParticipants.id));
}

/** Team-endurance Position: `teamCount` teams, participants round-robin by join order; overflow goes to Reserve. */
async function createTeamEnduranceTeams(ex: Executor, matchId: string, teamCount: number, teamSize: number): Promise<void> {
  const participants = await listParticipantsOrdered(ex, matchId);
  const teamIds: string[] = [];
  const rows = Array.from({ length: teamCount }, (_, i) => {
    const id = genId('mt');
    teamIds.push(id);
    return { id, match_id: matchId, team_name: `Team ${i + 1}`, team_color: null, team_order: i, is_reserve: false };
  });
  await ex.insert(matchTeams).values(rows).onConflictDoNothing();
  const reserveId = await ensureReserveTeam(ex, matchId);
  const capacity = teamCount * teamSize;
  for (let i = 0; i < participants.length; i++) {
    const teamId = i < capacity ? teamIds[i % teamCount] : reserveId;
    await ex.update(matchParticipants).set({ team_id: teamId }).where(eq(matchParticipants.id, participants[i].id));
  }
}

async function unplacedParticipants(ex: Executor, matchId: string) {
  const own = ex.select({ id: matchTeams.id }).from(matchTeams).where(eq(matchTeams.match_id, matchId));
  return ex.select({ id: matchParticipants.id, username: matchParticipants.username }).from(matchParticipants)
    .where(and(eq(matchParticipants.match_id, matchId), or(isNull(matchParticipants.team_id), notInArray(matchParticipants.team_id, own))))
    .orderBy(asc(matchParticipants.joined_at), asc(matchParticipants.id));
}

/** Team-endurance late joiners: fill the emptiest team with room, else Reserve. */
async function placeLateEnduranceJoiners(ex: Executor, matchId: string, teamSize: number): Promise<void> {
  const unplaced = await unplacedParticipants(ex, matchId);
  if (unplaced.length === 0) return;
  const reserveId = await ensureReserveTeam(ex, matchId);
  for (const p of unplaced) {
    const [target] = await ex
      .select({ id: matchTeams.id, cnt: count(matchParticipants.id) })
      .from(matchTeams)
      .leftJoin(matchParticipants, eq(matchParticipants.team_id, matchTeams.id))
      .where(and(eq(matchTeams.match_id, matchId), eq(matchTeams.is_reserve, false)))
      .groupBy(matchTeams.id, matchTeams.team_order)
      .orderBy(asc(count(matchParticipants.id)), asc(matchTeams.team_order))
      .limit(1);
    const teamId = target && target.cnt < teamSize ? target.id : reserveId;
    await ex.update(matchParticipants).set({ team_id: teamId }).where(eq(matchParticipants.id, p.id));
  }
}

/** FFA / individual Position: one team per participant; adds rows only for participants lacking one. */
async function createPerParticipantTeams(ex: Executor, matchId: string): Promise<void> {
  const participants = await unplacedParticipants(ex, matchId);
  if (participants.length === 0) return;
  const [maxRow] = await ex.select({ max_order: sql<number | null>`max(${matchTeams.team_order})`.mapWith((v) => (v === null ? null : Number(v))) })
    .from(matchTeams).where(and(eq(matchTeams.match_id, matchId), eq(matchTeams.is_reserve, false)));
  let nextOrder = (maxRow?.max_order ?? -1) + 1;
  for (const p of participants) {
    const id = genId('mt');
    await ex.insert(matchTeams).values({ id, match_id: matchId, team_name: p.username, team_color: null, team_order: nextOrder++, is_reserve: false });
    await ex.update(matchParticipants).set({ team_id: id }).where(eq(matchParticipants.id, p.id));
  }
}

/**
 * Resolve a team reference ('blue' | 'red' | 'reserve' | match_teams.id) to a team row of the given match.
 * Throws TeamAssignmentError if it does not resolve.
 */
export async function resolveMatchTeam(ex: Executor, matchId: string, teamRef: string): Promise<MatchTeamRow> {
  let where;
  if (teamRef === 'blue') where = and(eq(matchTeams.match_id, matchId), eq(matchTeams.team_order, 0), eq(matchTeams.is_reserve, false));
  else if (teamRef === 'red') where = and(eq(matchTeams.match_id, matchId), eq(matchTeams.team_order, 1), eq(matchTeams.is_reserve, false));
  else if (teamRef === 'reserve') where = and(eq(matchTeams.match_id, matchId), eq(matchTeams.is_reserve, true));
  else where = and(eq(matchTeams.id, teamRef), eq(matchTeams.match_id, matchId));
  const [row] = await ex.select().from(matchTeams).where(where).limit(1);
  if (!row) throw new TeamAssignmentError(`Team '${teamRef}' does not belong to match ${matchId}`);
  return row;
}

/**
 * Assign a participant to a team within a match. Accepts 'blue'/'red'/'reserve' or a match_teams.id belonging to
 * `matchId`. Throws TeamAssignmentError for an unknown team or participant.
 */
export async function assignParticipantToTeam(ex: Executor, matchId: string, participantId: string, teamRef: string): Promise<void> {
  const team = await resolveMatchTeam(ex, matchId, teamRef);
  const updated = await ex.update(matchParticipants).set({ team_id: team.id })
    .where(and(eq(matchParticipants.id, participantId), eq(matchParticipants.match_id, matchId)))
    .returning({ id: matchParticipants.id });
  if (updated.length === 0) throw new TeamAssignmentError(`Participant '${participantId}' does not belong to match ${matchId}`);
}

/** All match_teams for a match (active teams first by team_order, Reserve last). */
export async function getMatchTeams(ex: Executor, matchId: string): Promise<MatchTeamRow[]> {
  return ex.select().from(matchTeams).where(eq(matchTeams.match_id, matchId))
    .orderBy(asc(matchTeams.is_reserve), asc(matchTeams.team_order));
}

/** Update voice_channel_id on a match_teams row; scoped to `matchId` when given (TeamAssignmentError if it doesn't belong). */
export async function setTeamVoiceChannel(ex: Executor, teamId: string, channelId: string | null, matchId?: string): Promise<void> {
  const where = matchId ? and(eq(matchTeams.id, teamId), eq(matchTeams.match_id, matchId)) : eq(matchTeams.id, teamId);
  const updated = await ex.update(matchTeams).set({ voice_channel_id: channelId }).where(where).returning({ id: matchTeams.id });
  if (matchId && updated.length === 0) throw new TeamAssignmentError(`Team '${teamId}' does not belong to match ${matchId}`);
}

export interface TeamWithParticipants extends MatchTeamRow {
  participants: Array<{ username: string; discord_user_id: string | undefined }>;
}

/** Every match_teams row (active teams first, Reserve last) with its members, for Discord embeds. */
export async function listTeamsWithParticipants(ex: Executor, matchId: string): Promise<TeamWithParticipants[]> {
  const teams = await getMatchTeams(ex, matchId);
  if (teams.length === 0) return [];
  const members = await ex.select({ team_id: matchParticipants.team_id, username: matchParticipants.username, discord_user_id: matchParticipants.discord_user_id })
    .from(matchParticipants).where(eq(matchParticipants.match_id, matchId)).orderBy(asc(matchParticipants.username), asc(matchParticipants.id));
  return teams.map((team) => ({
    ...team,
    participants: members.filter((m) => m.team_id === team.id).map((m) => ({ username: m.username, discord_user_id: m.discord_user_id ?? undefined })),
  }));
}

/** Blue (team_order 0), red (team_order 1) and reserve/unassigned players of a match. */
export async function getTeamAssignments(ex: Executor, matchId: string): Promise<{
  blueTeam: Array<{ username: string; discord_user_id: string | undefined }>;
  redTeam: Array<{ username: string; discord_user_id: string | undefined }>;
  reserves: Array<{ username: string; discord_user_id: string | undefined }>;
}> {
  const rows = await ex
    .select({ username: matchParticipants.username, discord_user_id: matchParticipants.discord_user_id, team_order: matchTeams.team_order, is_reserve: matchTeams.is_reserve })
    .from(matchParticipants).leftJoin(matchTeams, and(eq(matchTeams.id, matchParticipants.team_id), eq(matchTeams.match_id, matchParticipants.match_id)))
    .where(eq(matchParticipants.match_id, matchId)).orderBy(asc(matchTeams.team_order), asc(matchParticipants.username));
  const dto = (r: (typeof rows)[number]) => ({ username: r.username, discord_user_id: r.discord_user_id ?? undefined });
  return {
    blueTeam: rows.filter((r) => r.team_order === 0 && !r.is_reserve).map(dto),
    redTeam: rows.filter((r) => r.team_order === 1 && !r.is_reserve).map(dto),
    reserves: rows.filter((r) => r.is_reserve || r.team_order === null).map(dto),
  };
}
