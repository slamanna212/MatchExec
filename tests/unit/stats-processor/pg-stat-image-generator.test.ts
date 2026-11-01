// @vitest-environment node
/** StatImageGenerator on Postgres: aggregation, rendering (canvas mocked) and storing the images as blobs. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { addMatchGame, addParticipant, addPlayerStat, addSubmission, seedStatsMatch, type StatsFixture } from '../../utils/pg-stats-fixtures';
import { blobs, gameStatDefinitions, matchPlayerStats, statsImageQueue } from '../../../lib/db/schema';
import { db } from '../../../lib/db';
import { claimJobs, enqueueStatsImage } from '../../../src/lib/discord-queues';
import { createMatchTeams } from '../../../src/lib/matches';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));
vi.mock('../../../src/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

// Mock @napi-rs/canvas so tests pass in CI without native bindings
const canvas = vi.hoisted(() => {
  const ctx = { fillStyle: '', font: '', textAlign: '', fillRect: vi.fn(), fillText: vi.fn() };
  return { ctx, createCanvas: vi.fn() };
});
vi.mock('@napi-rs/canvas', () => ({ createCanvas: canvas.createCanvas }));

import { StatImageGenerator } from '../../../processes/stats-processor/modules/stat-image-generator';

setupPgTestFile();
const pg = () => getPgTestDb();

const STAT_DEFS = [
  { id: 'kills', name: 'kills', display_name: 'Kills', is_primary: true, format: 'number', sort_order: 1 },
  { id: 'deaths', name: 'deaths', display_name: 'Deaths', is_primary: false, format: 'number', sort_order: 2 },
  { id: 'damage', name: 'damage', display_name: 'Damage', is_primary: true, format: 'thousands', sort_order: 3 },
  { id: 'kda', name: 'kda', display_name: 'KDA', is_primary: true, format: 'decimal', sort_order: 4 },
];

let fx: StatsFixture;
beforeEach(async () => {
  vi.clearAllMocks();
  canvas.createCanvas.mockImplementation(() => ({
    getContext: vi.fn().mockReturnValue(canvas.ctx),
    toBuffer: vi.fn().mockReturnValue(Buffer.from('fake-image')),
  }));
  fx = await seedStatsMatch();
  await pg().insert(gameStatDefinitions).values(STAT_DEFS.map((d) => ({ ...d, game_id: fx.game.id })));
});

async function queued(matchId = fx.match.id) {
  const id = await enqueueStatsImage(db, matchId);
  await claimJobs(db, 'statsImage', { limit: 1, workerId: 'test' });
  return id;
}
const job = async (id: string) => (await pg().select().from(statsImageQueue).where(eq(statsImageQueue.id, id)))[0];

/** An approved scorecard row for a participant (what the aggregation reads). */
async function approvedStat(participantId: string | null, stats: Record<string, number>, gameId = fx.matchGameId, matchId = fx.match.id) {
  const sub = await addSubmission(matchId, gameId, { review_status: 'approved' });
  return addPlayerStat(sub.id, matchId, gameId, { participant_id: participantId, stats_json: stats });
}

describe('generateMatchStatImages', () => {
  it('leaves the queue row alone until the end and completes it when there are no stats', async () => {
    const id = await queued();
    expect((await job(id)).status).toBe('processing'); // claimed by the processor, not touched by the generator at the start

    await new StatImageGenerator().generateMatchStatImages(id, fx.match.id);

    expect((await job(id)).status).toBe('completed');
    expect(await pg().select().from(blobs)).toHaveLength(0);
    expect(canvas.createCanvas).not.toHaveBeenCalled();
  });

  it('renders a team image and one image per player, stores them as blobs and records each player image URL', async () => {
    await createMatchTeams(db, fx.match.id);
    const a = await addParticipant(fx.match.id, { username: 'PlayerBlue' });
    const b = await addParticipant(fx.match.id, { username: 'PlayerRed' });
    await approvedStat(a.id, { kills: 12, deaths: 3, damage: 15000, kda: 4.5 });
    await approvedStat(b.id, { kills: 8, deaths: 6, damage: 9000, kda: 1.8 });
    const id = await queued();

    await new StatImageGenerator().generateMatchStatImages(id, fx.match.id);

    expect((await job(id)).status).toBe('completed');
    const stored = await pg().select().from(blobs);
    expect(stored.map((s) => s.path).sort()).toEqual([
      `/uploads/stats/${fx.match.id}/${a.id}.png`, `/uploads/stats/${fx.match.id}/${b.id}.png`, `/uploads/stats/${fx.match.id}/team.png`,
    ].sort());
    expect(stored.every((s) => s.kind === 'stat-image' && s.content_type === 'image/png' && s.owner_type === 'match' && s.owner_id === fx.match.id)).toBe(true);
    expect(Buffer.from(stored[0].data).toString()).toBe('fake-image');

    const rows = await pg().select().from(matchPlayerStats);
    expect(rows.find((r) => r.participant_id === a.id)?.stat_image_url).toBe(`/uploads/stats/${fx.match.id}/${a.id}.png`);
    expect(rows.find((r) => r.participant_id === b.id)?.stat_image_url).toBe(`/uploads/stats/${fx.match.id}/${b.id}.png`);
    expect(canvas.ctx.fillText).toHaveBeenCalledWith('PlayerBlue', expect.anything(), expect.anything());
    expect(canvas.ctx.fillText).toHaveBeenCalledWith('PlayerRed', expect.anything(), expect.anything());
  });

  it('regenerating replaces the stored images instead of adding new ones', async () => {
    const p = await addParticipant(fx.match.id);
    await approvedStat(p.id, { kills: 1 });
    const gen = new StatImageGenerator();
    await gen.generateMatchStatImages(await queued(), fx.match.id);
    const first = await pg().select().from(blobs);
    await gen.generateMatchStatImages(await queued(), fx.match.id);
    const second = await pg().select().from(blobs);
    expect(second).toHaveLength(first.length);
    expect(second.map((s) => s.id).sort()).toEqual(first.map((s) => s.id).sort());
  });

  it('aggregates approved scorecards first: sums stats and counts distinct maps', async () => {
    const map2 = await addMatchGame(fx.match.id, 2);
    const p = await addParticipant(fx.match.id);
    await approvedStat(p.id, { kills: 5, deaths: 2 });
    await approvedStat(p.id, { kills: 2 }); // same map again (a second screenshot)
    await approvedStat(p.id, { kills: 7, deaths: 1 }, map2);
    const id = await queued();

    await new StatImageGenerator().generateMatchStatImages(id, fx.match.id);

    const [row] = await pg().select().from(matchPlayerStats);
    expect(row.total_stats_json).toEqual({ kills: 14, deaths: 3 });
    expect(row.maps_played).toBe(2);
  });

  it('skips scorecard rows without an assigned participant', async () => {
    await approvedStat(null, { kills: 5 });
    const id = await queued();
    await new StatImageGenerator().generateMatchStatImages(id, fx.match.id);
    expect(await pg().select().from(matchPlayerStats)).toHaveLength(0);
    expect((await job(id)).status).toBe('completed');
  });

  it('renders when there are no stat definitions, a very long username or empty stats', async () => {
    await pg().delete(gameStatDefinitions);
    const p = await addParticipant(fx.match.id, { username: 'A'.repeat(64) });
    await approvedStat(p.id, {});
    const id = await queued();
    await expect(new StatImageGenerator().generateMatchStatImages(id, fx.match.id)).resolves.not.toThrow();
    expect((await job(id)).status).toBe('completed');
    expect(await pg().select().from(blobs)).toHaveLength(2);
  });

  it('completes with ten players', async () => {
    for (let i = 0; i < 10; i++) {
      const p = await addParticipant(fx.match.id, { username: `Player${i}` });
      await approvedStat(p.id, { kills: i * 2, deaths: i });
    }
    const id = await queued();
    await new StatImageGenerator().generateMatchStatImages(id, fx.match.id);
    expect((await job(id)).status).toBe('completed');
    expect(await pg().select().from(blobs)).toHaveLength(11);
  });

  it('colours Normal matches by team and shows no team column for Position modes', async () => {
    const p = await addParticipant(fx.match.id, { username: 'Solo' });
    await approvedStat(p.id, { kills: 1 });
    await new StatImageGenerator().generateMatchStatImages(await queued(), fx.match.id);
    expect(canvas.ctx.fillText).toHaveBeenCalledWith('Team', expect.anything(), expect.anything());

    canvas.ctx.fillText.mockClear();
    const { gameModes } = await import('../../../lib/db/schema');
    await pg().update(gameModes).set({ scoring_type: 'Position' });
    await new StatImageGenerator().generateMatchStatImages(await queued(), fx.match.id);
    expect(canvas.ctx.fillText).not.toHaveBeenCalledWith('Team', expect.anything(), expect.anything());
  });

  it('still completes the job (without images) when the canvas is not available', async () => {
    const p = await addParticipant(fx.match.id);
    await approvedStat(p.id, { kills: 1 });
    canvas.createCanvas.mockImplementation(() => { throw new Error('no canvas'); });
    const id = await queued();
    await new StatImageGenerator().generateMatchStatImages(id, fx.match.id);
    expect((await job(id)).status).toBe('completed');
    expect(await pg().select().from(blobs)).toHaveLength(0);
    expect((await pg().select().from(matchPlayerStats))[0].stat_image_url).toBeNull();
  });

  it('fails the queue entry (retry with backoff) and records the error when a DB error occurs', async () => {
    const id = await queued();
    const gen = new StatImageGenerator();
    // a Drizzle failure inside the flow: break the executor's first query
    (gen as any).ex = new Proxy(db, { get: (t, prop) => (prop === 'transaction' ? () => Promise.reject(new Error('specific error message')) : (t as any)[prop]) });
    await gen.generateMatchStatImages(id, fx.match.id);
    const row = await job(id);
    expect(row.status).toBe('pending'); // attempts remain
    expect(row.last_error).toBe('specific error message');
  });
});
