/** `tournament_teams`, `tournament_team_members` and `tournament_participants` (signups). */
import { and, asc, count, eq, inArray, or, sql } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { tournamentMatches, tournamentParticipants, tournamentTeamMembers, tournamentTeams } from '../../../lib/db/schema';
import { genId } from '../matches/ids';
import { lockTournament, touchTournament, TournamentError } from './tournaments';

export type TournamentTeamRow = typeof tournamentTeams.$inferSelect;
export type TournamentMemberRow = typeof tournamentTeamMembers.$inferSelect;
export type TournamentParticipantRow = typeof tournamentParticipants.$inferSelect;

export interface TeamMemberDto {
  id: string;
  team_id: string;
  user_id: string;
  discord_user_id?: string;
  username: string;
  avatar_url?: string;
  joined_at: Date;
  is_captain: boolean;
}
export type TeamDto = TournamentTeamRow & { members: TeamMemberDto[] };

// ─── teams ───────────────────────────────────────────────────────────────────

export async function getTeamName(ex: Executor, teamId: string): Promise<string | undefined> {
  const [row] = await ex.select({ n: tournamentTeams.team_name }).from(tournamentTeams).where(eq(tournamentTeams.id, teamId));
  return row?.n;
}

export async function listTeamNames(ex: Executor, teamIds: string[]): Promise<Map<string, string>> {
  if (teamIds.length === 0) return new Map();
  const rows = await ex.select({ id: tournamentTeams.id, n: tournamentTeams.team_name }).from(tournamentTeams).where(inArray(tournamentTeams.id, teamIds));
  return new Map(rows.map((r) => [r.id, r.n]));
}

/** Teams of a tournament by name (signup team picker). */
export async function listTeamsByName(ex: Executor, tournamentId: string): Promise<Array<{ id: string; team_name: string }>> {
  return ex.select({ id: tournamentTeams.id, team_name: tournamentTeams.team_name }).from(tournamentTeams)
    .where(eq(tournamentTeams.tournament_id, tournamentId)).orderBy(asc(tournamentTeams.team_name), asc(tournamentTeams.id));
}

/** Teams with their members, teams by name, members by join time. `withAvatars` also looks up each member's last known avatar. */
export async function listTeamsWithMembers(ex: Executor, tournamentId: string, opts: { withAvatars?: boolean } = {}): Promise<TeamDto[]> {
  const ttm = tournamentTeamMembers;
  const avatar = opts.withAvatars
    ? sql<string | null>`(select mp.avatar_url from match_participants mp where mp.discord_user_id = "tournament_team_members"."discord_user_id" and mp.avatar_url is not null limit 1)`
    : sql<string | null>`null`;
  const rows = await ex
    .select({
      team: tournamentTeams,
      member: ttm,
      avatar_url: avatar,
    })
    .from(tournamentTeams).leftJoin(ttm, eq(ttm.team_id, tournamentTeams.id))
    .where(eq(tournamentTeams.tournament_id, tournamentId))
    .orderBy(asc(tournamentTeams.team_name), asc(tournamentTeams.id), asc(ttm.joined_at), asc(ttm.id));

  const teams = new Map<string, TeamDto>();
  for (const row of rows) {
    let team = teams.get(row.team.id);
    if (!team) {
      team = { ...row.team, members: [] };
      teams.set(row.team.id, team);
    }
    if (row.member) {
      team.members.push({
        id: row.member.id,
        team_id: row.team.id,
        user_id: row.member.user_id,
        discord_user_id: row.member.discord_user_id ?? undefined,
        username: row.member.username,
        ...(opts.withAvatars ? { avatar_url: row.avatar_url ?? undefined } : {}),
        joined_at: row.member.joined_at,
        is_captain: row.member.is_captain,
      });
    }
  }
  return [...teams.values()];
}

/**
 * Create a team. The name must be unique inside the tournament: checked under the tournament row lock so two simultaneous
 * requests can't both create "Team A". Throws TournamentError (404 / 409).
 */
export async function createTeam(ex: Executor, tournamentId: string, teamName: string): Promise<TournamentTeamRow> {
  return ex.transaction(async (tx) => {
    if (!(await lockTournament(tx, tournamentId))) throw new TournamentError('Tournament not found', 404);
    const [existing] = await tx.select({ id: tournamentTeams.id }).from(tournamentTeams)
      .where(and(eq(tournamentTeams.tournament_id, tournamentId), eq(tournamentTeams.team_name, teamName)));
    if (existing) throw new TournamentError('Team name already exists in this tournament', 409);
    const [row] = await tx.insert(tournamentTeams).values({ id: genId('team'), tournament_id: tournamentId, team_name: teamName }).returning();
    await touchTournament(tx, tournamentId);
    return row;
  });
}

export interface TeamAssignmentInput {
  teamId: string;
  members?: Array<{ userId: string; username: string; isCaptain?: boolean }>;
}

/**
 * Replace every team's roster. Teams must belong to the tournament; members must be signed-up participants and appear on
 * at most one team. Runs under the tournament row lock so it can't interleave with bracket generation or another save.
 */
export async function assignTeamMembers(ex: Executor, tournamentId: string, teams: TeamAssignmentInput[]): Promise<void> {
  await ex.transaction(async (tx) => {
    if (!(await lockTournament(tx, tournamentId))) throw new TournamentError('Tournament not found', 404);

    const owned = new Set((await tx.select({ id: tournamentTeams.id }).from(tournamentTeams).where(eq(tournamentTeams.tournament_id, tournamentId))).map((t) => t.id));
    if (teams.some((t) => !t || typeof t.teamId !== 'string' || !owned.has(t.teamId))) {
      throw new TournamentError('teams contains a team that does not belong to this tournament', 400);
    }

    const participants = await tx.select({ user_id: tournamentParticipants.user_id, discord_user_id: tournamentParticipants.discord_user_id })
      .from(tournamentParticipants).where(eq(tournamentParticipants.tournament_id, tournamentId));
    const discordByUser = new Map(participants.map((p) => [p.user_id, p.discord_user_id]));
    const seen = new Set<string>();
    for (const team of teams) {
      for (const member of team.members ?? []) {
        if (!member || typeof member.userId !== 'string' || !discordByUser.has(member.userId)) {
          throw new TournamentError(`Member ${member?.userId ?? '(missing userId)'} is not a participant of this tournament`, 400);
        }
        if (seen.has(member.userId)) throw new TournamentError(`Member ${member.userId} is assigned to more than one team`, 400);
        seen.add(member.userId);
      }
    }

    await tx.delete(tournamentTeamMembers).where(inArray(tournamentTeamMembers.team_id, [...owned]));
    await tx.update(tournamentParticipants).set({ team_assignment: null }).where(eq(tournamentParticipants.tournament_id, tournamentId));

    for (const team of teams) {
      for (const member of team.members ?? []) {
        await tx.insert(tournamentTeamMembers).values({
          id: genId('member'), team_id: team.teamId, user_id: member.userId, discord_user_id: discordByUser.get(member.userId) || null,
          username: member.username, is_captain: !!member.isCaptain,
        });
        await tx.update(tournamentParticipants).set({ team_assignment: team.teamId })
          .where(and(eq(tournamentParticipants.tournament_id, tournamentId), eq(tournamentParticipants.user_id, member.userId)));
      }
    }
    await touchTournament(tx, tournamentId);
  });
}

/** Delete a team that is not part of the generated bracket. Throws TournamentError (404 / 409). */
export async function deleteTeam(ex: Executor, tournamentId: string, teamId: string): Promise<void> {
  await ex.transaction(async (tx) => {
    if (!(await lockTournament(tx, tournamentId))) throw new TournamentError('Team not found', 404);
    const [team] = await tx.select({ id: tournamentTeams.id }).from(tournamentTeams)
      .where(and(eq(tournamentTeams.id, teamId), eq(tournamentTeams.tournament_id, tournamentId)));
    if (!team) throw new TournamentError('Team not found', 404);

    const inBracket = await tx.select({ id: tournamentMatches.match_id }).from(tournamentMatches)
      .where(and(eq(tournamentMatches.tournament_id, tournamentId), or(eq(tournamentMatches.team1_id, teamId), eq(tournamentMatches.team2_id, teamId)))).limit(1);
    if (inBracket.length > 0) throw new TournamentError('Cannot delete a team that is part of the generated bracket', 409);

    // Members cascade; participants' team_assignment is SET NULL by its FK.
    await tx.delete(tournamentTeams).where(eq(tournamentTeams.id, teamId));
    await touchTournament(tx, tournamentId);
  });
}

export async function countTeams(ex: Executor, tournamentId: string): Promise<number> {
  const [row] = await ex.select({ n: count() }).from(tournamentTeams).where(eq(tournamentTeams.tournament_id, tournamentId));
  return row?.n ?? 0;
}

/** Number of team-member rows over all teams of the tournament. */
export async function countTeamMembers(ex: Executor, tournamentId: string): Promise<number> {
  const [row] = await ex.select({ n: count() }).from(tournamentTeamMembers)
    .innerJoin(tournamentTeams, eq(tournamentTeams.id, tournamentTeamMembers.team_id)).where(eq(tournamentTeams.tournament_id, tournamentId));
  return row?.n ?? 0;
}

/** Distinct players on teams (what the transition response reports as `participant_count`). */
export async function countTeamMemberUsers(ex: Executor, tournamentId: string): Promise<number> {
  const [row] = await ex.select({ n: sql<number>`count(distinct ${tournamentTeamMembers.user_id})`.mapWith(Number) }).from(tournamentTeamMembers)
    .innerJoin(tournamentTeams, eq(tournamentTeams.id, tournamentTeamMembers.team_id)).where(eq(tournamentTeams.tournament_id, tournamentId));
  return row?.n ?? 0;
}

export async function listTeamMemberNames(ex: Executor, teamId: string) {
  return ex.select({ username: tournamentTeamMembers.username, discord_user_id: tournamentTeamMembers.discord_user_id })
    .from(tournamentTeamMembers).where(eq(tournamentTeamMembers.team_id, teamId)).orderBy(asc(tournamentTeamMembers.username), asc(tournamentTeamMembers.id));
}

/** The team a player sits on in this tournament (matched by Discord id or user id), if any. */
export async function findTeamIdForPlayer(ex: Executor, tournamentId: string, discordUserId: string, userId: string): Promise<string | undefined> {
  const [row] = await ex.select({ team_id: tournamentTeamMembers.team_id }).from(tournamentTeamMembers)
    .innerJoin(tournamentTeams, eq(tournamentTeams.id, tournamentTeamMembers.team_id))
    .where(and(eq(tournamentTeams.tournament_id, tournamentId), or(eq(tournamentTeamMembers.discord_user_id, discordUserId), eq(tournamentTeamMembers.user_id, userId))))
    .orderBy(asc(tournamentTeamMembers.joined_at), asc(tournamentTeamMembers.id)).limit(1);
  return row?.team_id;
}

// ─── participants (signups) ──────────────────────────────────────────────────

export async function listParticipants(ex: Executor, tournamentId: string): Promise<TournamentParticipantRow[]> {
  return ex.select().from(tournamentParticipants).where(eq(tournamentParticipants.tournament_id, tournamentId))
    .orderBy(asc(tournamentParticipants.joined_at), asc(tournamentParticipants.id));
}

export async function isSignedUp(ex: Executor, tournamentId: string, userId: string): Promise<boolean> {
  const rows = await ex.select({ id: tournamentParticipants.id }).from(tournamentParticipants)
    .where(and(eq(tournamentParticipants.tournament_id, tournamentId), eq(tournamentParticipants.user_id, userId))).limit(1);
  return rows.length > 0;
}

export async function countParticipants(ex: Executor, tournamentId: string): Promise<number> {
  const [row] = await ex.select({ n: count() }).from(tournamentParticipants).where(eq(tournamentParticipants.tournament_id, tournamentId));
  return row?.n ?? 0;
}

export interface AddTournamentParticipantInput {
  tournamentId: string;
  userId: string;
  discordUserId: string | null;
  username: string;
  signupData: Record<string, unknown> | null;
  /** Team the player picked while signing up (only when the tournament allows it). */
  teamId?: string | null;
}

/**
 * Sign a player up (and onto their chosen team). The unique (tournament, user) key makes a double submit a `duplicate`
 * instead of a second row; capacity (`max_participants`) is checked under the tournament row lock.
 */
export async function addParticipant(
  ex: Executor,
  input: AddTournamentParticipantInput,
  opts: { capacity?: number | null } = {},
): Promise<{ status: 'added'; id: string } | { status: 'duplicate' | 'full' }> {
  return ex.transaction(async (tx) => {
    await lockTournament(tx, input.tournamentId);
    if (await isSignedUp(tx, input.tournamentId, input.userId)) return { status: 'duplicate' as const };
    if (opts.capacity != null && (await countParticipants(tx, input.tournamentId)) >= opts.capacity) return { status: 'full' as const };

    const id = genId('participant');
    const inserted = await tx.insert(tournamentParticipants).values({
      id, tournament_id: input.tournamentId, user_id: input.userId, discord_user_id: input.discordUserId ?? input.userId,
      username: input.username, signup_data: input.signupData, team_assignment: input.teamId ?? null,
    }).onConflictDoNothing().returning({ id: tournamentParticipants.id });
    if (inserted.length === 0) return { status: 'duplicate' as const };

    if (input.teamId) {
      await tx.insert(tournamentTeamMembers).values({
        id: genId('member'), team_id: input.teamId, user_id: input.userId, discord_user_id: input.discordUserId ?? input.userId, username: input.username,
      }).onConflictDoNothing();
    }
    await touchTournament(tx, input.tournamentId);
    return { status: 'added' as const, id };
  });
}
