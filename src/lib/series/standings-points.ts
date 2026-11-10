/**
 * Event scoring for the `points` / legacy standings modes, pure over the loaded `StandingsData`.
 *
 * Every function returns "contributions": what one competitor (an entrant, or a player in a series without entrants)
 * earned from one event. Series without entrants (legacy) treat each player as an implicit entrant and reproduce the
 * original per-player algorithm exactly; series with entrants resolve participants to entrants (match team row ->
 * tournament team -> roster lookup). Players who are not on any roster earn nothing, but in ranked (FFA / Position)
 * events they keep their finishing place, so the entrants behind them are not moved up.
 */
import type { SeriesScoringConfig } from '../../../shared/series-types';
import type { MatchInfo, ParticipantRow, PlacementRow, StandingsData, TeamRow } from './standings-data';
import { competitionRanks, resolveBracketPlacings } from './standings-rank';

export interface PlayerRef {
  key: string;
  username: string;
}

export interface Contribution {
  /** Entrant id, or the player key for an implicit entrant (series without entrants). */
  key: string;
  entrantId: string | null;
  /** Latest display name (the player's username for implicit entrants). */
  name: string;
  /** Players who took part (the individual view credits each of them). */
  players: PlayerRef[];
  points: number;
  /** 1-based finishing position in the event, when it has one. */
  position: number | null;
  isWin: boolean;
  /** Number of ranked competitors in the event (set by the engine; podiums only count in fields of 3+). */
  field?: number;
  /** Head-to-head record of the event (head_to_head mode). */
  record?: { w: number; l: number; t: number; mw: number; ml: number; mt: number };
  /** Preferred display name for champions (tournament team name when no entrant is known). */
  label?: string;
}

export interface StandingsContext {
  /** False = legacy series: every player is an implicit entrant. */
  hasEntrants: boolean;
  /** player key (discord id or user id) -> entrant id. */
  index: Map<string, string>;
  entrantNames: Map<string, string>;
  data: StandingsData;
}

/** Stable player identity across matches: Discord id when known, else user id. */
export function playerKey(p: { discord_user_id?: string | null; user_id: string }): string {
  return p.discord_user_id ?? p.user_id;
}

export function resolvePlayer(ctx: StandingsContext, p: { discord_user_id?: string | null; user_id: string }): string | null {
  return (p.discord_user_id ? ctx.index.get(p.discord_user_id) : undefined) ?? ctx.index.get(p.user_id) ?? null;
}

const playerRef = (p: { discord_user_id?: string | null; user_id: string; username: string }): PlayerRef => ({ key: playerKey(p), username: p.username });

/** Completed-game placements of a match. */
export function matchPlacements(data: StandingsData, matchId: string): PlacementRow[] {
  return (data.gamesByMatch.get(matchId) ?? []).flatMap((g) => data.placementsByGame.get(g) ?? []);
}

/**
 * Winner of a match from its team placements (map wins per non-reserve team): the sole leader with at least one win,
 * else null. Returns a match_teams id.
 */
export function normalWinnerTeamId(data: StandingsData, matchId: string, teams: TeamRow[]): string | null {
  const active = teams.filter((t) => !t.is_reserve);
  const teamPlacements = matchPlacements(data, matchId).filter((p) => p.entity_type === 'team');
  if (active.length === 0 || teamPlacements.length === 0) return null;
  const wins = active.map((t) => ({ id: t.id, wins: teamPlacements.filter((p) => p.entity_id === t.id && p.is_winner).length }));
  const best = Math.max(...wins.map((w) => w.wins));
  const leaders = wins.filter((w) => w.wins === best);
  return leaders.length === 1 && best > 0 ? leaders[0].id : null;
}

/** tournament_teams id of the winning slot of a tournament match (slot 1 = team_order 0, slot 2 = team_order 1). */
export function tournamentWinnerTeamId(data: StandingsData, match: MatchInfo, teams: TeamRow[]): string | null {
  const winner = normalWinnerTeamId(data, match.id, teams);
  const order = teams.find((t) => t.id === winner)?.team_order;
  if (order === 0) return match.team1_id;
  if (order === 1) return match.team2_id;
  return null;
}

// ─── contribution bookkeeping ────────────────────────────────────────────────

/** Merges contributions of the same competitor within one event: best points / position, any win, all players. */
class EventBook {
  readonly map = new Map<string, Contribution>();

  add(c: Contribution): void {
    const have = this.map.get(c.key);
    if (!have) {
      this.map.set(c.key, { ...c, players: [...c.players] });
      return;
    }
    have.name = c.name;
    have.points = Math.max(have.points, c.points);
    if (c.position !== null) have.position = have.position === null ? c.position : Math.min(have.position, c.position);
    have.isWin = have.isWin || c.isWin;
    for (const p of c.players) if (!have.players.some((o) => o.key === p.key)) have.players.push(p);
  }

  list(): Contribution[] {
    return [...this.map.values()];
  }
}

interface Unit {
  key: string;
  entrantId: string | null;
  name: string;
}

function unitFor(ctx: StandingsContext, p: ParticipantRow, team: TeamRow | undefined): Unit | null {
  if (!ctx.hasEntrants) return { key: playerKey(p), entrantId: null, name: p.username };
  if (team?.is_reserve) return null;
  const entrantId = team?.series_entrant_id ?? resolvePlayer(ctx, p);
  return entrantId ? { key: entrantId, entrantId, name: ctx.entrantNames.get(entrantId) ?? entrantId } : null;
}

// ─── match events ────────────────────────────────────────────────────────────

/**
 * Score a completed match. Only completed matches contribute.
 *
 * - Position matches use their own points_awarded spread (summed per entrant; a team's total for team endurance) unless
 *   `position_event_use_event_spread` is off or the config has explicit `position_points`, which then map the finishing
 *   order to points.
 * - FFA / Position without a spread award match_win_points to the sole leader and match_loss_points to the others.
 * - Tournament matches resolve the winner through tournament team membership (matches.winner_team is a tournament_teams id).
 * - Normal standalone matches compare match_teams ids; reserves and unassigned players earn nothing. Ties award no wins.
 */
export function scoreMatch(ctx: StandingsContext, matchId: string, cfg: SeriesScoringConfig, mult: number): Contribution[] {
  const { data } = ctx;
  const match = data.matches.get(matchId);
  if (match?.status !== 'complete') return [];
  const participants = data.participantsByMatch.get(matchId) ?? [];
  const teams = data.teamsByMatch.get(matchId) ?? [];
  const winPts = cfg.match_win_points ?? 0;
  const lossPts = cfg.match_loss_points ?? 0;

  if (match.scoring_type === 'Position' || match.scoring_type === 'FFA') {
    return participants.length === 0 ? [] : scoreRankedMatch(ctx, match, participants, teams, cfg, mult);
  }
  if (match.tournament_id) return scoreTournamentMatch(ctx, match, participants, teams, winPts, lossPts, mult);
  if (!ctx.hasEntrants && participants.length === 0) return [];
  return scoreNormalMatch(ctx, match, participants, teams, winPts, lossPts, mult);
}

function scoreRankedMatch(
  ctx: StandingsContext, match: MatchInfo, participants: ParticipantRow[], teams: TeamRow[], cfg: SeriesScoringConfig, mult: number,
): Contribution[] {
  const placements = matchPlacements(ctx.data, match.id).filter((p) => p.entity_type === 'participant');
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const unitOf = new Map<string, Unit | null>(participants.map((p) => [p.id, unitFor(ctx, p, p.team_id ? teamById.get(p.team_id) : undefined)]));

  // Per entity (participant id): spread = sum(points_awarded) (null when none), score = sum(coalesce(points_awarded, win ? 1 : 0)).
  const spread = new Map<string, number>();
  const score = new Map<string, number>();
  for (const pl of placements) {
    if (pl.points_awarded !== null) spread.set(pl.entity_id, (spread.get(pl.entity_id) ?? 0) + pl.points_awarded);
    score.set(pl.entity_id, (score.get(pl.entity_id) ?? 0) + (pl.points_awarded ?? (pl.is_winner ? 1 : 0)));
  }
  const hasSpread = placements.some((p) => p.points_awarded !== null);
  const positionPoints = cfg.position_points && cfg.position_points.length > 0 ? cfg.position_points : null;
  const spreadAllowed = match.scoring_type === 'Position' && cfg.position_event_use_event_spread !== false;
  const useOrder = positionPoints !== null && (match.scoring_type === 'FFA' || !spreadAllowed || !hasSpread);
  const useSpread = !useOrder && spreadAllowed;

  // Per unit totals, in participant order. Placements of entities that are not (or no longer) participants still take part in the ranking.
  const unitSpread = new Map<string, number>();
  const unitScore = new Map<string, number>();
  const units = new Map<string, { unit: Unit; players: PlayerRef[] }>();
  for (const p of participants) {
    const unit = unitOf.get(p.id);
    if (!unit) continue;
    const entry = units.get(unit.key) ?? { unit, players: [] };
    entry.unit = unit;
    entry.players.push(playerRef(p));
    units.set(unit.key, entry);
    unitSpread.set(unit.key, (unitSpread.get(unit.key) ?? 0) + (spread.get(p.id) ?? 0));
    unitScore.set(unit.key, (unitScore.get(unit.key) ?? 0) + (score.get(p.id) ?? 0));
  }
  const strangers = [...score.entries()].filter(([id]) => !unitOf.has(id));

  const unitKeys = [...units.keys()];
  const totals = useSpread ? unitSpread : unitScore;
  // Players who are not on any roster earn nothing, but they did race: they keep their place in the finishing order, so
  // an entrant who finished behind one of them is not promoted (and does not take the win).
  const outsiders = participants
    .filter((p) => unitOf.get(p.id) === null && score.has(p.id))
    .map((p) => (useSpread ? spread.get(p.id) ?? 0 : score.get(p.id) ?? 0));
  const unitTotals = unitKeys.map((k) => totals.get(k) ?? 0);
  const ranks = competitionRanks([...unitTotals, ...outsiders]).slice(0, unitKeys.length);
  const rankBase = [...unitTotals, ...outsiders, ...strangers.map(([, v]) => v)];
  const best = rankBase.length === 0 ? -Infinity : Math.max(...rankBase);
  const leaderCount = rankBase.filter((v) => v === best).length;
  const soleLeader = leaderCount === 1 && best > 0;

  return unitKeys.map((key, i) => {
    const { unit, players } = units.get(key)!;
    const total = totals.get(key) ?? 0;
    const isWin = soleLeader && total === best;
    let points: number;
    if (useSpread) points = (unitSpread.get(key) ?? 0) * mult;
    else if (useOrder) points = (positionPoints?.[ranks[i] - 1] ?? 0) * mult;
    else points = (isWin ? cfg.match_win_points ?? 0 : cfg.match_loss_points ?? 0) * mult;
    return { key, entrantId: unit.entrantId, name: unit.name, players, points, position: ranks[i], isWin };
  });
}

function scoreNormalMatch(
  ctx: StandingsContext, match: MatchInfo, participants: ParticipantRow[], teams: TeamRow[], winPts: number, lossPts: number, mult: number,
): Contribution[] {
  const winnerTeam = normalWinnerTeamId(ctx.data, match.id, teams);
  const book = new EventBook();
  const outcome = (teamId: string | null, extra: Pick<Contribution, 'key' | 'entrantId' | 'name' | 'players'>): Contribution => {
    const isWin = winnerTeam !== null && teamId === winnerTeam;
    return { ...extra, points: (isWin ? winPts : lossPts) * mult, position: isWin ? 1 : (winnerTeam ? 2 : null), isWin };
  };

  if (!ctx.hasEntrants) {
    const teamById = new Map(teams.map((t) => [t.id, t]));
    for (const p of participants) {
      if (teamById.get(p.team_id ?? '')?.is_reserve === true) continue;
      if (!p.team_id) continue; // unassigned
      book.add(outcome(p.team_id, { key: playerKey(p), entrantId: null, name: p.username, players: [playerRef(p)] }));
    }
    return book.list();
  }

  for (const team of teams) {
    if (team.is_reserve) continue;
    const onTeam = participants.filter((p) => p.team_id === team.id);
    const entrantId = team.series_entrant_id ?? firstEntrant(ctx, onTeam);
    if (!entrantId) continue;
    book.add(outcome(team.id, { key: entrantId, entrantId, name: ctx.entrantNames.get(entrantId) ?? entrantId, players: onTeam.map(playerRef) }));
  }
  return book.list();
}

function firstEntrant(ctx: StandingsContext, players: Array<{ discord_user_id?: string | null; user_id: string }>): string | null {
  for (const p of players) {
    const id = resolvePlayer(ctx, p);
    if (id) return id;
  }
  return null;
}

function scoreTournamentMatch(
  ctx: StandingsContext, match: MatchInfo, participants: ParticipantRow[], teams: TeamRow[], winPts: number, lossPts: number, mult: number,
): Contribution[] {
  const { data } = ctx;
  const winnerTeam = match.winner_team ?? tournamentWinnerTeamId(data, match, teams);
  const sideIds = [match.team1_id, match.team2_id].filter((t): t is string => !!t);
  const book = new EventBook();
  const outcome = (teamId: string, extra: Pick<Contribution, 'key' | 'entrantId' | 'name' | 'players'>): Contribution => {
    const isWin = winnerTeam !== null && teamId === winnerTeam;
    return { ...extra, points: (isWin ? winPts : lossPts) * mult, position: isWin ? 1 : (winnerTeam ? 2 : null), isWin };
  };
  const members = sideIds.flatMap((id) => data.membersByTournamentTeam.get(id) ?? []);

  if (!ctx.hasEntrants) {
    for (const p of participants) {
      const member = members.find((m) => m.user_id === p.user_id || (m.discord_user_id && m.discord_user_id === p.discord_user_id));
      if (!member) continue; // not on either team
      book.add(outcome(member.team_id, { key: playerKey(p), entrantId: null, name: p.username, players: [playerRef(p)] }));
    }
    return book.list();
  }

  for (const teamId of sideIds) {
    const tt = data.tournamentTeams.get(teamId);
    const teamMembers = data.membersByTournamentTeam.get(teamId) ?? [];
    const playing = participants.filter((p) => teamMembers.some((m) => m.user_id === p.user_id || (m.discord_user_id && m.discord_user_id === p.discord_user_id)));
    const entrantId = tt?.series_entrant_id ?? firstEntrant(ctx, teamMembers) ?? firstEntrant(ctx, playing);
    if (!entrantId) continue;
    book.add(outcome(teamId, { key: entrantId, entrantId, name: ctx.entrantNames.get(entrantId) ?? entrantId, players: playing.map(playerRef) }));
  }
  return book.list();
}

// ─── tournament events ───────────────────────────────────────────────────────

/**
 * Score a completed tournament via tournament_position_points.
 *
 * cumulative-points: competitors are ranked by total points over the tournament's matches (players, or entrants when the
 * series has them); ties share the higher placing's points. Bracket formats: see resolveBracketPlacings - champion,
 * runner-up and third place receive tournament_position_points[0..2].
 */
export function scoreTournament(ctx: StandingsContext, tournamentId: string, cfg: SeriesScoringConfig, mult: number): Contribution[] {
  const { data } = ctx;
  const tournament = data.tournaments.get(tournamentId);
  if (tournament?.status !== 'complete') return [];
  const positionPoints = cfg.tournament_position_points ?? [];
  const matchIds = data.matchIdsByTournament.get(tournamentId) ?? [];

  if (tournament.format === 'cumulative-points') {
    const totals = new Map<string, { unit: Unit; username: string; total: number; players: PlayerRef[] }>();
    // Players on no roster earn no series points, but keep their place in the tournament's final order.
    const outsiderTotals = new Map<string, number>();
    for (const matchId of matchIds) {
      const teamById = new Map((data.teamsByMatch.get(matchId) ?? []).map((t) => [t.id, t]));
      const earned = new Map<string, number>();
      const placed = new Set<string>();
      for (const pl of matchPlacements(data, matchId)) {
        if (pl.entity_type !== 'participant') continue;
        placed.add(pl.entity_id);
        earned.set(pl.entity_id, (earned.get(pl.entity_id) ?? 0) + (pl.points_awarded ?? 0));
      }
      for (const p of data.participantsByMatch.get(matchId) ?? []) {
        const unit = unitFor(ctx, p, p.team_id ? teamById.get(p.team_id) : undefined);
        if (!unit) {
          if (placed.has(p.id)) outsiderTotals.set(playerKey(p), (outsiderTotals.get(playerKey(p)) ?? 0) + (earned.get(p.id) ?? 0));
          continue;
        }
        const entry = totals.get(unit.key) ?? { unit, username: p.username, total: 0, players: [] };
        if (p.username > entry.username) entry.username = p.username; // legacy: max(username)
        entry.total += earned.get(p.id) ?? 0;
        if (!entry.players.some((o) => o.key === playerKey(p))) entry.players.push(playerRef(p));
        totals.set(unit.key, entry);
      }
    }
    const rows = [...totals.values()].sort((a, b) => b.total - a.total || a.username.localeCompare(b.username));
    const outsiders = [...outsiderTotals.values()];
    // 0-based competition rank among everybody who raced (outsiders included); ties share the higher placing
    const rankOf = (total: number) => rows.filter((o) => o.total > total).length + outsiders.filter((o) => o > total).length;
    return rows.map((r) => {
      const rank = rankOf(r.total);
      return {
        key: r.unit.key, entrantId: r.unit.entrantId, name: ctx.hasEntrants ? r.unit.name : r.username, players: r.players,
        points: (positionPoints[rank] ?? 0) * mult, position: rank + 1, isWin: rank === 0,
      };
    });
  }

  const bracket = matchIds.map((id) => data.matches.get(id)).filter((m): m is MatchInfo => !!m).map((m) => ({
    round: m.round, bracket_type: m.bracket_type, status: m.status, winner_team: m.winner_team, team1_id: m.team1_id, team2_id: m.team2_id,
  }));
  const placings = resolveBracketPlacings(bracket, tournament.format);
  const book = new EventBook();
  placings.forEach((group, i) => {
    const points = (positionPoints[i] ?? 0) * mult;
    for (const teamId of group) {
      const tt = data.tournamentTeams.get(teamId);
      const members = data.membersByTournamentTeam.get(teamId) ?? [];
      const players = members.map(playerRef);
      if (!ctx.hasEntrants) {
        for (const mem of members) {
          book.add({ key: playerKey(mem), entrantId: null, name: mem.username, players: [playerRef(mem)], points, position: i + 1, isWin: i === 0, label: tt?.team_name });
        }
        continue;
      }
      const entrantId = tt?.series_entrant_id ?? firstEntrant(ctx, members);
      if (!entrantId) continue;
      book.add({
        key: entrantId, entrantId, name: ctx.entrantNames.get(entrantId) ?? entrantId, players, points, position: i + 1, isWin: i === 0, label: tt?.team_name,
      });
    }
  });
  return book.list();
}
