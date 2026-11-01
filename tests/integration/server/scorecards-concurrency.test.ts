// @vitest-environment node
/**
 * Race review for the scorecard flows (plan 1.3): assignment, review and retry take the match row lock / compare-and-set,
 * so simultaneous requests cannot lose each other's changes. With `pnpm test:pg` (real Postgres) the requests really
 * interleave; on PGlite they are serialised, which still checks the end state.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { addMatchGame, addParticipant, addPlayerStat, addSubmission, seedStatsMatch, type StatsFixture } from '../../utils/pg-stats-fixtures';
import { activityFeed, discordStatsReportQueue, matchPlayerStats, matches, statsProcessingQueue } from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

setupPgTestFile();
const pg = () => getPgTestDb();

let fx: StatsFixture;
beforeEach(async () => { fx = await seedStatsMatch(); });
const base = () => `/api/matches/${fx.match.id}/scorecard`;
const put = (path: string, json: unknown) => appRequest(path, { method: 'PUT', json });

describe('concurrent scorecard assignment', () => {
  it('clears the player-matching feed event when the last two unassigned rows (in different submissions) are assigned at once', async () => {
    const p1 = await addParticipant(fx.match.id);
    const p2 = await addParticipant(fx.match.id);
    const map2 = await addMatchGame(fx.match.id, 2);
    const subA = await addSubmission(fx.match.id, fx.matchGameId);
    const subB = await addSubmission(fx.match.id, map2);
    const a = await addPlayerStat(subA.id, fx.match.id, fx.matchGameId);
    const b = await addPlayerStat(subB.id, fx.match.id, map2);
    await pg().insert(activityFeed).values({ id: 'ev', event_type: 'scorecard_player_matching_required', priority: 2, title: 't', match_id: fx.match.id });

    const results = await Promise.all([
      put(`${base()}/${subA.id}/assign`, { assignments: [{ playerStatId: a.id, participantId: p1.id }] }),
      put(`${base()}/${subB.id}/assign`, { assignments: [{ playerStatId: b.id, participantId: p2.id }] }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    // Each request counts unassigned rows under the match lock, so the second one sees the first one's commit
    expect(await pg().select().from(activityFeed)).toHaveLength(0);
  });
});

describe('concurrent reviews', () => {
  it('approving two maps of one participant at the same time aggregates both', async () => {
    const p = await addParticipant(fx.match.id);
    const map2 = await addMatchGame(fx.match.id, 2);
    const subA = await addSubmission(fx.match.id, fx.matchGameId);
    const subB = await addSubmission(fx.match.id, map2);
    await addPlayerStat(subA.id, fx.match.id, fx.matchGameId, { participant_id: p.id, stats_json: { kills: 3 } });
    await addPlayerStat(subB.id, fx.match.id, map2, { participant_id: p.id, stats_json: { kills: 4 } });

    const results = await Promise.all([
      put(`${base()}/${subA.id}/review`, { status: 'approved' }),
      put(`${base()}/${subB.id}/review`, { status: 'approved' }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const [row] = await pg().select().from(matchPlayerStats);
    expect(row.total_stats_json).toEqual({ kills: 7 });
    expect(row.maps_played).toBe(2);
  });

  it('queues exactly one stats report when the last two submissions of a complete match are finalized together', async () => {
    await pg().update(matches).set({ status: 'complete' });
    const map2 = await addMatchGame(fx.match.id, 2);
    const subA = await addSubmission(fx.match.id, fx.matchGameId);
    const subB = await addSubmission(fx.match.id, map2);
    await Promise.all([
      put(`${base()}/${subA.id}/review`, { status: 'approved' }),
      put(`${base()}/${subB.id}/review`, { status: 'rejected' }),
    ]);
    expect(await pg().select().from(discordStatsReportQueue)).toHaveLength(1);
  });
});

describe('concurrent retry', () => {
  it('a double click re-queues the failed submission once (the loser gets 400)', async () => {
    const sub = await addSubmission(fx.match.id, fx.matchGameId, { ai_extraction_status: 'failed' });
    const results = await Promise.all([
      appRequest(`${base()}/${sub.id}/retry`, { method: 'POST' }),
      appRequest(`${base()}/${sub.id}/retry`, { method: 'POST' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(await pg().select().from(statsProcessingQueue)).toHaveLength(1);
  });
});
