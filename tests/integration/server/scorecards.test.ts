// @vitest-environment node
/**
 * `/api/matches/:matchId/scorecard/**` on Postgres (ported from the old scorecard-routes / scorecard-submission-routes
 * suites): upload, list, get, delete, review, assign and retry.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createMatchTeams } from '@/lib/matches';
import { db } from '../../../lib/db';
import { appRequest } from '../../utils/app-request';
import { PNG_BYTES, addMatchGame, addParticipant, addPlayerStat, addSubmission, seedStatsMatch, type StatsFixture } from '../../utils/pg-stats-fixtures';
import {
  activityFeed, blobs, matches, discordScoreNotificationQueue, discordStatsReportQueue, matchGames, matchPlayerStats, scorecardPlayerStats,
  scorecardSubmissions, statsProcessingQueue,
} from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

setupPgTestFile();
const pg = () => getPgTestDb();

let fx: StatsFixture;
beforeEach(async () => {
  fx = await seedStatsMatch();
});

function upload(matchId: string, fields: { screenshot?: { bytes: Uint8Array; type: string; name: string }; matchGameId?: string; teamSide?: string }) {
  const form = new FormData();
  if (fields.screenshot) form.append('screenshot', new Blob([fields.screenshot.bytes as BlobPart], { type: fields.screenshot.type }), fields.screenshot.name);
  if (fields.matchGameId !== undefined) form.append('matchGameId', fields.matchGameId);
  if (fields.teamSide !== undefined) form.append('teamSide', fields.teamSide);
  return appRequest(`/api/matches/${matchId}/scorecard`, { method: 'POST', body: form });
}
const png = { bytes: PNG_BYTES, type: 'image/png', name: 'test.png' };
const sc = (suffix = '') => `/api/matches/${fx.match.id}/scorecard${suffix}`;
const put = (path: string, json: unknown) => appRequest(path, { method: 'PUT', json });

describe('POST /api/matches/:matchId/scorecard', () => {
  it('returns 400 when no screenshot is provided', async () => {
    const res = await upload(fx.match.id, { matchGameId: fx.matchGameId, teamSide: 'blue' });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/screenshot/i);
  });

  it('returns 400 when matchGameId is missing', async () => {
    const res = await upload(fx.match.id, { screenshot: png, teamSide: 'blue' });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/matchGameId/i);
  });

  it('returns 400 when teamSide is invalid', async () => {
    const res = await upload(fx.match.id, { screenshot: png, matchGameId: fx.matchGameId, teamSide: 'purple' });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/teamSide/i);
  });

  it('returns 400 when the file type is not an image', async () => {
    const res = await upload(fx.match.id, { screenshot: { bytes: new TextEncoder().encode('not an image'), type: 'text/plain', name: 'test.txt' }, matchGameId: fx.matchGameId, teamSide: 'blue' });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/invalid file type/i);
  });

  it('returns 400 when the content does not match an image format', async () => {
    const res = await upload(fx.match.id, { screenshot: { bytes: new TextEncoder().encode('definitely not a png'), type: 'image/png', name: 'x.png' }, matchGameId: fx.matchGameId, teamSide: 'blue' });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/does not match/i);
  });

  it('returns 400 above 10 MB', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(PNG_BYTES.subarray(0, 8));
    const res = await upload(fx.match.id, { screenshot: { bytes: big, type: 'image/png', name: 'big.png' }, matchGameId: fx.matchGameId, teamSide: 'blue' });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/too large/i);
  });

  it('returns 404 when the map does not belong to the match', async () => {
    const res = await upload(fx.match.id, { screenshot: png, matchGameId: 'nope', teamSide: 'blue' });
    expect(res.status).toBe(404);
    expect(await pg().select().from(blobs)).toHaveLength(0);
  });

  it('accepts a string-format matchId (regression: was rejected as invalid) and stores blob + submission + extraction job together', async () => {
    // Match IDs look like "match_<hex>", not numbers
    expect(fx.match.id).toMatch(/^match_/);
    const res = await upload(fx.match.id, { screenshot: png, matchGameId: fx.matchGameId, teamSide: 'blue' });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.screenshotUrl).toMatch(new RegExp(`^/uploads/scorecards/${fx.match.id}/\\d+_[0-9a-f]{32}\\.png$`));

    const [sub] = await pg().select().from(scorecardSubmissions);
    expect(sub).toMatchObject({ id: res.data.submissionId, match_id: fx.match.id, match_game_id: fx.matchGameId, team_side: 'blue', screenshot_url: res.data.screenshotUrl });
    const [blob] = await pg().select().from(blobs);
    expect(blob).toMatchObject({ path: res.data.screenshotUrl, kind: 'scorecard', owner_type: 'match', owner_id: fx.match.id, content_type: 'image/png', size: PNG_BYTES.length });
    const [job] = await pg().select().from(statsProcessingQueue);
    expect(job).toMatchObject({ submission_id: res.data.submissionId, match_id: fx.match.id, match_game_id: fx.matchGameId, status: 'pending' });

    // ...and the screenshot is served from /uploads
    const file = await appRequest(res.data.screenshotUrl);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/png');
  });
});

describe('GET /api/matches/:matchId/scorecard', () => {
  it('returns an empty array when there are no submissions (also for another match)', async () => {
    const res = await appRequest(sc());
    expect(res.status).toBe(200);
    expect(res.data).toEqual([]);
  });

  it('returns submissions with playerStats (jsonb objects) for this match only', async () => {
    const sub = await addSubmission(fx.match.id, fx.matchGameId);
    await addPlayerStat(sub.id, fx.match.id, fx.matchGameId, { extracted_player_name: 'Alice', stats_json: { kills: 3 } });
    const other = await seedStatsMatch();
    await addSubmission(other.match.id, other.matchGameId);

    const res = await appRequest(sc());
    expect(res.status).toBe(200);
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe(sub.id);
    expect(res.data[0].playerStats).toHaveLength(1);
    expect(res.data[0].playerStats[0].stats_json).toEqual({ kills: 3 });
    expect(typeof res.data[0].created_at).toBe('string');
  });

  it('filters by matchGameId', async () => {
    const map2 = await addMatchGame(fx.match.id, 2);
    await addSubmission(fx.match.id, fx.matchGameId, { id: 'sub-a' });
    await addSubmission(fx.match.id, map2, { id: 'sub-b' });
    const res = await appRequest(sc(`?matchGameId=${fx.matchGameId}`));
    expect(res.data.map((s: any) => s.id)).toEqual(['sub-a']);
  });
});

describe('GET /api/matches/:matchId/scorecard/:submissionId', () => {
  it('returns the submission with player stats', async () => {
    const sub = await addSubmission(fx.match.id, fx.matchGameId);
    const res = await appRequest(sc(`/${sub.id}`));
    expect(res.status).toBe(200);
    expect(res.data.id).toBe(sub.id);
    expect(Array.isArray(res.data.playerStats)).toBe(true);
  });

  it('returns 404 for an unknown submission and for one that belongs to another match', async () => {
    const sub = await addSubmission(fx.match.id, fx.matchGameId);
    expect((await appRequest(sc('/nonexistent'))).status).toBe(404);
    const other = await seedStatsMatch();
    expect((await appRequest(`/api/matches/${other.match.id}/scorecard/${sub.id}`)).status).toBe(404);
  });
});

describe('DELETE /api/matches/:matchId/scorecard/:submissionId', () => {
  it('deletes the submission, its player rows and its screenshot blob', async () => {
    const up = await upload(fx.match.id, { screenshot: png, matchGameId: fx.matchGameId, teamSide: 'blue' });
    await addPlayerStat(up.data.submissionId, fx.match.id, fx.matchGameId);
    const res = await appRequest(sc(`/${up.data.submissionId}`), { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(await pg().select().from(scorecardSubmissions)).toHaveLength(0);
    expect(await pg().select().from(scorecardPlayerStats)).toHaveLength(0);
    expect(await pg().select().from(blobs)).toHaveLength(0);
  });

  it('returns 404 for an unknown submission', async () => {
    expect((await appRequest(sc('/ghost'), { method: 'DELETE' })).status).toBe(404);
  });
});

describe('PUT /api/matches/:matchId/scorecard/:submissionId/review', () => {
  it('returns 400 for an invalid or missing status', async () => {
    const sub = await addSubmission(fx.match.id, fx.matchGameId);
    const bad = await put(sc(`/${sub.id}/review`), { status: 'unknown' });
    expect(bad.status).toBe(400);
    expect(bad.data.error).toMatch(/approved|rejected/i);
    expect((await put(sc(`/${sub.id}/review`), {})).status).toBe(400);
  });

  it('returns 404 for an unknown submission', async () => {
    expect((await put(sc('/ghost/review'), { status: 'approved' })).status).toBe(404);
  });

  it('approves a submission, stamps reviewed_at and aggregates the match stats', async () => {
    const p = await addParticipant(fx.match.id);
    const sub = await addSubmission(fx.match.id, fx.matchGameId);
    await addPlayerStat(sub.id, fx.match.id, fx.matchGameId, { participant_id: p.id, stats_json: { kills: 4 } });
    const res = await put(sc(`/${sub.id}/review`), { status: 'approved' });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const [row] = await pg().select().from(scorecardSubmissions);
    expect(row.review_status).toBe('approved');
    expect(row.reviewed_at).toBeInstanceOf(Date);
    const [stats] = await pg().select().from(matchPlayerStats);
    expect(stats).toMatchObject({ participant_id: p.id, total_stats_json: { kills: 4 }, maps_played: 1 });
  });

  it('rejects a submission without aggregating', async () => {
    const p = await addParticipant(fx.match.id);
    const sub = await addSubmission(fx.match.id, fx.matchGameId);
    await addPlayerStat(sub.id, fx.match.id, fx.matchGameId, { participant_id: p.id, stats_json: { kills: 4 } });
    const res = await put(sc(`/${sub.id}/review`), { status: 'rejected' });
    expect(res.status).toBe(200);
    expect((await pg().select().from(scorecardSubmissions))[0].review_status).toBe('rejected');
    expect(await pg().select().from(matchPlayerStats)).toHaveLength(0);
  });

  it('queues the stats report DMs only when the match is complete and nothing is left to review', async () => {
    const a = await addSubmission(fx.match.id, fx.matchGameId);
    const b = await addSubmission(fx.match.id, fx.matchGameId);
    // not complete yet: nothing queued
    await put(sc(`/${a.id}/review`), { status: 'approved' });
    expect(await pg().select().from(discordStatsReportQueue)).toHaveLength(0);

    await pg().update(matches).set({ status: 'complete' });
    await put(sc(`/${a.id}/review`), { status: 'approved' });
    expect(await pg().select().from(discordStatsReportQueue)).toHaveLength(0); // b still pending
    await put(sc(`/${b.id}/review`), { status: 'rejected' });
    const queued = await pg().select().from(discordStatsReportQueue);
    expect(queued).toHaveLength(1);
    expect(queued[0].match_id).toBe(fx.match.id);

    // reviewing again does not enqueue a second report
    await put(sc(`/${b.id}/review`), { status: 'rejected' });
    expect(await pg().select().from(discordStatsReportQueue)).toHaveLength(1);
  });
});

describe('PUT /api/matches/:matchId/scorecard/:submissionId/assign', () => {
  it('returns 400 when assignments is missing or empty', async () => {
    const sub = await addSubmission(fx.match.id, fx.matchGameId);
    const missing = await put(sc(`/${sub.id}/assign`), {});
    expect(missing.status).toBe(400);
    expect(missing.data.error).toMatch(/assignments/i);
    expect((await put(sc(`/${sub.id}/assign`), { assignments: [] })).status).toBe(400);
  });

  it('returns 404 when the submission does not exist', async () => {
    expect((await put(sc('/nope/assign'), { assignments: [{ playerStatId: 'p1', participantId: 'user1' }] })).status).toBe(404);
  });

  it('assigns participants and marks the rows assigned', async () => {
    const p = await addParticipant(fx.match.id);
    const sub = await addSubmission(fx.match.id, fx.matchGameId);
    const stat = await addPlayerStat(sub.id, fx.match.id, fx.matchGameId);
    const res = await put(sc(`/${sub.id}/assign`), { assignments: [{ playerStatId: stat.id, participantId: p.id }] });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const [row] = await pg().select().from(scorecardPlayerStats);
    expect(row).toMatchObject({ participant_id: p.id, assignment_status: 'assigned' });
  });

  it('clears the "players need matching" feed event once nothing is unassigned in the match', async () => {
    const p = await addParticipant(fx.match.id);
    const subA = await addSubmission(fx.match.id, fx.matchGameId);
    const subB = await addSubmission(fx.match.id, fx.matchGameId);
    const a = await addPlayerStat(subA.id, fx.match.id, fx.matchGameId);
    const b = await addPlayerStat(subB.id, fx.match.id, fx.matchGameId);
    await pg().insert(activityFeed).values({ id: 'ev', event_type: 'scorecard_player_matching_required', priority: 2, title: 't', match_id: fx.match.id });

    await put(sc(`/${subA.id}/assign`), { assignments: [{ playerStatId: a.id, participantId: p.id }] });
    expect(await pg().select().from(activityFeed)).toHaveLength(1); // submission B still has an unassigned row
    await put(sc(`/${subB.id}/assign`), { assignments: [{ playerStatId: b.id, participantId: p.id }] });
    expect(await pg().select().from(activityFeed)).toHaveLength(0);
  });

  it('releases the held Discord score notification of a stats-enabled map (once)', async () => {
    const stats = await seedStatsMatch({ stats_enabled: true });
    await createMatchTeams(db, stats.match.id);
    const p = await addParticipant(stats.match.id);
    // Scoring the map holds its Discord notification until the scorecard players are matched
    const scored = await appRequest(`/api/matches/${stats.match.id}/games/${stats.matchGameId}/result`, {
      method: 'POST', json: { winner: 'team1', gameId: stats.matchGameId, matchId: stats.match.id },
    });
    expect(scored.status).toBe(200);
    expect(await pg().select().from(discordScoreNotificationQueue)).toHaveLength(0);
    expect((await pg().select().from(matchGames).where(eq(matchGames.id, stats.matchGameId)))[0].discord_notified).toBe(false);

    const sub = await addSubmission(stats.match.id, stats.matchGameId);
    const stat = await addPlayerStat(sub.id, stats.match.id, stats.matchGameId);
    const url = `/api/matches/${stats.match.id}/scorecard/${sub.id}/assign`;
    const body = { assignments: [{ playerStatId: stat.id, participantId: p.id }] };
    expect((await put(url, body)).status).toBe(200);
    expect(await pg().select().from(discordScoreNotificationQueue)).toHaveLength(1);
    expect((await pg().select().from(matchGames).where(eq(matchGames.id, stats.matchGameId)))[0].discord_notified).toBe(true);

    // assigning again does not queue a second notification
    expect((await put(url, body)).status).toBe(200);
    expect(await pg().select().from(discordScoreNotificationQueue)).toHaveLength(1);
  });
});

describe('POST /api/matches/:matchId/scorecard/:submissionId/retry', () => {
  it('returns 404 for an unknown submission', async () => {
    expect((await appRequest(sc('/nope/retry'), { method: 'POST' })).status).toBe(404);
  });

  it('returns 400 when the submission is not in the failed state', async () => {
    const sub = await addSubmission(fx.match.id, fx.matchGameId);
    const res = await appRequest(sc(`/${sub.id}/retry`), { method: 'POST' });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/failed/i);
  });

  it('resets a failed submission to pending and queues a new extraction job', async () => {
    const sub = await addSubmission(fx.match.id, fx.matchGameId, { ai_extraction_status: 'failed', ai_error_message: 'x' });
    const res = await appRequest(sc(`/${sub.id}/retry`), { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect((await pg().select().from(scorecardSubmissions))[0]).toMatchObject({ ai_extraction_status: 'pending', ai_error_message: null });
    const jobs = await pg().select().from(statsProcessingQueue);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ submission_id: sub.id, status: 'pending' });
  });

  it('re-queues the existing failed job instead of adding a second one', async () => {
    const sub = await addSubmission(fx.match.id, fx.matchGameId, { ai_extraction_status: 'failed' });
    await pg().insert(statsProcessingQueue).values({ id: 'job-1', submission_id: sub.id, match_id: fx.match.id, match_game_id: fx.matchGameId, status: 'failed', attempts: 4, last_error: 'boom' });
    await appRequest(sc(`/${sub.id}/retry`), { method: 'POST' });
    const jobs = await pg().select().from(statsProcessingQueue);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ id: 'job-1', status: 'pending' });
  });
});
