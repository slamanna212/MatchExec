// @vitest-environment node
/** The series event builder (domain level): matches / tournaments with preset rosters, planned events, validation, seeding. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createGame } from '../../utils/pg-fixtures';
import { createSeriesWithEntrants, insertStage, modeWithMaps } from '../../utils/pg-series-fixtures';
import {
  createSeriesMatchEvent, createSeriesMatchEventTx, createSeriesPlannedEvent, createSeriesTournamentEvent, createSeriesTournamentEventTx,
  getSeriesEventDto,
} from '@/lib/series';
import { AfterCommit } from '@/lib/matches/effects';
import {
  discordAnnouncementQueue, matchParticipants, matchTeams, matches, series, seriesEntrants, seriesEvents, tournamentMatches, tournamentParticipants,
  tournamentRoundByes, tournamentTeamMembers, tournamentTeams, tournaments,
} from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/feed-helpers')>()), logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));
const setupVoice = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/matches/voice-channels', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/matches/voice-channels')>()),
  VoiceChannelService: { setupMatchVoiceChannels: (...a: unknown[]) => setupVoice(...a) },
}));

setupPgTestFile();
const pg = () => getPgTestDb();
const START = '2026-05-01T18:00:00.000Z';
const rejects = (p: Promise<unknown>, status: number, message?: RegExp) =>
  expect(p).rejects.toMatchObject({ name: 'SeriesError', status, ...(message ? { message: expect.stringMatching(message) } : {}) });

beforeEach(() => setupVoice.mockClear());

const cap = (username: string) => ({ username, role: 'captain' as const });
const entrantsOf = (names: string[]) => names.map((name, i) => ({
  name, color: `#00000${i}`, members: [cap(`${name}-cap`), `${name}-p1`, `${name}-p2`],
}));

async function normalSeries(entrantNames = ['Alpha', 'Bravo', 'Charlie'], over: Parameters<typeof createSeriesWithEntrants>[1] extends infer T ? Partial<T> : never = {}) {
  const game = await createGame({ max_signups: 16 });
  const { modeId, mapIds } = await modeWithMaps(game.id, 'Normal', 5, 5);
  const s = await createSeriesWithEntrants(pg(), { entrantType: 'team', scoringType: 'Normal', gameId: game.id, entrants: entrantsOf(entrantNames), ...over });
  await pg().update(series).set({ game_mode_id: modeId }).where(eq(series.id, s.seriesId));
  return { ...s, gameId: game.id, modeId, mapIds };
}

const teamsOf = (matchId: string) => pg().select().from(matchTeams).where(eq(matchTeams.match_id, matchId)).orderBy(asc(matchTeams.team_order));
const participantsOf = (matchId: string) => pg().select().from(matchParticipants).where(eq(matchParticipants.match_id, matchId));
const eventRow = async (id: string) => (await pg().select().from(seriesEvents).where(eq(seriesEvents.id, id)))[0];
const announcementsOf = (matchId: string) => pg().select().from(discordAnnouncementQueue).where(eq(discordAnnouncementQueue.match_id, matchId));

describe('createSeriesMatchEvent: Normal team matches', () => {
  it('presets one named team per entrant with its roster, status assign, announcement and voice', async () => {
    const s = await normalSeries();
    const [a, b] = s.entrants;
    const created = await createSeriesMatchEvent(pg(), s.seriesId, {
      entrant_ids: [a.id, b.id], week: 3, stage_id: null, match: { start_date: START, maps: s.mapIds.slice(0, 3) },
    });

    const [match] = await pg().select().from(matches).where(eq(matches.id, created.match_id));
    expect(match).toMatchObject({ name: 'Alpha vs Bravo', status: 'assign', team_count: 2, game_id: s.gameId, mode_id: s.modeId });
    expect(match.start_date.toISOString()).toBe(START);

    const teams = await teamsOf(match.id);
    expect(teams.map((t) => [t.team_name, t.team_color, t.team_order, t.series_entrant_id, t.is_reserve])).toEqual([
      ['Alpha', '#000000', 0, a.id, false], ['Bravo', '#000001', 1, b.id, false],
    ]);
    const people = await participantsOf(match.id);
    expect(people).toHaveLength(6);
    for (const [i, entrant] of [a, b].entries()) {
      const mine = people.filter((p) => p.team_id === teams[i].id);
      expect(mine.map((p) => p.user_id).sort()).toEqual([...entrant.userIds].sort());
      // the captain receives map codes, nobody else does
      expect(mine.filter((p) => p.receives_map_codes).map((p) => p.username)).toEqual([`${entrant.name}-cap`]);
    }

    expect(await eventRow(created.event_id)).toMatchObject({
      series_id: s.seriesId, event_type: 'match', match_id: match.id, tournament_id: null, event_order: 1, week: 3, role: 'regular',
      counts_for_standings: true, status: 'live', entrant_ids: [a.id, b.id], points_multiplier: 1, batch_id: null,
    });
    expect((await eventRow(created.event_id)).event_date?.toISOString()).toBe(START);
    expect((await announcementsOf(match.id)).map((r) => [r.announcement_type, r.status])).toEqual([['standard', 'pending']]);
    expect(setupVoice).toHaveBeenCalledWith(match.id); // after the commit

    const dto = await getSeriesEventDto(pg(), s.seriesId, created.event_id);
    expect(dto?.entrants?.map((e) => e.name)).toEqual(['Alpha', 'Bravo']);
  });

  it('numbers events after each other, honours placement fields and an explicit order', async () => {
    const s = await normalSeries();
    const stage = await insertStage(s.seriesId);
    const tpl = { start_date: START, maps: s.mapIds.slice(0, 1) };
    const first = await createSeriesMatchEvent(pg(), s.seriesId, { entrant_ids: [s.entrants[0].id, s.entrants[1].id], match: tpl });
    const second = await createSeriesMatchEvent(pg(), s.seriesId, {
      entrant_ids: [s.entrants[1].id, s.entrants[2].id], match: tpl, stage_id: stage.id, role: 'exhibition', points_multiplier: 2, week: 2,
    });
    const third = await createSeriesMatchEvent(pg(), s.seriesId, { entrant_ids: [s.entrants[0].id, s.entrants[2].id], match: tpl }, { eventOrder: 10 });
    expect((await eventRow(first.event_id)).event_order).toBe(1);
    expect(await eventRow(second.event_id)).toMatchObject({ event_order: 2, stage_id: stage.id, role: 'exhibition', counts_for_standings: false, points_multiplier: 2, week: 2 });
    expect((await eventRow(third.event_id)).event_order).toBe(10);
  });

  it('prefills from the series match_defaults and lets the template override them', async () => {
    const s = await normalSeries();
    await pg().update(series).set({
      match_defaults: { maps: s.mapIds.slice(0, 2), rounds: 2, rules: 'competitive', stats_enabled: true, livestream_link: 'https://tv.example/s', player_notifications: false },
    }).where(eq(series.id, s.seriesId));
    const ids = [s.entrants[0].id, s.entrants[1].id];
    const a = await createSeriesMatchEvent(pg(), s.seriesId, { entrant_ids: ids, match: { start_date: START } });
    const [m1] = await pg().select().from(matches).where(eq(matches.id, a.match_id));
    expect(m1).toMatchObject({ rounds: 2, rules: 'competitive', stats_enabled: true, livestream_link: 'https://tv.example/s', player_notifications: false });
    expect(m1.maps).toEqual(s.mapIds.slice(0, 2));

    const b = await createSeriesMatchEvent(pg(), s.seriesId, { entrant_ids: ids, match: { start_date: START, name: 'Grand Final', maps: [s.mapIds[4]], rounds: 1, rules: 'casual' } });
    const [m2] = await pg().select().from(matches).where(eq(matches.id, b.match_id));
    expect(m2).toMatchObject({ name: 'Grand Final', rounds: 1, rules: 'casual' });
    expect(m2.maps).toEqual([s.mapIds[4]]);
  });

  it('names a many-team match after the series and week, with a team per entrant and no reserve', async () => {
    const s = await normalSeries(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    const created = await createSeriesMatchEvent(pg(), s.seriesId, { week: 4, match: { start_date: START, maps: s.mapIds.slice(0, 1) } });
    const [match] = await pg().select().from(matches).where(eq(matches.id, created.match_id));
    expect(match.name).toBe('Season - Round 4');
    expect(match.team_count).toBe(4);
    const teams = await teamsOf(match.id);
    expect(teams.map((t) => t.team_name)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']); // null entrant_ids = every active entrant
    expect(teams.some((t) => t.is_reserve)).toBe(false);
    expect((await eventRow(created.event_id)).entrant_ids).toHaveLength(4);
  });

  it('skips the announcement when the series has announcements off', async () => {
    const s = await normalSeries();
    await pg().update(series).set({ announcements: false }).where(eq(series.id, s.seriesId));
    const created = await createSeriesMatchEvent(pg(), s.seriesId, { entrant_ids: [s.entrants[0].id, s.entrants[1].id], match: { start_date: START } });
    expect(await announcementsOf(created.match_id)).toEqual([]);
  });

  it('skips the announcement when the caller passes announce: false (generators)', async () => {
    const s = await normalSeries();
    const created = await createSeriesMatchEvent(pg(), s.seriesId, { entrant_ids: [s.entrants[0].id, s.entrants[1].id], match: { start_date: START } }, { announce: false });
    expect(await announcementsOf(created.match_id)).toEqual([]);
  });

  it('works for a legacy series without a scoring type (Normal by default) and any game', async () => {
    const s = await normalSeries(['Alpha', 'Bravo'], { scoringType: null, gameId: null });
    await pg().update(series).set({ game_id: null }).where(eq(series.id, s.seriesId));
    const created = await createSeriesMatchEvent(pg(), s.seriesId, { match: { start_date: START, game_id: s.gameId, maps: s.mapIds.slice(0, 1) } });
    expect(await teamsOf(created.match_id)).toHaveLength(2);
  });

  it('uses the other allowed game of a multi-game series (default maps only apply to the primary game)', async () => {
    const s = await normalSeries(['Alpha', 'Bravo']);
    const other = await createGame({ name: 'Other' });
    const otherModes = await modeWithMaps(other.id, 'Normal', 5, 2);
    await pg().update(series).set({ game_ids: [s.gameId, other.id], match_defaults: { maps: s.mapIds.slice(0, 2) } }).where(eq(series.id, s.seriesId));
    const created = await createSeriesMatchEvent(pg(), s.seriesId, { match: { start_date: START, game_id: other.id, maps: otherModes.mapIds.slice(0, 1) } });
    const [match] = await pg().select().from(matches).where(eq(matches.id, created.match_id));
    expect(match.game_id).toBe(other.id);
    expect(match.maps).toEqual(otherModes.mapIds.slice(0, 1));
    // no maps given for the other game: the primary game's default maps are not applied to it
    const bare = await createSeriesMatchEvent(pg(), s.seriesId, { match: { start_date: START, game_id: other.id } });
    const [bareMatch] = await pg().select().from(matches).where(eq(matches.id, bare.match_id));
    expect(bareMatch.maps).toBeNull();
  });
});

describe('createSeriesMatchEvent: validation', () => {
  const counts = async () => ({
    matches: (await pg().select().from(matches)).length,
    events: (await pg().select().from(seriesEvents)).length,
    queue: (await pg().select().from(discordAnnouncementQueue)).length,
  });

  it('rejects an unknown or finished series', async () => {
    const s = await normalSeries();
    await rejects(createSeriesMatchEvent(pg(), 'nope', { match: { start_date: START } }), 404);
    await pg().update(series).set({ status: 'complete' }).where(eq(series.id, s.seriesId));
    await rejects(createSeriesMatchEvent(pg(), s.seriesId, { match: { start_date: START } }), 409);
    await pg().update(series).set({ status: 'cancelled' }).where(eq(series.id, s.seriesId));
    await rejects(createSeriesMatchEvent(pg(), s.seriesId, { match: { start_date: START } }), 409);
  });

  it('rejects bad entrant selections without writing anything', async () => {
    const s = await normalSeries(['Alpha', 'Bravo', 'Charlie']);
    const other = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'Outsider', members: ['x'] }] });
    const [a, b, c] = s.entrants;
    await pg().update(seriesEntrants).set({ status: 'pending' }).where(eq(seriesEntrants.id, c.id));
    const tpl = { start_date: START, maps: s.mapIds.slice(0, 1) };
    const before = await counts();

    await rejects(createSeriesMatchEvent(pg(), s.seriesId, { entrant_ids: [a.id], match: tpl }), 400, /at least 2/);
    await rejects(createSeriesMatchEvent(pg(), s.seriesId, { entrant_ids: [a.id, a.id], match: tpl }), 400, /more than once/);
    await rejects(createSeriesMatchEvent(pg(), s.seriesId, { entrant_ids: [a.id, other.entrants[0].id], match: tpl }), 400, /does not belong/);
    await rejects(createSeriesMatchEvent(pg(), s.seriesId, { entrant_ids: [a.id, c.id], match: tpl }), 400, /pending/);
    await pg().update(seriesEntrants).set({ status: 'withdrawn' }).where(eq(seriesEntrants.id, b.id));
    await rejects(createSeriesMatchEvent(pg(), s.seriesId, { entrant_ids: [a.id, b.id], match: tpl }), 400, /withdrawn/);
    expect(await counts()).toEqual(before);
  });

  it('requires 2 to 16 entrants for a Normal match', async () => {
    const names = Array.from({ length: 17 }, (_, i) => `Team ${String(i).padStart(2, '0')}`);
    const s = await normalSeries(names);
    await rejects(createSeriesMatchEvent(pg(), s.seriesId, { match: { start_date: START, maps: s.mapIds.slice(0, 1) } }), 400, /2 to 16/);
    const sixteen = await createSeriesMatchEvent(pg(), s.seriesId, { entrant_ids: s.entrants.slice(0, 16).map((e) => e.id), match: { start_date: START, maps: s.mapIds.slice(0, 1) } });
    expect((await pg().select().from(matches).where(eq(matches.id, sixteen.match_id)))[0].team_count).toBe(16);
  });

  it('enforces roster_min', async () => {
    const s = await normalSeries(['Alpha', 'Bravo'], { rosterMin: 4 });
    await rejects(createSeriesMatchEvent(pg(), s.seriesId, { match: { start_date: START, maps: s.mapIds.slice(0, 1) } }), 400, /needs at least 4/);
    await pg().update(series).set({ roster_min: 3 }).where(eq(series.id, s.seriesId));
    expect(await createSeriesMatchEvent(pg(), s.seriesId, { match: { start_date: START, maps: s.mapIds.slice(0, 1) } })).toHaveProperty('match_id');
  });

  it('checks the game, the scoring type, the maps and the stage', async () => {
    const s = await normalSeries(['Alpha', 'Bravo']);
    const outside = await createGame({ name: 'Outside' });
    const racing = await modeWithMaps(s.gameId, 'Position', null, 2);
    const before = await counts();
    await rejects(createSeriesMatchEvent(pg(), s.seriesId, { match: { start_date: START, game_id: outside.id } }), 400, /not one of this series/);
    await rejects(createSeriesMatchEvent(pg(), s.seriesId, { match: { start_date: START, maps: racing.mapIds } }), 400, /only takes Normal/);
    await rejects(createSeriesMatchEvent(pg(), s.seriesId, { match: { start_date: START, maps: ['no-such-map'] } }), 400, /Unknown map/);
    await rejects(createSeriesMatchEvent(pg(), s.seriesId, { stage_id: 'nope', match: { start_date: START, maps: s.mapIds.slice(0, 1) } }), 400, /stage_id/);
    await rejects(createSeriesMatchEvent(pg(), s.seriesId, { match: { start_date: 'not a date' } }), 400);
    const otherSeries = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [] });
    const foreignStage = await insertStage(otherSeries.seriesId);
    await rejects(createSeriesMatchEvent(pg(), s.seriesId, { stage_id: foreignStage.id, match: { start_date: START, maps: s.mapIds.slice(0, 1) } }), 400, /stage_id/);
    expect(await counts()).toEqual(before);
  });

  it('needs a game when the series has none and maps for FFA / Position series', async () => {
    const s = await normalSeries(['Alpha', 'Bravo'], { gameId: null });
    await pg().update(series).set({ game_id: null }).where(eq(series.id, s.seriesId));
    await rejects(createSeriesMatchEvent(pg(), s.seriesId, { match: { start_date: START } }), 400, /game_id is required/);

    const game = await createGame();
    const racing = await createSeriesWithEntrants(pg(), { entrantType: 'solo', scoringType: 'Position', gameId: game.id, entrants: [{ name: 'P1', members: ['p1'] }, { name: 'P2', members: ['p2'] }] });
    await rejects(createSeriesMatchEvent(pg(), racing.seriesId, { match: { start_date: START } }), 400, /Select maps/);
  });
});

describe('createSeriesMatchEvent: racing', () => {
  async function racingSeries(over: { entrantType: 'solo' | 'team'; scoringType: 'Position' | 'FFA'; teamSize: number | null; entrants: Array<{ name: string; members: Array<string | { username: string; role: 'captain' }> }> }) {
    const game = await createGame({ max_signups: 24 });
    const mode = await modeWithMaps(game.id, over.scoringType, over.teamSize, 3);
    const s = await createSeriesWithEntrants(pg(), { entrantType: over.entrantType, scoringType: over.scoringType, gameId: game.id, entrants: over.entrants });
    return { ...s, ...mode, gameId: game.id };
  }

  it('solo Position: participants first, then one team row per participant tagged with its entrant', async () => {
    const s = await racingSeries({
      entrantType: 'solo', scoringType: 'Position', teamSize: null,
      entrants: [{ name: 'Ada', members: ['ada'] }, { name: 'Bo', members: ['bo'] }, { name: 'Cy', members: ['cy'] }],
    });
    const created = await createSeriesMatchEvent(pg(), s.seriesId, { week: 1, match: { start_date: START, maps: s.mapIds.slice(0, 2) } });
    const [match] = await pg().select().from(matches).where(eq(matches.id, created.match_id));
    expect(match).toMatchObject({ status: 'assign', name: 'Season - Round 1' });

    const people = await participantsOf(match.id);
    const teams = await teamsOf(match.id);
    expect(people).toHaveLength(3);
    expect(teams.filter((t) => !t.is_reserve)).toHaveLength(3);
    for (const entrant of s.entrants) {
      const person = people.find((p) => p.user_id === entrant.userIds[0])!;
      const team = teams.find((t) => t.id === person.team_id)!;
      expect(team).toMatchObject({ series_entrant_id: entrant.id, team_name: entrant.name });
      expect(person.receives_map_codes).toBe(true);
    }
    expect((await eventRow(created.event_id)).entrant_ids).toHaveLength(3);
  });

  it('FFA with team entrants: every member races on their own team row, tagged with the entrant', async () => {
    const s = await racingSeries({
      entrantType: 'team', scoringType: 'FFA', teamSize: null,
      entrants: [{ name: 'Red', members: [{ username: 'r-cap', role: 'captain' }, 'r2'] }, { name: 'Blue', members: ['b1', 'b2'] }],
    });
    const created = await createSeriesMatchEvent(pg(), s.seriesId, { match: { start_date: START, maps: s.mapIds.slice(0, 1) } });
    const people = await participantsOf(created.match_id);
    const teams = await teamsOf(created.match_id);
    expect(people).toHaveLength(4);
    expect(teams).toHaveLength(4);
    for (const entrant of s.entrants) {
      for (const userId of entrant.userIds) {
        const team = teams.find((t) => t.id === people.find((p) => p.user_id === userId)!.team_id)!;
        expect(team.series_entrant_id).toBe(entrant.id);
        expect(team.team_name).toBe(people.find((p) => p.user_id === userId)!.username); // not a solo entrant: keeps the player's name
      }
    }
    // the captain (or the first listed player) is the commander
    expect(people.filter((p) => p.receives_map_codes).map((p) => p.username).sort()).toEqual(['b1', 'r-cap']);
  });

  it('endurance (Position, team_size > 1): one named team per entrant with its roster', async () => {
    const s = await racingSeries({
      entrantType: 'team', scoringType: 'Position', teamSize: 3,
      entrants: [
        { name: 'Porsche', members: [{ username: 'p-cap', role: 'captain' }, 'p2', 'p3'] },
        { name: 'Ferrari', members: ['f1', 'f2', 'f3'] },
        { name: 'BMW', members: ['m1', 'm2', 'm3'] },
      ],
    });
    // the order given is the team order
    const created = await createSeriesMatchEvent(pg(), s.seriesId, { entrant_ids: s.entrants.map((e) => e.id), match: { start_date: START, maps: s.mapIds.slice(0, 1) } });
    const teams = (await teamsOf(created.match_id)).filter((t) => !t.is_reserve);
    expect(teams.map((t) => [t.team_name, t.series_entrant_id])).toEqual(s.entrants.map((e) => [e.name, e.id]));
    const people = await participantsOf(created.match_id);
    expect(people).toHaveLength(9);
    for (const [i, entrant] of s.entrants.entries()) {
      expect(people.filter((p) => p.team_id === teams[i].id).map((p) => p.user_id).sort()).toEqual([...entrant.userIds].sort());
    }
    expect((await pg().select().from(matches).where(eq(matches.id, created.match_id)))[0].team_count).toBe(3);
  });

  it('an individual layout needs a player for every entrant', async () => {
    const s = await racingSeries({
      entrantType: 'solo', scoringType: 'Position', teamSize: null, entrants: [{ name: 'Ada', members: ['ada'] }, { name: 'Nobody', members: [] }],
    });
    await rejects(createSeriesMatchEvent(pg(), s.seriesId, { match: { start_date: START, maps: s.mapIds.slice(0, 1) } }), 400, /needs at least 1/);
  });
});

describe('createSeriesTournamentEvent', () => {
  const tpl = (over: Record<string, unknown> = {}) => ({ name: 'Playoffs', rounds_per_match: 3, start_time: START, ...over });

  const teamsOfTournament = (tournamentId: string) =>
    pg().select().from(tournamentTeams).where(eq(tournamentTeams.tournament_id, tournamentId)).orderBy(asc(tournamentTeams.created_at));
  const bracketOf = async (tournamentId: string) => {
    const rows = await pg().select().from(tournamentMatches).where(eq(tournamentMatches.tournament_id, tournamentId)).orderBy(asc(tournamentMatches.round), asc(tournamentMatches.match_order));
    const names = new Map((await teamsOfTournament(tournamentId)).map((t) => [t.id, t.team_name]));
    return rows.map((r) => [r.round, names.get(r.team1_id as string) ?? null, names.get(r.team2_id as string) ?? null]);
  };

  it('presets one team per entrant with its roster, status assign, and a seeded bracket (6 entrants)', async () => {
    const s = await normalSeries(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot']);
    // seeds follow entrant.seed, then name: Alpha 1 ... Foxtrot 6
    for (const [i, e] of s.entrants.entries()) await pg().update(seriesEntrants).set({ seed: i + 1 }).where(eq(seriesEntrants.id, e.id));
    const created = await createSeriesTournamentEvent(pg(), s.seriesId, { format: 'single-elimination', tournament: tpl(), week: 1 });

    const [t] = await pg().select().from(tournaments).where(eq(tournaments.id, created.tournament_id));
    expect(t).toMatchObject({ name: 'Playoffs', status: 'assign', format: 'single-elimination', game_id: s.gameId, game_mode_id: s.modeId, rounds_per_match: 3 });
    expect(t.start_time?.toISOString()).toBe(START);

    const teams = await teamsOfTournament(t.id);
    expect(teams.map((x) => [x.team_name, x.series_entrant_id])).toEqual(s.entrants.map((e) => [e.name, e.id]));
    const members = await pg().select().from(tournamentTeamMembers);
    expect(members).toHaveLength(18);
    for (const [i, team] of teams.entries()) {
      const mine = members.filter((m) => m.team_id === team.id);
      expect(mine.map((m) => m.user_id).sort()).toEqual([...s.entrants[i].userIds].sort());
      expect(mine.filter((m) => m.is_captain).map((m) => m.username)).toEqual([`${s.entrants[i].name}-cap`]);
    }
    const signups = await pg().select().from(tournamentParticipants).where(eq(tournamentParticipants.tournament_id, t.id));
    expect(signups).toHaveLength(18);
    expect(signups.every((p) => teams.some((x) => x.id === p.team_assignment))).toBe(true);

    // seedOrder(6) = [2,5,3,4,1,6]: Bravo-Echo, Charlie-Delta, Alpha-Foxtrot
    expect(await bracketOf(t.id)).toEqual([[1, 'Bravo', 'Echo'], [1, 'Charlie', 'Delta'], [1, 'Alpha', 'Foxtrot']]);

    // matches are in assign, their match teams are named and tagged with the entrants
    const bracketMatches = await pg().select().from(matches).where(eq(matches.tournament_id, t.id));
    expect(bracketMatches).toHaveLength(3);
    expect(bracketMatches.every((m) => m.status === 'assign')).toBe(true);
    const tagged = await pg().select().from(matchTeams).where(and(eq(matchTeams.match_id, bracketMatches[0].id)));
    expect(tagged.every((x) => x.series_entrant_id !== null)).toBe(true);
    expect(tagged.map((x) => x.team_name).sort()).toEqual(bracketMatches[0].name.split(' vs ').sort());
    expect((await announcementsOf(bracketMatches[0].id)).map((r) => r.announcement_type)).toEqual(['standard']);

    expect(await eventRow(created.event_id)).toMatchObject({
      event_type: 'tournament', tournament_id: t.id, match_id: null, status: 'live', week: 1, entrant_ids: s.entrants.map((e) => e.id), event_order: 1,
    });
  });

  it('seeds 1 vs n on four entrants from an explicit seed_order', async () => {
    const s = await normalSeries(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    const [a, b, c, d] = s.entrants;
    const created = await createSeriesTournamentEvent(pg(), s.seriesId, {
      format: 'double-elimination', seed_order: [c.id, a.id, d.id, b.id], tournament: tpl(),
    });
    // seeds: 1 Charlie, 2 Alpha, 3 Delta, 4 Bravo -> 1 v 4, 2 v 3
    expect(await bracketOf(created.tournament_id)).toEqual([[1, 'Charlie', 'Bravo'], [1, 'Alpha', 'Delta']]);
  });

  it('defaults to entrant.seed then name, unseeded entrants last', async () => {
    const s = await normalSeries(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    await pg().update(seriesEntrants).set({ seed: 1 }).where(eq(seriesEntrants.id, s.entrants[3].id)); // Delta is the top seed
    const created = await createSeriesTournamentEvent(pg(), s.seriesId, { format: 'single-elimination', tournament: tpl() });
    // seed order: Delta, Alpha, Bravo, Charlie -> 1 v 4 (Delta v Charlie), 2 v 3 (Alpha v Bravo)
    expect(await bracketOf(created.tournament_id)).toEqual([[1, 'Delta', 'Charlie'], [1, 'Alpha', 'Bravo']]);
  });

  it('gives the top seed the bye with an odd count', async () => {
    const s = await normalSeries(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo']);
    const created = await createSeriesTournamentEvent(pg(), s.seriesId, { format: 'single-elimination', tournament: tpl() });
    expect(await bracketOf(created.tournament_id)).toEqual([[1, 'Charlie', 'Delta'], [1, 'Bravo', 'Echo']]);
    const [bye] = await pg().select().from(tournamentRoundByes).where(eq(tournamentRoundByes.tournament_id, created.tournament_id));
    const [alpha] = await pg().select().from(tournamentTeams).where(and(eq(tournamentTeams.tournament_id, created.tournament_id), eq(tournamentTeams.team_name, 'Alpha')));
    expect(bye).toMatchObject({ round: 1, bracket_type: 'winners', team_id: alpha.id });
  });

  it('creates a cumulative-points tournament for a racing series: the same teams, one group match tagged per participant', async () => {
    const game = await createGame({ max_signups: 24 });
    const { modeId } = await modeWithMaps(game.id, 'Position', null, 4);
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'solo', scoringType: 'Position', gameId: game.id,
      entrants: [{ name: 'Ada', members: ['ada'] }, { name: 'Bo', members: ['bo'] }, { name: 'Cy', members: ['cy'] }],
    });
    await pg().update(series).set({ game_mode_id: modeId }).where(eq(series.id, s.seriesId));
    const created = await createSeriesTournamentEvent(pg(), s.seriesId, { format: 'cumulative-points', tournament: tpl({ name: 'Race weekend' }), role: 'regular' });

    expect(await teamsOfTournament(created.tournament_id)).toHaveLength(3);
    const group = await pg().select().from(matches).where(eq(matches.tournament_id, created.tournament_id));
    expect(group).toHaveLength(1);
    expect(group[0].status).toBe('assign');
    const teams = await teamsOf(group[0].id);
    expect(teams).toHaveLength(3);
    expect(teams.map((x) => x.series_entrant_id).sort()).toEqual(s.entrants.map((e) => e.id).sort());
    expect(await participantsOf(group[0].id)).toHaveLength(3);
  });

  it('validates format against the scoring type, the mode, the entrants and seed_order', async () => {
    const s = await normalSeries(['Alpha', 'Bravo', 'Charlie']);
    const racingGame = await createGame();
    const racing = await modeWithMaps(racingGame.id, 'Position', null, 3);
    const before = (await pg().select().from(tournaments)).length;
    await rejects(createSeriesTournamentEvent(pg(), s.seriesId, { format: 'cumulative-points', tournament: tpl() }), 400, /single-elimination or double-elimination/);
    await rejects(createSeriesTournamentEvent(pg(), s.seriesId, { format: 'single-elimination', tournament: tpl({ game_mode_id: 'nope' }) }), 400, /game mode/);
    await rejects(createSeriesTournamentEvent(pg(), s.seriesId, { format: 'single-elimination', tournament: tpl({ game_id: racingGame.id, game_mode_id: racing.modeId }) }), 400, /not one of this series/);
    await rejects(createSeriesTournamentEvent(pg(), s.seriesId, { format: 'single-elimination', entrant_ids: [s.entrants[0].id], tournament: tpl() }), 400, /at least 2/);
    await rejects(createSeriesTournamentEvent(pg(), s.seriesId, { format: 'single-elimination', seed_order: [s.entrants[0].id, s.entrants[1].id], tournament: tpl() }), 400, /seed_order/);
    await rejects(createSeriesTournamentEvent(pg(), s.seriesId, { format: 'single-elimination', seed_order: [s.entrants[0].id, s.entrants[0].id, s.entrants[1].id], tournament: tpl() }), 400, /seed_order/);
    await pg().update(series).set({ game_mode_id: null }).where(eq(series.id, s.seriesId));
    await rejects(createSeriesTournamentEvent(pg(), s.seriesId, { format: 'single-elimination', tournament: tpl() }), 400, /game_mode_id is required/);
    expect((await pg().select().from(tournaments)).length).toBe(before);

    const racers = await createSeriesWithEntrants(pg(), {
      entrantType: 'solo', scoringType: 'Position', gameId: racingGame.id, entrants: [{ name: 'Ada', members: ['ada'] }, { name: 'Bo', members: ['bo'] }],
    });
    await pg().update(series).set({ game_mode_id: racing.modeId }).where(eq(series.id, racers.seriesId));
    await rejects(createSeriesTournamentEvent(pg(), racers.seriesId, { format: 'single-elimination', tournament: tpl() }), 400, /cumulative-points/);
  });

  it('rolls everything back when the bracket cannot be generated (no tournament-eligible maps)', async () => {
    const s = await normalSeries(['Alpha', 'Bravo']);
    const { gameMaps } = await import('../../../lib/db/schema');
    await pg().update(gameMaps).set({ tournament_enabled: false }).where(eq(gameMaps.game_id, s.gameId));
    await rejects(createSeriesTournamentEvent(pg(), s.seriesId, { format: 'single-elimination', tournament: tpl() }), 400, /tournament-eligible/);
    expect(await pg().select().from(tournaments)).toEqual([]);
    expect(await pg().select().from(tournamentTeams)).toEqual([]);
    expect(await pg().select().from(seriesEvents)).toEqual([]);
  });

  it('fillEventId turns a planned event into the live tournament (what playoff seeding uses)', async () => {
    const s = await normalSeries(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    const plannedId = await createSeriesPlannedEvent(pg(), s.seriesId, {
      role: 'season_playoff', week: 9,
      seeding_rule: { source: 'season', top: 4, format: 'single-elimination', template: { name: 'Finals' } },
    });
    const after = new AfterCommit();
    const created = await pg().transaction((tx) => createSeriesTournamentEventTx(tx, s.seriesId, {
      format: 'single-elimination', entrant_ids: s.entrants.map((e) => e.id), tournament: tpl({ name: 'Finals' }),
    }, after, { fillEventId: plannedId }));
    await after.run();
    expect(created.event_id).toBe(plannedId);
    expect(await eventRow(plannedId)).toMatchObject({
      status: 'live', tournament_id: created.tournament_id, event_type: 'tournament', role: 'season_playoff', week: 9, counts_for_standings: false,
    });
    expect((await pg().select().from(seriesEvents)).length).toBe(1);
    // a live event cannot be filled again
    await rejects(pg().transaction((tx) => createSeriesTournamentEventTx(tx, s.seriesId, {
      format: 'single-elimination', tournament: tpl({ name: 'Again' }),
    }, new AfterCommit(), { fillEventId: plannedId })), 409);
    await rejects(pg().transaction((tx) => createSeriesMatchEventTx(tx, s.seriesId, { match: { start_date: START, maps: s.mapIds.slice(0, 1) } }, new AfterCommit(), { fillEventId: 'nope' })), 404);
  });
});

describe('createSeriesPlannedEvent', () => {
  const rule = (over: Record<string, unknown> = {}) => ({
    source: 'season' as const, top: 4, format: 'single-elimination' as const, template: { name: 'Playoffs' }, ...over,
  });

  it('creates a placeholder without a target and reads back as a planned event', async () => {
    const s = await normalSeries();
    const stage = await insertStage(s.seriesId);
    const id = await createSeriesPlannedEvent(pg(), s.seriesId, {
      role: 'stage_playoff', stage_id: stage.id, week: 6,
      seeding_rule: rule({ source: 'stage', stage_id: stage.id, per_division: true, template: { name: 'Stage 1 Playoffs', start_time: START } }),
    });
    expect(await eventRow(id)).toMatchObject({
      status: 'planned', event_type: 'tournament', match_id: null, tournament_id: null, role: 'stage_playoff', stage_id: stage.id, week: 6,
      counts_for_standings: false, entrant_ids: null, batch_id: null, event_order: 1,
    });
    const dto = await getSeriesEventDto(pg(), s.seriesId, id);
    expect(dto).toMatchObject({ status: 'planned', name: 'Stage 1 Playoffs', target_status: null });
    expect(dto?.seeding_rule?.top).toBe(4);
    const next = await createSeriesPlannedEvent(pg(), s.seriesId, { role: 'season_playoff', seeding_rule: rule() });
    expect((await eventRow(next)).event_order).toBe(2);
  });

  it('validates the rule against the series', async () => {
    const s = await normalSeries();
    const stage = await insertStage(s.seriesId);
    await rejects(createSeriesPlannedEvent(pg(), s.seriesId, { role: 'stage_playoff', seeding_rule: rule({ source: 'stage' }) }), 400, /stage_id is required/);
    await rejects(createSeriesPlannedEvent(pg(), s.seriesId, { role: 'stage_playoff', seeding_rule: rule({ source: 'stage', stage_id: 'nope' }) }), 400, /does not match a stage/);
    await rejects(createSeriesPlannedEvent(pg(), s.seriesId, { role: 'stage_playoff', stage_id: 'nope', seeding_rule: rule() }), 400, /stage_id/);
    await rejects(createSeriesPlannedEvent(pg(), s.seriesId, { role: 'season_playoff', seeding_rule: rule({ format: 'cumulative-points' }) }), 400, /elimination/);
    await rejects(createSeriesPlannedEvent(pg(), s.seriesId, { role: 'season_playoff', seeding_rule: rule({ template: { name: 'X', game_id: 'nope' } }) }), 400, /not one of this series/);
    await rejects(createSeriesPlannedEvent(pg(), 'nope', { role: 'season_playoff', seeding_rule: rule() }), 404);
    expect(await createSeriesPlannedEvent(pg(), s.seriesId, { role: 'stage_playoff', seeding_rule: rule({ source: 'stage', stage_id: stage.id }) })).toBeTruthy();
    await pg().update(series).set({ status: 'complete' }).where(eq(series.id, s.seriesId));
    await rejects(createSeriesPlannedEvent(pg(), s.seriesId, { role: 'season_playoff', seeding_rule: rule() }), 409);
  });
});
