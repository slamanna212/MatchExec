/**
 * Head-to-head records for the `head_to_head` standings mode, pure over the loaded `StandingsData`: the result of every
 * completed 2-entrant Normal match (standalone, or inside a completed tournament) as W/L/T plus the maps won / lost /
 * tied, from the completed games' team placements.
 */
import type { SeriesScoringConfig } from '../../../shared/series-types';
import type { MatchInfo, TeamRow } from './standings-data';
import {
  matchPlacements, normalWinnerTeamId, playerKey, resolvePlayer, tournamentWinnerTeamId, type Contribution, type PlayerRef, type StandingsContext,
} from './standings-points';

export interface H2hSide {
  entrantId: string;
  players: PlayerRef[];
}

export interface H2hMatch {
  matchId: string;
  a: H2hSide;
  b: H2hSide;
  /** null = tie. */
  winner: 'a' | 'b' | null;
  mapsA: number;
  mapsB: number;
  mapTies: number;
}

/** The record of one completed match between exactly two entrants, or null when it is not such a match. */
export function h2hMatchRecord(ctx: StandingsContext, matchId: string): H2hMatch | null {
  const { data } = ctx;
  const match = data.matches.get(matchId);
  if (!ctx.hasEntrants || match?.status !== 'complete' || match.scoring_type !== 'Normal') return null;
  const teams = (data.teamsByMatch.get(matchId) ?? []).filter((t) => !t.is_reserve).sort((x, y) => x.team_order - y.team_order);
  if (teams.length !== 2) return null;
  const participants = data.participantsByMatch.get(matchId) ?? [];

  const sides = teams.map((team, slot) => {
    const ttId = match.tournament_id ? (slot === 0 ? match.team1_id : match.team2_id) : null;
    const tt = ttId ? data.tournamentTeams.get(ttId) : undefined;
    const members = ttId ? (data.membersByTournamentTeam.get(ttId) ?? []) : [];
    let players = participants.filter((p) => p.team_id === team.id);
    if (players.length === 0 && members.length > 0) {
      players = participants.filter((p) => members.some((m) => m.user_id === p.user_id || (m.discord_user_id && m.discord_user_id === p.discord_user_id)));
    }
    const fromPlayers = [...players, ...members].map((p) => resolvePlayer(ctx, p)).find((id): id is string => !!id);
    const entrantId = tt?.series_entrant_id ?? team.series_entrant_id ?? fromPlayers ?? null;
    return { team, ttId, entrantId, players: players.map((p) => ({ key: playerKey(p), username: p.username })) };
  });
  const [a, b] = sides;
  if (!a.entrantId || !b.entrantId || a.entrantId === b.entrantId) return null;

  let winner: 'a' | 'b' | null = null;
  if (match.tournament_id && match.winner_team) {
    winner = match.winner_team === a.ttId ? 'a' : (match.winner_team === b.ttId ? 'b' : null);
  } else {
    winner = sideWinner(match, teams, a.team, b.team, ctx);
  }

  let mapsA = 0;
  let mapsB = 0;
  let mapTies = 0;
  for (const gameId of data.gamesByMatch.get(matchId) ?? []) {
    const placements = (data.placementsByGame.get(gameId) ?? []).filter((p) => p.entity_type === 'team');
    const pa = placements.find((p) => p.entity_id === a.team.id);
    const pb = placements.find((p) => p.entity_id === b.team.id);
    if (!pa && !pb) continue;
    if (pa?.is_winner && !pb?.is_winner) mapsA++;
    else if (pb?.is_winner && !pa?.is_winner) mapsB++;
    else mapTies++;
  }

  return {
    matchId, a: { entrantId: a.entrantId, players: a.players }, b: { entrantId: b.entrantId, players: b.players }, winner, mapsA, mapsB, mapTies,
  };
}

function sideWinner(match: MatchInfo, teams: TeamRow[], a: TeamRow, b: TeamRow, ctx: StandingsContext): 'a' | 'b' | null {
  const { data } = ctx;
  const winnerId = match.tournament_id ? tournamentWinnerTeamId(data, match, teams) : normalWinnerTeamId(data, match.id, teams);
  if (match.tournament_id) {
    const slot = winnerId === match.team1_id ? 'a' : (winnerId === match.team2_id ? 'b' : null);
    return winnerId ? slot : null;
  }
  if (winnerId) return winnerId === a.id ? 'a' : (winnerId === b.id ? 'b' : null);
  // No team placements at all (result entered without map data): fall back to the stored winner.
  if (matchPlacements(data, match.id).some((p) => p.entity_type === 'team')) return null;
  if (match.winner_team === a.id) return 'a';
  if (match.winner_team === b.id) return 'b';
  return null;
}

/** All 2-entrant matches of an event (one match, or every match of a completed tournament). */
export function eventH2hMatches(ctx: StandingsContext, event: { match_id: string | null; tournament_id: string | null }): H2hMatch[] {
  const { data } = ctx;
  let matchIds: string[] = [];
  if (event.match_id) matchIds = [event.match_id];
  else if (event.tournament_id) {
    if (data.tournaments.get(event.tournament_id)?.status !== 'complete') return [];
    matchIds = data.matchIdsByTournament.get(event.tournament_id) ?? [];
  }
  return matchIds.map((id) => h2hMatchRecord(ctx, id)).filter((m): m is H2hMatch => !!m);
}

interface Acc {
  key: string;
  entrantId: string | null;
  name: string;
  players: PlayerRef[];
  record: { w: number; l: number; t: number; mw: number; ml: number; mt: number };
}

/**
 * One event's contributions in head_to_head mode: a record per entrant (or per player when `individual`), with league
 * points `win_points*W + loss_points*L + tie_points*T`, times the event multiplier.
 */
export function scoreH2hEvent(
  ctx: StandingsContext, records: H2hMatch[], cfg: SeriesScoringConfig, mult: number, individual: boolean,
): Contribution[] {
  const acc = new Map<string, Acc>();
  const credit = (key: string, entrantId: string, name: string, players: PlayerRef[], res: 'w' | 'l' | 't', mw: number, ml: number, mt: number) => {
    const have = acc.get(key) ?? { key, entrantId, name, players, record: { w: 0, l: 0, t: 0, mw: 0, ml: 0, mt: 0 } };
    have.name = name;
    have.record[res]++;
    have.record.mw += mw;
    have.record.ml += ml;
    have.record.mt += mt;
    acc.set(key, have);
  };

  for (const m of records) {
    const aRes = m.winner === 'a' ? 'w' : (m.winner === 'b' ? 'l' : 't');
    const bRes = m.winner === 'b' ? 'w' : (m.winner === 'a' ? 'l' : 't');
    const sides = [
      { side: m.a, res: aRes, mw: m.mapsA, ml: m.mapsB } as const,
      { side: m.b, res: bRes, mw: m.mapsB, ml: m.mapsA } as const,
    ];
    for (const { side, res, mw, ml } of sides) {
      if (individual) {
        for (const p of side.players) credit(p.key, side.entrantId, p.username, [p], res, mw, ml, m.mapTies);
      } else {
        credit(side.entrantId, side.entrantId, ctx.entrantNames.get(side.entrantId) ?? side.entrantId, side.players, res, mw, ml, m.mapTies);
      }
    }
  }

  const win = cfg.win_points ?? 0;
  const loss = cfg.loss_points ?? 0;
  const tie = cfg.tie_points ?? 0;
  return [...acc.values()].map((a) => ({
    key: a.key, entrantId: a.entrantId, name: a.name, players: a.players, position: null, isWin: false, record: a.record,
    points: (win * a.record.w + loss * a.record.l + tie * a.record.t) * mult,
  }));
}
