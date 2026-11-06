/** Pure ranking helpers of the standings engine: tie-aware ranks, bracket placings and the tiebreaker resolver. */
import type { SeriesTiebreaker } from '../../../shared/series-types';

/** Standard competition ranking over a descending-sorted list of totals: tied entries share the rank (index) of the first tied entry. */
export function tieAwareRanks(totals: number[]): number[] {
  const ranks: number[] = [];
  totals.forEach((t, i) => {
    ranks.push(i > 0 && t === totals[i - 1] ? ranks[i - 1] : i);
  });
  return ranks;
}

/** Competition ranks (1-based) of entries by a score, higher = better; equal scores share a rank. Returns ranks in input order. */
export function competitionRanks(scores: number[]): number[] {
  return scores.map((s) => 1 + scores.filter((o) => o > s).length);
}

export interface BracketMatch {
  round: number;
  bracket_type: string;
  status: string;
  winner_team: string | null;
  team1_id: string | null;
  team2_id: string | null;
}

function loserOf(m: BracketMatch): string | null {
  if (!m.winner_team) return null;
  if (m.team1_id === m.winner_team) return m.team2_id;
  if (m.team2_id === m.winner_team) return m.team1_id;
  return null;
}

/**
 * Resolve bracket-tournament placings as an ordered list of team-id groups (index 0 = champion, 1 = runner-up,
 * 2 = third place, ...). Groups with several teams are tied for that placing.
 *
 * Single elimination: champion = winner of the highest winners-bracket round; runner-up = its loser; semifinal losers
 * share 3rd. Double elimination: champion = winner of the 'final' bracket match (latest round if there's a reset);
 * runner-up = its loser; 3rd = loser of the last losers-bracket match.
 */
export function resolveBracketPlacings(bracket: BracketMatch[], format: string): string[][] {
  const done = bracket.filter((m) => m.status === 'complete' && m.winner_team);
  const maxBy = (list: BracketMatch[]) => list.reduce<BracketMatch | null>((best, m) => (!best || m.round > best.round ? m : best), null);

  let finalMatch: BracketMatch | null;
  if (format === 'double-elimination') {
    finalMatch = maxBy(done.filter((m) => m.bracket_type === 'final'));
  } else {
    finalMatch = maxBy(done.filter((m) => m.bracket_type === 'winners' || m.bracket_type === 'final'));
  }
  if (!finalMatch?.winner_team) return [];

  const placings: string[][] = [[finalMatch.winner_team]];
  const runnerUp = loserOf(finalMatch);
  if (runnerUp) placings.push([runnerUp]);

  if (format === 'double-elimination') {
    const lastLosers = maxBy(done.filter((m) => m.bracket_type === 'losers'));
    const third = lastLosers ? loserOf(lastLosers) : null;
    if (third && third !== runnerUp) placings.push([third]);
  } else {
    const semis = done.filter((m) => m.bracket_type === 'winners' && m.round === finalMatch.round - 1);
    const losers = semis.map(loserOf).filter((t): t is string => !!t);
    if (losers.length > 0) placings.push(Array.from(new Set(losers)));
  }
  return placings;
}

// ─── tiebreakers ─────────────────────────────────────────────────────────────

/** What the tiebreaker resolver needs to know about a row. */
export interface RankItem {
  key: string;
  name: string;
  total_points: number;
  match_wins: number;
  match_losses: number;
  match_ties: number;
  map_wins: number;
  map_losses: number;
  map_ties: number;
  event_wins: number;
  /** positionCounts[i] = how many events finished in place i + 1 (count-back). */
  positionCounts: number[];
}

/** Record between the given keys only (the mini-table used by the head_to_head tiebreaker). */
export type MiniTable = (keys: Set<string>) => Map<string, { wins: number; games: number }>;

/** > 0 when `a` ranks ahead of `b` on a single (non head_to_head) tiebreaker. */
function compareOn(t: SeriesTiebreaker, a: RankItem, b: RankItem): number {
  switch (t) {
    case 'points': return a.total_points - b.total_points;
    case 'match_wins': return a.match_wins - b.match_wins;
    case 'win_pct': return winPct(a) - winPct(b);
    case 'map_diff': return (a.map_wins - a.map_losses) - (b.map_wins - b.map_losses);
    case 'maps_won': return a.map_wins - b.map_wins;
    case 'event_wins': return a.event_wins - b.event_wins;
    case 'best_finishes': {
      const n = Math.max(a.positionCounts.length, b.positionCounts.length);
      for (let i = 0; i < n; i++) {
        const d = (a.positionCounts[i] ?? 0) - (b.positionCounts[i] ?? 0);
        if (d !== 0) return d;
      }
      return 0;
    }
    default: return 0;
  }
}

function winPct(r: RankItem): number {
  const games = r.match_wins + r.match_losses + r.match_ties;
  return games === 0 ? 0 : r.match_wins / games;
}

/**
 * Split a set of rows into ordered tie groups (best first) by the tiebreaker chain. Rows in one group are fully equal
 * after every tiebreaker. `head_to_head` compares the record among the currently tied rows only, so with 3+ tied rows
 * it is a mini-table, re-evaluated on every smaller subgroup it produces.
 */
export function orderByTiebreakers<T extends RankItem>(rows: T[], tiebreakers: SeriesTiebreaker[], mini: MiniTable | null): T[][] {
  if (rows.length === 0) return [];
  if (rows.length === 1 || tiebreakers.length === 0) return [rows];
  const [t, ...rest] = tiebreakers;

  if (t === 'head_to_head') {
    if (!mini) return orderByTiebreakers(rows, rest, mini);
    const table = mini(new Set(rows.map((r) => r.key)));
    // no games among the tied rows = neutral (0.5), so an unplayed pair stays tied for the next tiebreaker
    const score = (r: T) => {
      const rec = table.get(r.key);
      return !rec || rec.games === 0 ? 0.5 : rec.wins / rec.games;
    };
    const groups = splitBy(rows, (a, b) => score(a) - score(b));
    if (groups.length === 1) return orderByTiebreakers(rows, rest, mini);
    return groups.flatMap((g) => orderByTiebreakers(g, tiebreakers, mini));
  }

  return splitBy(rows, (a, b) => compareOn(t, a, b)).flatMap((g) => orderByTiebreakers(g, rest, mini));
}

/** Sort best-first by `cmp` (> 0 = a ahead) and split into runs of equal rows. */
function splitBy<T>(rows: T[], cmp: (a: T, b: T) => number): T[][] {
  const sorted = [...rows].sort((a, b) => cmp(b, a));
  const groups: T[][] = [];
  for (const r of sorted) {
    const last = groups[groups.length - 1];
    if (last && cmp(last[0], r) === 0) last.push(r);
    else groups.push([r]);
  }
  return groups;
}
