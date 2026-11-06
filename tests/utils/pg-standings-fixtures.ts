/**
 * Direct-insert fixtures for standings tests: completed matches (Normal / Position), tournaments with entrant teams and
 * their series events, without going through the routes. Use with setupPgTestFile().
 */
import { randomBytes } from 'node:crypto';
import { getPgTestDb } from './pg-test-db';
import { createGame, createGameMode, createMatch, createTournament } from './pg-fixtures';
import { linkEvent } from './pg-series-fixtures';
import {
  matchGamePlacements, matchGames, matchParticipants, matchTeams, tournamentMatches, tournamentTeamMembers, tournamentTeams,
} from '../../lib/db/schema';
import type { seriesEvents } from '../../lib/db/schema';

const uid = (prefix: string): string => `${prefix}${randomBytes(6).toString('hex')}`;
type EventOverrides = Partial<typeof seriesEvents.$inferInsert>;

export interface StandingsWorld {
  gameId: string;
  normalMode: string;
  positionMode: string;
  teamPositionMode: string;
}

export async function setupStandingsWorld(): Promise<StandingsWorld> {
  const gameId = (await createGame()).id;
  return {
    gameId,
    normalMode: (await createGameMode(gameId, { scoring_type: 'Normal', name: 'Normal' })).id,
    positionMode: (await createGameMode(gameId, { scoring_type: 'Position', team_size: 1, name: 'Position' })).id,
    teamPositionMode: (await createGameMode(gameId, { scoring_type: 'Position', team_size: 2, max_teams: 2, name: 'Team Position' })).id,
  };
}

/** Identity used for a player name everywhere: matches createSeriesWithEntrants' string members. */
export const playerId = (name: string): string => `u-${name}`;

export async function addTeam(matchId: string, name: string, order: number, entrantId: string | null = null, reserve = false): Promise<string> {
  const id = uid('mt');
  await getPgTestDb().insert(matchTeams).values({ id, match_id: matchId, team_name: name, team_order: order, is_reserve: reserve, series_entrant_id: entrantId });
  return id;
}

export async function addPlayer(matchId: string, name: string, teamId: string | null = null): Promise<string> {
  const id = uid('mp');
  await getPgTestDb().insert(matchParticipants).values({
    id, match_id: matchId, user_id: playerId(name), discord_user_id: playerId(name), username: name, team_id: teamId,
  });
  return id;
}

export interface PlacementSpec { type: 'team' | 'participant'; id: string; pos?: number; pts?: number | null; win?: boolean }

export async function addGame(matchId: string, round: number, placements: PlacementSpec[], status: 'completed' | 'ongoing' = 'completed'): Promise<string> {
  const db = getPgTestDb();
  const id = uid('mg');
  await db.insert(matchGames).values({ id, match_id: matchId, round, status });
  if (placements.length > 0) {
    await db.insert(matchGamePlacements).values(placements.map((p) => ({
      id: uid('pl'), match_game_id: id, entity_type: p.type, entity_id: p.id, position: p.pos ?? null, points_awarded: p.pts ?? null, is_winner: p.win ?? false,
    })));
  }
  return id;
}

export interface Side {
  entrant?: string | null;
  players?: string[];
  name?: string;
}

/**
 * A Normal 2-team match linked to the series. `maps[i]` says who won map i ('draw' = nobody). Team A is team_order 0.
 * `status` defaults to complete.
 */
export async function normalMatch(
  w: StandingsWorld, seriesId: string, a: Side, b: Side, maps: Array<'a' | 'b' | 'draw'>, ev: EventOverrides = {}, status = 'complete',
): Promise<{ matchId: string; teamA: string; teamB: string }> {
  const m = await createMatch(w.gameId, w.normalMode, { status: status as 'complete', name: `${a.name ?? 'A'} vs ${b.name ?? 'B'}` });
  const teamA = await addTeam(m.id, a.name ?? 'A', 0, a.entrant ?? null);
  const teamB = await addTeam(m.id, b.name ?? 'B', 1, b.entrant ?? null);
  for (const p of a.players ?? []) await addPlayer(m.id, p, teamA);
  for (const p of b.players ?? []) await addPlayer(m.id, p, teamB);
  for (const [i, res] of maps.entries()) {
    await addGame(m.id, i + 1, [
      { type: 'team', id: teamA, pos: res === 'b' ? 2 : 1, win: res === 'a' },
      { type: 'team', id: teamB, pos: res === 'a' ? 2 : 1, win: res === 'b' },
    ]);
  }
  await linkEvent(seriesId, 'match', m.id, ev);
  return { matchId: m.id, teamA, teamB };
}

/** Points of the default spread used by the Position fixtures. */
export const SPREAD = [25, 18, 15, 12, 10, 8];

export interface RankedEntry {
  /** Player name (a participant on a per-participant team row, or on a team). */
  player: string;
  entrant?: string | null;
  /** Team label for endurance matches: players with the same team label share a match_teams row. */
  team?: string;
}

/**
 * A completed Position match. `order` lists the players first to last; points come from SPREAD. Without `team`, every
 * player gets their own match_teams row (solo racing, row tagged with their entrant); with `team`, players share a row
 * per team label (endurance), and team placements (sum of members' points) are written too like the real engine does.
 */
export async function positionMatch(
  w: StandingsWorld, seriesId: string, order: RankedEntry[], ev: EventOverrides = {}, opts: { spread?: number[]; status?: string; teams?: Record<string, string | null> } = {},
): Promise<{ matchId: string; participants: Record<string, string> }> {
  const endurance = order.some((o) => o.team);
  const m = await createMatch(w.gameId, endurance ? w.teamPositionMode : w.positionMode, { status: (opts.status ?? 'complete') as 'complete' });
  const spread = opts.spread ?? SPREAD;
  const teamRows = new Map<string, string>();
  const participants: Record<string, string> = {};
  let teamOrder = 0;
  for (const entry of order) {
    let teamId: string;
    if (endurance && entry.team) {
      const existing = teamRows.get(entry.team);
      teamId = existing ?? await addTeam(m.id, entry.team, teamOrder++, opts.teams?.[entry.team] ?? entry.entrant ?? null);
      teamRows.set(entry.team, teamId);
    } else {
      teamId = await addTeam(m.id, entry.player, teamOrder++, entry.entrant ?? null);
    }
    participants[entry.player] = await addPlayer(m.id, entry.player, teamId);
  }
  const placements: PlacementSpec[] = order.map((o, i) => ({ type: 'participant', id: participants[o.player], pos: i + 1, pts: spread[i] ?? 0, win: i === 0 }));
  if (endurance) {
    const totals = new Map<string, number>();
    order.forEach((o, i) => { if (o.team) totals.set(o.team, (totals.get(o.team) ?? 0) + (spread[i] ?? 0)); });
    [...totals.entries()].sort((x, y) => y[1] - x[1]).forEach(([team, pts], i) => placements.push({ type: 'team', id: teamRows.get(team)!, pos: i + 1, pts, win: i === 0 }));
  }
  await addGame(m.id, 1, placements);
  await linkEvent(seriesId, 'match', m.id, ev);
  return { matchId: m.id, participants };
}

export interface TeamSpec {
  name: string;
  entrant?: string | null;
  members?: string[];
}

export interface BracketSpec {
  round: number;
  bracket: 'winners' | 'losers' | 'final';
  /** Indexes into the teams array. */
  a: number;
  b: number;
  winner: number | null;
  /** Map results (a / b); default one map won by the winner. */
  maps?: Array<'a' | 'b' | 'draw'>;
}

/** A tournament (bracket format) with entrant-tagged teams and its matches, linked to the series. */
export async function bracketTournament(
  w: StandingsWorld, seriesId: string, teams: TeamSpec[], bracket: BracketSpec[],
  opts: { format?: 'single-elimination' | 'double-elimination'; status?: 'complete' | 'battle'; ev?: EventOverrides } = {},
): Promise<{ tournamentId: string; teamIds: string[] }> {
  const db = getPgTestDb();
  const t = await createTournament(w.gameId, { format: opts.format ?? 'single-elimination', status: opts.status ?? 'complete', game_mode_id: w.normalMode });
  const teamIds: string[] = [];
  for (const spec of teams) {
    const id = uid('tt');
    await db.insert(tournamentTeams).values({ id, tournament_id: t.id, team_name: spec.name, series_entrant_id: spec.entrant ?? null });
    for (const [i, name] of (spec.members ?? []).entries()) {
      await db.insert(tournamentTeamMembers).values({ id: uid('ttm'), team_id: id, user_id: playerId(name), discord_user_id: playerId(name), username: name, is_captain: i === 0 });
    }
    teamIds.push(id);
  }
  let order = 0;
  for (const spec of bracket) {
    const ta = teamIds[spec.a];
    const tb = teamIds[spec.b];
    const winnerId = spec.winner === null ? null : teamIds[spec.winner];
    const m = await createMatch(w.gameId, w.normalMode, {
      status: 'complete', tournament_id: t.id, tournament_round: spec.round, tournament_bracket_type: spec.bracket,
      winner_team: winnerId, blue_team_id: ta, red_team_id: tb,
    });
    await db.insert(tournamentMatches).values({ match_id: m.id, tournament_id: t.id, round: spec.round, bracket_type: spec.bracket, team1_id: ta, team2_id: tb, match_order: ++order });
    const mtA = await addTeam(m.id, teams[spec.a].name, 0, null);
    const mtB = await addTeam(m.id, teams[spec.b].name, 1, null);
    for (const name of teams[spec.a].members ?? []) await addPlayer(m.id, name, mtA);
    for (const name of teams[spec.b].members ?? []) await addPlayer(m.id, name, mtB);
    const maps = spec.maps ?? [spec.winner === spec.b ? 'b' : 'a'];
    for (const [i, res] of maps.entries()) {
      await addGame(m.id, i + 1, [
        { type: 'team', id: mtA, pos: res === 'b' ? 2 : 1, win: res === 'a' },
        { type: 'team', id: mtB, pos: res === 'a' ? 2 : 1, win: res === 'b' },
      ]);
    }
  }
  await linkEvent(seriesId, 'tournament', t.id, opts.ev ?? {});
  return { tournamentId: t.id, teamIds };
}
