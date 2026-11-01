/**
 * Series scoring and management through the real routes, with the matches and tournaments
 * scored through the real scoring path (nothing mocked). Complements tests/unit/series.test.ts
 * and series.test.ts, which seed rows by hand.
 *
 * Regressions covered:
 *  - a tournament and one of its own matches could both be added to a series (points counted twice)
 *  - start/end dates and game_id were not validated (end before start, unknown game)
 *  - a renamed player kept the username from their first event
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { createGame, createGameMode } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { finishedBracket, tournamentInAssign, generateBracket, tournamentTransition } from '../../utils/bracket-helpers';
import type { BracketCtx } from '../../utils/bracket-helpers';
import { forwardToApp as createMatch } from '../../utils/legacy-match-routes';
import { forwardToApp as transitionMatch } from '../../utils/legacy-match-routes';
import { forwardToApp as assignTeams } from '../../utils/legacy-match-routes';
import { forwardToApp as saveResult } from '../../utils/legacy-match-routes';
import { POST as createSeries } from '@/app/api/series/route';
import { PATCH as patchSeries } from '@/app/api/series/[seriesId]/route';
import { POST as addEvent } from '@/app/api/series/[seriesId]/events/route';
import { DELETE as deleteEvent, PATCH as patchEvent } from '@/app/api/series/[seriesId]/events/[eventId]/route';
import { POST as transitionSeries } from '@/app/api/series/[seriesId]/transition/route';
import { updateSeriesEvent } from '@/lib/series';
import { GET as getStandings } from '@/app/api/series/[seriesId]/standings/route';

let db: ReturnType<typeof getTestDb>;
let ctx: BracketCtx;
let gameId: string;
let seq = 0;

const req = (method: string, url: string, body?: Record<string, unknown>) => createMockRequest(method, url, body);

async function mode(scoringType: 'Normal' | 'FFA' | 'Position', teamSize: number | null, maps = 3) {
  const m = await createGameMode(gameId, { scoring_type: scoringType, team_size: teamSize as number, name: `${scoringType} ${++seq}` });
  const mapIds: string[] = [];
  for (let i = 0; i < maps; i++) {
    const id = `smap-${++seq}`;
    await db.run(`INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`, [id, gameId, m.id, id]);
    mapIds.push(id);
  }
  return { modeId: m.id, mapIds };
}

const move = async (matchId: string, newStatus: string) =>
  transitionMatch(req('POST', `/api/matches/${matchId}/transition`, { newStatus }), createRouteParams({ matchId }));

/** Create a match with `players` participants (discord ids 100.. so identities repeat across matches). */
async function newMatch(mapIds: string[], players: number, extra: Record<string, unknown> = {}) {
  const res = await parseResponse(await createMatch(req('POST', '/api/matches', {
    name: `M${++seq}`, gameId, maps: mapIds, rounds: mapIds.length, startDate: new Date().toISOString(), ...extra,
  })));
  expect(res.status).toBe(201);
  const matchId: string = res.data.id;
  const ids: string[] = [];
  for (let i = 0; i < players; i++) {
    const id = `${matchId}-p${i}`;
    await db.run(
      `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username) VALUES (?, ?, ?, ?, ?)`,
      [id, matchId, `user-${i}`, `${100 + i}`, `Player${i}`]
    );
    ids.push(id);
  }
  return { matchId, ids };
}

const gamesOf = (matchId: string) => db.all<{ id: string }>(`SELECT id FROM match_games WHERE match_id = ? ORDER BY round`, [matchId]);
const score = async (matchId: string, gId: string, body: Record<string, unknown>) =>
  parseResponse(await saveResult(req('POST', `/api/matches/${matchId}/games/${gId}/result`, body), createRouteParams({ matchId, gameId: gId })));

/**
 * A finished Normal match. `layout[i]` is player i's team: a team index, 'reserve' or null (unassigned).
 * Team 0 wins unless `outcome` is 'draw' or a team index.
 */
async function finishedNormal(layout: Array<number | 'reserve' | null>, outcome: number | 'draw' = 0, teamCount = 2) {
  const { mapIds } = await mode('Normal', 5, 1);
  const { matchId, ids } = await newMatch(mapIds, layout.length, { teamCount });
  await move(matchId, 'gather');
  await move(matchId, 'assign');
  const teams = await db.all<{ id: string; is_reserve: number }>(
    `SELECT id, is_reserve FROM match_teams WHERE match_id = ? ORDER BY team_order`, [matchId]
  );
  const playing = teams.filter(t => !t.is_reserve);
  const reserve = teams.find(t => t.is_reserve)!;
  const assignments = layout.flatMap((slot, i) =>
    slot === null ? [] : [{ participantId: ids[i], teamId: slot === 'reserve' ? reserve.id : playing[slot].id }]
  );
  const res = await assignTeams(req('POST', `/api/matches/${matchId}/assign-teams`, { teamAssignments: assignments }), createRouteParams({ matchId }));
  expect(res.status).toBe(200);
  await move(matchId, 'battle');
  const [g] = await gamesOf(matchId);
  const body = outcome === 'draw' ? { draw: true } : { winnerTeamId: playing[outcome].id, winnerScore: 13, loserScore: 4 };
  expect((await score(matchId, g.id, body)).status).toBe(200);
  expect((await db.get<{ status: string }>(`SELECT status FROM matches WHERE id = ?`, [matchId]))?.status).toBe('complete');
  return { matchId, ids, gameId: g.id, teams: playing };
}

async function finishedFfa(players: number, winnerIdx: number) {
  const { mapIds } = await mode('FFA', null, 2);
  const { matchId, ids } = await newMatch(mapIds, players);
  for (const s of ['gather', 'assign', 'battle']) await move(matchId, s);
  for (const g of await gamesOf(matchId)) {
    expect((await score(matchId, g.id, { type: 'FFA', matchId, gameId: g.id, winnerParticipantId: ids[winnerIdx] })).status).toBe(200);
  }
  return { matchId, ids };
}

/** Finished Position match; `order` lists player indexes first to last. */
async function finishedPosition(players: number, order: number[]) {
  const { mapIds } = await mode('Position', 1, 1);
  const { matchId, ids } = await newMatch(mapIds, players);
  for (const s of ['gather', 'assign', 'battle']) await move(matchId, s);
  const [g] = await gamesOf(matchId);
  const positionResults = Object.fromEntries(order.map((idx, k) => [ids[idx], k + 1]));
  expect((await score(matchId, g.id, { type: 'Position', matchId, gameId: g.id, positionResults })).status).toBe(200);
  return { matchId, ids };
}

async function series(config?: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const res = await parseResponse(await createSeries(req('POST', '/api/series', { name: `S${++seq}`, ...(config ? { scoring_config: config } : {}), ...extra })));
  expect(res.status).toBe(201);
  return res.data.id as string;
}
const add = async (sid: string, body: Record<string, unknown>) =>
  parseResponse(await addEvent(req('POST', `/api/series/${sid}/events`, body), createRouteParams({ seriesId: sid })));
const standings = async (sid: string) =>
  (await parseResponse(await getStandings(req('GET', `/api/series/${sid}/standings`), createRouteParams({ seriesId: sid })))).data.standings as
    Array<{ rank: number; user_id: string; username: string; total_points: number; events_played: number }>;
const pointsOf = async (sid: string) => Object.fromEntries((await standings(sid)).map(r => [r.user_id, r.total_points]));

describe('Series scoring', () => {
  beforeEach(async () => {
    db = getTestDb();
    gameId = (await createGame()).id;
    const normal = await mode('Normal', 5, 4);
    ctx = { db, gameId, normalModeId: normal.modeId };
  });

  describe('match events', () => {
    it('credits winners, gives the other assigned players loss points, and ignores reserves and unassigned players', async () => {
      // players 0,2 = team 0 (win); 1,3 = team 1; 4 = reserve; 5 = unassigned
      const m = await finishedNormal([0, 1, 0, 1, 'reserve', null]);
      const sid = await series({ match_win_points: 3, match_loss_points: 1 });
      await add(sid, { event_type: 'match', match_id: m.matchId });
      expect(await pointsOf(sid)).toEqual({ '100': 3, '102': 3, '101': 1, '103': 1 });
    });

    it('applies fractional multipliers', async () => {
      const m = await finishedNormal([0, 1]);
      const sid = await series({ match_win_points: 3, match_loss_points: 1 });
      await add(sid, { event_type: 'match', match_id: m.matchId, points_multiplier: 0.5 });
      expect(await pointsOf(sid)).toEqual({ '100': 1.5, '101': 0.5 });
    });

    it('with 3 teams, only the winning team earns win points', async () => {
      const m = await finishedNormal([0, 1, 2], 1, 3);
      const sid = await series({ match_win_points: 5, match_loss_points: 1 });
      await add(sid, { event_type: 'match', match_id: m.matchId });
      expect(await pointsOf(sid)).toEqual({ '100': 1, '101': 5, '102': 1 });
    });

    it('a drawn match awards no win points (everyone assigned gets loss points)', async () => {
      const m = await finishedNormal([0, 1], 'draw');
      const sid = await series({ match_win_points: 3, match_loss_points: 1 });
      await add(sid, { event_type: 'match', match_id: m.matchId });
      expect(await pointsOf(sid)).toEqual({ '100': 1, '101': 1 });
    });

    it('scores FFA with win/loss points', async () => {
      const m = await finishedFfa(4, 2);
      const sid = await series({ match_win_points: 3, match_loss_points: 1 });
      await add(sid, { event_type: 'match', match_id: m.matchId });
      expect(await pointsOf(sid)).toEqual({ '100': 1, '101': 1, '102': 3, '103': 1 });
    });

    it('Position events use the finishing spread by default and win/loss points when the toggle is off', async () => {
      const m = await finishedPosition(4, [3, 1, 0, 2]); // spread 25 / 18 / 15 / 12
      const bySpread = await series({ match_win_points: 3, match_loss_points: 1 });
      await add(bySpread, { event_type: 'match', match_id: m.matchId, points_multiplier: 2 });
      expect(await pointsOf(bySpread)).toEqual({ '103': 50, '101': 36, '100': 30, '102': 24 });

      const byWinLoss = await series({ match_win_points: 3, match_loss_points: 1, position_event_use_event_spread: false });
      await add(byWinLoss, { event_type: 'match', match_id: m.matchId });
      expect(await pointsOf(byWinLoss)).toEqual({ '103': 3, '101': 1, '100': 1, '102': 1 });
    });

    it('lists players with 0 points when the series has no scoring_config', async () => {
      const m = await finishedNormal([0, 1]);
      const sid = await series();
      await add(sid, { event_type: 'match', match_id: m.matchId });
      expect(await pointsOf(sid)).toEqual({ '100': 0, '101': 0 });
    });

    it('ignores matches that are not complete (including cancelled) and does not count them as played', async () => {
      const { mapIds } = await mode('Normal', 5, 1);
      const open = await newMatch(mapIds, 2);
      const cancelled = await newMatch(mapIds, 2);
      await move(cancelled.matchId, 'cancelled');
      const done = await finishedNormal([0, 1]);
      const sid = await series({ match_win_points: 3, match_loss_points: 1 });
      await add(sid, { event_type: 'match', match_id: open.matchId });
      await add(sid, { event_type: 'match', match_id: cancelled.matchId });
      await add(sid, { event_type: 'match', match_id: done.matchId });
      const rows = await standings(sid);
      expect(rows.map(r => r.events_played)).toEqual([1, 1]);
      expect(rows.map(r => r.total_points).sort()).toEqual([1, 3]);
    });

    it('follows a rescore: standings are computed from the current results', async () => {
      const m = await finishedNormal([0, 1], 0);
      const sid = await series({ match_win_points: 3, match_loss_points: 1 });
      await add(sid, { event_type: 'match', match_id: m.matchId });
      expect(await pointsOf(sid)).toEqual({ '100': 3, '101': 1 });
      expect((await score(m.matchId, m.gameId, { winnerTeamId: m.teams[1].id, rescore: true })).status).toBe(200);
      expect(await pointsOf(sid)).toEqual({ '100': 1, '101': 3 });
    });
  });

  describe('identity across events', () => {
    it('merges a player by Discord id across events and shows their latest username', async () => {
      const a = await finishedNormal([0, 1]);
      const b = await finishedFfa(2, 0);
      await db.run(`UPDATE match_participants SET username = 'RenamedPlayer0' WHERE id = ?`, [b.ids[0]]);
      const sid = await series({ match_win_points: 3, match_loss_points: 1 });
      await add(sid, { event_type: 'match', match_id: a.matchId });
      await add(sid, { event_type: 'match', match_id: b.matchId });

      const rows = await standings(sid);
      const p0 = rows.find(r => r.user_id === '100')!;
      expect(p0).toMatchObject({ total_points: 6, events_played: 2, username: 'RenamedPlayer0' });
      expect(rows).toHaveLength(2); // not one row per match
    });
  });

  describe('tournament events', () => {
    it('single elimination, 4 teams: champion 10, runner-up 6, both semifinal losers share 3rd', async () => {
      const t = await finishedBracket(ctx, 'single-elimination', 4, 'team2');
      const sid = await series({ tournament_position_points: [10, 6, 3] });
      expect((await add(sid, { event_type: 'tournament', tournament_id: t.id })).status).toBe(201);

      const rows = await standings(sid);
      const byTeam = (i: number) => [rows.find(r => r.user_id === `d-${t.id}-${i * 2}`)?.total_points, rows.find(r => r.user_id === `d-${t.id}-${i * 2 + 1}`)?.total_points];
      const bracket = await db.all<{ round: number; team1_id: string; team2_id: string; winner_team: string }>(
        `SELECT tm.round, tm.team1_id, tm.team2_id, m.winner_team FROM tournament_matches tm JOIN matches m ON m.id = tm.match_id
         WHERE tm.tournament_id = ? ORDER BY tm.round`, [t.id]
      );
      const loser = (m: { team1_id: string; team2_id: string; winner_team: string }) => (m.winner_team === m.team1_id ? m.team2_id : m.team1_id);
      const final = bracket[bracket.length - 1];
      const semis = bracket.filter(m => m.round === final.round - 1);
      expect(byTeam(t.teamIds.indexOf(final.winner_team))).toEqual([10, 10]);
      expect(byTeam(t.teamIds.indexOf(loser(final)))).toEqual([6, 6]);
      for (const s of semis) expect(byTeam(t.teamIds.indexOf(loser(s)))).toEqual([3, 3]);

      // 2 + 2 + 4 players on 10 / 6 / 3: ranks are tie-aware
      expect(rows.map(r => r.rank)).toEqual([1, 1, 3, 3, 5, 5, 5, 5]);
    });

    it('single elimination, 5 teams (a bye in round 1): only the loser of the one semifinal is third', async () => {
      const t = await finishedBracket(ctx, 'single-elimination', 5);
      const sid = await series({ tournament_position_points: [10, 6, 3] });
      await add(sid, { event_type: 'tournament', tournament_id: t.id });
      const points = Object.values(await pointsOf(sid)).sort((a, b) => b - a);
      expect(points).toEqual([10, 10, 6, 6, 3, 3]);
    });

    it('ignores a tournament that is not complete yet', async () => {
      const t = await tournamentInAssign(ctx, 'single-elimination', 4);
      await generateBracket(t.id);
      await tournamentTransition(t.id, 'battle');
      const sid = await series({ tournament_position_points: [10, 6, 3] });
      expect((await add(sid, { event_type: 'tournament', tournament_id: t.id })).status).toBe(201);
      expect(await standings(sid)).toEqual([]);
    });
  });

  describe('double counting guard', () => {
    it('refuses a match whose tournament is already in the series, and the reverse', async () => {
      const t = await finishedBracket(ctx, 'single-elimination', 4);
      const [m] = await db.all<{ id: string }>(`SELECT id FROM matches WHERE tournament_id = ? LIMIT 1`, [t.id]);

      const tournamentFirst = await series({ match_win_points: 3, tournament_position_points: [10, 6, 3] });
      await add(tournamentFirst, { event_type: 'tournament', tournament_id: t.id });
      const matchAfter = await add(tournamentFirst, { event_type: 'match', match_id: m.id });
      expect(matchAfter.status).toBe(409);
      expect(matchAfter.data.error).toMatch(/twice/);

      const matchFirst = await series({ match_win_points: 3, tournament_position_points: [10, 6, 3] });
      expect((await add(matchFirst, { event_type: 'match', match_id: m.id })).status).toBe(201);
      const tournamentAfter = await add(matchFirst, { event_type: 'tournament', tournament_id: t.id });
      expect(tournamentAfter.status).toBe(409);
      expect(tournamentAfter.data.error).toMatch(/twice/);
    });

    it('still allows the same match in two different series, and a tournament match alongside other tournaments', async () => {
      const t = await finishedBracket(ctx, 'single-elimination', 4);
      const other = await finishedBracket(ctx, 'single-elimination', 4);
      const [m] = await db.all<{ id: string }>(`SELECT id FROM matches WHERE tournament_id = ? LIMIT 1`, [t.id]);
      const a = await series({ match_win_points: 1 });
      const b = await series({ match_win_points: 1 });
      expect((await add(a, { event_type: 'match', match_id: m.id })).status).toBe(201);
      expect((await add(b, { event_type: 'match', match_id: m.id })).status).toBe(201);
      expect((await add(a, { event_type: 'tournament', tournament_id: other.id })).status).toBe(201);
    });
  });

  describe('events', () => {
    it('keeps numbering after a delete, rejects wrong-series deletes, and survives parallel adds', async () => {
      const matches: string[] = [];
      const { mapIds } = await mode('Normal', 5, 1);
      for (let i = 0; i < 6; i++) matches.push((await newMatch(mapIds, 1)).matchId);
      const sid = await series();
      const other = await series();
      const ids: string[] = [];
      for (const m of matches.slice(0, 3)) ids.push((await add(sid, { event_type: 'match', match_id: m })).data.id);

      expect((await deleteEvent(req('DELETE', `/api/series/${other}/events/${ids[0]}`), createRouteParams({ seriesId: other, eventId: ids[0] }))).status).toBe(404);
      expect((await deleteEvent(req('DELETE', `/api/series/${sid}/events/${ids[1]}`), createRouteParams({ seriesId: sid, eventId: ids[1] }))).status).toBe(200);

      const results = await Promise.all(matches.slice(3).map(m => add(sid, { event_type: 'match', match_id: m })));
      expect(results.every(r => r.status === 201)).toBe(true);
      const orders = (await db.all<{ event_order: number }>(`SELECT event_order FROM series_events WHERE series_id = ? ORDER BY event_order`, [sid])).map(r => r.event_order);
      expect(new Set(orders).size).toBe(orders.length); // no duplicate orders
      expect(orders).toHaveLength(5);
    });

    it('validates event_date', async () => {
      const { mapIds } = await mode('Normal', 5, 1);
      const { matchId } = await newMatch(mapIds, 1);
      const sid = await series();
      expect((await add(sid, { event_type: 'match', match_id: matchId, event_date: 'not a date' })).status).toBe(400);
      expect((await add(sid, { event_type: 'match', match_id: matchId, event_date: '2026-06-01' })).status).toBe(201);
    });
  });

  describe('editing events (PATCH /events/[eventId])', () => {
    const edit = async (sid: string, eventId: string, body: Record<string, unknown>) =>
      parseResponse(await patchEvent(req('PATCH', `/api/series/${sid}/events/${eventId}`, body), createRouteParams({ seriesId: sid, eventId })));
    const start = async (sid: string, status: string) =>
      transitionSeries(req('POST', `/api/series/${sid}/transition`, { status }), createRouteParams({ seriesId: sid }));
    const orders = async (sid: string) =>
      Object.fromEntries((await db.all<{ id: string; event_order: number }>(
        `SELECT id, event_order FROM series_events WHERE series_id = ?`, [sid]
      )).map(r => [r.id, r.event_order]));

    async function seriesWithThreeEvents() {
      const sid = await series({ match_win_points: 10, match_loss_points: 0 });
      const matches = [await finishedNormal([0, 1]), await finishedNormal([1, 0]), await finishedNormal([0, 1])];
      const ids: string[] = [];
      for (const m of matches) ids.push((await add(sid, { event_type: 'match', match_id: m.matchId })).data.id);
      return { sid, ids, matches };
    }

    it('changes the multiplier before the series starts, and standings follow', async () => {
      const { sid, ids } = await seriesWithThreeEvents();
      // events 1 and 3: player 100 wins; event 2: player 101 wins -> 100 has 20, 101 has 10
      expect(await pointsOf(sid)).toEqual({ '100': 20, '101': 10 });

      const res = await edit(sid, ids[1], { points_multiplier: 3 });
      expect(res.status).toBe(200);
      expect(res.data.event.points_multiplier).toBe(3);
      expect(await pointsOf(sid)).toEqual({ '100': 20, '101': 30 });
    });

    it('moves an event to a free order number', async () => {
      const { sid, ids } = await seriesWithThreeEvents();
      const res = await edit(sid, ids[0], { event_order: 7 });
      expect(res.status).toBe(200);
      expect(res.data.swapped_with).toBeNull();
      expect((await orders(sid))[ids[0]]).toBe(7);
    });

    it('swaps places with the event that already holds the order number', async () => {
      const { sid, ids } = await seriesWithThreeEvents();
      expect(await orders(sid)).toEqual({ [ids[0]]: 1, [ids[1]]: 2, [ids[2]]: 3 });

      const res = await edit(sid, ids[0], { event_order: 3 });
      expect(res.status).toBe(200);
      expect(res.data.swapped_with).toBe(ids[2]);
      expect(await orders(sid)).toEqual({ [ids[0]]: 3, [ids[1]]: 2, [ids[2]]: 1 });
      // nothing was left parked on the temporary value
      expect(Object.values(await orders(sid)).every(o => o > 0)).toBe(true);
    });

    it('setting the order an event already has changes nothing', async () => {
      const { sid, ids } = await seriesWithThreeEvents();
      const res = await edit(sid, ids[1], { event_order: 2 });
      expect(res.status).toBe(200);
      expect(res.data.swapped_with).toBeNull();
      expect(await orders(sid)).toEqual({ [ids[0]]: 1, [ids[1]]: 2, [ids[2]]: 3 });
    });

    it('edits several fields at once, and sets then clears the date', async () => {
      const { sid, ids } = await seriesWithThreeEvents();
      const res = await edit(sid, ids[0], { points_multiplier: 2.5, event_order: 9, event_date: '2026-06-01' });
      expect(res.status).toBe(200);
      expect(res.data.event).toMatchObject({ points_multiplier: 2.5, event_order: 9 });
      expect(res.data.event.event_date).toContain('2026-06-01');
      const cleared = await edit(sid, ids[0], { event_date: null });
      expect(cleared.status).toBe(200);
      expect(cleared.data.event.event_date).toBeNull();
    });

    it('rejects invalid values and an empty edit without changing anything', async () => {
      const { sid, ids } = await seriesWithThreeEvents();
      for (const body of [
        { points_multiplier: 0 }, { points_multiplier: 11 }, { points_multiplier: -1 }, { points_multiplier: 'x' },
        { event_order: 0 }, { event_order: 1.5 }, { event_order: '2' },
        { event_date: 'not a date' }, { event_date: 5 },
        {},
      ]) {
        expect((await edit(sid, ids[0], body)).status, JSON.stringify(body)).toBe(400);
      }
      expect(await orders(sid)).toEqual({ [ids[0]]: 1, [ids[1]]: 2, [ids[2]]: 3 });
      expect(await pointsOf(sid)).toEqual({ '100': 20, '101': 10 });
    });

    it('is locked once the series has started, completed or been cancelled', async () => {
      for (const target of ['active', 'complete', 'cancelled'] as const) {
        const { sid, ids } = await seriesWithThreeEvents();
        if (target === 'complete') { await start(sid, 'active'); await start(sid, 'complete'); }
        else await start(sid, target);

        const res = await edit(sid, ids[0], { points_multiplier: 5 });
        expect(res.status, target).toBe(409);
        expect(res.data.error).toMatch(/before the series starts/);
        const row = await db.get<{ points_multiplier: number }>(`SELECT points_multiplier FROM series_events WHERE id = ?`, [ids[0]]);
        expect(row?.points_multiplier).toBe(1);
      }
    });

    it('re-checks the series status inside the update, so a concurrent start cannot slip an edit through', async () => {
      const { sid, ids } = await seriesWithThreeEvents();
      await start(sid, 'active'); // the route's early check already passed in the racing request
      const result = await updateSeriesEvent(sid, ids[0], { points_multiplier: 5 }, { requireSeriesStatus: 'created' });
      expect(result).toMatchObject({ status: 409 });
      const row = await db.get<{ points_multiplier: number }>(`SELECT points_multiplier FROM series_events WHERE id = ?`, [ids[0]]);
      expect(row?.points_multiplier).toBe(1);
    });

    it('404s for an unknown event, an event of another series, and an unknown series', async () => {
      const { sid, ids } = await seriesWithThreeEvents();
      const other = await series();
      expect((await edit(sid, 'no-such-event', { points_multiplier: 2 })).status).toBe(404);
      expect((await edit(other, ids[0], { points_multiplier: 2 })).status).toBe(404);
      expect((await edit('no-such-series', ids[0], { points_multiplier: 2 })).status).toBe(404);
    });

    it('parallel reorders never leave duplicate or parked order numbers', async () => {
      const { sid, ids } = await seriesWithThreeEvents();
      await Promise.all([
        edit(sid, ids[0], { event_order: 3 }),
        edit(sid, ids[1], { event_order: 1 }),
        edit(sid, ids[2], { event_order: 2 }),
      ]);
      const now = Object.values(await orders(sid));
      expect(new Set(now).size).toBe(3);
      expect(now.every(o => o > 0)).toBe(true);
    });
  });

  describe('series fields', () => {
    const patch = async (sid: string, body: Record<string, unknown>) =>
      patchSeries(req('PATCH', `/api/series/${sid}`, body), createRouteParams({ seriesId: sid }));

    it('rejects an end date before the start date, on create and on partial updates', async () => {
      const created = await createSeries(req('POST', '/api/series', { name: 'Bad', start_date: '2026-12-01', end_date: '2026-01-01' }));
      expect(created.status).toBe(400);

      const sid = await series(undefined, { start_date: '2026-06-01', end_date: '2026-06-30' });
      expect((await patch(sid, { end_date: '2026-05-01' })).status).toBe(400); // only end moved: checked against stored start
      expect((await patch(sid, { start_date: '2026-07-01' })).status).toBe(400); // only start moved
      expect((await patch(sid, { start_date: '2026-06-10', end_date: '2026-06-20' })).status).toBe(200);
      expect((await patch(sid, { end_date: null })).status).toBe(200); // clearing is fine
    });

    it('rejects unparseable dates', async () => {
      expect((await createSeries(req('POST', '/api/series', { name: 'x', start_date: 'soon' }))).status).toBe(400);
      const sid = await series();
      expect((await patch(sid, { end_date: 'whenever' })).status).toBe(400);
    });

    it('rejects a game_id that does not exist, on create and update', async () => {
      expect((await createSeries(req('POST', '/api/series', { name: 'x', game_id: 'no-such-game' }))).status).toBe(400);
      const sid = await series();
      expect((await patch(sid, { game_id: 'no-such-game' })).status).toBe(400);
      expect((await patch(sid, { game_id: gameId })).status).toBe(200);
      expect((await patch(sid, { game_id: null })).status).toBe(200);
    });
  });
});
