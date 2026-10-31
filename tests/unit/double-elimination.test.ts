import { describe, it, expect } from 'vitest';
import { planDoubleElimination } from '@/lib/double-elimination';
import type { DeMatch, PlannedMatch } from '@/lib/double-elimination';

// Deterministic RNG so a failing seed can be replayed.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const teamsOf = (n: number) => Array.from({ length: n }, (_, i) => `T${i + 1}`);

/** Seed WB round 1 the way generate-matches does: pair teams in order, odd team out gets a bye. */
function firstRound(teams: string[]): DeMatch[] {
  const ms: DeMatch[] = [];
  for (let i = 0; i + 1 < teams.length; i += 2) {
    ms.push({ bracket: 'winners', round: 1, team1: teams[i], team2: teams[i + 1], winner: null, complete: false });
  }
  return ms;
}

interface Result {
  matches: DeMatch[];
  champion: string;
}

/**
 * Play a bracket to the end. Each step generates whatever the planner offers, then completes a
 * random non-empty subset of the open matches (so brackets are exercised with matches finishing
 * in arbitrary order). `forceFinal` pins the grand-final outcome when set.
 */
function simulate(n: number, seed: number, opts: { forceFinal?: 'wb' | 'lb' } = {}): Result {
  const rand = rng(seed);
  const teams = teamsOf(n);
  const matches = firstRound(teams);

  for (let step = 0; step < 500; step++) {
    const plan = planDoubleElimination(teams, matches);

    for (const p of plan.matches) {
      const dup = matches.some(m => m.bracket === p.bracket && m.round === p.round);
      expect(dup, `n=${n} seed=${seed}: round regenerated ${p.bracket}/${p.round}`).toBe(false);
    }
    // all matches of one planned round must be added together
    for (const p of plan.matches) {
      matches.push({ bracket: p.bracket, round: p.round, team1: p.team1, team2: p.team2, winner: null, complete: false });
    }

    if (plan.champion) return { matches, champion: plan.champion };

    const open = matches.filter(m => !m.complete);
    expect(open.length, `n=${n} seed=${seed}: stuck (${plan.waiting})`).toBeGreaterThan(0);

    const subset = open.filter(() => rand() < 0.5);
    if (subset.length === 0) subset.push(open[Math.floor(rand() * open.length)]);
    for (const m of subset) {
      let wbWins = rand() < 0.5;
      if (m.bracket === 'final' && m.round === 1 && opts.forceFinal) wbWins = opts.forceFinal === 'wb';
      // in a final, team1 is always the WB champion, so "wbWins" means team1 wins
      m.winner = wbWins ? m.team1 : m.team2;
      m.complete = true;
    }
  }
  throw new Error(`n=${n} seed=${seed}: did not finish`);
}

function check(n: number, { matches, champion }: Result, seed: number) {
  const where = `n=${n} seed=${seed}`;
  const losses = new Map<string, number>(teamsOf(n).map(t => [t, 0]));
  const order = [...matches].sort((a, b) => {
    const rank = { winners: 0, losers: 1, final: 2 } as const;
    return a.round - b.round || rank[a.bracket] - rank[b.bracket];
  });

  // nobody plays in a round twice, and nobody plays after being eliminated
  for (const bracket of ['winners', 'losers', 'final'] as const) {
    const seen = new Map<number, Set<string>>();
    for (const m of matches.filter(x => x.bracket === bracket)) {
      const s = seen.get(m.round) ?? new Set<string>();
      for (const t of [m.team1, m.team2]) {
        expect(s.has(t), `${where}: ${t} plays twice in ${bracket} round ${m.round}`).toBe(false);
        s.add(t);
      }
      seen.set(m.round, s);
    }
  }
  expect(order.every(m => m.complete && m.winner), `${where}: undecided match`).toBe(true);

  for (const m of matches) {
    const loser = m.winner === m.team1 ? m.team2 : m.team1;
    losses.set(loser, (losses.get(loser) ?? 0) + 1);
  }
  for (const [team, count] of losses) {
    if (team === champion) expect(count, `${where}: champion ${team} lost ${count}`).toBeLessThanOrEqual(1);
    else expect(count, `${where}: ${team} has ${count} losses`).toBe(2);
  }

  // rounds are numbered consecutively from 1 in every bracket
  for (const bracket of ['winners', 'losers'] as const) {
    const rounds = [...new Set(matches.filter(m => m.bracket === bracket).map(m => m.round))].sort((a, b) => a - b);
    rounds.forEach((r, i) => expect(r, `${where}: ${bracket} round gap`).toBe(i + 1));
  }

  const reset = matches.some(m => m.bracket === 'final' && m.round === 2);
  expect(matches.length, `${where}: match count`).toBe(reset ? 2 * n - 1 : 2 * n - 2);

  // the champion won the last final
  const lastFinal = matches.filter(m => m.bracket === 'final').sort((a, b) => b.round - a.round)[0];
  expect(lastFinal.winner, `${where}: champion`).toBe(champion);
}

describe('planDoubleElimination', () => {
  it('waits when there is no bracket yet', () => {
    const plan = planDoubleElimination(teamsOf(4), []);
    expect(plan.matches).toEqual([]);
    expect(plan.waiting).toBeTruthy();
  });

  it('explains a stall caused by a drawn match (complete, no winner)', () => {
    const ms = firstRound(teamsOf(4));
    ms[0].winner = 'T1'; ms[0].complete = true;
    ms[1].complete = true; // finished without a winner
    const plan = planDoubleElimination(teamsOf(4), ms);
    expect(plan.matches).toEqual([]);
    expect(plan.waiting).toMatch(/draw/);
  });

  it('does not generate anything while round 1 is unfinished', () => {
    const ms = firstRound(teamsOf(4));
    ms[0].winner = 'T1'; ms[0].complete = true;
    expect(planDoubleElimination(teamsOf(4), ms).matches).toEqual([]);
  });

  describe('4 teams, hand-checked', () => {
    const t = teamsOf(4);
    const played = (bracket: DeMatch['bracket'], round: number, team1: string, team2: string, winner: string): DeMatch =>
      ({ bracket, round, team1, team2, winner, complete: true });

    it('feeds the WB final loser into the losers bracket (the old code never did)', () => {
      const ms = [
        played('winners', 1, 'T1', 'T2', 'T1'),
        played('winners', 1, 'T3', 'T4', 'T3'),
      ];
      // WB round 2 and LB round 1 (T2 v T4) are both ready at once
      let plan = planDoubleElimination(t, ms);
      expect(plan.matches).toEqual<PlannedMatch[]>([
        { bracket: 'winners', round: 2, team1: 'T1', team2: 'T3' },
        { bracket: 'losers', round: 1, team1: 'T2', team2: 'T4' },
      ]);

      ms.push(played('winners', 2, 'T1', 'T3', 'T1'), played('losers', 1, 'T2', 'T4', 'T2'));
      // T3 (WB final loser, one loss) drops to meet T2 in LB round 2
      plan = planDoubleElimination(t, ms);
      expect(plan.matches).toEqual<PlannedMatch[]>([{ bracket: 'losers', round: 2, team1: 'T2', team2: 'T3' }]);

      ms.push(played('losers', 2, 'T2', 'T3', 'T3'));
      plan = planDoubleElimination(t, ms);
      expect(plan.matches).toEqual<PlannedMatch[]>([{ bracket: 'final', round: 1, team1: 'T1', team2: 'T3' }]);
    });

    it('plays a reset final when the LB champion beats the undefeated WB champion', () => {
      const ms = [
        played('winners', 1, 'T1', 'T2', 'T1'), played('winners', 1, 'T3', 'T4', 'T3'),
        played('winners', 2, 'T1', 'T3', 'T1'), played('losers', 1, 'T2', 'T4', 'T2'),
        played('losers', 2, 'T2', 'T3', 'T3'),
        played('final', 1, 'T1', 'T3', 'T3'),
      ];
      let plan = planDoubleElimination(t, ms);
      expect(plan.champion).toBeUndefined();
      expect(plan.matches).toEqual<PlannedMatch[]>([{ bracket: 'final', round: 2, team1: 'T1', team2: 'T3', reset: true }]);

      ms.push(played('final', 2, 'T1', 'T3', 'T1'));
      plan = planDoubleElimination(t, ms);
      expect(plan).toEqual({ matches: [], champion: 'T1' });
    });

    it('ends without a reset when the WB champion wins the final', () => {
      const ms = [
        played('winners', 1, 'T1', 'T2', 'T1'), played('winners', 1, 'T3', 'T4', 'T3'),
        played('winners', 2, 'T1', 'T3', 'T1'), played('losers', 1, 'T2', 'T4', 'T2'),
        played('losers', 2, 'T2', 'T3', 'T2'),
        played('final', 1, 'T1', 'T2', 'T1'),
      ];
      expect(planDoubleElimination(t, ms)).toEqual({ matches: [], champion: 'T1' });
    });
  });

  it('2 teams: WB final, then a grand final (and a reset if the loser wins it)', () => {
    const t = teamsOf(2);
    const ms: DeMatch[] = [{ bracket: 'winners', round: 1, team1: 'T1', team2: 'T2', winner: 'T1', complete: true }];
    expect(planDoubleElimination(t, ms).matches).toEqual([{ bracket: 'final', round: 1, team1: 'T1', team2: 'T2' }]);
  });

  describe('invariants hold for every field size and completion order', () => {
    for (let n = 2; n <= 32; n++) {
      it(`${n} teams`, () => {
        for (let seed = 1; seed <= 25; seed++) {
          check(n, simulate(n, seed * 7919 + n), seed * 7919 + n);
        }
      });
    }

    it('forces the reset final path for every size', () => {
      for (let n = 2; n <= 20; n++) {
        const res = simulate(n, 42 + n, { forceFinal: 'lb' });
        check(n, res, 42 + n);
        expect(res.matches.some(m => m.bracket === 'final' && m.round === 2), `n=${n}`).toBe(true);
      }
    });

    it('never needs a reset when the WB champion wins the final', () => {
      for (let n = 2; n <= 20; n++) {
        const res = simulate(n, 77 + n, { forceFinal: 'wb' });
        check(n, res, 77 + n);
        expect(res.matches.some(m => m.bracket === 'final' && m.round === 2), `n=${n}`).toBe(false);
        expect(res.champion).toBe(res.matches.find(m => m.bracket === 'final')!.team1);
      }
    });
  });
});
