// @vitest-environment node
/** Series events after the rework: planned rows, scoring-type checks, series-created deletion, the SeriesEventDto read model. */
import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createGame, createGameMode, createMatch, createTournament } from '../../utils/pg-fixtures';
import { createSeriesWithEntrants, insertSeries, insertStage, linkEvent, uid } from '../../utils/pg-series-fixtures';
import {
  addSeriesEvent, getSeriesEventDto, listSeriesEventDtos, listSeriesEvents, listSeriesSummaries, removeSeriesEvent, updateSeriesEvent,
} from '@/lib/series';
import {
  discordDeletionQueue, matchGamePlacements, matchGames, matchTeams, matches, seriesEvents, tournamentTeams, tournaments,
} from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));

setupPgTestFile();
const pg = () => getPgTestDb();
const rejects = (p: Promise<unknown>, status: number, message?: RegExp) =>
  expect(p).rejects.toMatchObject({ name: 'SeriesError', status, ...(message ? { message: expect.stringMatching(message) } : {}) });

async function plannedEvent(seriesId: string, overrides: Partial<typeof seriesEvents.$inferInsert> = {}) {
  const [row] = await pg().insert(seriesEvents).values({
    id: uid('se_'), series_id: seriesId, event_type: 'tournament', status: 'planned', event_order: 100, role: 'season_playoff', counts_for_standings: false,
    seeding_rule: { source: 'season', top: 4, format: 'single-elimination', template: { name: 'Grand Finals', game_id: null, start_time: '2031-05-06T18:00:00.000Z' } },
    ...overrides,
  }).returning();
  return row;
}

describe('planned events (rows created by the builder; list / edit / delete must cope)', () => {
  it('the target check refuses a live row without a target and a planned row with one', async () => {
    const s = await insertSeries();
    await expect(pg().insert(seriesEvents).values({ id: uid('x'), series_id: s.id, event_type: 'match', event_order: 1, status: 'live' })).rejects.toThrow();
    const game = await createGame();
    const mode = await createGameMode(game.id);
    const m = await createMatch(game.id, mode.id);
    await expect(pg().insert(seriesEvents).values({ id: uid('x'), series_id: s.id, event_type: 'match', match_id: m.id, event_order: 1, status: 'planned' })).rejects.toThrow();
  });

  it('lists with the template name, planned status and no target', async () => {
    const s = await insertSeries();
    await plannedEvent(s.id);
    const [dto] = await listSeriesEventDtos(pg(), s.id);
    expect(dto).toMatchObject({
      status: 'planned', target_status: null, match_id: null, tournament_id: null, name: 'Grand Finals', role: 'season_playoff',
      start_date: '2031-05-06T18:00:00.000Z', counts_for_standings: false,
    });
    expect(dto.seeding_rule?.top).toBe(4);
    expect(await listSeriesEvents(pg(), s.id)).toHaveLength(1);
  });

  it('is edited and deleted like a live event, and falls back to the series game', async () => {
    const game = await createGame({ name: 'Racer' });
    const s = await insertSeries({ game_id: game.id });
    const ev = await plannedEvent(s.id);
    expect((await listSeriesEventDtos(pg(), s.id))[0].game_name).toBe('Racer');
    const { event } = await updateSeriesEvent(pg(), s.id, ev.id, { week: 9, points_multiplier: 2, stage_id: (await insertStage(s.id)).id });
    expect(event).toMatchObject({ week: 9, points_multiplier: 2, status: 'planned' });
    expect(await removeSeriesEvent(pg(), s.id, ev.id)).toEqual({ deleted_target: false });
    expect(await listSeriesEvents(pg(), s.id)).toEqual([]);
  });

  it('does not become the next event in the summary, and counts in event_count', async () => {
    const s = await insertSeries();
    await plannedEvent(s.id);
    const [summary] = await listSeriesSummaries(pg(), { ids: [s.id] });
    expect(summary.event_count).toBe(1);
    expect(summary.next_event).toBeNull();
    expect(summary.completed_event_count).toBe(0);
  });
});

describe('scoring type / game checks on attach', () => {
  async function setup() {
    const g1 = await createGame({ name: 'One' });
    const g2 = await createGame({ name: 'Two' });
    const g3 = await createGame({ name: 'Three' });
    const modes = {
      g1Normal: await createGameMode(g1.id, { scoring_type: 'Normal' }),
      g1Ffa: await createGameMode(g1.id, { scoring_type: 'FFA' }),
      g2Normal: await createGameMode(g2.id, { scoring_type: 'Normal' }),
      g3Normal: await createGameMode(g3.id, { scoring_type: 'Normal' }),
    };
    return { g1, g2, g3, modes };
  }

  it('a legacy series (no scoring type) accepts anything', async () => {
    const { g1, modes } = await setup();
    const s = await insertSeries({ game_id: g1.id });
    const m = await createMatch(g1.id, modes.g1Ffa.id);
    await addSeriesEvent(pg(), s.id, { event_type: 'match', match_id: m.id });
  });

  it('refuses a match of another scoring type or of a game outside the allowed set', async () => {
    const { g1, g2, g3, modes } = await setup();
    const s = await insertSeries({ scoring_type: 'Normal', game_id: g1.id, game_ids: [g1.id, g2.id] });
    await rejects(addSeriesEvent(pg(), s.id, { event_type: 'match', match_id: (await createMatch(g1.id, modes.g1Ffa.id)).id }), 400, /only takes Normal/);
    await rejects(addSeriesEvent(pg(), s.id, { event_type: 'match', match_id: (await createMatch(g3.id, modes.g3Normal.id)).id }), 400, /not one of this series/);
    await addSeriesEvent(pg(), s.id, { event_type: 'match', match_id: (await createMatch(g2.id, modes.g2Normal.id)).id });
  });

  it('an empty game_ids means just game_id; tournaments are checked by their mode', async () => {
    const { g1, g2, modes } = await setup();
    const s = await insertSeries({ scoring_type: 'FFA', game_id: g1.id });
    await rejects(addSeriesEvent(pg(), s.id, { event_type: 'match', match_id: (await createMatch(g2.id, modes.g2Normal.id)).id }), 400);
    const bad = await createTournament(g1.id, { game_mode_id: modes.g1Normal.id });
    await rejects(addSeriesEvent(pg(), s.id, { event_type: 'tournament', tournament_id: bad.id }), 400, /only takes FFA/);
    const good = await createTournament(g1.id, { game_mode_id: modes.g1Ffa.id, format: 'cumulative-points' });
    await addSeriesEvent(pg(), s.id, { event_type: 'tournament', tournament_id: good.id });
  });
});

describe('deleting a series-created event', () => {
  it('also deletes its not-yet-started match, with the Discord cleanup queued', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id);
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'A' }, { name: 'B' }] });
    const m = await createMatch(game.id, mode.id, { status: 'assign' });
    for (const [i, e] of f.entrants.entries()) await pg().insert(matchTeams).values({ id: uid('mt_'), match_id: m.id, team_name: e.name, team_order: i, series_entrant_id: e.id });
    const ev = await linkEvent(f.seriesId, 'match', m.id);

    expect(await removeSeriesEvent(pg(), f.seriesId, ev.id)).toEqual({ deleted_target: true });
    expect(await pg().select().from(matches).where(eq(matches.id, m.id))).toEqual([]);
    const queued = await pg().select().from(discordDeletionQueue).where(eq(discordDeletionQueue.match_id, m.id));
    expect(queued).toHaveLength(1);
  });

  it('keeps a started or finished match (only the link goes), and never touches an attached one', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id);
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'A' }] });
    const started = await createMatch(game.id, mode.id, { status: 'battle' });
    await pg().insert(matchTeams).values({ id: uid('mt_'), match_id: started.id, team_name: 'A', team_order: 0, series_entrant_id: f.entrants[0].id });
    const evStarted = await linkEvent(f.seriesId, 'match', started.id);
    expect(await removeSeriesEvent(pg(), f.seriesId, evStarted.id)).toEqual({ deleted_target: false });
    expect(await pg().select().from(matches).where(eq(matches.id, started.id))).toHaveLength(1);

    const attached = await createMatch(game.id, mode.id, { status: 'created' }); // no entrant-linked teams: attached
    const evAttached = await linkEvent(f.seriesId, 'match', attached.id);
    expect(await removeSeriesEvent(pg(), f.seriesId, evAttached.id)).toEqual({ deleted_target: false });
    expect(await pg().select().from(matches).where(eq(matches.id, attached.id))).toHaveLength(1);
  });

  it('deletes a not-yet-started series tournament with its teams, but keeps one in battle', async () => {
    const game = await createGame();
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'A' }] });
    const fresh = await createTournament(game.id, { status: 'assign' });
    await pg().insert(tournamentTeams).values({ id: uid('tt_'), tournament_id: fresh.id, team_name: 'A', series_entrant_id: f.entrants[0].id });
    const evFresh = await linkEvent(f.seriesId, 'tournament', fresh.id);
    expect(await removeSeriesEvent(pg(), f.seriesId, evFresh.id)).toEqual({ deleted_target: true });
    expect(await pg().select().from(tournaments).where(eq(tournaments.id, fresh.id))).toEqual([]);

    const running = await createTournament(game.id, { status: 'battle' });
    await pg().insert(tournamentTeams).values({ id: uid('tt_'), tournament_id: running.id, team_name: 'A', series_entrant_id: f.entrants[0].id });
    const evRunning = await linkEvent(f.seriesId, 'tournament', running.id);
    expect(await removeSeriesEvent(pg(), f.seriesId, evRunning.id)).toEqual({ deleted_target: false });
    expect(await pg().select().from(tournaments).where(eq(tournaments.id, running.id))).toHaveLength(1);
  });
});

describe('SeriesEventDto read model', () => {
  it('returns the placement fields, target status and (for a 2-entrant match) entrants with scores and the winner', async () => {
    const game = await createGame({ name: 'Duel', color: '#abc' });
    const mode = await createGameMode(game.id);
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'A', color: '#f00' }, { name: 'B', color: '#00f' }] });
    const st = await insertStage(f.seriesId);
    const m = await createMatch(game.id, mode.id, { status: 'complete' });
    const teamIds = [uid('mt_'), uid('mt_')];
    for (const [i, e] of f.entrants.entries()) await pg().insert(matchTeams).values({ id: teamIds[i], match_id: m.id, team_name: e.name, team_order: i, series_entrant_id: e.id });
    // B wins 2 maps to 1
    for (const [round, winner] of [[1, 1], [2, 0], [3, 1]] as const) {
      const gid = uid('g_');
      await pg().insert(matchGames).values({ id: gid, match_id: m.id, round, status: 'completed' });
      for (const [i, id] of teamIds.entries()) await pg().insert(matchGamePlacements).values({ id: uid('pl_'), match_game_id: gid, entity_type: 'team', entity_id: id, is_winner: i === winner });
    }
    await pg().update(matches).set({ winner_team: teamIds[1] }).where(eq(matches.id, m.id));
    const ev = await linkEvent(f.seriesId, 'match', m.id, { stage_id: st.id, week: 3, role: 'regular', entrant_ids: f.entrants.map((e) => e.id) });

    const dto = (await getSeriesEventDto(pg(), f.seriesId, ev.id))!;
    expect(dto).toMatchObject({
      id: ev.id, stage_id: st.id, week: 3, status: 'live', target_status: 'complete', counts_for_standings: true, batch_id: null,
      event_type: 'match', match_id: m.id, game_id: game.id, game_name: 'Duel', game_color: '#abc', name: 'Test Match', entrant_ids: f.entrants.map((e) => e.id),
    });
    expect(dto.entrants).toEqual([
      { entrant_id: f.entrants[0].id, name: 'A', color: '#f00', score: 1, is_winner: false },
      { entrant_id: f.entrants[1].id, name: 'B', color: '#00f', score: 2, is_winner: true },
    ]);
    expect(typeof dto.start_date).toBe('string');
    expect((await getSeriesEventDto(pg(), f.seriesId, 'nope'))).toBeNull();
    expect((await getSeriesEventDto(pg(), 'other', ev.id))).toBeNull();
  });

  it('omits entrants for matches that are not entrant-linked or have more than two teams', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id);
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'solo', entrants: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] });
    const three = await createMatch(game.id, mode.id);
    for (const [i, e] of f.entrants.entries()) await pg().insert(matchTeams).values({ id: uid('mt_'), match_id: three.id, team_name: e.name, team_order: i, series_entrant_id: e.id });
    await linkEvent(f.seriesId, 'match', three.id);
    const plain = await createMatch(game.id, mode.id);
    await linkEvent(f.seriesId, 'match', plain.id);
    const dtos = await listSeriesEventDtos(pg(), f.seriesId);
    expect(dtos).toHaveLength(2);
    expect(dtos.every((d) => d.entrants === undefined)).toBe(true);
  });
});
