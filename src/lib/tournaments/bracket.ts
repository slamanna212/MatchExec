/**
 * Bracket generation and persistence. The pure math (pairing, map selection, naming) lives in `bracket-math.ts`; this
 * module reads the tournament, picks the mode/map pool, builds the matches to create and saves them.
 *
 * Everything takes an `Executor` and is meant to run inside the caller's transaction, with the tournament row locked
 * (`lockTournament`), so generating a round and recording its bye teams is atomic.
 */
import { v4 as uuidv4 } from 'uuid';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { matches, tournamentMatches, tournamentRoundByes, tournamentTeamMembers, tournamentTeams } from '../../../lib/db/schema';
import type { Announcement } from '../../../lib/db/schema/types';
import { getModeById, listMapsForModes, listModesByTeamSize, listNonWorkshopModes } from '../games';
import {
  VoiceChannelService, addParticipantsBulk, createMatchTeams, createNamedMatchTeams, createTournamentMatch, initializeMatchGames, newMatchId,
} from '../matches';
import type { AfterCommit } from '../matches/effects';
import { logger } from '../logger';
import {
  filterTournamentMaps, matchTitle, pairTeams, plannedMatchName, selectMapsForMatch, type GameMapLite, type GameModeLite,
} from './bracket-math';
import type { PlannedMatch } from './double-elimination';
import { listTeamNames } from './teams';
import { getTournament, TournamentError, type TournamentRow } from './tournaments';

export type { BracketFormat } from './bracket-math';
export { calculateTotalMatches, calculateTournamentRounds } from './bracket-math';

export type BracketType = 'winners' | 'losers' | 'final';

export interface BracketAssignment {
  position: number;
  teamId: string;
}

export interface TournamentMatchInfo {
  id: string;
  tournament_id: string;
  round: number;
  bracket_type: BracketType;
  team1_id?: string;
  team2_id?: string;
  match_order: number;
  parent_match1_id?: string;
  parent_match2_id?: string;
}

export interface GeneratedMatch {
  id: string;
  name: string;
  description?: string;
  game_id: string;
  game_mode_id: string;
  map_id: string;
  maps?: string[];
  rounds_per_match: number;
  max_participants: number;
  status: 'assign';
  match_type: 'tournament';
  tournament_id: string;
  tournament_round: number;
  tournament_bracket_type: string;
  rules?: string;
  scheduled_time?: Date;
  team1_name?: string;
  team2_name?: string;
  /** tournament_teams ids: team1 plays blue (order 0), team2 plays red (order 1). */
  team1_id?: string;
  team2_id?: string;
  event_image_url?: string | null;
  stats_enabled?: boolean;
  announcements?: Announcement[] | null;
  player_notifications?: boolean;
}

const FAR_FUTURE = new Date('2099-12-31T23:59:59.999Z');
const TOURNAMENT_TEAM_COLORS = { blue: '#4A90E2', red: '#E04A4A' } as const;

// ─── mode / map pool ─────────────────────────────────────────────────────────

interface BracketContext {
  tournament: TournamentRow;
  gameModes: GameModeLite[];
  tournamentMaps: GameMapLite[];
}

async function fetchGameData(ex: Executor, gameId: string, gameModeId: string) {
  // Overwatch 2 team-size options ("ow2-5v5") span all non-workshop modes
  if (gameId === 'overwatch2' && gameModeId?.startsWith('ow2-')) {
    const gameModes = await listNonWorkshopModes(ex, gameId);
    const gameMaps = await listMapsForModes(ex, gameId, gameModes.map((m) => m.id));
    if (gameModes.length === 0 || gameMaps.length === 0) throw new TournamentError('No game modes or maps found for Overwatch 2');
    return { gameModes, gameMaps };
  }

  const selectedMode = await getModeById(ex, gameModeId);
  if (!selectedMode) throw new TournamentError(`Game mode ${gameModeId} not found`);

  // All modes with the same team size (a NULL team size matches other NULL modes: FFA/Position)
  const gameModes = await listModesByTeamSize(ex, gameId, selectedMode.team_size);
  const gameMaps = await listMapsForModes(ex, gameId, gameModes.map((m) => m.id));
  if (gameModes.length === 0 || gameMaps.length === 0) throw new TournamentError('No game modes or maps found for this game and team size');
  return { gameModes, gameMaps };
}

async function loadContext(ex: Executor, tournamentId: string): Promise<BracketContext> {
  const tournament = await getTournament(ex, tournamentId);
  if (!tournament) throw new TournamentError('Tournament not found', 404);
  const { gameModes, gameMaps } = await fetchGameData(ex, tournament.game_id, tournament.game_mode_id ?? '');
  return { tournament, gameModes, tournamentMaps: filterTournamentMaps(gameMaps) };
}

// ─── byes ────────────────────────────────────────────────────────────────────

/** Record that a team sits a round out (picked up by the next round's pairing). Idempotent. */
export async function saveByeTeam(ex: Executor, tournamentId: string, round: number, bracketType: string, teamId: string): Promise<void> {
  await ex.insert(tournamentRoundByes).values({ id: uuidv4(), tournament_id: tournamentId, round, bracket_type: bracketType, team_id: teamId }).onConflictDoNothing();
}

export async function listByeTeamIds(ex: Executor, tournamentId: string, round: number, bracketType: string): Promise<string[]> {
  const rows = await ex.select({ team_id: tournamentRoundByes.team_id }).from(tournamentRoundByes)
    .where(and(eq(tournamentRoundByes.tournament_id, tournamentId), eq(tournamentRoundByes.round, round), eq(tournamentRoundByes.bracket_type, bracketType)))
    .orderBy(asc(tournamentRoundByes.created_at), asc(tournamentRoundByes.id));
  return rows.map((r) => r.team_id);
}

// ─── generation ──────────────────────────────────────────────────────────────

function buildMatch(
  ctx: BracketContext,
  names: Map<string, string>,
  p: { team1Id: string; team2Id: string; round: number; bracket: string; title?: string; fallback?: [string, string]; scheduledTime?: Date },
): GeneratedMatch {
  const { tournament } = ctx;
  const { selectedMaps, primaryMode } = selectMapsForMatch(tournament.rounds_per_match, ctx.gameModes, ctx.tournamentMaps);
  const team1Name = names.get(p.team1Id);
  const team2Name = names.get(p.team2Id);
  return {
    id: uuidv4(),
    name: p.title ?? matchTitle(team1Name, team2Name, p.fallback),
    description: tournament.description || undefined,
    game_id: tournament.game_id,
    game_mode_id: primaryMode.id,
    map_id: selectedMaps[0],
    maps: selectedMaps,
    rounds_per_match: tournament.rounds_per_match,
    max_participants: 12,
    status: 'assign',
    match_type: 'tournament',
    tournament_id: tournament.id,
    tournament_round: p.round,
    tournament_bracket_type: p.bracket,
    rules: tournament.ruleset,
    scheduled_time: p.scheduledTime,
    team1_name: team1Name,
    team2_name: team2Name,
    team1_id: p.team1Id,
    team2_id: p.team2Id,
    event_image_url: tournament.event_image_url || undefined,
    stats_enabled: tournament.stats_enabled,
    announcements: tournament.announcements ?? null,
    player_notifications: tournament.player_notifications,
  };
}

/** Round 1 of a single- or double-elimination bracket (identical). An odd team out gets a recorded bye. */
export async function generateFirstRoundMatches(
  ex: Executor,
  tournamentId: string,
  bracketAssignments: BracketAssignment[],
  startTime?: Date,
): Promise<GeneratedMatch[]> {
  const ctx = await loadContext(ex, tournamentId);
  const sorted = [...bracketAssignments].sort((a, b) => a.position - b.position);
  const { pairs, bye } = pairTeams(sorted);
  const names = await listTeamNames(ex, sorted.map((a) => a.teamId));

  if (bye) await saveByeTeam(ex, tournamentId, 1, 'winners', bye.teamId);
  return pairs.map(([a, b]) => buildMatch(ctx, names, { team1Id: a.teamId, team2Id: b.teamId, round: 1, bracket: 'winners', scheduledTime: startTime }));
}

export const generateSingleEliminationMatches = generateFirstRoundMatches;
export const generateDoubleEliminationMatches = generateFirstRoundMatches;

/** Completed matches of a round with a decided winner, in bracket order. */
export async function listDecidedMatches(ex: Executor, tournamentId: string, round: number, bracketType: string) {
  return ex
    .select({
      id: matches.id, winner_team: matches.winner_team, team1_id: tournamentMatches.team1_id, team2_id: tournamentMatches.team2_id,
      bracket_type: tournamentMatches.bracket_type, match_order: tournamentMatches.match_order,
    })
    .from(matches).innerJoin(tournamentMatches, eq(matches.id, tournamentMatches.match_id))
    .where(and(
      eq(tournamentMatches.tournament_id, tournamentId), eq(tournamentMatches.round, round), eq(tournamentMatches.bracket_type, bracketType as BracketType),
      eq(matches.status, 'complete'), sql`${matches.winner_team} is not null`,
    ))
    .orderBy(asc(tournamentMatches.match_order), asc(matches.id));
}

/** Next winners-bracket round from the decided matches of `currentRound` plus the teams that had a bye into it. */
export async function generateNextRoundMatches(
  ex: Executor,
  tournamentId: string,
  currentRound: number,
  bracketType: BracketType,
): Promise<GeneratedMatch[]> {
  const ctx = await loadContext(ex, tournamentId);
  const previous = await listDecidedMatches(ex, tournamentId, currentRound, bracketType);
  if (previous.length === 0) throw new TournamentError('No completed matches found for previous round');

  const byeTeamIds = await listByeTeamIds(ex, tournamentId, currentRound, bracketType);
  if (previous.length + byeTeamIds.length === 1 && bracketType === 'winners') return []; // one team left: the tournament is over

  const nextRound = currentRound + 1;
  const advancing = [...byeTeamIds, ...previous.map((m) => m.winner_team).filter((w): w is string => !!w)];
  const { pairs, bye } = pairTeams(advancing);
  if (bye) await saveByeTeam(ex, tournamentId, nextRound, bracketType, bye);

  const names = await listTeamNames(ex, advancing);
  return pairs.map(([a, b]) => buildMatch(ctx, names, { team1Id: a, team2Id: b, round: nextRound, bracket: bracketType, fallback: ['Winner 1', 'Winner 2'] }));
}

/** Build the matches the double-elimination planner asked for. */
export async function generateDoubleEliminationRoundMatches(ex: Executor, tournamentId: string, planned: PlannedMatch[]): Promise<GeneratedMatch[]> {
  if (planned.length === 0) return [];
  const ctx = await loadContext(ex, tournamentId);
  const names = await listTeamNames(ex, planned.flatMap((p) => [p.team1, p.team2]));
  return planned.map((p) => buildMatch(ctx, names, {
    team1Id: p.team1, team2Id: p.team2, round: p.round, bracket: p.bracket,
    title: plannedMatchName(p.bracket, p.reset, matchTitle(names.get(p.team1), names.get(p.team2))),
  }));
}

/**
 * One group match for a cumulative-points tournament: all participants compete together and position/FFA results
 * accumulate over the tournament.
 */
export async function generateCumulativeMatches(
  ex: Executor,
  tournamentId: string,
  startTime?: Date,
): Promise<{ matches: GeneratedMatch[]; tournamentMatches: TournamentMatchInfo[] }> {
  const ctx = await loadContext(ex, tournamentId);
  const { tournament } = ctx;
  if (ctx.tournamentMaps.length === 0) throw new TournamentError('No tournament-eligible maps found');

  const mode = ctx.gameModes.find((m) => m.id === tournament.game_mode_id) ?? ctx.gameModes[0];
  const matchId = newMatchId();
  const generated: GeneratedMatch = {
    id: matchId,
    name: tournament.name ?? 'Cumulative Match',
    description: tournament.description ?? undefined,
    game_id: tournament.game_id,
    game_mode_id: mode.id,
    map_id: ctx.tournamentMaps[0].id,
    maps: ctx.tournamentMaps.slice(0, tournament.rounds_per_match).map((m) => m.id),
    rounds_per_match: tournament.rounds_per_match,
    max_participants: 999,
    // 'assign' so the battle transition picks it up; match_teams are created in saveGeneratedMatches
    status: 'assign',
    match_type: 'tournament',
    tournament_id: tournamentId,
    tournament_round: 1,
    tournament_bracket_type: 'winners',
    rules: tournament.ruleset,
    scheduled_time: startTime ?? FAR_FUTURE,
    event_image_url: tournament.event_image_url,
    stats_enabled: tournament.stats_enabled,
    announcements: tournament.announcements ?? null,
    player_notifications: tournament.player_notifications,
  };
  return {
    matches: [generated],
    tournamentMatches: [{ id: matchId, tournament_id: tournamentId, round: 1, bracket_type: 'winners', match_order: 1 }],
  };
}

// ─── persistence ─────────────────────────────────────────────────────────────

async function listTeamRoster(ex: Executor, teamId: string) {
  return ex.select({
    user_id: tournamentTeamMembers.user_id, discord_user_id: tournamentTeamMembers.discord_user_id,
    username: tournamentTeamMembers.username, is_captain: tournamentTeamMembers.is_captain,
  }).from(tournamentTeamMembers).where(eq(tournamentTeamMembers.team_id, teamId)).orderBy(asc(tournamentTeamMembers.joined_at), asc(tournamentTeamMembers.id));
}

async function addRosterToMatch(ex: Executor, matchId: string, teamId: string, matchTeamId?: string): Promise<void> {
  const roster = await listTeamRoster(ex, teamId);
  await addParticipantsBulk(ex, matchId, roster.map((m) => ({
    user_id: m.user_id, discord_user_id: m.discord_user_id, username: m.username, receives_map_codes: m.is_captain,
  })), matchTeamId);
}

/**
 * Create match_teams rows named after the two tournament teams (order 0 = team1/blue, order 1 = team2/red) and add each
 * tournament team's members as participants linked to the matching match_teams row. When a side is still unknown, only
 * the known side's roster is added.
 */
async function setupTournamentMatchTeams(ex: Executor, matchId: string, team1Id: string | null | undefined, team2Id: string | null | undefined): Promise<void> {
  if (!team1Id || !team2Id) {
    if (team1Id) await addRosterToMatch(ex, matchId, team1Id);
    if (team2Id) await addRosterToMatch(ex, matchId, team2Id);
    return;
  }
  const names = await listTeamNames(ex, [team1Id, team2Id]);
  const [blueId, redId] = await createNamedMatchTeams(ex, matchId, [
    { name: names.get(team1Id) ?? 'Team 1', color: TOURNAMENT_TEAM_COLORS.blue },
    { name: names.get(team2Id) ?? 'Team 2', color: TOURNAMENT_TEAM_COLORS.red },
  ]);
  await addRosterToMatch(ex, matchId, team1Id, blueId);
  await addRosterToMatch(ex, matchId, team2Id, redId);
}

/** Cumulative-points: every team member joins the single match, and each participant gets a match_teams row. */
export async function addAllTeamsToMatch(ex: Executor, tournamentId: string, matchId: string): Promise<void> {
  const teams = await ex.select({ id: tournamentTeams.id }).from(tournamentTeams)
    .where(eq(tournamentTeams.tournament_id, tournamentId)).orderBy(asc(tournamentTeams.created_at), asc(tournamentTeams.id));
  for (const team of teams) await addRosterToMatch(ex, matchId, team.id);
  await createMatchTeams(ex, matchId); // FFA/Position: one match_teams row per participant (idempotent)
}

export interface SaveGeneratedOptions {
  /** Cumulative-points: add every tournament team member to the (single) match instead of two named teams. */
  addAllTeams?: boolean;
}

/**
 * Save generated matches, their bracket rows, teams / participants and game rows. Runs in the caller's transaction;
 * voice channel creation (which waits on the bot) is queued on `after` and runs once the caller has committed.
 */
export async function saveGeneratedMatches(
  ex: Executor,
  generated: GeneratedMatch[],
  tournamentMatchInfos: TournamentMatchInfo[],
  options: SaveGeneratedOptions,
  after: AfterCommit,
): Promise<void> {
  for (const m of generated) {
    await createTournamentMatch(ex, {
      id: m.id, name: m.name, description: m.description, gameId: m.game_id, modeId: m.game_mode_id, mapId: m.map_id ?? null,
      maps: m.maps ?? [], rounds: m.rounds_per_match, maxParticipants: m.max_participants, status: m.status,
      tournamentId: m.tournament_id, tournamentRound: m.tournament_round, tournamentBracketType: m.tournament_bracket_type,
      scheduledTime: m.scheduled_time ?? FAR_FUTURE, team1Name: m.team1_name, team2Name: m.team2_name, team1Id: m.team1_id, team2Id: m.team2_id,
      announcements: m.announcements, rules: m.rules, eventImageUrl: m.event_image_url, statsEnabled: m.stats_enabled, playerNotifications: m.player_notifications,
    });
  }

  for (const info of tournamentMatchInfos) {
    // The team ids carried on the generated match are the ones its row was built from; fall back to the bracket record.
    const source = generated.find((m) => m.id === info.id);
    const team1Id = source?.team1_id || info.team1_id || undefined;
    const team2Id = source?.team2_id || info.team2_id || undefined;
    await ex.insert(tournamentMatches).values({
      match_id: info.id, tournament_id: info.tournament_id, round: info.round, bracket_type: info.bracket_type,
      team1_id: team1Id ?? null, team2_id: team2Id ?? null, match_order: info.match_order,
      parent_match1_id: info.parent_match1_id ?? null, parent_match2_id: info.parent_match2_id ?? null,
    });
    if (!options.addAllTeams) await setupTournamentMatchTeams(ex, info.id, team1Id, team2Id);
  }

  for (const m of generated) {
    if (m.maps && m.maps.length > 0) await initializeMatchGames(ex, m.id);
  }
  if (options.addAllTeams) {
    for (const m of generated) await addAllTeamsToMatch(ex, m.tournament_id, m.id);
    return; // cumulative matches hold every participant: no per-match voice channels
  }

  for (const m of generated) {
    after.add(async () => {
      try {
        await VoiceChannelService.setupMatchVoiceChannels(m.id);
      } catch (error) {
        logger.error(`Failed to create voice channels for tournament match ${m.id}:`, error); // never fails the request
      }
    });
  }
}

// ─── bracket state ───────────────────────────────────────────────────────────

/** Round completion: how many matches the round has and how many are complete. */
export async function getRoundCompletion(ex: Executor, tournamentId: string, round: number, bracketType: BracketType): Promise<{ total: number; completed: number }> {
  const [row] = await ex.select({
    total: sql<number>`count(*)`.mapWith(Number),
    completed: sql<number>`count(*) filter (where ${matches.status} = 'complete')`.mapWith(Number),
  }).from(matches).innerJoin(tournamentMatches, eq(matches.id, tournamentMatches.match_id))
    .where(and(eq(tournamentMatches.tournament_id, tournamentId), eq(tournamentMatches.round, round), eq(tournamentMatches.bracket_type, bracketType)));
  return { total: row?.total ?? 0, completed: row?.completed ?? 0 };
}

export async function isRoundComplete(ex: Executor, tournamentId: string, round: number, bracketType: BracketType): Promise<boolean> {
  const { total, completed } = await getRoundCompletion(ex, tournamentId, round, bracketType);
  return total > 0 && total === completed;
}

async function bracketStats(ex: Executor, tournamentId: string, bracketType: BracketType) {
  const [row] = await ex.select({
    max_round: sql<number>`coalesce(max(${tournamentMatches.round}), 0)`.mapWith(Number),
    completed: sql<number>`count(*) filter (where ${matches.status} = 'complete')`.mapWith(Number),
    total: sql<number>`count(*)`.mapWith(Number),
  }).from(matches).innerJoin(tournamentMatches, eq(matches.id, tournamentMatches.match_id))
    .where(and(eq(tournamentMatches.tournament_id, tournamentId), eq(tournamentMatches.bracket_type, bracketType)));
  return row ?? { max_round: 0, completed: 0, total: 0 };
}

export async function getCurrentRoundInfo(ex: Executor, tournamentId: string): Promise<{
  maxWinnersRound: number;
  maxLosersRound: number;
  winnersComplete: boolean;
  losersComplete: boolean;
}> {
  const winners = await bracketStats(ex, tournamentId, 'winners');
  const losers = await bracketStats(ex, tournamentId, 'losers');
  return {
    maxWinnersRound: winners.max_round,
    maxLosersRound: losers.max_round,
    winnersComplete: winners.total > 0 && winners.completed === winners.total,
    losersComplete: losers.total > 0 && losers.completed === losers.total,
  };
}

/** The winner of the latest decided match of a bracket (the last team standing). */
export async function getBracketWinner(ex: Executor, tournamentId: string, bracketType: 'winners' | 'losers'): Promise<string | null> {
  const [row] = await ex.select({ winner_team: matches.winner_team }).from(matches)
    .innerJoin(tournamentMatches, eq(matches.id, tournamentMatches.match_id))
    .where(and(
      eq(tournamentMatches.tournament_id, tournamentId), eq(tournamentMatches.bracket_type, bracketType),
      eq(matches.status, 'complete'), sql`${matches.winner_team} is not null`,
    ))
    .orderBy(sql`${tournamentMatches.round} desc`, sql`${tournamentMatches.match_order} desc`).limit(1);
  return row?.winner_team ?? null;
}
