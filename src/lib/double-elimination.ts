/**
 * Double-elimination bracket planner (pure; no I/O).
 *
 * Replays a bracket from its recorded matches and returns what to generate next. Every team
 * is out after its second loss; the winners-bracket (WB) champion meets the losers-bracket (LB)
 * champion in the grand final, and if the LB champion wins that, a reset final decides it
 * (the WB champion had no losses before it).
 *
 * Structure
 *  - WB: like single elimination. Round r+1 pairs [teams that sat out round r, round r winners].
 *    An odd team out sits out the round (a bye) and is simply "not in any match" that round.
 *  - LB: rounds alternate. The first LB round pairs the WB round-1 losers. After that, a "major"
 *    round pairs the survivors against the next WB round's losers (each WB loser drops in), and
 *    a "minor" round pairs survivors among themselves to halve the field before the next drop.
 *    Odd teams out get a bye. When the WB is finished and every drop has been consumed, minor
 *    rounds continue until one team is left: the LB champion.
 *
 * Byes are never stored: a team that was in a round's pool but not in any match of that round
 * had a bye, so the whole plan can be recomputed from the match results alone.
 */

export type DeBracket = 'winners' | 'losers' | 'final';

/** A recorded bracket match. `winner` is null until the match has a decided winner. */
export interface DeMatch {
  bracket: DeBracket;
  round: number;
  team1: string;
  team2: string;
  winner: string | null;
  complete: boolean;
}

export interface PlannedMatch {
  bracket: DeBracket;
  round: number;
  team1: string;
  team2: string;
  /** True for the reset grand final (second 'final' round). */
  reset?: boolean;
}

export interface DePlan {
  /** Matches that can be generated right now (possibly in several brackets at once). */
  matches: PlannedMatch[];
  /** Set once the bracket is decided. */
  champion?: string;
  /** Why nothing can be generated yet (only set when `matches` is empty and there is no champion). */
  waiting?: string;
}

const isDecided = (m: DeMatch): boolean => m.complete && m.winner !== null;

/** Why a round can't advance: unfinished matches, or finished ones that ended without a winner (draws). */
function undecidedReason(label: string, ms: DeMatch[]): string {
  if (ms.some(m => m.complete && m.winner === null)) {
    return `${label} has a match that ended in a draw; rescore one of its maps to decide a winner`;
  }
  return `${label} is not complete yet`;
}
const loserOf = (m: DeMatch): string => (m.winner === m.team1 ? m.team2 : m.team1);

function byRound(matches: DeMatch[], bracket: DeBracket): Map<number, DeMatch[]> {
  const rounds = new Map<number, DeMatch[]>();
  for (const m of matches) {
    if (m.bracket !== bracket) continue;
    const list = rounds.get(m.round) ?? [];
    list.push(m);
    rounds.set(m.round, list);
  }
  return rounds;
}

/** Pair a list front to back; an odd team out is left unpaired (it has a bye). */
function pairSequential(teams: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i + 1 < teams.length; i += 2) pairs.push([teams[i], teams[i + 1]]);
  return pairs;
}

type LbKind = 'drop' | 'major' | 'minor';

/** Pairings for one LB round: survivors `s` and incoming WB losers `d`. */
function lbPairs(kind: LbKind, s: string[], d: string[]): Array<[string, string]> {
  if (kind === 'drop') return pairSequential(d);
  if (kind === 'minor') return pairSequential(s);
  // major: each drop meets a survivor; any surplus on either side plays among itself
  const cross = Math.min(s.length, d.length);
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < cross; i++) pairs.push([s[i], d[i]]);
  const surplus = s.length > d.length ? s.slice(cross) : d.slice(cross);
  return pairs.concat(pairSequential(surplus));
}

interface WbState {
  /** Losers of each completed WB round (index = round). */
  losers: Map<number, string[]>;
  champion: string | null;
  totalRounds: number | null;
  /** Next WB round to generate, if the previous one is complete and more than one team remains. */
  next: { round: number; pairs: Array<[string, string]> } | null;
  waiting: string | null;
}

function replayWinners(allTeams: string[], matches: DeMatch[]): WbState {
  const rounds = byRound(matches, 'winners');
  const state: WbState = { losers: new Map(), champion: null, totalRounds: null, next: null, waiting: null };
  let pool = [...allTeams];

  for (let r = 1; ; r++) {
    const ms = rounds.get(r);
    if (!ms || ms.length === 0) {
      if (r === 1) state.waiting = 'The bracket has no matches yet';
      else state.next = { round: r, pairs: pairSequential(pool) };
      return state;
    }
    if (!ms.every(isDecided)) {
      state.waiting = undecidedReason(`Winners bracket round ${r}`, ms);
      return state;
    }
    const inMatch = new Set(ms.flatMap(m => [m.team1, m.team2]));
    const byes = pool.filter(t => !inMatch.has(t));
    state.losers.set(r, ms.map(loserOf));
    pool = [...byes, ...ms.map(m => m.winner as string)];
    if (pool.length === 1) {
      state.champion = pool[0];
      state.totalRounds = r;
      return state;
    }
  }
}

interface LbState {
  champion: string | null;
  next: { round: number; pairs: Array<[string, string]> } | null;
  waiting: string | null;
}

function replayLosers(wb: WbState, matches: DeMatch[]): LbState {
  const rounds = byRound(matches, 'losers');
  const state: LbState = { champion: null, next: null, waiting: null };

  let survivors: string[] = [];
  let consumed = 0; // WB rounds whose losers have entered the LB
  let step = 1; // structural position: 1 = first drop, then major (even) / minor (odd) alternate
  let round = 0; // LB rounds that actually have matches

  for (;;) {
    const dropsRemain = wb.champion === null || consumed < (wb.totalRounds as number);
    if (!dropsRemain && survivors.length <= 1) {
      state.champion = survivors[0] ?? null;
      return state;
    }

    const kind: LbKind = step === 1 ? 'drop' : step % 2 === 0 && dropsRemain ? 'major' : 'minor';
    if (kind === 'minor' && survivors.length <= 1) {
      step++; // nothing to pair; the lone survivor waits for the next drop
      continue;
    }

    let drops: string[] = [];
    if (kind !== 'minor') {
      const incoming = wb.losers.get(consumed + 1);
      if (!incoming) {
        state.waiting = `Waiting for winners bracket round ${consumed + 1} to finish`;
        return state;
      }
      drops = incoming;
    }

    const pool = kind === 'drop' ? drops : kind === 'minor' ? survivors : [...survivors, ...drops];
    const pairs = lbPairs(kind, survivors, drops);

    if (pairs.length === 0) {
      // a single team and nothing to play: it passes straight through
      survivors = [...pool];
      if (kind !== 'minor') consumed++;
      step++;
      continue;
    }

    const ms = rounds.get(round + 1);
    if (!ms || ms.length === 0) {
      state.next = { round: round + 1, pairs };
      return state;
    }
    if (!ms.every(isDecided)) {
      state.waiting = undecidedReason(`Losers bracket round ${round + 1}`, ms);
      return state;
    }
    const inMatch = new Set(ms.flatMap(m => [m.team1, m.team2]));
    const byes = pool.filter(t => !inMatch.has(t));
    survivors = [...byes, ...ms.map(m => m.winner as string)];
    if (kind !== 'minor') consumed++;
    round++;
    step++;
  }
}

/**
 * Plan the next step of a double-elimination bracket.
 *
 * @param allTeams every team entered in the bracket (order is irrelevant)
 * @param matches  the bracket's recorded matches (any order; per-round order is preserved)
 */
export function planDoubleElimination(allTeams: string[], matches: DeMatch[]): DePlan {
  const wb = replayWinners(allTeams, matches);
  const lb = replayLosers(wb, matches);
  const out: PlannedMatch[] = [];

  if (wb.next) {
    for (const [team1, team2] of wb.next.pairs) out.push({ bracket: 'winners', round: wb.next.round, team1, team2 });
  }
  if (lb.next) {
    for (const [team1, team2] of lb.next.pairs) out.push({ bracket: 'losers', round: lb.next.round, team1, team2 });
  }

  if (wb.champion && lb.champion) {
    const finals = byRound(matches, 'final');
    const first = finals.get(1)?.[0];
    if (!first) {
      out.push({ bracket: 'final', round: 1, team1: wb.champion, team2: lb.champion });
    } else if (!isDecided(first)) {
      return { matches: out, waiting: undecidedReason('The grand final', [first]) };
    } else if (first.winner === wb.champion) {
      return { matches: out, champion: wb.champion };
    } else {
      // The LB champion beat the undefeated WB champion: both now have one loss, so play it again.
      const reset = finals.get(2)?.[0];
      if (!reset) {
        out.push({ bracket: 'final', round: 2, team1: wb.champion, team2: lb.champion, reset: true });
      } else if (!isDecided(reset)) {
        return { matches: out, waiting: undecidedReason('The grand final reset', [reset]) };
      } else {
        return { matches: out, champion: reset.winner as string };
      }
    }
  }

  if (out.length === 0) {
    return { matches: out, waiting: wb.waiting ?? lb.waiting ?? 'No progression available at this time' };
  }
  return { matches: out };
}
