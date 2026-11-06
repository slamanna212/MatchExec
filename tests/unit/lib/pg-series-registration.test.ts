// @vitest-environment node
/** Series self-service registration (the Discord buttons' domain layer) and the registration_open enqueue. */
import { describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createSeriesWithEntrants, insertSeries } from '../../utils/pg-series-fixtures';
import {
  getEntrant, joinSeriesEntrant, leaveSeries, listEntrants, listJoinableEntrants, registerForSeries, transitionSeries,
} from '@/lib/series';
import { discordSeriesUpdateQueue, seriesEntrantMembers, seriesEntrants } from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));

setupPgTestFile();
const pg = () => getPgTestDb();
const rejects = (p: Promise<unknown>, status: number, message?: RegExp) =>
  expect(p).rejects.toMatchObject({ name: 'SeriesError', status, ...(message ? { message: expect.stringMatching(message) } : {}) });

const alice = { user_id: 'u-alice', discord_user_id: 'u-alice', username: 'Alice' };
const bob = { user_id: 'u-bob', discord_user_id: 'u-bob', username: 'Bob' };
const cara = { user_id: 'u-cara', discord_user_id: 'u-cara', username: 'Cara' };

describe('registerForSeries', () => {
  it('registers a solo player as a pending entrant named after them', async () => {
    const s = await insertSeries({ entrant_type: 'solo', status: 'registration' });
    const result = await registerForSeries(pg(), s.id, alice);
    expect(result.entrant_name).toBe('Alice');
    const e = (await getEntrant(pg(), s.id, result.entrant_id))!;
    expect(e).toMatchObject({ name: 'Alice', status: 'pending' });
    expect(e.members).toHaveLength(1);
    expect(e.members[0]).toMatchObject({ user_id: 'u-alice', discord_user_id: 'u-alice', username: 'Alice', role: 'player' });
  });

  it('gives a solo player a numbered name when the username is already an entrant name', async () => {
    const s = await insertSeries({ entrant_type: 'solo', status: 'registration' });
    await registerForSeries(pg(), s.id, { user_id: 'x1', username: 'Sam' });
    const second = await registerForSeries(pg(), s.id, { user_id: 'x2', username: 'sam' });
    const third = await registerForSeries(pg(), s.id, { user_id: 'x3', username: 'Sam' });
    expect(second.entrant_name).toBe('sam (2)');
    expect(third.entrant_name).toBe('Sam (3)');
  });

  it('registers a team with its tag and makes the player captain', async () => {
    const s = await insertSeries({ entrant_type: 'team', status: 'registration', roster_max: 5 });
    const result = await registerForSeries(pg(), s.id, alice, { team: { name: ' Rockets ', tag: ' RKT ' } });
    const e = (await getEntrant(pg(), s.id, result.entrant_id))!;
    expect(e).toMatchObject({ name: 'Rockets', tag: 'RKT', status: 'pending' });
    expect(e.members[0]).toMatchObject({ user_id: 'u-alice', role: 'captain' });
  });

  it('validates the team name and tag', async () => {
    const s = await insertSeries({ entrant_type: 'team', status: 'registration' });
    await rejects(registerForSeries(pg(), s.id, alice), 400, /team name is required/);
    await rejects(registerForSeries(pg(), s.id, alice, { team: { name: '   ' } }), 400);
    await rejects(registerForSeries(pg(), s.id, alice, { team: { name: 'x'.repeat(46) } }), 400, /at most 45/);
    await rejects(registerForSeries(pg(), s.id, alice, { team: { name: 'Ok', tag: 'TOOLONGTAG' } }), 400, /tag/);
    expect(await listEntrants(pg(), s.id)).toEqual([]);
  });

  it('rejects a duplicate team name (409, case-insensitive) and a second roster for the same player (409)', async () => {
    const s = await insertSeries({ entrant_type: 'team', status: 'registration' });
    await registerForSeries(pg(), s.id, alice, { team: { name: 'Rockets' } });
    await rejects(registerForSeries(pg(), s.id, bob, { team: { name: 'ROCKETS' } }), 409, /already exists/);
    await rejects(registerForSeries(pg(), s.id, alice, { team: { name: 'Other' } }), 409, /already on the roster of "Rockets"/);
    expect(await listEntrants(pg(), s.id)).toHaveLength(1);
  });

  it('rejects a solo player who already registered, matching by Discord id too', async () => {
    const s = await insertSeries({ entrant_type: 'solo', status: 'registration' });
    await registerForSeries(pg(), s.id, alice);
    await rejects(registerForSeries(pg(), s.id, { user_id: 'other-key', discord_user_id: 'u-alice', username: 'Alice2' }), 409, /already on the roster/);
  });

  it('only works while registration is open (404 for an unknown series)', async () => {
    for (const status of ['created', 'active', 'complete', 'cancelled'] as const) {
      const s = await insertSeries({ status });
      await rejects(registerForSeries(pg(), s.id, alice), 409, /not open/);
    }
    await rejects(registerForSeries(pg(), 'nope', alice), 404);
  });

  it('requires a player id and username', async () => {
    const s = await insertSeries({ status: 'registration' });
    await rejects(registerForSeries(pg(), s.id, { user_id: '', username: 'x' }), 400);
    await rejects(registerForSeries(pg(), s.id, { user_id: 'u', username: ' ' }), 400);
  });
});

describe('joinSeriesEntrant / listJoinableEntrants', () => {
  it('adds the player to a team as a player and respects roster_max', async () => {
    const s = await insertSeries({ entrant_type: 'team', status: 'registration', roster_max: 2 });
    const team = await registerForSeries(pg(), s.id, alice, { team: { name: 'Rockets' } });

    const joined = await joinSeriesEntrant(pg(), s.id, team.entrant_id, bob);
    expect(joined).toEqual({ entrant_id: team.entrant_id, entrant_name: 'Rockets' });
    const roster = (await getEntrant(pg(), s.id, team.entrant_id))!.members;
    expect(roster.map((m) => [m.username, m.role])).toEqual([['Alice', 'captain'], ['Bob', 'player']]);

    await rejects(joinSeriesEntrant(pg(), s.id, team.entrant_id, cara), 409, /full/);
  });

  it('rejects: already on a roster, withdrawn / unknown teams, solo series, closed registration', async () => {
    const s = await insertSeries({ entrant_type: 'team', status: 'registration' });
    const a = await registerForSeries(pg(), s.id, alice, { team: { name: 'A' } });
    const b = await registerForSeries(pg(), s.id, bob, { team: { name: 'B' } });
    await rejects(joinSeriesEntrant(pg(), s.id, b.entrant_id, alice), 409, /already on the roster of "A"/);
    await rejects(joinSeriesEntrant(pg(), s.id, 'missing', cara), 404);

    const withdrawn = await createSeriesWithEntrants(pg(), { entrantType: 'team', status: 'registration', entrants: [{ name: 'W', status: 'withdrawn' }] });
    await rejects(joinSeriesEntrant(pg(), withdrawn.seriesId, withdrawn.entrants[0].id, cara), 409, /withdrawn/);

    const solo = await insertSeries({ entrant_type: 'solo', status: 'registration' });
    await rejects(joinSeriesEntrant(pg(), solo.id, a.entrant_id, cara), 400, /solo/);

    await transitionSeries(pg(), s.id, 'active');
    await rejects(joinSeriesEntrant(pg(), s.id, a.entrant_id, cara), 409, /not open/);
  });

  it('lists teams with room (not withdrawn), by name', async () => {
    const s = await insertSeries({ entrant_type: 'team', status: 'registration', roster_max: 2 });
    const z = await registerForSeries(pg(), s.id, alice, { team: { name: 'Zebras', tag: 'ZB' } });
    const full = await registerForSeries(pg(), s.id, bob, { team: { name: 'Full' } });
    await joinSeriesEntrant(pg(), s.id, full.entrant_id, cara);
    await registerForSeries(pg(), s.id, { user_id: 'd', username: 'D' }, { team: { name: 'Ants' } });
    const w = await createSeriesWithEntrants(pg(), { entrantType: 'team', status: 'registration', rosterMax: 2, entrants: [{ name: 'Gone', status: 'withdrawn' }] });

    const list = await listJoinableEntrants(pg(), s.id);
    expect(list.map((e) => e.name)).toEqual(['Ants', 'Zebras']);
    expect(list[1]).toMatchObject({ id: z.entrant_id, tag: 'ZB', status: 'pending', member_count: 1, roster_max: 2 });
    expect(await listJoinableEntrants(pg(), w.seriesId)).toEqual([]);
    expect(await listJoinableEntrants(pg(), 'nope')).toEqual([]);
  });

  it('lists every team when roster_max is unset', async () => {
    const s = await insertSeries({ entrant_type: 'team', status: 'registration', roster_max: null });
    const t = await registerForSeries(pg(), s.id, alice, { team: { name: 'T' } });
    for (const u of ['b', 'c', 'd']) await joinSeriesEntrant(pg(), s.id, t.entrant_id, { user_id: u, username: u });
    expect((await listJoinableEntrants(pg(), s.id)).map((e) => e.member_count)).toEqual([4]);
  });
});

describe('leaveSeries', () => {
  it('soft-leaves and deletes a pending solo entrant that is left empty', async () => {
    const s = await insertSeries({ entrant_type: 'solo', status: 'registration' });
    const r = await registerForSeries(pg(), s.id, alice);
    const out = await leaveSeries(pg(), s.id, alice);
    expect(out).toEqual({ entrant_id: r.entrant_id, entrant_name: 'Alice', entrant_deleted: true });
    expect(await listEntrants(pg(), s.id)).toEqual([]);
    // the player is free to register again
    await registerForSeries(pg(), s.id, alice);
  });

  it('keeps the team and hands the captaincy on when the captain leaves', async () => {
    const s = await insertSeries({ entrant_type: 'team', status: 'registration' });
    const t = await registerForSeries(pg(), s.id, alice, { team: { name: 'Rockets' } });
    await joinSeriesEntrant(pg(), s.id, t.entrant_id, bob);

    const out = await leaveSeries(pg(), s.id, alice);
    expect(out).toMatchObject({ entrant_name: 'Rockets', entrant_deleted: false });
    const e = (await getEntrant(pg(), s.id, t.entrant_id))!;
    expect(e.members.map((m) => [m.username, m.role])).toEqual([['Bob', 'captain']]);
    // history is kept
    const [row] = await pg().select().from(seriesEntrantMembers).where(and(eq(seriesEntrantMembers.entrant_id, t.entrant_id), eq(seriesEntrantMembers.user_id, 'u-alice')));
    expect(row.left_at).not.toBeNull();
  });

  it('never deletes an active entrant, even when its last player leaves', async () => {
    const s = await insertSeries({ entrant_type: 'team', status: 'registration' });
    const t = await registerForSeries(pg(), s.id, alice, { team: { name: 'Rockets' } });
    await pg().update(seriesEntrants).set({ status: 'active' }).where(eq(seriesEntrants.id, t.entrant_id));
    const out = await leaveSeries(pg(), s.id, alice);
    expect(out.entrant_deleted).toBe(false);
    expect((await getEntrant(pg(), s.id, t.entrant_id))!.members).toEqual([]);
  });

  it('rejects: not on a roster (404), registration closed (409)', async () => {
    const s = await insertSeries({ entrant_type: 'solo', status: 'registration' });
    await rejects(leaveSeries(pg(), s.id, alice), 404, /not on a roster/);
    await registerForSeries(pg(), s.id, alice);
    await transitionSeries(pg(), s.id, 'active');
    await rejects(leaveSeries(pg(), s.id, alice), 409, /not open/);
  });
});

describe('registration_open enqueue on the transition to registration', () => {
  const rows = (seriesId: string) => pg().select().from(discordSeriesUpdateQueue).where(eq(discordSeriesUpdateQueue.series_id, seriesId));

  it('queues one registration_open post', async () => {
    const s = await insertSeries({ status: 'created', announcements: true });
    await transitionSeries(pg(), s.id, 'registration');
    expect(await rows(s.id)).toMatchObject([{ kind: 'registration_open', status: 'pending', dedupe_key: 'registration' }]);
  });

  it('queues nothing when announcements are off or registration posts are disabled', async () => {
    const off = await insertSeries({ status: 'created', announcements: false });
    await transitionSeries(pg(), off.id, 'registration');
    const quiet = await insertSeries({ status: 'created', announcements: true, discord_config: { registration_posts: false } });
    await transitionSeries(pg(), quiet.id, 'registration');
    expect(await rows(off.id)).toEqual([]);
    expect(await rows(quiet.id)).toEqual([]);
  });

  it('does not queue it for other transitions, and registration_posts undefined counts as on', async () => {
    const s = await insertSeries({ status: 'created', announcements: true, discord_config: { weekly_schedule: false } });
    await transitionSeries(pg(), s.id, 'active');
    expect(await rows(s.id)).toEqual([]);
    const t = await insertSeries({ status: 'created', announcements: true, discord_config: { weekly_schedule: false } });
    await transitionSeries(pg(), t.id, 'registration');
    expect(await rows(t.id)).toHaveLength(1);
  });
});
