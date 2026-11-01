// @vitest-environment node
/** `/api/matches/:matchId/stats/**` on Postgres (ported from match-stats-routes.test.ts + aggregate / list routes). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { addParticipant, addPlayerStat, addSubmission, seedStatsMatch, type StatsFixture } from '../../utils/pg-stats-fixtures';
import { createMatch } from '../../utils/pg-fixtures';
import { matchPlayerStats, statsImageQueue } from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

setupPgTestFile();
const pg = () => getPgTestDb();

let fx: StatsFixture;
beforeEach(async () => { fx = await seedStatsMatch(); });
const url = (suffix = '') => `/api/matches/${fx.match.id}/stats${suffix}`;

async function approved(participantId: string, stats: Record<string, number>, review: 'approved' | 'pending' = 'approved', matchId = fx.match.id, gameId = fx.matchGameId) {
  const sub = await addSubmission(matchId, gameId, { review_status: review });
  return addPlayerStat(sub.id, matchId, gameId, { participant_id: participantId, stats_json: stats });
}

describe('GET /api/matches/:matchId/stats/per-map', () => {
  it('returns an empty array when no scorecard stats exist', async () => {
    const res = await appRequest(url('/per-map'));
    expect(res.status).toBe(200);
    expect(res.data).toEqual([]);
  });

  it('returns approved stats for the match with stats_json as an object', async () => {
    const p = await addParticipant(fx.match.id);
    await approved(p.id, { kills: 5 });
    const res = await appRequest(url('/per-map'));
    expect(res.status).toBe(200);
    expect(res.data).toEqual([{ match_game_id: fx.matchGameId, participant_id: p.id, stats_json: { kills: 5 } }]);
  });

  it('does not return stats for non-approved submissions', async () => {
    const p = await addParticipant(fx.match.id);
    await approved(p.id, { kills: 5 }, 'pending');
    expect((await appRequest(url('/per-map'))).data).toEqual([]);
  });

  it('does not return stats for a different match', async () => {
    const other = await seedStatsMatch();
    const p = await addParticipant(other.match.id);
    await approved(p.id, { kills: 5 }, 'approved', other.match.id, other.matchGameId);
    expect((await appRequest(url('/per-map'))).data).toEqual([]);
  });
});

describe('POST /api/matches/:matchId/stats/generate-images', () => {
  it('inserts a pending row into stats_image_queue and returns the queue id', async () => {
    const res = await appRequest(url('/generate-images'), { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.queueId).toBeTruthy();
    const [row] = await pg().select().from(statsImageQueue).where(eq(statsImageQueue.id, res.data.queueId));
    expect(row).toMatchObject({ match_id: fx.match.id, status: 'pending' });
  });

  it('creates a unique queue id for each call', async () => {
    const [a, b] = await Promise.all([appRequest(url('/generate-images'), { method: 'POST' }), appRequest(url('/generate-images'), { method: 'POST' })]);
    expect(a.data.queueId).not.toBe(b.data.queueId);
  });
});

describe('POST /api/matches/:matchId/stats (aggregate) and GET', () => {
  it('reports nothing to aggregate when no stats are approved', async () => {
    const res = await appRequest(url(), { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ message: 'No approved stats to aggregate' });
  });

  it('aggregates approved stats and lists the per-participant totals (jsonb object)', async () => {
    const p = await addParticipant(fx.match.id);
    await approved(p.id, { kills: 5, deaths: 1 });
    const res = await appRequest(url(), { method: 'POST' });
    expect(res.data).toEqual({ success: true, participantsAggregated: 1 });

    const list = await appRequest(url());
    expect(list.status).toBe(200);
    expect(list.data).toHaveLength(1);
    expect(list.data[0]).toMatchObject({ match_id: fx.match.id, participant_id: p.id, total_stats_json: { kills: 5, deaths: 1 }, maps_played: 1, stat_image_sent: false, stats_dm_sent: false });
  });

  it('returns an empty list for a match without aggregates, and only that match’s rows', async () => {
    expect((await appRequest(url())).data).toEqual([]);
    const other = await createMatch(fx.game.id, fx.mode.id);
    const p = await addParticipant(other.id);
    await pg().insert(matchPlayerStats).values({ id: 'mps', match_id: other.id, participant_id: p.id, total_stats_json: { kills: 1 }, maps_played: 1 });
    expect((await appRequest(url())).data).toEqual([]);
  });
});
