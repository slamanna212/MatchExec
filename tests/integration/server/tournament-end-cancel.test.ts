// @vitest-environment node
/** Ending / cancelling a tournament: its unfinished matches are cancelled, the lists move it to history, the feed hears about it. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createTournament } from '../../utils/pg-fixtures';
import { insertSeries } from '../../utils/pg-series-fixtures';
import { bracketGame, completeMatch, generateBracket, insertTeams, progressBracket, tournamentTransition } from '../../utils/pg-tournament-fixtures';
import { discordDeletionQueue, matches, tournaments } from '../../../lib/db/schema';
import { logFeedEvent } from '@/lib/feed-helpers';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/feed-helpers')>()), logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));
vi.mock('@/lib/matches/voice-channels', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/matches/voice-channels')>()),
  VoiceChannelService: { setupMatchVoiceChannels: vi.fn().mockResolvedValue(true), queueVoiceAnnouncement: vi.fn().mockResolvedValue(undefined) },
}));

setupPgTestFile();
const pg = () => getPgTestDb();

let gameId: string;
let modeId: string;
beforeEach(async () => {
  vi.mocked(logFeedEvent).mockClear();
  const g = await bracketGame({ maps: 3 });
  gameId = g.gameId;
  modeId = g.modeId;
});

const statusesOf = async (tournamentId: string) =>
  (await pg().select({ status: matches.status }).from(matches).where(eq(matches.tournament_id, tournamentId))).map((m) => m.status).sort();

/** A tournament with a generated 4-team bracket (2 matches), sitting in `assign`. */
async function bracketInAssign(id: string) {
  await createTournament(gameId, { id, game_mode_id: modeId, rounds_per_match: 1, status: 'assign' });
  const teams = await insertTeams(id, 4, 1);
  expect((await generateBracket(id)).status).toBe(200);
  return teams;
}

describe('cancelling a tournament', () => {
  it('cancels every unfinished match, so nothing is left live and the tournament can be deleted', async () => {
    await bracketInAssign('t1');
    expect(await statusesOf('t1')).toEqual(['assign', 'assign']);
    expect((await appRequest('/api/tournaments/t1')).status).toBe(200);
    expect((await appRequest('/api/tournaments/t1', { method: 'DELETE' })).status).toBe(400); // active matches block it

    expect((await tournamentTransition('t1', 'cancelled')).data.status).toBe('cancelled');
    expect(await statusesOf('t1')).toEqual(['cancelled', 'cancelled']);
    expect((await appRequest('/api/tournaments/t1', { method: 'DELETE' })).status).toBe(200);
  });

  it('queues the Discord clean-up of each cancelled match', async () => {
    await bracketInAssign('t1');
    const ids = (await pg().select({ id: matches.id }).from(matches).where(eq(matches.tournament_id, 't1'))).map((m) => m.id);
    await tournamentTransition('t1', 'cancelled');
    const queued = await pg().select().from(discordDeletionQueue);
    for (const id of ids) expect(queued.some((q) => q.match_id === id)).toBe(true);
  });

  it('leaves already finished matches as they were', async () => {
    const teams = await bracketInAssign('t1');
    await pg().update(tournaments).set({ status: 'battle' }).where(eq(tournaments.id, 't1'));
    const [first] = await pg().select({ id: matches.id }).from(matches).where(eq(matches.tournament_id, 't1')).orderBy(matches.id);
    await completeMatch(first.id, teams[0]);

    await tournamentTransition('t1', 'cancelled');
    expect(await statusesOf('t1')).toEqual(['cancelled', 'complete']);
  });
});

describe('ending a tournament by hand', () => {
  it('cancels the matches that were never played and logs the completion', async () => {
    await bracketInAssign('t1');
    await pg().update(tournaments).set({ status: 'battle' }).where(eq(tournaments.id, 't1'));

    expect((await tournamentTransition('t1', 'complete')).data.status).toBe('complete');
    expect(await statusesOf('t1')).toEqual(['cancelled', 'cancelled']);
    expect(vi.mocked(logFeedEvent).mock.calls.some(([e]) => e.eventType === 'tournament_completed')).toBe(true);
  });
});

describe('finishing a tournament through progress', () => {
  it('logs "Tournament Completed" in the activity feed, the same as ending it by hand', async () => {
    await createTournament(gameId, { id: 't1', game_mode_id: modeId, rounds_per_match: 1, status: 'assign' });
    const [a] = await insertTeams('t1', 2, 1);
    await generateBracket('t1');
    await pg().update(tournaments).set({ status: 'battle' }).where(eq(tournaments.id, 't1'));
    const [only] = await pg().select({ id: matches.id }).from(matches).where(eq(matches.tournament_id, 't1'));
    await completeMatch(only.id, a);
    vi.mocked(logFeedEvent).mockClear();

    expect((await progressBracket('t1')).data.message).toBe('Tournament completed!');
    const events = vi.mocked(logFeedEvent).mock.calls.map(([e]) => e);
    expect(events.filter((e) => e.eventType === 'tournament_completed')).toHaveLength(1);
    expect(events.find((e) => e.eventType === 'tournament_completed')).toMatchObject({ tournamentId: 't1', title: 'Tournament Completed' });
  });
});

describe('lists', () => {
  it('keep cancelled tournaments and matches out of the active lists and put them in history', async () => {
    await bracketInAssign('t-cancel');
    await tournamentTransition('t-cancel', 'cancelled');
    await createTournament(gameId, { id: 't-live', game_mode_id: modeId, status: 'gather' });

    const names = async (q: string) => (await appRequest<Array<{ id: string }>>(`/api/tournaments${q}`)).data.map((t) => t.id);
    expect(await names('')).toEqual(['t-live']);
    expect(await names('?status=finished')).toEqual(['t-cancel']);
    expect(await names('?status=cancelled')).toEqual(['t-cancel']);
    expect(await names('?status=complete')).toEqual([]);

    const active = (await appRequest<Array<{ id: string }>>('/api/matches')).data;
    expect(active).toHaveLength(0);
    const finished = (await appRequest<Array<{ id: string }>>('/api/matches?status=finished')).data;
    expect(finished).toHaveLength(2);
  });
});

describe('finished things cannot be edited', () => {
  it.each(['complete', 'cancelled'] as const)('refuses to edit a %s tournament', async (status) => {
    await createTournament(gameId, { id: 't1', game_mode_id: modeId, name: 'Original', status });
    const res = await appRequest('/api/tournaments/t1', { method: 'PUT', json: { name: 'Renamed' } });
    expect(res.status).toBe(403);
    expect((await pg().select().from(tournaments).where(eq(tournaments.id, 't1')))[0].name).toBe('Original');
  });

  it('still edits a tournament that has not finished', async () => {
    await createTournament(gameId, { id: 't1', game_mode_id: modeId, name: 'Original', status: 'gather' });
    expect((await appRequest('/api/tournaments/t1', { method: 'PUT', json: { name: 'Renamed' } })).status).toBe(200);
  });

  it.each(['complete', 'cancelled'] as const)('refuses to edit a %s series', async (status) => {
    const s = await insertSeries({ name: 'Original', status });
    const res = await appRequest(`/api/series/${s.id}`, { method: 'PATCH', json: { name: 'Renamed' } });
    expect(res.status).toBe(403);
  });

  it('still edits an active series', async () => {
    const s = await insertSeries({ name: 'Original', status: 'active' });
    expect((await appRequest(`/api/series/${s.id}`, { method: 'PATCH', json: { name: 'Renamed' } })).status).toBe(200);
  });
});
