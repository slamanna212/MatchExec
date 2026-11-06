/** Pure round-robin pairing (circle method) with optional divisions, and the round robin fixture list. */
import type { GeneratedFixture, RoundRobinConfig } from '../../../../shared/series-types';
import {
  GeneratorConfigError, renderTemplate, scheduleItems, weeklyByes, type ScheduleOptions,
} from './schedule';

export interface PairingEntrant {
  id: string;
  name: string;
  division: string | null;
}

export type DivisionMode = RoundRobinConfig['divisions'];

export interface PairingRound {
  /** [home, away] */
  pairs: Array<[string, string]>;
  /** Entrants sitting this round out (odd pools). */
  byes: string[];
}

/** One pairing waiting for a time slot. */
export interface RoundRobinPairing {
  /** 1-based position in the pairing order. */
  round: number;
  home: string;
  away: string;
  entrant_ids: [string, string];
}

/**
 * Circle method: n entrants (a bye is added when n is odd) play n - 1 (odd: n) rounds, everybody meets everybody once and
 * nobody plays twice in a round. Home/away alternates by round and board.
 */
export function circleRounds(ids: readonly string[]): PairingRound[] {
  if (ids.length < 2) return [];
  const ring: Array<string | null> = [...ids];
  if (ring.length % 2 === 1) ring.push(null);
  const size = ring.length;
  const rounds: PairingRound[] = [];
  let order = ring;
  for (let r = 0; r < size - 1; r++) {
    const pairs: Array<[string, string]> = [];
    const byes: string[] = [];
    for (let i = 0; i < size / 2; i++) {
      const a = order[i];
      const b = order[size - 1 - i];
      if (a === null || b === null) {
        byes.push((a ?? b) as string);
      } else {
        // board 0 alternates by round; the others by board, which alternates an entrant's role as it moves one board per round
        pairs.push((i === 0 ? r : i) % 2 === 0 ? [a, b] : [b, a]);
      }
    }
    rounds.push({ pairs, byes });
    order = [order[0], order[size - 1], ...order.slice(1, size - 1)]; // rotate everything but the first
  }
  return rounds;
}

/** The same rounds again with home and away swapped. */
const mirrored = (rounds: readonly PairingRound[]): PairingRound[] =>
  rounds.map((r) => ({ pairs: r.pairs.map(([home, away]) => [away, home] as [string, string]), byes: r.byes }));

const legs = (rounds: PairingRound[], count: 1 | 2): PairingRound[] => (count === 2 ? [...rounds, ...mirrored(rounds)] : rounds);

/** Merge the rounds of several independent pools into shared rounds (round i of every pool plays together). */
function mergeRounds(pools: PairingRound[][]): PairingRound[] {
  const length = Math.max(0, ...pools.map((p) => p.length));
  return Array.from({ length }, (_, i) => ({
    pairs: pools.flatMap((p) => p[i]?.pairs ?? []),
    byes: pools.flatMap((p) => p[i]?.byes ?? []),
  }));
}

/**
 * The pairing rounds of a round robin.
 * - `none`: everybody plays everybody (twice, home/away swapped, when `double`).
 * - `within`: only inside divisions (twice when `double`); divisions play in parallel rounds.
 * - `within_and_cross`: inside divisions TWICE, then every cross-division pairing once (twice when `double`).
 * Entrants without a division form their own pool.
 */
export function generatePairingRounds(
  entrants: readonly PairingEntrant[], opts: { double: boolean; divisions: DivisionMode },
): { rounds: PairingRound[]; warnings: string[] } {
  const warnings: string[] = [];
  if (entrants.length < 2) throw new GeneratorConfigError('A round robin needs at least 2 entrants');
  if (new Set(entrants.map((e) => e.id)).size !== entrants.length) throw new GeneratorConfigError('Entrants must be distinct');

  if (opts.divisions === 'none') {
    return { rounds: legs(circleRounds(entrants.map((e) => e.id)), opts.double ? 2 : 1), warnings };
  }

  const pools = new Map<string, string[]>();
  for (const e of entrants) pools.set(e.division ?? '', [...(pools.get(e.division ?? '') ?? []), e.id]);
  if (pools.size < 2) warnings.push('All entrants are in the same division, so the division setting has no effect');
  for (const [division, ids] of pools) {
    if (ids.length < 2) warnings.push(`Division "${division || 'none'}" has a single entrant and plays no division matches`);
  }
  const withinLegs: 1 | 2 = opts.double || opts.divisions === 'within_and_cross' ? 2 : 1;
  const within = mergeRounds([...pools.values()].map((ids) => legs(circleRounds(ids), withinLegs)));
  if (opts.divisions === 'within') return { rounds: within, warnings };

  // cross-division: a round robin of everybody, keeping only the pairings between different divisions
  const divisionOf = new Map(entrants.map((e) => [e.id, e.division ?? '']));
  const cross = circleRounds(entrants.map((e) => e.id))
    .map((r) => ({ pairs: r.pairs.filter(([a, b]) => divisionOf.get(a) !== divisionOf.get(b)), byes: [] as string[] }))
    .filter((r) => r.pairs.length > 0);
  return { rounds: [...within, ...legs(cross, opts.double ? 2 : 1)], warnings };
}

/** The pairing rounds flattened into the fixture order the scheduler fills slots in. */
export function flattenRounds(rounds: readonly PairingRound[]): RoundRobinPairing[] {
  return rounds.flatMap((r, i) => r.pairs.map(([home, away]) => ({ round: i + 1, home, away, entrant_ids: [home, away] as [string, string] })));
}

/** Round robin fixtures: pairings -> greedy slot schedule -> names. Pure. */
export function planRoundRobin(
  entrants: readonly PairingEntrant[],
  config: Pick<RoundRobinConfig, 'double' | 'divisions' | 'start_date' | 'match_days' | 'time_slots' | 'timezone' | 'concurrent_matches' | 'max_per_entrant_per_week' | 'skip_dates'>,
  nameTemplate: string | undefined,
  options: ScheduleOptions & { pairings?: readonly RoundRobinPairing[] } = {},
): { fixtures: GeneratedFixture[]; byes: Array<{ week: number; entrant_ids: string[] }>; warnings: string[] } {
  const warnings: string[] = [];
  let pairings: readonly RoundRobinPairing[];
  if (options.pairings) {
    pairings = options.pairings;
  } else {
    const generated = generatePairingRounds(entrants, config);
    warnings.push(...generated.warnings);
    pairings = flattenRounds(generated.rounds);
  }
  const names = new Map(entrants.map((e) => [e.id, e.name]));
  const template = nameTemplate?.trim() || '{home} vs {away}';
  const scheduled = scheduleItems(pairings, config, options);
  const fixtures: GeneratedFixture[] = scheduled.map(({ item, week, start }) => ({
    week,
    start: start.toISOString(),
    name: renderTemplate(template, { home: names.get(item.home) ?? item.home, away: names.get(item.away) ?? item.away, round: item.round }),
    entrant_ids: [item.home, item.away],
  }));
  return { fixtures, byes: weeklyByes(fixtures, entrants.map((e) => e.id)), warnings };
}
