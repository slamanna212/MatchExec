/**
 * Standings input: everything the engine needs about the matches and tournaments behind a set of series events,
 * loaded in a fixed number of batched queries (never per player / per match) and indexed in memory. The scoring code
 * (standings-points.ts, standings-h2h.ts) is pure over this data.
 */
import { and, asc, eq, inArray, type SQL } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import {
  gameModes, matchGamePlacements, matchGames, matchParticipants, matchTeams, matches, tournamentMatches, tournamentTeamMembers,
  tournamentTeams, tournaments,
} from '../../../lib/db/schema';
import type { SeriesEventRow } from './events';

export type ScoringKind = 'Normal' | 'FFA' | 'Position';

export interface MatchInfo {
  id: string;
  name: string;
  status: string;
  scoring_type: ScoringKind;
  tournament_id: string | null;
  winner_team: string | null;
  /** Bracket position (tournament matches). */
  round: number;
  bracket_type: string;
  /** tournament_teams ids of the two sides (tournament_matches first, else the match's own blue/red columns). */
  team1_id: string | null;
  team2_id: string | null;
}

export interface TeamRow {
  id: string;
  match_id: string;
  team_name: string;
  team_order: number;
  is_reserve: boolean;
  series_entrant_id: string | null;
}

export interface ParticipantRow {
  id: string;
  match_id: string;
  user_id: string;
  discord_user_id: string | null;
  username: string;
  team_id: string | null;
}

export interface PlacementRow {
  match_game_id: string;
  entity_type: 'team' | 'participant';
  entity_id: string;
  position: number | null;
  points_awarded: number | null;
  is_winner: boolean;
}

export interface TournamentInfo {
  id: string;
  name: string;
  format: string;
  status: string;
}

export interface TournamentTeamInfo {
  id: string;
  tournament_id: string;
  team_name: string;
  series_entrant_id: string | null;
}

export interface TournamentMemberRow {
  team_id: string;
  user_id: string;
  discord_user_id: string | null;
  username: string;
}

export interface StandingsData {
  matches: Map<string, MatchInfo>;
  teamsByMatch: Map<string, TeamRow[]>;
  participantsByMatch: Map<string, ParticipantRow[]>;
  /** Completed games only. */
  gamesByMatch: Map<string, string[]>;
  placementsByGame: Map<string, PlacementRow[]>;
  tournaments: Map<string, TournamentInfo>;
  matchIdsByTournament: Map<string, string[]>;
  tournamentTeams: Map<string, TournamentTeamInfo>;
  membersByTournamentTeam: Map<string, TournamentMemberRow[]>;
}

const CHUNK = 20000;

async function chunked<T, R>(ids: T[], run: (chunk: T[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...await run(ids.slice(i, i + CHUNK)));
  return out;
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Load the data behind `events` (live match / tournament events only; planned events have no target). */
export async function loadStandingsData(ex: Executor, events: SeriesEventRow[]): Promise<StandingsData> {
  const eventMatchIds = [...new Set(events.map((e) => e.match_id).filter((id): id is string => !!id))];
  const tournamentIds = [...new Set(events.map((e) => e.tournament_id).filter((id): id is string => !!id))];

  const matchRows = [
    ...await chunked(eventMatchIds, (ids) => selectMatches(ex, inArray(matches.id, ids))),
    ...await chunked(tournamentIds, (ids) => selectMatches(ex, inArray(matches.tournament_id, ids))),
  ];
  const matchMap = new Map<string, MatchInfo>();
  const matchIdsByTournament = new Map<string, string[]>();
  for (const r of matchRows) {
    if (matchMap.has(r.id)) continue;
    matchMap.set(r.id, {
      id: r.id, name: r.name, status: r.status, scoring_type: (r.scoring_type ?? 'Normal') as ScoringKind,
      tournament_id: r.tournament_id, winner_team: r.winner_team,
      round: r.match_round ?? r.tm_round ?? 1, bracket_type: r.match_bracket ?? r.tm_bracket ?? 'winners',
      team1_id: r.tm_team1 ?? r.blue_team_id, team2_id: r.tm_team2 ?? r.red_team_id,
    });
    if (r.tournament_id) pushTo(matchIdsByTournament, r.tournament_id, r.id);
  }
  const matchIds = [...matchMap.keys()];

  const teamsByMatch = new Map<string, TeamRow[]>();
  for (const t of await chunked(matchIds, (ids) => ex.select({
    id: matchTeams.id, match_id: matchTeams.match_id, team_name: matchTeams.team_name, team_order: matchTeams.team_order,
    is_reserve: matchTeams.is_reserve, series_entrant_id: matchTeams.series_entrant_id,
  }).from(matchTeams).where(inArray(matchTeams.match_id, ids)).orderBy(asc(matchTeams.team_order), asc(matchTeams.id)))) {
    pushTo(teamsByMatch, t.match_id, t);
  }

  const participantsByMatch = new Map<string, ParticipantRow[]>();
  for (const p of await chunked(matchIds, (ids) => ex.select({
    id: matchParticipants.id, match_id: matchParticipants.match_id, user_id: matchParticipants.user_id,
    discord_user_id: matchParticipants.discord_user_id, username: matchParticipants.username, team_id: matchParticipants.team_id,
  }).from(matchParticipants).where(inArray(matchParticipants.match_id, ids)).orderBy(asc(matchParticipants.joined_at), asc(matchParticipants.id)))) {
    pushTo(participantsByMatch, p.match_id, p);
  }

  const gamesByMatch = new Map<string, string[]>();
  const gameIds: string[] = [];
  for (const g of await chunked(matchIds, (ids) => ex.select({ id: matchGames.id, match_id: matchGames.match_id })
    .from(matchGames).where(and(inArray(matchGames.match_id, ids), eq(matchGames.status, 'completed'))).orderBy(asc(matchGames.round), asc(matchGames.id)))) {
    pushTo(gamesByMatch, g.match_id, g.id);
    gameIds.push(g.id);
  }

  const placementsByGame = new Map<string, PlacementRow[]>();
  for (const p of await chunked(gameIds, (ids) => ex.select({
    match_game_id: matchGamePlacements.match_game_id, entity_type: matchGamePlacements.entity_type, entity_id: matchGamePlacements.entity_id,
    position: matchGamePlacements.position, points_awarded: matchGamePlacements.points_awarded, is_winner: matchGamePlacements.is_winner,
  }).from(matchGamePlacements).where(inArray(matchGamePlacements.match_game_id, ids)))) {
    pushTo(placementsByGame, p.match_game_id, p);
  }

  const tournamentMap = new Map<string, TournamentInfo>();
  for (const t of await chunked(tournamentIds, (ids) => ex.select({ id: tournaments.id, name: tournaments.name, format: tournaments.format, status: tournaments.status })
    .from(tournaments).where(inArray(tournaments.id, ids)))) {
    tournamentMap.set(t.id, t);
  }

  // Tournament teams: those of the tournament events, plus the sides of tournament matches that are events themselves.
  const referencedTeamIds = new Set<string>();
  for (const m of matchMap.values()) {
    for (const id of [m.team1_id, m.team2_id, m.winner_team]) if (id && m.tournament_id) referencedTeamIds.add(id);
  }
  const ttRows = [
    ...await chunked(tournamentIds, (ids) => ex.select().from(tournamentTeams).where(inArray(tournamentTeams.tournament_id, ids))),
    ...await chunked([...referencedTeamIds], (ids) => ex.select().from(tournamentTeams).where(inArray(tournamentTeams.id, ids))),
  ];
  const ttMap = new Map<string, TournamentTeamInfo>();
  for (const t of ttRows) {
    ttMap.set(t.id, { id: t.id, tournament_id: t.tournament_id, team_name: t.team_name, series_entrant_id: t.series_entrant_id });
  }
  const membersByTournamentTeam = new Map<string, TournamentMemberRow[]>();
  for (const m of await chunked([...ttMap.keys()], (ids) => ex.select({
    team_id: tournamentTeamMembers.team_id, user_id: tournamentTeamMembers.user_id,
    discord_user_id: tournamentTeamMembers.discord_user_id, username: tournamentTeamMembers.username,
  }).from(tournamentTeamMembers).where(inArray(tournamentTeamMembers.team_id, ids)).orderBy(asc(tournamentTeamMembers.id)))) {
    pushTo(membersByTournamentTeam, m.team_id, m);
  }

  return {
    matches: matchMap, teamsByMatch, participantsByMatch, gamesByMatch, placementsByGame, tournaments: tournamentMap,
    matchIdsByTournament, tournamentTeams: ttMap, membersByTournamentTeam,
  };
}

function selectMatches(ex: Executor, where: SQL) {
  return ex
    .select({
      id: matches.id, name: matches.name, status: matches.status, scoring_type: gameModes.scoring_type, tournament_id: matches.tournament_id,
      winner_team: matches.winner_team, match_round: matches.tournament_round, tm_round: tournamentMatches.round,
      match_bracket: matches.tournament_bracket_type, tm_bracket: tournamentMatches.bracket_type,
      tm_team1: tournamentMatches.team1_id, tm_team2: tournamentMatches.team2_id,
      blue_team_id: matches.blue_team_id, red_team_id: matches.red_team_id,
    })
    .from(matches)
    .leftJoin(gameModes, and(eq(gameModes.id, matches.mode_id), eq(gameModes.game_id, matches.game_id)))
    .leftJoin(tournamentMatches, eq(tournamentMatches.match_id, matches.id))
    .where(where);
}
