// @vitest-environment node
/** Scheduler feed retention (ported from index-extended.test.ts) plus the orphaned-upload sweep, on Postgres. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createGame, createGameMode, createMatch } from '../../utils/pg-fixtures';
import { activityFeed, appSettings, blobs } from '../../../lib/db/schema';
import { db } from '../../../lib/db';
import { putBlob } from '../../../lib/storage';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));
vi.mock('../../../src/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));
vi.mock('node-cron', () => ({ schedule: vi.fn(() => ({ stop: vi.fn() })), validate: vi.fn().mockReturnValue(true) }));
vi.mock('../../../processes/scheduler/jobs/update-avatars', () => ({ AvatarUpdateJob: vi.fn() }));
vi.mock('../../../processes/scheduler/jobs/check-for-update', () => ({ UpdateCheckJob: vi.fn() }));

import { MatchExecScheduler } from '../../../processes/scheduler/index';

setupPgTestFile();
const pg = () => getPgTestDb();
const ago = (ms: number) => new Date(Date.now() - ms);
const DAY = 24 * 60 * 60 * 1000;
const event = (id: string, type: string, createdAt: Date) =>
  pg().insert(activityFeed).values({ id, event_type: type, priority: 1, title: id, metadata: {}, created_at: createdAt });
const ids = async () => (await pg().select().from(activityFeed)).map((r) => r.id).sort();
const setRetention = (v: string | null) =>
  v === null ? pg().delete(appSettings) : pg().insert(appSettings).values({ setting_key: 'feed_retention_days', setting_value: v, data_type: 'number' });

let scheduler: any;
beforeEach(() => { scheduler = new MatchExecScheduler(); });

describe('cleanupFeedEvents', () => {
  it('removes feed events older than the configured retention period', async () => {
    await setRetention('7');
    await event('old-event', 'test_event', ago(8 * DAY));
    await event('new-event', 'test_event', new Date());
    await scheduler.cleanupFeedEvents();
    expect(await ids()).toEqual(['new-event']);
  });

  it('does not remove events when the retention period is 0 or invalid', async () => {
    await setRetention('0');
    await event('retain-event', 'test_event', ago(400 * DAY));
    await scheduler.cleanupFeedEvents();
    expect(await ids()).toEqual(['retain-event']);
    await pg().delete(appSettings);
    await setRetention('abc');
    await scheduler.cleanupFeedEvents();
    expect(await ids()).toEqual(['retain-event']);
  });

  it('defaults to 180-day retention when the setting is absent', async () => {
    await setRetention(null);
    await event('within-180-event', 'test_event', ago(100 * DAY));
    await event('past-180-event', 'test_event', ago(200 * DAY));
    await scheduler.cleanupFeedEvents();
    expect(await ids()).toEqual(['within-180-event']);
  });
});

describe('cleanupStaleScoringNotifications', () => {
  it('removes match_scoring_required events older than 24 hours', async () => {
    await event('stale-scoring', 'match_scoring_required', ago(2 * DAY));
    await scheduler.cleanupStaleScoringNotifications();
    expect(await ids()).toEqual([]);
  });

  it('removes scorecard_player_matching_required events older than 24 hours', async () => {
    await event('stale-matching', 'scorecard_player_matching_required', ago(2 * DAY));
    await scheduler.cleanupStaleScoringNotifications();
    expect(await ids()).toEqual([]);
  });

  it('keeps scoring events newer than 24 hours and other event types of any age', async () => {
    await event('fresh-scoring', 'match_scoring_required', ago(60 * 60 * 1000));
    await event('old-other', 'match_created', ago(5 * DAY));
    await scheduler.cleanupStaleScoringNotifications();
    expect(await ids()).toEqual(['fresh-scoring', 'old-other']);
  });
});

describe('cleanupOrphanedUploads', () => {
  it('deletes files of deleted matches during the daily feed cleanup and keeps the rest', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id);
    await createMatch(game.id, mode.id, { id: 'live' });
    const data = Buffer.from([1, 2, 3]);
    await putBlob(db, { path: '/uploads/scorecards/live/a.png', kind: 'scorecard', contentType: 'image/png', data, owner: { type: 'match', id: 'live' } });
    await putBlob(db, { path: '/uploads/scorecards/gone/a.png', kind: 'scorecard', contentType: 'image/png', data, owner: { type: 'match', id: 'gone' } });
    await putBlob(db, { path: '/uploads/events/free.png', kind: 'event-image', contentType: 'image/png', data });
    await scheduler.runFeedCleanup();
    expect((await pg().select().from(blobs)).map((b) => b.path).sort()).toEqual(['/uploads/events/free.png', '/uploads/scorecards/live/a.png']);
  });
});
