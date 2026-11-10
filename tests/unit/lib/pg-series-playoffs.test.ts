// @vitest-environment node
/** Series playoffs: seed preview, seeding planned events, stage completion, champion post and the champion integration. */
import { describe, expect, it, vi } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { insertStage } from '../../utils/pg-series-fixtures';
import { bracketRule, createLeague, plannedPlayoff } from '../../utils/pg-playoffs-fixtures';
import {
  completeStage, getSeedPreview, getSeriesChampion, getSeriesEventDto, seedPlayoffEvent, transitionSeries,
} from '@/lib/series';
import {
  discordSeriesUpdateQueue, matches, series, seriesEntrantMembers, seriesEvents, seriesStages, tournamentMatches, tournamentTeams,
  tournaments,
} from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/feed-helpers')>()), logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));

setupPgTestFile();
const pg = () => getPgTestDb();
const rejects = (p: Promise<unknown>, status: number, message?: RegExp) =>
  expect(p).rejects.toMatchObject({ name: 'SeriesError', status, ...(message ? { message: expect.stringMatching(message) } : {}) });

const names = (q: Array<{ name: string }>) => q.map((x) => x.name);
const updatesOf = (seriesId: string, kind?: string) =>
  pg().select().from(discordSeriesUpdateQueue).where(eq(discordSeriesUpdateQueue.series_id, seriesId))
    .then((rows) => rows.filter((r) => !kind || r.kind === kind));

/** Four entrants ranked A > B > C > D. */
async function fourTeamLeague(opts: Parameters<typeof createLeague>[1] = {}) {
  const league = await createLeague([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }], opts);
  await league.rankBy(['A', 'B', 'C', 'D']);
  return league;
}

describe('getSeedPreview', () => {
  it('lists the top N of the season table with seeds, ranks and divisions', async () => {
    const l = await createLeague([{ name: 'A', division: 'East' }, { name: 'B' }, { name: 'C' }, { name: 'D' }]);
    await l.rankBy(['A', 'B', 'C', 'D']);
    const eventId = await plannedPlayoff(l.seriesId, bracketRule({ top: 3 }));

    const preview = await getSeedPreview(pg(), l.seriesId, eventId);
    expect(preview.warnings).toEqual([]);
    expect(preview.qualifiers).toEqual([
      { entrant_id: l.id.A, name: 'A', seed: 1, rank: 1, division: 'East' },
      { entrant_id: l.id.B, name: 'B', seed: 2, rank: 2, division: null },
      { entrant_id: l.id.C, name: 'C', seed: 3, rank: 3, division: null },
    ]);
  });

  it('takes the top N per division interleaved by rank, divisions by name and the division-less group last', async () => {
    const l = await createLeague([
      { name: 'W1', division: 'West' }, { name: 'E1', division: 'East' }, { name: 'E2', division: 'East' }, { name: 'W2', division: 'West' },
      { name: 'E3', division: 'East' }, { name: 'Z' },
    ]);
    await l.rankBy(['E1', 'W1', 'E2', 'W2', 'E3', 'Z']);
    const eventId = await plannedPlayoff(l.seriesId, bracketRule({ top: 2, per_division: true }));

    const preview = await getSeedPreview(pg(), l.seriesId, eventId);
    expect(names(preview.qualifiers)).toEqual(['E1', 'W1', 'Z', 'E2', 'W2']);
    expect(preview.qualifiers.map((q) => q.seed)).toEqual([1, 2, 3, 4, 5]);
    expect(preview.qualifiers[0]).toMatchObject({ rank: 1, division: 'East' }); // overall standings rank
    expect(preview.qualifiers[4]).toMatchObject({ name: 'W2', rank: 4 });
    expect(preview.warnings).toEqual([expect.stringMatching(/No division.*only 1 entrant/)]);
  });

  it('uses the standings of the source stage', async () => {
    const l = await createLeague([{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
    const stage1 = await insertStage(l.seriesId, { status: 'complete' });
    const stage2 = await insertStage(l.seriesId);
    await l.rankBy(['A', 'B', 'C'], { stage_id: stage1.id });
    await l.rankBy(['C', 'B', 'A'], { stage_id: stage2.id });
    const eventId = await plannedPlayoff(l.seriesId, bracketRule({ source: 'stage', stage_id: stage1.id, top: 2 }));
    const season = await plannedPlayoff(l.seriesId, bracketRule({ top: 3 }));

    expect(names((await getSeedPreview(pg(), l.seriesId, eventId)).qualifiers)).toEqual(['A', 'B']);
    // season: both stages count, A/B/C all end up level so the order falls back to the name
    expect((await getSeedPreview(pg(), l.seriesId, season)).qualifiers.map((q) => q.rank)).toEqual([1, 1, 1]);
  });

  it('warns about an incomplete source stage, a tie at the cut-off and too few qualifiers', async () => {
    const l = await createLeague([{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
    const stage = await insertStage(l.seriesId, { name: 'Split 1', status: 'active' });
    await l.play('A', 'B', { stage_id: stage.id });
    await l.play('A', 'C', { stage_id: stage.id });
    const tied = await plannedPlayoff(l.seriesId, bracketRule({ source: 'stage', stage_id: stage.id, top: 2 }));

    const a = await getSeedPreview(pg(), l.seriesId, tied);
    expect(a.blockers).toEqual([expect.stringMatching(/Split 1.*not complete/)]); // only the unfinished source blocks seeding
    expect(a.warnings).toHaveLength(2);
    expect(a.warnings[0]).toMatch(/Split 1.*not complete/);
    expect(a.warnings[1]).toMatch(/Tie at the cut-off.*ranked 2/);

    const many = await plannedPlayoff(l.seriesId, bracketRule({ source: 'stage', stage_id: stage.id, top: 8 }));
    expect((await getSeedPreview(pg(), l.seriesId, many)).warnings).toContainEqual(expect.stringMatching(/Only 3 entrant\(s\).*8 qualify/));

    await pg().update(seriesStages).set({ status: 'complete' }).where(eq(seriesStages.id, stage.id));
    const done = await getSeedPreview(pg(), l.seriesId, tied);
    expect(done.warnings).toEqual([expect.stringMatching(/Tie at the cut-off/)]);
    expect(done.blockers).toEqual([]);
  });

  it('warns when the series is not active', async () => {
    const l = await createLeague([{ name: 'A' }, { name: 'B' }], { status: 'registration' });
    const eventId = await plannedPlayoff(l.seriesId, bracketRule({ top: 2 }));
    const preview = await getSeedPreview(pg(), l.seriesId, eventId);
    expect(preview.warnings).toContainEqual(expect.stringMatching(/series is registration.*only be seeded while it is active/));
    expect(preview.blockers).toEqual([]);
  });

  it('only considers active entrants', async () => {
    const l = await createLeague([{ name: 'A' }, { name: 'B', status: 'withdrawn' }, { name: 'C', status: 'pending' }, { name: 'D' }, { name: 'E' }]);
    await l.rankBy(['A', 'B', 'C', 'D', 'E']);
    const eventId = await plannedPlayoff(l.seriesId, bracketRule({ top: 4 }));
    const preview = await getSeedPreview(pg(), l.seriesId, eventId);
    expect(names(preview.qualifiers)).toEqual(['A', 'D', 'E']);
    expect(preview.warnings).toContainEqual(expect.stringMatching(/Only 3 entrant/));
  });

  it('answers 404 for unknown series / event, 409 for a live event and explains legacy series without entrants', async () => {
    const l = await fourTeamLeague();
    const eventId = await plannedPlayoff(l.seriesId);
    await rejects(getSeedPreview(pg(), 'nope', eventId), 404);
    await rejects(getSeedPreview(pg(), l.seriesId, 'nope'), 404);
    await seedPlayoffEvent(pg(), l.seriesId, eventId);
    await rejects(getSeedPreview(pg(), l.seriesId, eventId), 409);

    const [legacy] = await pg().insert(series).values({ id: 'legacy1', name: 'Legacy', status: 'active', game_id: l.world.gameId, game_mode_id: l.world.normalMode }).returning();
    const planned = await plannedPlayoff(legacy.id);
    const preview = await getSeedPreview(pg(), legacy.id, planned);
    expect(preview.qualifiers).toEqual([]);
    expect(preview.warnings[0]).toMatch(/no entrants/);
    await rejects(seedPlayoffEvent(pg(), legacy.id, planned), 400, /no entrants/);
  });
});

describe('seedPlayoffEvent', () => {
  it('turns the planned event into a live bracket tournament seeded from the standings', async () => {
    const l = await fourTeamLeague();
    const stage = await insertStage(l.seriesId, { status: 'complete' });
    const eventId = await plannedPlayoff(l.seriesId, bracketRule({ top: 3, template: { name: 'Grand Finals' } }), { stage_id: stage.id, week: 9 });
    const before = (await pg().select().from(seriesEvents).where(eq(seriesEvents.id, eventId)))[0];

    const { event, tournament_id } = await seedPlayoffEvent(pg(), l.seriesId, eventId);

    expect(event).toMatchObject({
      id: eventId, status: 'live', event_type: 'tournament', tournament_id, role: 'season_playoff', stage_id: stage.id, week: 9,
      event_order: before.event_order, counts_for_standings: false, entrant_ids: [l.id.A, l.id.B, l.id.C], name: 'Grand Finals',
    });
    expect(event.seeding_rule).toMatchObject({ top: 3 });
    expect(await getSeriesEventDto(pg(), l.seriesId, eventId)).toMatchObject({ tournament_id });
    const [t] = await pg().select().from(tournaments).where(eq(tournaments.id, tournament_id));
    expect(t).toMatchObject({ name: 'Grand Finals', format: 'single-elimination' });
    const teams = await pg().select().from(tournamentTeams).where(eq(tournamentTeams.tournament_id, tournament_id)).orderBy(asc(tournamentTeams.created_at));
    expect(teams.map((x) => [x.team_name, x.series_entrant_id])).toEqual([['A', l.id.A], ['B', l.id.B], ['C', l.id.C]]);
    // top seed gets the bye in a 3-team bracket: seed 2 vs seed 3 play, seed 1 waits
    const bracket = await pg().select().from(tournamentMatches).where(eq(tournamentMatches.tournament_id, tournament_id));
    const firstRound = bracket.filter((m) => m.round === 1 && m.team1_id && m.team2_id);
    expect(firstRound).toHaveLength(1);
    expect([firstRound[0].team1_id, firstRound[0].team2_id].sort()).toEqual([teams[1].id, teams[2].id].sort());
  });

  describe('seed checks', () => {
    const unfinished = async () => {
      const l = await fourTeamLeague();
      await insertStage(l.seriesId, { name: 'Regular Season', status: 'active' }); // counts toward the season, not complete
      const eventId = await plannedPlayoff(l.seriesId, bracketRule({ top: 3 }));
      return { l, eventId };
    };

    it('refuses while the source stage / season is not complete, and creates nothing', async () => {
      const { l, eventId } = await unfinished();
      await rejects(seedPlayoffEvent(pg(), l.seriesId, eventId), 409, /Cannot seed yet.*Regular Season.*force: true/);
      expect((await pg().select().from(seriesEvents).where(eq(seriesEvents.id, eventId)))[0].status).toBe('planned');
      expect(await pg().select().from(tournaments)).toHaveLength(0);
    });

    it('seeds anyway with force', async () => {
      const { l, eventId } = await unfinished();
      const { event } = await seedPlayoffEvent(pg(), l.seriesId, eventId, { force: true });
      expect(event).toMatchObject({ status: 'live', entrant_ids: [l.id.A, l.id.B, l.id.C] });
    });

    it('a manual seed order skips the stage check', async () => {
      const { l, eventId } = await unfinished();
      const { event } = await seedPlayoffEvent(pg(), l.seriesId, eventId, { entrant_ids: [l.id.D, l.id.C] });
      expect(event).toMatchObject({ status: 'live', entrant_ids: [l.id.D, l.id.C] });
    });

    it.each(['created', 'registration'] as const)('refuses while the series is %s, even with force or a manual order', async (status) => {
      const l = await createLeague([{ name: 'A' }, { name: 'B' }, { name: 'C' }], { status });
      await l.rankBy(['A', 'B', 'C']);
      const eventId = await plannedPlayoff(l.seriesId, bracketRule({ top: 2 }));
      await rejects(seedPlayoffEvent(pg(), l.seriesId, eventId), 409, /only be seeded while the series is active/);
      await rejects(seedPlayoffEvent(pg(), l.seriesId, eventId, { force: true }), 409, /only be seeded while the series is active/);
      await rejects(seedPlayoffEvent(pg(), l.seriesId, eventId, { entrant_ids: [l.id.A, l.id.B] }), 409, /only be seeded while the series is active/);
    });
  });

  it('queues playoff_seeded with the qualifiers, once, and respects series.announcements', async () => {
    const l = await fourTeamLeague();
    const eventId = await plannedPlayoff(l.seriesId, bracketRule({ top: 4 }));
    const { tournament_id } = await seedPlayoffEvent(pg(), l.seriesId, eventId);

    const posts = await updatesOf(l.seriesId, 'playoff_seeded');
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ dedupe_key: `playoff:${eventId}`, status: 'pending' });
    expect(posts[0].payload).toEqual({
      event_id: eventId, tournament_id, stage_id: null,
      qualifiers: [
        { seed: 1, name: 'A', entrant_id: l.id.A }, { seed: 2, name: 'B', entrant_id: l.id.B },
        { seed: 3, name: 'C', entrant_id: l.id.C }, { seed: 4, name: 'D', entrant_id: l.id.D },
      ],
    });

    const quiet = await fourTeamLeague({ announcements: false });
    await seedPlayoffEvent(pg(), quiet.seriesId, await plannedPlayoff(quiet.seriesId));
    expect(await updatesOf(quiet.seriesId, 'playoff_seeded')).toHaveLength(0);
  });

  it('takes a manual seed order instead of the standings', async () => {
    const l = await fourTeamLeague();
    const eventId = await plannedPlayoff(l.seriesId, bracketRule({ top: 4 }));
    const { event, tournament_id } = await seedPlayoffEvent(pg(), l.seriesId, eventId, { entrant_ids: [l.id.D, l.id.A] });

    expect(event.entrant_ids).toEqual([l.id.D, l.id.A]);
    const teams = await pg().select().from(tournamentTeams).where(eq(tournamentTeams.tournament_id, tournament_id)).orderBy(asc(tournamentTeams.created_at));
    expect(teams.map((x) => x.team_name)).toEqual(['D', 'A']);
    const [post] = await updatesOf(l.seriesId, 'playoff_seeded');
    expect(post.payload).toMatchObject({ qualifiers: [{ seed: 1, name: 'D' }, { seed: 2, name: 'A' }] });
  });

  it('rejects an invalid override: unknown, duplicate, inactive entrants, fewer than 2, another series', async () => {
    const l = await createLeague([{ name: 'A' }, { name: 'B' }, { name: 'C', status: 'withdrawn' }, { name: 'D', status: 'pending' }]);
    const other = await createLeague([{ name: 'X' }, { name: 'Y' }]);
    const eventId = await plannedPlayoff(l.seriesId);
    await rejects(seedPlayoffEvent(pg(), l.seriesId, eventId, { entrant_ids: [l.id.A, 'ghost'] }), 400, /does not belong/);
    await rejects(seedPlayoffEvent(pg(), l.seriesId, eventId, { entrant_ids: [l.id.A, other.id.X] }), 400, /does not belong/);
    await rejects(seedPlayoffEvent(pg(), l.seriesId, eventId, { entrant_ids: [l.id.A, l.id.A] }), 400, /more than once/);
    await rejects(seedPlayoffEvent(pg(), l.seriesId, eventId, { entrant_ids: [l.id.A, l.id.C] }), 400, /withdrawn/);
    await rejects(seedPlayoffEvent(pg(), l.seriesId, eventId, { entrant_ids: [l.id.A, l.id.D] }), 400, /pending/);
    await rejects(seedPlayoffEvent(pg(), l.seriesId, eventId, { entrant_ids: [l.id.A] }), 400, /At least 2/);
    // nothing was created
    expect((await pg().select().from(seriesEvents).where(eq(seriesEvents.id, eventId)))[0]).toMatchObject({ status: 'planned', tournament_id: null });
    expect(await pg().select().from(tournaments)).toHaveLength(0);
  });

  it('needs at least two qualifiers and a planned event in an open series', async () => {
    const solo = await createLeague([{ name: 'A' }, { name: 'B', status: 'withdrawn' }]);
    await rejects(seedPlayoffEvent(pg(), solo.seriesId, await plannedPlayoff(solo.seriesId)), 400, /At least 2/);

    const l = await fourTeamLeague();
    const eventId = await plannedPlayoff(l.seriesId);
    await rejects(seedPlayoffEvent(pg(), l.seriesId, 'ghost'), 404);
    await rejects(seedPlayoffEvent(pg(), 'ghost', eventId), 404);
    await seedPlayoffEvent(pg(), l.seriesId, eventId);
    await rejects(seedPlayoffEvent(pg(), l.seriesId, eventId), 409, /planned/);
    expect(await pg().select().from(tournaments)).toHaveLength(1);

    const done = await fourTeamLeague();
    const doneEvent = await plannedPlayoff(done.seriesId);
    await pg().update(series).set({ status: 'complete' }).where(eq(series.id, done.seriesId));
    await rejects(seedPlayoffEvent(pg(), done.seriesId, doneEvent), 409, /complete/);
  });

  it('rolls everything back when the builder rejects the bracket', async () => {
    const l = await fourTeamLeague();
    const eventId = await plannedPlayoff(l.seriesId, bracketRule({ top: 4 }));
    // an entrant without any roster cannot field a tournament team
    await pg().delete(seriesEntrantMembers).where(eq(seriesEntrantMembers.entrant_id, l.id.A));
    await rejects(seedPlayoffEvent(pg(), l.seriesId, eventId), 400, /roster/);
    expect((await pg().select().from(seriesEvents).where(eq(seriesEvents.id, eventId)))[0].status).toBe('planned');
    expect(await pg().select().from(tournaments)).toHaveLength(0);
    expect(await updatesOf(l.seriesId, 'playoff_seeded')).toHaveLength(0);
  });
});

describe('completeStage', () => {
  it('completes the stage, activates the next upcoming one and lists the events seedable from it', async () => {
    const l = await fourTeamLeague();
    const s1 = await insertStage(l.seriesId, { status: 'active' });
    const s2 = await insertStage(l.seriesId);
    const s3 = await insertStage(l.seriesId);
    const fromS1 = await plannedPlayoff(l.seriesId, bracketRule({ source: 'stage', stage_id: s1.id }), { role: 'stage_playoff' });
    const fromS2 = await plannedPlayoff(l.seriesId, bracketRule({ source: 'stage', stage_id: s2.id }), { role: 'stage_playoff' });
    const season = await plannedPlayoff(l.seriesId);

    const first = await completeStage(pg(), l.seriesId, s1.id);
    expect(first.stage).toMatchObject({ id: s1.id, status: 'complete' });
    expect(first.seedable_event_ids).toEqual([fromS1]);
    const status = async (id: string) => (await pg().select().from(seriesStages).where(eq(seriesStages.id, id)))[0].status;
    expect(await status(s2.id)).toBe('active');
    expect(await status(s3.id)).toBe('upcoming');

    const second = await completeStage(pg(), l.seriesId, s2.id);
    expect(second.seedable_event_ids).toEqual([fromS2]);
    expect(await status(s3.id)).toBe('active');

    // the last stage also unlocks the season playoffs
    const last = await completeStage(pg(), l.seriesId, s3.id);
    expect(last.seedable_event_ids).toEqual([season]);

    // a seeded (live) event is no longer listed; the season playoffs stay seedable while every season stage is complete
    await seedPlayoffEvent(pg(), l.seriesId, fromS1);
    expect((await completeStage(pg(), l.seriesId, s1.id)).seedable_event_ids).toEqual([season]);
  });

  it('lists season playoffs once the season stages are complete, even when a non-season playoff stage follows', async () => {
    const l = await fourTeamLeague();
    const regular = await insertStage(l.seriesId, { status: 'active' });
    const playoffStage = await insertStage(l.seriesId, { counts_toward_season: false });
    const season = await plannedPlayoff(l.seriesId, bracketRule(), { stage_id: playoffStage.id });

    const done = await completeStage(pg(), l.seriesId, regular.id);
    expect(done.seedable_event_ids).toEqual([season]);
    expect((await pg().select().from(seriesStages).where(eq(seriesStages.id, playoffStage.id)))[0].status).toBe('active');
  });

  it('does not list season playoffs while a later season stage is still open', async () => {
    const l = await fourTeamLeague();
    const first = await insertStage(l.seriesId, { status: 'active' });
    await insertStage(l.seriesId);
    await plannedPlayoff(l.seriesId);
    expect((await completeStage(pg(), l.seriesId, first.id)).seedable_event_ids).toEqual([]);
  });

  it('completes an upcoming stage, leaves an already active next stage alone and rejects unknown stages / finished series', async () => {
    const l = await createLeague([{ name: 'A' }, { name: 'B' }]);
    const s1 = await insertStage(l.seriesId);
    const s2 = await insertStage(l.seriesId, { status: 'complete' });
    expect((await completeStage(pg(), l.seriesId, s1.id)).stage.status).toBe('complete');
    expect((await pg().select().from(seriesStages).where(eq(seriesStages.id, s2.id)))[0].status).toBe('complete');

    await rejects(completeStage(pg(), l.seriesId, 'ghost'), 404);
    await rejects(completeStage(pg(), 'ghost', s1.id), 404);

    await pg().update(series).set({ status: 'complete' }).where(eq(series.id, l.seriesId));
    await rejects(completeStage(pg(), l.seriesId, s1.id), 409);
  });
});

describe('champion post', () => {
  it('queues champion once when the series completes, with the dedupe key', async () => {
    const l = await fourTeamLeague();
    await transitionSeries(pg(), l.seriesId, 'complete');
    const posts = await updatesOf(l.seriesId, 'champion');
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ dedupe_key: 'champion', status: 'pending' });
  });

  it('does not queue it for a series without announcements or on other transitions', async () => {
    const quiet = await fourTeamLeague({ announcements: false });
    await transitionSeries(pg(), quiet.seriesId, 'complete');
    expect(await updatesOf(quiet.seriesId, 'champion')).toHaveLength(0);

    const l = await fourTeamLeague({ status: 'created' });
    await transitionSeries(pg(), l.seriesId, 'active');
    expect(await updatesOf(l.seriesId, 'champion')).toHaveLength(0);
  });
});

describe('champion integration', () => {
  it('getSeriesChampion returns the entrant that won the seeded season playoff', async () => {
    const l = await createLeague([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }]);
    await l.rankBy(['A', 'B', 'C', 'D']);
    const eventId = await plannedPlayoff(l.seriesId, bracketRule({ top: 2 }));
    expect(await getSeriesChampion(pg(), l.seriesId)).toBeNull();
    const { tournament_id } = await seedPlayoffEvent(pg(), l.seriesId, eventId);
    expect(await getSeriesChampion(pg(), l.seriesId)).toBeNull(); // bracket not played yet

    // B (seed 2) upsets A in the final
    const teams = await pg().select().from(tournamentTeams).where(eq(tournamentTeams.tournament_id, tournament_id));
    const teamB = teams.find((t) => t.series_entrant_id === l.id.B)!;
    const bracket = await pg().select().from(tournamentMatches).where(eq(tournamentMatches.tournament_id, tournament_id));
    expect(bracket).toHaveLength(1);
    await pg().update(matches).set({ status: 'complete', winner_team: teamB.id }).where(eq(matches.id, bracket[0].match_id));
    await pg().update(tournaments).set({ status: 'complete' }).where(eq(tournaments.id, tournament_id));

    expect(await getSeriesChampion(pg(), l.seriesId)).toEqual({ entrant_id: l.id.B, name: 'B', source: 'season_playoff' });
  });
});
