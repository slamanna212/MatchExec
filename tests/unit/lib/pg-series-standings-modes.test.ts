// @vitest-environment node
/**
 * The series standings engine on Postgres, mode by mode: head_to_head, points (solo FFA/Position, team endurance,
 * tournaments, multipliers, drop_worst), stage vs season scope, the individual view, legacy equivalence and champions.
 * Matches and tournaments are inserted directly (tests/utils/pg-standings-fixtures.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createSeriesWithEntrants, insertStage, linkEvent, uid } from '../../utils/pg-series-fixtures';
import {
  addGame, addPlayer, addTeam, bracketTournament, normalMatch, positionMatch, setupStandingsWorld, type StandingsWorld,
} from '../../utils/pg-standings-fixtures';
import { createMatch } from '../../utils/pg-fixtures';
import { getSeriesChampion, getSeriesStandings, getSeriesStandingsResponse, SeriesError } from '@/lib/series';
import { series, seriesEvents } from '../../../lib/db/schema';
import { eq } from 'drizzle-orm';
import type { SeriesStandingRow } from '../../../shared/series-types';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));

setupPgTestFile();
const pg = () => getPgTestDb();

let w: StandingsWorld;
beforeEach(async () => {
  w = await setupStandingsWorld();
});

const byName = (rows: SeriesStandingRow[], name: string) => rows.find((r) => r.name === name)!;
const summary = (rows: SeriesStandingRow[]) => rows.map((r) => [r.name, r.rank]);

// ─── head_to_head ────────────────────────────────────────────────────────────

describe('head_to_head mode', () => {
  const h2h = (extra: Record<string, unknown> = {}) => ({ mode: 'head_to_head', ...extra });

  const league = async (names: string[], config: Record<string, unknown> = h2h()) => {
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'team', scoringType: 'Normal', scoringConfig: config,
      entrants: names.map((n) => ({ name: n, members: [`${n}1`, `${n}2`] })),
    });
    const id = Object.fromEntries(s.entrants.map((e) => [e.name, e.id]));
    const play = (a: string, b: string, maps: Array<'a' | 'b' | 'draw'>, ev = {}) =>
      normalMatch(w, s.seriesId, { entrant: id[a], players: [`${a}1`], name: a }, { entrant: id[b], players: [`${b}1`], name: b }, maps, ev);
    return { seriesId: s.seriesId, id, play };
  };

  it('keeps W-L-T records and map records and orders by wins, then map differential', async () => {
    const { seriesId, play } = await league(['Alpha', 'Bravo', 'Charlie']);
    await play('Alpha', 'Bravo', ['a', 'a']);            // Alpha 2-0
    await play('Alpha', 'Charlie', ['a', 'b']);          // 1-1 maps: tied match
    await play('Bravo', 'Charlie', ['a', 'b', 'a']);     // Bravo 2-1

    const res = (await getSeriesStandingsResponse(pg(), seriesId))!;
    expect(res.mode).toBe('head_to_head');
    expect(res.rows).toBe(res.standings);
    expect(summary(res.rows)).toEqual([['Alpha', 1], ['Bravo', 2], ['Charlie', 3]]);
    expect(byName(res.rows, 'Alpha')).toMatchObject({
      match_wins: 1, match_losses: 0, match_ties: 1, map_wins: 3, map_losses: 1, map_diff: 2, events_played: 2, total_points: 0,
    });
    expect(byName(res.rows, 'Bravo')).toMatchObject({ match_wins: 1, match_losses: 1, match_ties: 0, map_wins: 2, map_losses: 3, map_diff: -1 });
    expect(byName(res.rows, 'Charlie')).toMatchObject({ match_wins: 0, match_losses: 1, match_ties: 1, map_wins: 2, map_losses: 3, map_ties: 0 });
    // contract extras
    expect(byName(res.rows, 'Alpha')).toMatchObject({ key: expect.any(String), entrant_id: expect.any(String), username: 'Alpha', user_id: byName(res.rows, 'Alpha').key });
    expect(res.events).toHaveLength(3);
  });

  it('counts a drawn map as a map tie and a drawn series as a tied match', async () => {
    const { seriesId, play } = await league(['Alpha', 'Bravo']);
    await play('Alpha', 'Bravo', ['draw', 'draw']);
    const rows = await getSeriesStandings(pg(), seriesId);
    for (const r of rows) expect(r).toMatchObject({ match_wins: 0, match_losses: 0, match_ties: 1, map_ties: 2, map_diff: 0 });
    expect(rows.map((r) => r.rank)).toEqual([1, 1]);
  });

  it('does not rank a drawn pairing below entrants that have not played (draw = half a head-to-head win)', async () => {
    const { seriesId, play } = await league(['Alpha', 'Bravo', 'Charlie'], h2h({ tiebreakers: ['match_wins', 'head_to_head', 'maps_won'] }));
    await play('Alpha', 'Bravo', ['a', 'b']); // tied match, 1-1 maps
    const rows = await getSeriesStandings(pg(), seriesId);
    expect(rows[2].name).toBe('Charlie');
    expect(rows.map((r) => r.name).slice(0, 2).sort()).toEqual(['Alpha', 'Bravo']);
  });

  it('awards league points with the event multiplier and sorts by them when configured', async () => {
    const { seriesId, play } = await league(['Alpha', 'Bravo', 'Charlie'], h2h({ win_points: 3, loss_points: 0, tie_points: 1 }));
    await play('Bravo', 'Alpha', ['a'], { points_multiplier: 2 }); // Bravo 6
    await play('Alpha', 'Charlie', ['a', 'b']);                      // tie: 1 each
    await play('Bravo', 'Charlie', ['b']);                           // Charlie 3
    const rows = await getSeriesStandings(pg(), seriesId);
    expect(rows.map((r) => [r.name, r.total_points])).toEqual([['Bravo', 6], ['Charlie', 4], ['Alpha', 1]]);
    expect(byName(rows, 'Bravo').events.map((e) => e.points)).toEqual([6, null, 0]);
  });

  it('ranks on league points first even when a custom tiebreaker list does not include points', async () => {
    // Alpha has the only win but fewer points than Bravo and Charlie, who tied each other four times.
    const { seriesId, play } = await league(['Alpha', 'Bravo', 'Charlie'], h2h({ win_points: 3, tie_points: 1, tiebreakers: ['match_wins', 'map_diff'] }));
    await play('Alpha', 'Charlie', ['a']);              // Alpha 3 points, 1 win
    for (let i = 0; i < 4; i++) await play('Bravo', 'Charlie', ['draw']); // 4 tied matches: 4 points each, no wins
    const rows = await getSeriesStandings(pg(), seriesId);
    expect(rows.map((r) => [r.name, r.total_points, r.match_wins])).toEqual([['Bravo', 4, 0], ['Charlie', 4, 0], ['Alpha', 3, 1]]);
  });

  it('an explicit position for points in a custom list is respected (wins can outrank points)', async () => {
    const { seriesId, play } = await league(['Alpha', 'Bravo'], h2h({ win_points: 3, loss_points: 0, tie_points: 3, tiebreakers: ['match_wins', 'points'] }));
    await play('Alpha', 'Bravo', ['a']);                // Alpha 1 win, 3 pts
    await play('Bravo', 'Alpha', ['draw']);             // tie worth 3 points to each: Alpha 6, Bravo 3
    await play('Alpha', 'Bravo', ['draw']);             // Alpha 9, Bravo 6
    const rows = await getSeriesStandings(pg(), seriesId);
    expect(rows.map((r) => [r.name, r.match_wins, r.total_points])).toEqual([['Alpha', 1, 9], ['Bravo', 0, 6]]);
  });

  it('breaks a two-way tie on head-to-head before alphabetical order', async () => {
    // Bravo beat Alpha; Alpha beat Delta; Charlie beat Bravo and Delta. Alpha and Bravo are 1-1 with equal map diff.
    const { seriesId, play } = await league(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    await play('Bravo', 'Alpha', ['a']);
    await play('Alpha', 'Delta', ['a']);
    await play('Charlie', 'Bravo', ['a']);
    await play('Charlie', 'Delta', ['a']);
    const rows = await getSeriesStandings(pg(), seriesId);
    expect(summary(rows)).toEqual([['Charlie', 1], ['Bravo', 2], ['Alpha', 3], ['Delta', 4]]);
  });

  it('resolves a three-way tie with the mini-table among the tied entrants only', async () => {
    // Zed beat Yan and Xan; Yan beat Xan and P; Xan beat P and Q: Zed, Yan and Xan all have 2 wins.
    const { seriesId, play } = await league(['Zed', 'Yan', 'Xan', 'P', 'Q'], h2h({ tiebreakers: ['match_wins', 'head_to_head'] }));
    await play('Zed', 'Yan', ['a']);
    await play('Zed', 'Xan', ['a']);
    await play('Yan', 'Xan', ['a']);
    await play('Yan', 'P', ['a']);
    await play('Xan', 'P', ['a']);
    await play('Xan', 'Q', ['a']);
    const rows = await getSeriesStandings(pg(), seriesId);
    expect(summary(rows)).toEqual([['Zed', 1], ['Yan', 2], ['Xan', 3], ['P', 4], ['Q', 4]]);
  });

  it('uses the configured tiebreaker order (maps_won first)', async () => {
    const { seriesId, play } = await league(['Alpha', 'Bravo', 'Charlie', 'Delta'], h2h({ tiebreakers: ['maps_won', 'match_wins'] }));
    await play('Alpha', 'Bravo', ['a']);
    await play('Charlie', 'Delta', ['a', 'a', 'a'], {});
    const rows = await getSeriesStandings(pg(), seriesId);
    expect(rows[0].name).toBe('Charlie');
    expect(summary(rows)).toEqual([['Charlie', 1], ['Alpha', 2], ['Bravo', 3], ['Delta', 3]]);
  });

  it('supports win_pct', async () => {
    const { seriesId, play } = await league(['Alpha', 'Bravo', 'Charlie', 'Delta'], h2h({ tiebreakers: ['win_pct'] }));
    await play('Alpha', 'Bravo', ['a']);
    await play('Alpha', 'Charlie', ['b']);                // Charlie beats Alpha
    await play('Bravo', 'Charlie', ['a']);                // Bravo beats Charlie
    await play('Delta', 'Alpha', ['a']);                  // Delta beats Alpha, then nobody else plays Delta
    // Alpha 1-2, Bravo 1-1, Charlie 1-1, Delta 1-0: win percentage puts the undefeated Delta first, Alpha last
    const rows = await getSeriesStandings(pg(), seriesId);
    expect(summary(rows)).toEqual([['Delta', 1], ['Bravo', 2], ['Charlie', 2], ['Alpha', 4]]);
  });

  it('ignores incomplete matches, planned events, non-counting events and unmapped teams', async () => {
    const { seriesId, id, play } = await league(['Alpha', 'Bravo']);
    await play('Alpha', 'Bravo', ['a']);
    await normalMatch(w, seriesId, { entrant: id.Alpha, name: 'Alpha' }, { entrant: id.Bravo, name: 'Bravo' }, ['b'], {}, 'battle');
    await play('Alpha', 'Bravo', ['b'], { counts_for_standings: false });
    await pg().insert(seriesEvents).values({ id: uid('se_'), series_id: seriesId, event_type: 'match', event_order: 999, status: 'planned' });
    await normalMatch(w, seriesId, { entrant: null, players: ['stranger1'], name: 'S1' }, { entrant: id.Bravo, name: 'Bravo' }, ['b']);
    const res = (await getSeriesStandingsResponse(pg(), seriesId))!;
    expect(byName(res.rows, 'Alpha')).toMatchObject({ match_wins: 1, match_losses: 0, events_played: 1 });
    expect(byName(res.rows, 'Bravo')).toMatchObject({ match_wins: 0, match_losses: 1, events_played: 1 });
    expect(res.events).toHaveLength(3); // live counting events in scope: the played match, the one still in battle, the unmapped one
  });

  it('resolves a side through the roster when the match team row has no entrant (left members count)', async () => {
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'team', scoringConfig: h2h(),
      entrants: [
        { name: 'Alpha', members: ['a1', { username: 'a2', left: true }] },
        { name: 'Bravo', members: ['b1'] },
      ],
    });
    await normalMatch(w, s.seriesId, { players: ['a2'], name: 'X' }, { players: ['b1'], name: 'Y' }, ['a']);
    const rows = await getSeriesStandings(pg(), s.seriesId);
    expect(byName(rows, 'Alpha')).toMatchObject({ match_wins: 1 });
    expect(byName(rows, 'Bravo')).toMatchObject({ match_losses: 1 });
  });

  it('adds the 2-entrant matches of a counting tournament event; incomplete tournaments add nothing', async () => {
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'team', scoringConfig: h2h({ win_points: 2 }),
      entrants: [{ name: 'Alpha', members: ['a1'] }, { name: 'Bravo', members: ['b1'] }, { name: 'Charlie', members: ['c1'] }],
    });
    const [A, B, C] = s.entrants.map((e) => e.id);
    await bracketTournament(w, s.seriesId, [
      { name: 'Alpha', entrant: A, members: ['a1'] }, { name: 'Bravo', entrant: B, members: ['b1'] }, { name: 'Charlie', entrant: C, members: ['c1'] },
    ], [
      { round: 1, bracket: 'winners', a: 0, b: 1, winner: 1, maps: ['b', 'b'] },
      { round: 2, bracket: 'final', a: 1, b: 2, winner: 2, maps: ['b', 'a', 'b'] },
    ], { ev: { points_multiplier: 2 } });
    await bracketTournament(w, s.seriesId, [{ name: 'Alpha', entrant: A }, { name: 'Bravo', entrant: B }], [{ round: 1, bracket: 'final', a: 0, b: 1, winner: 0 }], { status: 'battle' });
    const rows = await getSeriesStandings(pg(), s.seriesId);
    expect(byName(rows, 'Bravo')).toMatchObject({ match_wins: 1, match_losses: 1, map_wins: 3, map_losses: 2, total_points: 4 });
    expect(byName(rows, 'Charlie')).toMatchObject({ match_wins: 1, match_losses: 0, map_wins: 2, map_losses: 1, total_points: 4 });
    expect(byName(rows, 'Alpha')).toMatchObject({ match_wins: 0, match_losses: 1, events_played: 1 });
  });

  it('lists every active entrant (even without results) and skips pending ones', async () => {
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'team', scoringConfig: h2h(),
      entrants: [
        { name: 'Alpha', division: 'East', tag: 'ALP', color: '#ff0000' }, { name: 'Bravo', division: 'West' },
        { name: 'Cee', division: 'East', status: 'pending' },
      ],
    });
    const res = (await getSeriesStandingsResponse(pg(), s.seriesId))!;
    expect(res.rows.map((r) => r.name)).toEqual(['Alpha', 'Bravo']);
    expect(byName(res.rows, 'Alpha')).toMatchObject({ division: 'East', tag: 'ALP', color: '#ff0000', events_played: 0, match_wins: 0 });
    expect(res.divisions).toEqual(['East', 'West']);
  });

  it('individual view: each player gets the record of the matches they played', async () => {
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'team', scoringConfig: h2h(),
      entrants: [{ name: 'Alpha', members: ['ann', 'abe'] }, { name: 'Bravo', members: ['bob'] }],
    });
    const [A, B] = s.entrants.map((e) => e.id);
    await normalMatch(w, s.seriesId, { entrant: A, players: ['ann'], name: 'Alpha' }, { entrant: B, players: ['bob'], name: 'Bravo' }, ['a', 'a']);
    await normalMatch(w, s.seriesId, { entrant: A, players: ['ann', 'abe'], name: 'Alpha' }, { entrant: B, players: ['bob'], name: 'Bravo' }, ['b']);
    const res = (await getSeriesStandingsResponse(pg(), s.seriesId, { view: 'individual' }))!;
    expect(res.view).toBe('individual');
    expect(byName(res.rows, 'ann')).toMatchObject({ match_wins: 1, match_losses: 1, entrant_name: 'Alpha', entrant_id: null, key: 'u-ann' });
    expect(byName(res.rows, 'abe')).toMatchObject({ match_wins: 0, match_losses: 1, events_played: 1 });
    expect(byName(res.rows, 'bob')).toMatchObject({ match_wins: 1, match_losses: 1, map_wins: 1, map_losses: 2 });
  });
});

// ─── points mode ─────────────────────────────────────────────────────────────

describe('points mode', () => {
  const soloSeries = async (names: string[], config: Record<string, unknown> = { mode: 'points' }) => {
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'solo', scoringType: 'Position', scoringConfig: config, entrants: names.map((n) => ({ name: n, members: [n] })),
    });
    const id = Object.fromEntries(s.entrants.map((e) => [e.name, e.id]));
    const race = (order: string[], ev = {}, opts = {}) =>
      positionMatch(w, s.seriesId, order.map((n) => ({ player: n, entrant: id[n] })), ev, opts);
    return { seriesId: s.seriesId, id, race };
  };

  it('scores solo Position races from the event spread with multipliers, event wins and podiums', async () => {
    const { seriesId, race } = await soloSeries(['ann', 'bob', 'cy', 'dee']);
    await race(['ann', 'bob', 'cy', 'dee']);
    await race(['bob', 'ann', 'cy', 'dee'], { points_multiplier: 2 });
    const rows = await getSeriesStandings(pg(), seriesId);
    expect(rows.map((r) => [r.name, r.total_points, r.rank])).toEqual([['bob', 68, 1], ['ann', 61, 2], ['cy', 45, 3], ['dee', 36, 4]]);
    expect(byName(rows, 'ann')).toMatchObject({ event_wins: 1, podiums: 2, events_played: 2, entrant_id: expect.any(String) });
    expect(byName(rows, 'dee')).toMatchObject({ event_wins: 0, podiums: 0 });
    expect(byName(rows, 'ann').events.map((e) => e.points)).toEqual([25, 36]);
  });

  it('uses position_points when the event spread is turned off', async () => {
    const { seriesId, race } = await soloSeries(['ann', 'bob', 'cy'], { mode: 'points', position_points: [10, 6, 3], position_event_use_event_spread: false });
    await race(['cy', 'ann', 'bob']);
    const rows = await getSeriesStandings(pg(), seriesId);
    expect(rows.map((r) => [r.name, r.total_points])).toEqual([['cy', 10], ['ann', 6], ['bob', 3]]);
  });

  it('falls back to match_win_points / match_loss_points for FFA-style events without a spread', async () => {
    const { seriesId, race } = await soloSeries(['ann', 'bob', 'cy'], { mode: 'points', match_win_points: 5, match_loss_points: 1, position_event_use_event_spread: false });
    await race(['bob', 'ann', 'cy']);
    const rows = await getSeriesStandings(pg(), seriesId);
    expect(rows.map((r) => [r.name, r.total_points])).toEqual([['bob', 5], ['ann', 1], ['cy', 1]]);
    // equal points; ann finished ahead of cy, which the count-back of finishing positions picks up
    expect(summary(rows)).toEqual([['bob', 1], ['ann', 2], ['cy', 3]]);
  });

  it('drop_worst ignores each entrant\'s lowest events and flags them', async () => {
    const { seriesId, race } = await soloSeries(['ann', 'bob'], { mode: 'points', drop_worst: 1 });
    await race(['ann', 'bob']);   // ann 25, bob 18
    await race(['bob', 'ann']);   // bob 25, ann 18
    await race(['ann', 'bob']);   // ann 25, bob 18
    const res = (await getSeriesStandingsResponse(pg(), seriesId))!;
    const ann = byName(res.rows, 'ann');
    const bob = byName(res.rows, 'bob');
    expect(ann.total_points).toBe(50);
    expect(ann.events.filter((e) => e.dropped)).toHaveLength(1);
    expect(ann.events.find((e) => e.dropped)!.points).toBe(18);
    expect(bob.total_points).toBe(43); // 25 + 18, one of the 18s dropped
    expect(ann.events_played).toBe(3);
  });

  it('does not drop anything until an entrant has played more events than drop_worst', async () => {
    const { seriesId, race } = await soloSeries(['ann', 'bob'], { mode: 'points', drop_worst: 2 });
    await race(['ann', 'bob']);
    await race(['bob', 'ann']);
    const rows = await getSeriesStandings(pg(), seriesId);
    expect(rows.map((r) => r.total_points)).toEqual([43, 43]);
    expect(rows.flatMap((r) => r.events).some((e) => e.dropped)).toBe(false);
  });

  it('ranks ties by event wins, then count-back of finishing positions, and shares the rank only when fully equal', async () => {
    const { seriesId, race } = await soloSeries(['ann', 'bob', 'cy'], { mode: 'points', tiebreakers: ['points', 'event_wins', 'best_finishes'] });
    await race(['ann', 'bob', 'cy'], {}, { spread: [10, 6, 0] });  // ann 10, bob 6, cy 0
    await race(['bob', 'cy', 'ann'], {}, { spread: [10, 6, 0] });  // bob 10, cy 6, ann 0
    await race(['cy', 'ann', 'bob'], {}, { spread: [10, 6, 0] });  // cy 10, ann 6, bob 0
    // everyone: 16 points, one win, one 2nd, one 3rd -> fully tied
    const rows = await getSeriesStandings(pg(), seriesId);
    expect(rows.map((r) => r.total_points)).toEqual([16, 16, 16]);
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 1]);
    expect(rows.map((r) => r.name)).toEqual(['ann', 'bob', 'cy']);

    // different points: the higher total wins
    const second = await soloSeries(['ann', 'bob'], { mode: 'points' });
    await second.race(['ann', 'bob'], {}, { spread: [10, 4] });   // ann 10 bob 4
    await second.race(['bob', 'ann'], {}, { spread: [8, 6] });    // bob 8 ann 6 -> bob 12 ann 16
    const rows2 = await getSeriesStandings(pg(), second.seriesId);
    expect(summary(rows2)).toEqual([['ann', 1], ['bob', 2]]);

    // equal points and no wins separating them: ann finished (1st, 3rd), bob (2nd, 2nd), cy won the other race
    const third = await soloSeries(['ann', 'bob', 'cy'], { mode: 'points', tiebreakers: ['points', 'best_finishes'] });
    await third.race(['ann', 'bob', 'cy'], {}, { spread: [12, 6, 0] });   // ann 12, bob 6
    await third.race(['cy', 'bob', 'ann'], {}, { spread: [10, 6, 0] });   // cy 10, bob 6, ann 0
    const rows3 = await getSeriesStandings(pg(), third.seriesId);
    expect(rows3.map((r) => [r.name, r.total_points])).toEqual([['ann', 12], ['bob', 12], ['cy', 10]]);
    expect(summary(rows3)).toEqual([['ann', 1], ['bob', 2], ['cy', 3]]);
  });

  it('scores team endurance matches per team entrant (team total), via the team row\'s entrant', async () => {
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'team', scoringType: 'Position', scoringConfig: { mode: 'points' },
      entrants: [{ name: 'Red', members: ['r1', 'r2'] }, { name: 'Blue', members: ['b1', 'b2'] }],
    });
    const [R, B] = s.entrants.map((e) => e.id);
    // finishing order r1, b1, r2, b2 -> Red 25 + 15 = 40, Blue 18 + 12 = 30
    await positionMatch(w, s.seriesId, [
      { player: 'r1', team: 'Red', entrant: R }, { player: 'b1', team: 'Blue', entrant: B }, { player: 'r2', team: 'Red', entrant: R }, { player: 'b2', team: 'Blue', entrant: B },
    ]);
    const rows = await getSeriesStandings(pg(), s.seriesId);
    expect(rows.map((r) => [r.name, r.total_points, r.rank])).toEqual([['Red', 40, 1], ['Blue', 30, 2]]);
    expect(byName(rows, 'Red')).toMatchObject({ event_wins: 1, events_played: 1 });

    // individual view: every member is credited with the entrant's event points
    const individual = (await getSeriesStandingsResponse(pg(), s.seriesId, { view: 'individual' }))!.rows;
    expect(individual.map((r) => [r.name, r.total_points, r.entrant_name])).toEqual([
      ['b1', 30, 'Blue'], ['b2', 30, 'Blue'], ['r1', 40, 'Red'], ['r2', 40, 'Red'],
    ].sort((a, b) => (b[1] as number) - (a[1] as number) || String(a[0]).localeCompare(String(b[0]))));
  });

  it('resolves participants through the roster when team rows have no entrant, ignoring unmapped players', async () => {
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'solo', scoringType: 'Position', scoringConfig: { mode: 'points' },
      entrants: [{ name: 'Ann', members: ['ann'] }, { name: 'Bob', members: [{ username: 'bob', left: true }] }],
    });
    await positionMatch(w, s.seriesId, [{ player: 'stranger' }, { player: 'ann' }, { player: 'bob' }]);
    const rows = await getSeriesStandings(pg(), s.seriesId);
    expect(rows.map((r) => [r.name, r.total_points])).toEqual([['Ann', 18], ['Bob', 15]]);
  });

  it('scores Normal matches with win/loss points, including a forfeit that has team placements but no players', async () => {
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'team', scoringType: 'Normal', scoringConfig: { mode: 'points', match_win_points: 3, match_loss_points: 1 },
      entrants: [{ name: 'Alpha', members: ['a1'] }, { name: 'Bravo', members: ['b1'] }],
    });
    const [A, B] = s.entrants.map((e) => e.id);
    await normalMatch(w, s.seriesId, { entrant: A, players: ['a1'], name: 'Alpha' }, { entrant: B, players: ['b1'], name: 'Bravo' }, ['a']);
    await normalMatch(w, s.seriesId, { entrant: A, name: 'Alpha' }, { entrant: B, name: 'Bravo' }, ['b'], { points_multiplier: 2 }); // forfeit: nobody played
    const rows = await getSeriesStandings(pg(), s.seriesId);
    expect(rows.map((r) => [r.name, r.total_points])).toEqual([['Bravo', 7], ['Alpha', 5]]);
    expect(byName(rows, 'Bravo')).toMatchObject({ event_wins: 1, events_played: 2 });
  });

  it('scores bracket tournaments through tournament teams (entrant-tagged or by roster lookup)', async () => {
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'team', scoringConfig: { mode: 'points', tournament_position_points: [10, 6, 3] },
      entrants: [{ name: 'Alpha', members: ['a1'] }, { name: 'Bravo', members: ['b1'] }, { name: 'Charlie', members: ['c1'] }, { name: 'Delta', members: ['d1'] }],
    });
    const [A, B, C] = s.entrants.map((e) => e.id);
    await bracketTournament(w, s.seriesId, [
      { name: 'ta', entrant: A, members: ['a1'] }, { name: 'tb', entrant: B, members: ['b1'] }, { name: 'tc', entrant: null, members: ['c1'] }, { name: 'td', members: ['d1'] },
    ], [
      { round: 1, bracket: 'winners', a: 0, b: 3, winner: 0 },
      { round: 1, bracket: 'winners', a: 1, b: 2, winner: 1 },
      { round: 2, bracket: 'winners', a: 0, b: 1, winner: 0 },
    ], { ev: { points_multiplier: 2 } });
    const rows = await getSeriesStandings(pg(), s.seriesId);
    expect(rows.map((r) => [r.name, r.total_points])).toEqual([['Alpha', 20], ['Bravo', 12], ['Charlie', 6], ['Delta', 6]]);
    expect(byName(rows, 'Alpha')).toMatchObject({ event_wins: 1, events_played: 1 });
    expect(C).toBeDefined();
  });

  it('scores a cumulative-points tournament by entrant totals', async () => {
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'solo', scoringType: 'Position', scoringConfig: { mode: 'points', tournament_position_points: [30, 20, 10] },
      entrants: [{ name: 'Ann', members: ['ann'] }, { name: 'Bob', members: ['bob'] }, { name: 'Cy', members: ['cy'] }],
    });
    const [A, B, C] = s.entrants.map((e) => e.id);
    const { createTournament } = await import('../../utils/pg-fixtures');
    const t = await createTournament(w.gameId, { format: 'cumulative-points', status: 'complete', game_mode_id: w.positionMode });
    for (const spread of [[10, 6, 3], [3, 10, 6]]) {
      const m = await createMatch(w.gameId, w.positionMode, { status: 'complete', tournament_id: t.id });
      const order = ['ann', 'bob', 'cy'];
      const ids: string[] = [];
      for (const [i, n] of order.entries()) ids.push(await addPlayer(m.id, n, await addTeam(m.id, n, i, [A, B, C][i])));
      await addGame(m.id, 1, ids.map((id, i) => ({ type: 'participant' as const, id, pos: i + 1, pts: spread[i] })));
    }
    await linkEvent(s.seriesId, 'tournament', t.id);
    // ann 13, bob 16, cy 9
    const rows = await getSeriesStandings(pg(), s.seriesId);
    expect(rows.map((r) => [r.name, r.total_points])).toEqual([['Bob', 30], ['Ann', 20], ['Cy', 10]]);
  });
});

// ─── scope ───────────────────────────────────────────────────────────────────

describe('scope', () => {
  const league = async () => {
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'team', scoringType: 'Normal', scoringConfig: { mode: 'points', match_win_points: 3, match_loss_points: 0 },
      entrants: [{ name: 'Alpha', members: ['a1'] }, { name: 'Bravo', members: ['b1'] }],
    });
    const [A, B] = s.entrants.map((e) => e.id);
    const play = (winner: 'a' | 'b', ev = {}) => normalMatch(w, s.seriesId, { entrant: A, name: 'Alpha' }, { entrant: B, name: 'Bravo' }, [winner], ev);
    return { s, play };
  };

  it('season counts stages that count toward the season; a stage scope counts only its own events', async () => {
    const { s, play } = await league();
    const s1 = await insertStage(s.seriesId, { name: 'Stage 1', stage_order: 1 });
    const s2 = await insertStage(s.seriesId, { name: 'Stage 2', stage_order: 2, counts_toward_season: false });
    await play('a', { stage_id: s1.id });
    await play('b', { stage_id: s1.id });
    await play('b', { stage_id: s2.id });
    await play('a');                                                    // no stage: part of the season
    await play('b', { stage_id: s1.id, counts_for_standings: false });  // never counts
    await play('b', { stage_id: s1.id, role: 'stage_playoff', counts_for_standings: false });

    const season = (await getSeriesStandingsResponse(pg(), s.seriesId))!;
    expect(season.scope).toEqual({ type: 'season' });
    expect(season.rows.map((r) => [r.name, r.total_points])).toEqual([['Alpha', 6], ['Bravo', 3]]);
    expect(season.events).toHaveLength(3);

    const stage2 = (await getSeriesStandingsResponse(pg(), s.seriesId, { scope: s2.id }))!;
    expect(stage2.scope).toEqual({ type: 'stage', stage_id: s2.id });
    expect(stage2.rows.map((r) => [r.name, r.total_points])).toEqual([['Bravo', 3], ['Alpha', 0]]);
    expect(stage2.events.map((e) => e.stage_id)).toEqual([s2.id]);

    const stage1 = (await getSeriesStandingsResponse(pg(), s.seriesId, { scope: s1.id }))!;
    expect(stage1.rows.map((r) => [r.name, r.total_points])).toEqual([['Alpha', 3], ['Bravo', 3]]);
    expect(stage1.rows.map((r) => r.rank)).toEqual([1, 1]);
  });

  it('a stage outside the season counts its playoff events even though they do not count toward the season; exhibitions never count', async () => {
    const { s, play } = await league();
    const reg = await insertStage(s.seriesId, { name: 'Regular', stage_order: 1 });
    const po = await insertStage(s.seriesId, { name: 'Playoffs', stage_order: 2, counts_toward_season: false });
    await play('a', { stage_id: reg.id });
    await play('b', { stage_id: po.id, role: 'stage_playoff', counts_for_standings: false });
    await play('b', { stage_id: po.id, role: 'stage_playoff', counts_for_standings: false });
    await play('a', { stage_id: po.id, role: 'exhibition', counts_for_standings: false });

    const playoffs = (await getSeriesStandingsResponse(pg(), s.seriesId, { scope: po.id }))!;
    expect(playoffs.events).toHaveLength(2);
    expect(playoffs.rows.map((r) => [r.name, r.total_points])).toEqual([['Bravo', 6], ['Alpha', 0]]);
    // the season table is unchanged by them
    const season = (await getSeriesStandingsResponse(pg(), s.seriesId))!;
    expect(season.rows.map((r) => [r.name, r.total_points])).toEqual([['Alpha', 3], ['Bravo', 0]]);
  });

  it('a stage outside the season lists only the entrants that played in it; a season stage still lists everyone', async () => {
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'team', scoringType: 'Normal', scoringConfig: { mode: 'points', match_win_points: 3, match_loss_points: 0 },
      entrants: [{ name: 'Alpha', members: ['a1'] }, { name: 'Bravo', members: ['b1'] }, { name: 'Cy', members: ['c1'] }],
    });
    const [A, B] = s.entrants.map((e) => e.id);
    const reg = await insertStage(s.seriesId, { name: 'Regular', stage_order: 1 });
    const po = await insertStage(s.seriesId, { name: 'Playoffs', stage_order: 2, counts_toward_season: false });
    await normalMatch(w, s.seriesId, { entrant: A, name: 'Alpha' }, { entrant: B, name: 'Bravo' }, ['a'], { stage_id: po.id, role: 'stage_playoff', counts_for_standings: false });

    const playoffs = (await getSeriesStandingsResponse(pg(), s.seriesId, { scope: po.id }))!;
    expect(playoffs.rows.map((r) => r.name)).toEqual(['Alpha', 'Bravo']); // Cy did not qualify
    const regular = (await getSeriesStandingsResponse(pg(), s.seriesId, { scope: reg.id }))!;
    expect(regular.rows.map((r) => r.name).sort()).toEqual(['Alpha', 'Bravo', 'Cy']);
  });

  it('applies a stage scoring_config over the series config key by key', async () => {
    const { s, play } = await league();
    const st = await insertStage(s.seriesId, { scoring_config: { match_win_points: 5 } });
    await play('a', { stage_id: st.id });
    await play('a');
    const season = await getSeriesStandings(pg(), s.seriesId);
    expect(byName(season, 'Alpha').total_points).toBe(8); // 5 (stage override) + 3
    expect((await getSeriesStandings(pg(), s.seriesId, { scope: st.id }))[0].total_points).toBe(5);
  });

  it('throws a 404 SeriesError for a stage of another series and orders events by stage then event order', async () => {
    const { s } = await league();
    const other = await createSeriesWithEntrants(pg(), { entrantType: 'solo', entrants: [] });
    const foreign = await insertStage(other.seriesId);
    await expect(getSeriesStandingsResponse(pg(), s.seriesId, { scope: foreign.id })).rejects.toMatchObject({ status: 404 });
    await expect(getSeriesStandingsResponse(pg(), s.seriesId, { scope: 'nope' })).rejects.toBeInstanceOf(SeriesError);
    expect(await getSeriesStandingsResponse(pg(), 'missing')).toBeNull();

  });

  it('orders the event list by (stage_order, event_order)', async () => {
    const { s, play } = await league();
    const first = await insertStage(s.seriesId, { stage_order: 1 });
    const second = await insertStage(s.seriesId, { stage_order: 2 });
    await play('a', { stage_id: second.id, event_order: 1 });
    await play('a', { stage_id: first.id, event_order: 2 });
    const res = (await getSeriesStandingsResponse(pg(), s.seriesId))!;
    expect(res.events.map((e) => e.stage_id)).toEqual([first.id, second.id]);
  });
});

// ─── legacy equivalence ──────────────────────────────────────────────────────

describe('legacy series (no entrants, no mode)', () => {
  it('scores per player exactly like before, with the new response shape on top', async () => {
    const [{ id: sid }] = await pg().insert(series).values({ id: uid('s_'), name: 'Legacy', status: 'active', scoring_config: { match_win_points: 3, match_loss_points: 1 } }).returning({ id: series.id });
    await normalMatch(w, sid, { players: ['ann'], name: 'A' }, { players: ['bob'], name: 'B' }, ['a']);
    await normalMatch(w, sid, { players: ['bob'], name: 'A' }, { players: ['ann'], name: 'B' }, ['a'], { points_multiplier: 0.5 });
    const res = (await getSeriesStandingsResponse(pg(), sid))!;
    expect(res.mode).toBe('points');
    expect(res.view).toBe('entrant');
    expect(res.rows.map((r) => [r.username, r.user_id, r.total_points, r.rank, r.events_played, r.entrant_id])).toEqual([
      ['ann', 'u-ann', 3.5, 1, 2, null], ['bob', 'u-bob', 2.5, 2, 2, null],
    ]);
    expect(res.standings).toEqual(res.rows);
    // the individual view of a series without entrants is the same table
    const individual = (await getSeriesStandingsResponse(pg(), sid, { view: 'individual' }))!;
    expect(individual.rows.map((r) => [r.key, r.total_points])).toEqual(res.rows.map((r) => [r.key, r.total_points]));
  });

  it('ranks only on points: a player with an event win does not outrank an equal-points player', async () => {
    const [{ id: sid }] = await pg().insert(series).values({ id: uid('s_'), name: 'Legacy', status: 'active', scoring_config: { match_win_points: 1, match_loss_points: 1 } }).returning({ id: series.id });
    await normalMatch(w, sid, { players: ['zed'], name: 'A' }, { players: ['amy'], name: 'B' }, ['a']);
    const rows = await getSeriesStandings(pg(), sid);
    expect(summary(rows)).toEqual([['amy', 1], ['zed', 1]]);
  });
});

// ─── champion ────────────────────────────────────────────────────────────────

describe('getSeriesChampion', () => {
  it('is null until the series is complete, then the leader of the season table', async () => {
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'team', scoringConfig: { mode: 'head_to_head' },
      entrants: [{ name: 'Alpha', members: ['a1'] }, { name: 'Bravo', members: ['b1'] }],
    });
    const [A, B] = s.entrants.map((e) => e.id);
    await normalMatch(w, s.seriesId, { entrant: A, name: 'Alpha' }, { entrant: B, name: 'Bravo' }, ['b']);
    expect(await getSeriesChampion(pg(), s.seriesId)).toBeNull();
    await pg().update(series).set({ status: 'complete' }).where(eq(series.id, s.seriesId));
    expect(await getSeriesChampion(pg(), s.seriesId)).toEqual({ entrant_id: B, name: 'Bravo', source: 'standings' });
    expect(await getSeriesChampion(pg(), 'missing')).toBeNull();
  });

  it('joins tied leaders and is null when nobody has scored', async () => {
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'team', scoringConfig: { match_win_points: 1, match_loss_points: 1 }, status: 'complete',
      entrants: [{ name: 'Alpha', members: ['a1'] }, { name: 'Bravo', members: ['b1'] }],
    });
    expect(await getSeriesChampion(pg(), s.seriesId)).toBeNull();
    const [A, B] = s.entrants.map((e) => e.id);
    await normalMatch(w, s.seriesId, { entrant: A, name: 'Alpha' }, { entrant: B, name: 'Bravo' }, ['a']);
    expect(await getSeriesChampion(pg(), s.seriesId)).toEqual({ entrant_id: null, name: 'Alpha, Bravo', source: 'standings' });
  });

  it('prefers the winner of a completed season_playoff tournament, even before the series completes', async () => {
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'team', scoringConfig: { mode: 'head_to_head' },
      entrants: [{ name: 'Alpha', members: ['a1'] }, { name: 'Bravo', members: ['b1'] }],
    });
    const [A, B] = s.entrants.map((e) => e.id);
    await normalMatch(w, s.seriesId, { entrant: A, name: 'Alpha' }, { entrant: B, name: 'Bravo' }, ['a']);
    await bracketTournament(w, s.seriesId, [{ name: 'Alpha', entrant: A, members: ['a1'] }, { name: 'Bravo', entrant: B, members: ['b1'] }],
      [{ round: 1, bracket: 'final', a: 0, b: 1, winner: 1 }], { ev: { role: 'season_playoff', counts_for_standings: false } });
    expect(await getSeriesChampion(pg(), s.seriesId)).toEqual({ entrant_id: B, name: 'Bravo', source: 'season_playoff' });
  });

  it('ignores a season playoff that is not finished and names the tournament team when there are no entrants', async () => {
    const [{ id: sid }] = await pg().insert(series).values({ id: uid('s_'), name: 'Legacy', status: 'active' }).returning({ id: series.id });
    await bracketTournament(w, sid, [{ name: 'The Champs', members: ['x1', 'x2'] }, { name: 'Others', members: ['y1'] }],
      [{ round: 1, bracket: 'final', a: 0, b: 1, winner: 0 }], { status: 'battle', ev: { role: 'season_playoff', counts_for_standings: false } });
    expect(await getSeriesChampion(pg(), sid)).toBeNull();

    const [{ id: sid2 }] = await pg().insert(series).values({ id: uid('s_'), name: 'Legacy 2', status: 'active' }).returning({ id: series.id });
    await bracketTournament(w, sid2, [{ name: 'The Champs', members: ['x1', 'x2'] }, { name: 'Others', members: ['y1'] }],
      [{ round: 1, bracket: 'final', a: 0, b: 1, winner: 0 }], { ev: { role: 'season_playoff', counts_for_standings: false } });
    expect(await getSeriesChampion(pg(), sid2)).toEqual({ entrant_id: null, name: 'The Champs', source: 'season_playoff' });
  });
});

describe('odds and ends', () => {
  it('a series with entrants and no events lists its active entrants with zeroes', async () => {
    const s = await createSeriesWithEntrants(pg(), { entrantType: 'solo', entrants: [{ name: 'Ann', members: ['ann'] }, { name: 'Bob', members: ['bob'] }] });
    const rows = await getSeriesStandings(pg(), s.seriesId);
    expect(rows.map((r) => [r.name, r.total_points, r.events_played, r.rank])).toEqual([['Ann', 0, 0, 1], ['Bob', 0, 0, 1]]);
  });

  it('ignores a participant-less, placement-less completed match', async () => {
    const s = await createSeriesWithEntrants(pg(), { entrantType: 'solo', entrants: [{ name: 'Ann', members: ['ann'] }] });
    const m = await createMatch(w.gameId, w.normalMode, { status: 'complete' });
    await linkEvent(s.seriesId, 'match', m.id);
    const rows = await getSeriesStandings(pg(), s.seriesId);
    expect(rows.map((r) => r.events_played)).toEqual([0]);
  });
});
