// @vitest-environment node
/** Series entrants and rosters: CRUD, roster rules, soft leave, copy, player resolution and search (domain level). */
import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createGame, createGameMode, createMatch, createMatchParticipant } from '../../utils/pg-fixtures';
import { createSeriesWithEntrants, insertSeries, linkEvent } from '../../utils/pg-series-fixtures';
import {
  SeriesError, addEntrantMember, copyEntrants, createEntrant, deleteEntrant, entrantHasResults, getEntrant, listActiveRoster, listEntrants,
  getSeriesSummary, loadPlayerEntrantIndex, removeEntrantMember, resolveEntrantForPlayer, searchPlayers, updateEntrant, updateEntrantMember,
} from '@/lib/series';
import { matchTeams, seriesEntrantMembers, seriesEntrants } from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));

setupPgTestFile();
const pg = () => getPgTestDb();
const rejects = (p: Promise<unknown>, status: number, message?: RegExp) =>
  expect(p).rejects.toMatchObject({ name: 'SeriesError', status, ...(message ? { message: expect.stringMatching(message) } : {}) });

describe('createEntrant', () => {
  it('creates a solo entrant with its one player', async () => {
    const s = await insertSeries({ entrant_type: 'solo' });
    const id = await createEntrant(pg(), s.id, { name: ' Alice ', members: [{ user_id: 'u1', discord_user_id: 'd1', username: 'Alice' }], seed: 3, color: '#fff' });
    const e = (await getEntrant(pg(), s.id, id))!;
    expect(e).toMatchObject({ name: 'Alice', status: 'active', seed: 3, color: '#fff', source_entrant_id: null });
    expect(e.members).toHaveLength(1);
    expect(e.members[0]).toMatchObject({ user_id: 'u1', discord_user_id: 'd1', role: 'player', left_at: null });
  });

  it('refuses a second player on a solo entrant, and too many on a team', async () => {
    const solo = await insertSeries({ entrant_type: 'solo' });
    await rejects(createEntrant(pg(), solo.id, { name: 'X', members: [{ user_id: 'a', username: 'a' }, { user_id: 'b', username: 'b' }] }), 400);
    const team = await insertSeries({ entrant_type: 'team', roster_max: 2 });
    await rejects(createEntrant(pg(), team.id, { name: 'T', members: ['a', 'b', 'c'].map((u) => ({ user_id: u, username: u })) }), 400);
    expect(await listEntrants(pg(), team.id)).toEqual([]); // nothing was left behind
  });

  it('enforces unique names per series (409) but allows the same name in another series', async () => {
    const a = await insertSeries();
    const b = await insertSeries();
    await createEntrant(pg(), a.id, { name: 'Dup' });
    await rejects(createEntrant(pg(), a.id, { name: 'Dup' }), 409, /name/);
    await createEntrant(pg(), b.id, { name: 'Dup' });
  });

  it('keeps one current roster per player per series (409), and frees the player when they leave', async () => {
    const s = await insertSeries({ entrant_type: 'team' });
    const first = await createEntrant(pg(), s.id, { name: 'One', members: [{ user_id: 'p', discord_user_id: 'dp', username: 'P' }] });
    await rejects(createEntrant(pg(), s.id, { name: 'Two', members: [{ user_id: 'p', username: 'P' }] }), 409, /already on the roster of "One"/);
    // the same person under another user id but the same Discord id is also refused
    await rejects(createEntrant(pg(), s.id, { name: 'Three', members: [{ user_id: 'other', discord_user_id: 'dp', username: 'P' }] }), 409);
    const [m] = (await getEntrant(pg(), s.id, first))!.members;
    await removeEntrantMember(pg(), s.id, first, m.id);
    await createEntrant(pg(), s.id, { name: 'Four', members: [{ user_id: 'p', username: 'P' }] });
  });

  it('rejects two captains and refuses finished or unknown series', async () => {
    const s = await insertSeries({ entrant_type: 'team' });
    await rejects(createEntrant(pg(), s.id, { name: 'C', members: [{ user_id: 'a', username: 'a', role: 'captain' }, { user_id: 'b', username: 'b', role: 'captain' }] }), 400);
    const done = await insertSeries({ status: 'complete' });
    await rejects(createEntrant(pg(), done.id, { name: 'Late' }), 409);
    await rejects(createEntrant(pg(), 'nope', { name: 'X' }), 404);
  });
});

describe('members', () => {
  it('making a member captain demotes the previous captain', async () => {
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'T', members: [{ username: 'a', role: 'captain' }, 'b'] }] });
    const [t] = f.entrants;
    await updateEntrantMember(pg(), f.seriesId, t.id, t.memberIds[1], { role: 'captain' });
    const roles = Object.fromEntries((await getEntrant(pg(), f.seriesId, t.id))!.members.map((m) => [m.username, m.role]));
    expect(roles).toEqual({ a: 'player', b: 'captain' });
  });

  it('add is capped by roster_max, refused on withdrawn entrants and unknown ids', async () => {
    const f = await createSeriesWithEntrants(pg(), {
      entrantType: 'team', rosterMax: 2,
      entrants: [{ name: 'T', members: ['a', 'b'] }, { name: 'W', status: 'withdrawn' }],
    });
    const [t, w] = f.entrants;
    await rejects(addEntrantMember(pg(), f.seriesId, t.id, { user_id: 'c', username: 'c' }), 409, /full/);
    await rejects(addEntrantMember(pg(), f.seriesId, w.id, { user_id: 'c', username: 'c' }), 409, /withdrawn/);
    await rejects(addEntrantMember(pg(), f.seriesId, 'nope', { user_id: 'c', username: 'c' }), 404);
  });

  it('solo entrants hold exactly one player and no special roles', async () => {
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'solo', entrants: [{ name: 'S', members: ['a'] }, { name: 'Empty' }] });
    await rejects(addEntrantMember(pg(), f.seriesId, f.entrants[0].id, { user_id: 'x', username: 'x' }), 409, /exactly one/);
    await rejects(updateEntrantMember(pg(), f.seriesId, f.entrants[0].id, f.entrants[0].memberIds[0], { role: 'captain' }), 400);
    const m = await addEntrantMember(pg(), f.seriesId, f.entrants[1].id, { user_id: 'y', username: 'y', role: 'captain' });
    expect(m.role).toBe('player');
  });

  it('leaving sets left_at (history kept), is idempotent-safe and hidden from the default roster', async () => {
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'T', members: ['a', 'b'] }] });
    const [t] = f.entrants;
    await removeEntrantMember(pg(), f.seriesId, t.id, t.memberIds[0]);
    await rejects(removeEntrantMember(pg(), f.seriesId, t.id, t.memberIds[0]), 409);
    await rejects(removeEntrantMember(pg(), f.seriesId, t.id, 'nope'), 404);
    expect((await listActiveRoster(pg(), t.id)).map((m) => m.username)).toEqual(['b']);
    expect((await getEntrant(pg(), f.seriesId, t.id))!.members).toHaveLength(1);
    const all = (await getEntrant(pg(), f.seriesId, t.id, { includeLeft: true }))!.members;
    expect(all).toHaveLength(2);
    expect(all.find((m) => m.username === 'a')!.left_at).toBeInstanceOf(Date);
  });

  it('a pending entrant left empty is deleted when asked (the Discord leave flow)', async () => {
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'P', status: 'pending', members: ['a'] }, { name: 'A', members: ['b'] }] });
    expect(await removeEntrantMember(pg(), f.seriesId, f.entrants[0].id, f.entrants[0].memberIds[0], { deleteEmptyPending: true })).toEqual({ entrant_deleted: true });
    expect(await removeEntrantMember(pg(), f.seriesId, f.entrants[1].id, f.entrants[1].memberIds[0], { deleteEmptyPending: true })).toEqual({ entrant_deleted: false });
    expect((await listEntrants(pg(), f.seriesId)).map((e) => e.name)).toEqual(['A']);
  });
});

describe('updateEntrant / deleteEntrant', () => {
  it('edits fields, approves pending and refuses a direct move to withdrawn', async () => {
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'T', status: 'pending' }, { name: 'U' }] });
    const e = await updateEntrant(pg(), f.seriesId, f.entrants[0].id, { status: 'active', division: ' Pacific ', seed: 2, tag: null });
    expect(e).toMatchObject({ status: 'active', division: 'Pacific', seed: 2, tag: null });
    await rejects(updateEntrant(pg(), f.seriesId, f.entrants[0].id, { status: 'withdrawn' }), 400, /withdraw/);
    const w = await updateEntrant(pg(), f.seriesId, f.entrants[0].id, { status: 'withdrawn' }, { allowWithdrawn: true });
    expect(w.status).toBe('withdrawn');
    await rejects(updateEntrant(pg(), f.seriesId, f.entrants[0].id, { name: 'U' }), 409, /name/);
    await rejects(updateEntrant(pg(), f.seriesId, 'nope', { seed: 1 }), 404);
  });

  it('deletes entrants without results and cascades the roster', async () => {
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'T', members: ['a'] }] });
    await deleteEntrant(pg(), f.seriesId, f.entrants[0].id);
    expect(await pg().select().from(seriesEntrants).where(eq(seriesEntrants.series_id, f.seriesId))).toEqual([]);
    expect(await pg().select().from(seriesEntrantMembers).where(eq(seriesEntrantMembers.series_id, f.seriesId))).toEqual([]);
    await rejects(deleteEntrant(pg(), f.seriesId, f.entrants[0].id), 404);
  });

  it('refuses (409) to delete an entrant with a completed match, via its team or its players', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id);
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'Linked' }, { name: 'ByPlayer', members: ['pl'] }, { name: 'Open' }] });
    const [linked, byPlayer, open] = f.entrants;

    const done = await createMatch(game.id, mode.id, { status: 'complete' });
    await pg().insert(matchTeams).values({ id: 'mt-linked', match_id: done.id, team_name: 'Linked', team_order: 0, series_entrant_id: linked.id });
    await rejects(deleteEntrant(pg(), f.seriesId, linked.id), 409, /withdraw/);
    expect(await entrantHasResults(pg(), f.seriesId, linked.id)).toBe(true);

    const played = await createMatch(game.id, mode.id, { status: 'complete' });
    await createMatchParticipant(played.id, 'u-pl', 'pl', { user_id: 'u-pl' });
    await linkEvent(f.seriesId, 'match', played.id);
    await rejects(deleteEntrant(pg(), f.seriesId, byPlayer.id), 409);

    await deleteEntrant(pg(), f.seriesId, open.id);
  });

  it('an unfinished match only loses its entrant link when the entrant is deleted (FK set null)', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id);
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'T' }] });
    const m = await createMatch(game.id, mode.id, { status: 'assign' });
    await pg().insert(matchTeams).values({ id: 'mt1', match_id: m.id, team_name: 'T', team_order: 0, series_entrant_id: f.entrants[0].id });
    expect(await entrantHasResults(pg(), f.seriesId, f.entrants[0].id)).toBe(false);
    await deleteEntrant(pg(), f.seriesId, f.entrants[0].id);
    const [team] = await pg().select().from(matchTeams).where(eq(matchTeams.id, 'mt1'));
    expect(team.series_entrant_id).toBeNull();
  });
});

describe('copyEntrants', () => {
  it('copies identity fields and current members, marks the source, and skips existing names', async () => {
    const src = await createSeriesWithEntrants(pg(), {
      entrantType: 'team', status: 'complete',
      entrants: [
        { name: 'Alpha', tag: 'AL', color: '#111', division: 'East', seed: 1, members: [{ username: 'a1', role: 'captain' }, 'a2', { username: 'gone', left: true }] },
        { name: 'Beta', members: ['b1'] },
        { name: 'Withdrawn', status: 'withdrawn' },
      ],
    });
    const target = await insertSeries({ entrant_type: 'team', status: 'created' });
    await createEntrant(pg(), target.id, { name: 'Beta' });

    const res = await copyEntrants(pg(), target.id, { from_series_id: src.seriesId });
    expect(res.entrants.map((e) => e.name)).toEqual(['Alpha']);
    expect(res.skipped).toEqual([{ name: 'Beta', reason: expect.stringMatching(/already exists/) }]);
    const [alpha] = res.entrants;
    expect(alpha).toMatchObject({ tag: 'AL', color: '#111', division: 'East', seed: 1, status: 'active', source_entrant_id: src.entrants[0].id });
    expect(alpha.members.map((m) => `${m.username}:${m.role}`).sort()).toEqual(['a1:captain', 'a2:player']);
  });

  it('can skip members, pick entrants, and reports members that cannot move over', async () => {
    const src = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'A', members: ['x', 'y'] }, { name: 'B', members: ['z'] }] });
    const noMembers = await insertSeries({ entrant_type: 'team' });
    const r1 = await copyEntrants(pg(), noMembers.id, { from_series_id: src.seriesId, entrant_ids: [src.entrants[1].id], include_members: false });
    expect(r1.entrants.map((e) => [e.name, e.members.length])).toEqual([['B', 0]]);

    // solo target: only the first player fits, the other is reported
    const solo = await insertSeries({ entrant_type: 'solo' });
    const r2 = await copyEntrants(pg(), solo.id, { from_series_id: src.seriesId, entrant_ids: [src.entrants[0].id] });
    expect(r2.entrants[0].members).toHaveLength(1);
    expect(r2.skipped).toHaveLength(1);
    expect(r2.skipped[0].name).toMatch(/^A \//);
  });

  it('rejects copying from itself, from an unknown series, or unknown entrants (400)', async () => {
    const src = await createSeriesWithEntrants(pg(), { entrantType: 'solo', entrants: [{ name: 'A' }] });
    await rejects(copyEntrants(pg(), src.seriesId, { from_series_id: src.seriesId }), 400);
    await rejects(copyEntrants(pg(), src.seriesId, { from_series_id: 'nope' }), 400);
    const other = await insertSeries();
    await rejects(copyEntrants(pg(), other.id, { from_series_id: src.seriesId, entrant_ids: ['nope'] }), 400);
  });
});

describe('resolveEntrantForPlayer / loadPlayerEntrantIndex', () => {
  it('finds an entrant by Discord id or user id, including members who left; a current roster wins', async () => {
    const f = await createSeriesWithEntrants(pg(), {
      entrantType: 'team',
      entrants: [
        { name: 'Old', members: [{ user_id: 'u1', discord_user_id: 'd1', username: 'one', left: true }, { user_id: 'u2', discord_user_id: 'd2', username: 'two' }] },
        { name: 'New', members: [{ user_id: 'u1', discord_user_id: 'd1', username: 'one' }] },
      ],
    });
    expect((await resolveEntrantForPlayer(pg(), f.seriesId, { discord_user_id: 'd1' }))!.name).toBe('New');
    expect((await resolveEntrantForPlayer(pg(), f.seriesId, { user_id: 'u1' }))!.name).toBe('New');
    expect((await resolveEntrantForPlayer(pg(), f.seriesId, { user_id: 'd2' }))!.name).toBe('Old'); // user id that is a Discord id
    expect(await resolveEntrantForPlayer(pg(), f.seriesId, { discord_user_id: 'nobody' })).toBeNull();
    expect(await resolveEntrantForPlayer(pg(), f.seriesId, {})).toBeNull();

    const index = await loadPlayerEntrantIndex(pg(), f.seriesId);
    expect(index.get('d1')).toBe(f.entrants[1].id);
    expect(index.get('u2')).toBe(f.entrants[0].id);
  });

  it('only a player who left is still resolved to the entrant they raced for', async () => {
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'T', members: [{ username: 'gone', left: true }] }] });
    expect((await resolveEntrantForPlayer(pg(), f.seriesId, { discord_user_id: 'u-gone' }))!.id).toBe(f.entrants[0].id);
    expect(await listActiveRoster(pg(), f.entrants[0].id)).toEqual([]);
  });

  it('does not leak across series', async () => {
    const a = await createSeriesWithEntrants(pg(), { entrantType: 'solo', entrants: [{ name: 'A', members: ['p'] }] });
    const b = await insertSeries();
    expect(await resolveEntrantForPlayer(pg(), b.id, { user_id: 'u-p' })).toBeNull();
    expect((await resolveEntrantForPlayer(pg(), a.seriesId, { user_id: 'u-p' }))!.name).toBe('A');
  });
});

describe('searchPlayers', () => {
  it('finds distinct players across matches, tournament signups and rosters, case-insensitively and literally', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id);
    const m = await createMatch(game.id, mode.id);
    await createMatchParticipant(m.id, 'd-1', 'Maverick', { user_id: 'd-1', avatar_url: 'http://a/1.png' });
    const m2 = await createMatch(game.id, mode.id);
    await createMatchParticipant(m2.id, 'd-1', 'maverick', { user_id: 'd-1' }); // same person again
    await createMatchParticipant(m.id, 'd-2', '100%_Pure', { user_id: 'd-2' });
    await createSeriesWithEntrants(pg(), { entrantType: 'solo', entrants: [{ name: 'S', members: [{ username: 'Mavis', user_id: 'x1', discord_user_id: 'd-3' }] }] });

    const hits = await searchPlayers(pg(), 'mav');
    expect(hits.map((h) => h.username.toLowerCase()).sort()).toEqual(['maverick', 'mavis']);
    expect(hits.find((h) => h.discord_user_id === 'd-1')!.avatar_url).toBe('http://a/1.png');
    expect(await searchPlayers(pg(), '%')).toEqual([expect.objectContaining({ username: '100%_Pure' })]);
    expect(await searchPlayers(pg(), '_')).toHaveLength(1);
    expect(await searchPlayers(pg(), '   ')).toEqual([]);
    expect(await searchPlayers(pg(), 'mav', 1)).toHaveLength(1);
  });
});

describe('errors', () => {
  it('SeriesError carries a status', () => {
    expect(new SeriesError('x', 409).status).toBe(409);
  });
});

describe('series player and team counts', () => {
  it('counts the current roster of non-withdrawn entrants, not the players who appear in events', async () => {
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'team',
      entrants: [
        { name: 'Alpha', members: ['a1', 'a2', 'a3'] },
        { name: 'Bravo', members: ['b1', 'b2'] },
        { name: 'Charlie', status: 'pending', members: ['c1'] },
        { name: 'Gone', status: 'withdrawn', members: ['g1', 'g2', 'g3', 'g4'] },
      ],
    });
    // no events at all, yet every roster player counts
    expect(await getSeriesSummary(pg(), s.seriesId)).toMatchObject({ participant_count: 6, entrant_count: 3 });

    // a player who left the roster no longer counts
    const [leaver] = await pg().select().from(seriesEntrantMembers).where(eq(seriesEntrantMembers.user_id, 'u-a3'));
    await removeEntrantMember(pg(), s.seriesId, leaver.entrant_id, leaver.id);
    expect(await getSeriesSummary(pg(), s.seriesId)).toMatchObject({ participant_count: 5, entrant_count: 3 });

    // withdrawing a team removes its players from the count
    const bravo = s.entrants.find((e) => e.name === 'Bravo')!;
    await pg().update(seriesEntrants).set({ status: 'withdrawn' }).where(eq(seriesEntrants.id, bravo.id)); // the withdraw action itself is covered elsewhere
    expect(await getSeriesSummary(pg(), s.seriesId)).toMatchObject({ participant_count: 3, entrant_count: 2 });
  });

  it('a series whose entrants all withdrew shows 0 / 0 instead of falling back to event players', async () => {
    const s = await createSeriesWithEntrants(pg(), { entrantType: 'solo', entrants: [{ name: 'Solo', status: 'withdrawn', members: ['p'] }] });
    expect(await getSeriesSummary(pg(), s.seriesId)).toMatchObject({ participant_count: 0, entrant_count: 0 });
  });

  it('a legacy series without entrants keeps the distinct players across its events', async () => {
    const s = await insertSeries({ entrant_type: 'solo' });
    const game = await createGame();
    const mode = await createGameMode(game.id);
    const m1 = await createMatch(game.id, mode.id);
    const m2 = await createMatch(game.id, mode.id);
    await createMatchParticipant(m1.id, 'd1');
    await createMatchParticipant(m1.id, 'd2');
    await createMatchParticipant(m2.id, 'd1'); // same player in two events counts once
    await linkEvent(s.id, 'match', m1.id);
    await linkEvent(s.id, 'match', m2.id);
    expect(await getSeriesSummary(pg(), s.id)).toMatchObject({ participant_count: 2, entrant_count: 0 });
  });
});
