// @vitest-environment node
/** GET /api/tournaments/:id `progress_hint`: what the "next round" action would do, without doing it. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createTournament } from '../../utils/pg-fixtures';
import { bracketGame, completeMatch, generateBracket, insertTeams, progressBracket } from '../../utils/pg-tournament-fixtures';
import { matches, tournaments } from '../../../lib/db/schema';

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
  const g = await bracketGame({ maps: 3 });
  gameId = g.gameId;
  modeId = g.modeId;
});

const hint = async (id: string) => (await appRequest(`/api/tournaments/${id}`)).data.progress_hint;
const roundMatches = (id: string) => pg().select({ id: matches.id }).from(matches).where(eq(matches.tournament_id, id));

async function runningTournament(id: string, teams: number) {
  await createTournament(gameId, { id, game_mode_id: modeId, rounds_per_match: 1, status: 'assign' });
  const ids = await insertTeams(id, teams, 1);
  await generateBracket(id);
  await pg().update(tournaments).set({ status: 'battle' }).where(eq(tournaments.id, id));
  return ids;
}

describe('progress_hint', () => {
  it('is null until the tournament is running', async () => {
    await createTournament(gameId, { id: 't1', game_mode_id: modeId, status: 'gather' });
    expect(await hint('t1')).toBeNull();
  });

  it('single elimination: cannot advance while the round is unfinished', async () => {
    await runningTournament('t1', 4);
    expect(await hint('t1')).toEqual({ canAdvance: false, willComplete: false, reason: 'Round 1 is not complete yet' });
  });

  it('single elimination: can advance to the next round once the round is decided, and says so is not the end', async () => {
    const teams = await runningTournament('t1', 4);
    const rows = await roundMatches('t1');
    await completeMatch(rows[0].id, teams[0]);
    await completeMatch(rows[1].id, teams[2]);
    expect(await hint('t1')).toEqual({ canAdvance: true, willComplete: false, reason: null });
  });

  it('single elimination: the final round advances by finishing the tournament', async () => {
    const teams = await runningTournament('t1', 4);
    const round1 = await roundMatches('t1');
    await completeMatch(round1[0].id, teams[0]);
    await completeMatch(round1[1].id, teams[2]);
    expect((await progressBracket('t1')).status).toBe(200); // generates the final

    const [final] = (await roundMatches('t1')).filter((m) => !round1.some((r) => r.id === m.id));
    expect(await hint('t1')).toEqual({ canAdvance: false, willComplete: false, reason: 'Round 2 is not complete yet' });
    await completeMatch(final.id, teams[0]);
    expect(await hint('t1')).toEqual({ canAdvance: true, willComplete: true, reason: null });

    // The hint predicts exactly what progress then does.
    const done = await progressBracket('t1');
    expect(done.data.message).toBe('Tournament completed!');
    expect(await hint('t1')).toBeNull();
  });

  it('reading the hint never changes anything', async () => {
    const teams = await runningTournament('t1', 4);
    const rows = await roundMatches('t1');
    await completeMatch(rows[0].id, teams[0]);
    await completeMatch(rows[1].id, teams[2]);
    await hint('t1');
    await hint('t1');
    expect(await roundMatches('t1')).toHaveLength(2);
    expect((await pg().select().from(tournaments).where(eq(tournaments.id, 't1')))[0].status).toBe('battle');
  });

  it('a drawn round cannot advance and says why', async () => {
    await runningTournament('t1', 2);
    const [only] = await roundMatches('t1');
    await completeMatch(only.id, null);
    const h = await hint('t1');
    expect(h.canAdvance).toBe(false);
    expect(h.reason).toMatch(/ended in a draw/);
  });
});
