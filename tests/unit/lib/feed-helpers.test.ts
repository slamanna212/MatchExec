import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

import { logFeedEvent } from '../../../src/lib/feed-helpers';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData } from '../../utils/fixtures';

describe('logFeedEvent', () => {
  let db: any;

  beforeEach(async () => {
    await seedBasicTestData();
    db = getTestDb();
    vi.clearAllMocks();
  });

  it('inserts a feed event into activity_feed', async () => {
    await logFeedEvent({
      eventType: 'match_created',
      priority: 2,
      title: 'Test Match Created',
      description: 'A test match was created',
    });

    const row = await db.get(
      `SELECT * FROM activity_feed WHERE title = 'Test Match Created'`
    );

    expect(row).toBeDefined();
    expect(row.event_type).toBe('match_created');
    expect(row.priority).toBe(2);
    expect(row.title).toBe('Test Match Created');
    expect(row.description).toBe('A test match was created');
  });

  it('stores matchId when provided', async () => {
    await logFeedEvent({
      eventType: 'match_started',
      priority: 1,
      title: 'Match Started',
      matchId: 'match-abc',
    });

    const row = await db.get(
      `SELECT * FROM activity_feed WHERE match_id = 'match-abc'`
    );

    expect(row).toBeDefined();
    expect(row.match_id).toBe('match-abc');
  });

  it('stores tournamentId when provided', async () => {
    await logFeedEvent({
      eventType: 'tournament_created',
      priority: 2,
      title: 'Tournament Created',
      tournamentId: 'tourney-xyz',
    });

    const row = await db.get(
      `SELECT * FROM activity_feed WHERE tournament_id = 'tourney-xyz'`
    );

    expect(row).toBeDefined();
    expect(row.tournament_id).toBe('tourney-xyz');
  });

  it('serializes metadata to JSON', async () => {
    await logFeedEvent({
      eventType: 'match_completed',
      priority: 1,
      title: 'Match Completed',
      metadata: { winner: 'blue', score: '3-1' },
    });

    const row = await db.get(
      `SELECT * FROM activity_feed WHERE title = 'Match Completed'`
    );

    expect(row).toBeDefined();
    const meta = JSON.parse(row.metadata);
    expect(meta.winner).toBe('blue');
    expect(meta.score).toBe('3-1');
  });

  it('does not throw when called without optional fields', async () => {
    await expect(
      logFeedEvent({
        eventType: 'match_created',
        priority: 3,
        title: 'Minimal Event',
      })
    ).resolves.not.toThrow();
  });

  it('generates unique IDs for each event', async () => {
    await logFeedEvent({ eventType: 'match_created', priority: 2, title: 'Event A' });
    await logFeedEvent({ eventType: 'match_created', priority: 2, title: 'Event B' });

    const rows = await db.all(
      `SELECT id FROM activity_feed WHERE title IN ('Event A', 'Event B')`
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].id).not.toBe(rows[1].id);
  });

  it('stores update_available event with metadata', async () => {
    await logFeedEvent({
      eventType: 'update_available',
      priority: 2,
      title: 'MatchExec v9.9.9 is available',
      metadata: { currentVersion: 'v0.8.0', latestVersion: 'v9.9.9' },
    });

    const row = await db.get(
      `SELECT * FROM activity_feed WHERE event_type = 'update_available'`
    );

    expect(row).toBeDefined();
    expect(row.event_type).toBe('update_available');
    expect(row.priority).toBe(2);
    const meta = JSON.parse(row.metadata);
    expect(meta.latestVersion).toBe('v9.9.9');
    expect(meta.currentVersion).toBe('v0.8.0');
  });
});
