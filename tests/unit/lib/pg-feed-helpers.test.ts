// @vitest-environment node
/** Activity feed domain (src/lib/feed-helpers.ts) on Postgres: logging, queries and retention. */
import { describe, it, expect, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createGame, createGameMode, createMatch, createTournament } from '../../utils/pg-fixtures';
import { activityFeed } from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

import {
  MATCH_ACTION_EVENTS, deleteFeedEvents, hasFeedEvent, listFeed, logFeedEvent, purgeFeedEventsOfType, purgeFeedEventsOlderThan, removeFeedEvents,
} from '@/lib/feed-helpers';
import { db } from '../../../lib/db';

setupPgTestFile();
const pg = () => getPgTestDb();
const rowByTitle = async (title: string) => (await pg().select().from(activityFeed).where(eq(activityFeed.title, title)))[0];

async function seedMatch(id = 'm1') {
  const game = await createGame();
  const mode = await createGameMode(game.id);
  return { game, mode, match: await createMatch(game.id, mode.id, { id }) };
}

describe('logFeedEvent', () => {
  it('inserts a feed event into activity_feed', async () => {
    await logFeedEvent({ eventType: 'match_created', priority: 2, title: 'Test Match Created', description: 'A test match was created' });
    const row = await rowByTitle('Test Match Created');
    expect(row).toMatchObject({ event_type: 'match_created', priority: 2, title: 'Test Match Created', description: 'A test match was created' });
    expect(row.created_at).toBeInstanceOf(Date);
  });

  it('stores matchId when provided', async () => {
    await seedMatch('match-abc');
    await logFeedEvent({ eventType: 'match_started', priority: 1, title: 'Match Started', matchId: 'match-abc' });
    expect((await rowByTitle('Match Started')).match_id).toBe('match-abc');
  });

  it('stores tournamentId when provided', async () => {
    const game = await createGame();
    await createTournament(game.id, { id: 'tourney-xyz' });
    await logFeedEvent({ eventType: 'tournament_created', priority: 2, title: 'Tournament Created', tournamentId: 'tourney-xyz' });
    expect((await rowByTitle('Tournament Created')).tournament_id).toBe('tourney-xyz');
  });

  it('stores metadata as JSON', async () => {
    await logFeedEvent({ eventType: 'match_completed', priority: 1, title: 'Match Completed', metadata: { winner: 'blue', score: '3-1' } });
    expect((await rowByTitle('Match Completed')).metadata).toEqual({ winner: 'blue', score: '3-1' });
  });

  it('does not throw when called without optional fields', async () => {
    await expect(logFeedEvent({ eventType: 'match_created', priority: 3, title: 'Minimal Event' })).resolves.not.toThrow();
  });

  it('generates unique IDs for each event', async () => {
    await logFeedEvent({ eventType: 'match_created', priority: 2, title: 'Event A' });
    await logFeedEvent({ eventType: 'match_created', priority: 2, title: 'Event B' });
    const rows = await pg().select().from(activityFeed);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).not.toBe(rows[1].id);
  });

  it('stores update_available event with metadata', async () => {
    await logFeedEvent({
      eventType: 'update_available', priority: 2, title: 'MatchExec v9.9.9 is available',
      metadata: { currentVersion: 'v0.8.0', latestVersion: 'v9.9.9' },
    });
    const row = (await pg().select().from(activityFeed).where(eq(activityFeed.event_type, 'update_available')))[0];
    expect(row.priority).toBe(2);
    expect(row.metadata).toMatchObject({ latestVersion: 'v9.9.9', currentVersion: 'v0.8.0' });
  });

  describe('NULL field handling', () => {
    it('stores NULL for description, match_id, tournament_id and metadata when omitted', async () => {
      await logFeedEvent({ eventType: 'match_created', priority: 1, title: 'No Desc' });
      const row = await rowByTitle('No Desc');
      expect(row.description).toBeNull();
      expect(row.match_id).toBeNull();
      expect(row.tournament_id).toBeNull();
      expect(row.metadata).toBeNull();
    });
  });

  describe('metadata JSON round-trips', () => {
    it('round-trips nested object metadata', async () => {
      await logFeedEvent({ eventType: 'match_completed', priority: 2, title: 'Nested Meta', metadata: { match: { id: 'abc', status: 'complete' }, scores: { blue: 3, red: 1 } } });
      const meta = (await rowByTitle('Nested Meta')).metadata as any;
      expect(meta.match.id).toBe('abc');
      expect(meta.scores.blue).toBe(3);
    });

    it('round-trips array values in metadata', async () => {
      await logFeedEvent({ eventType: 'match_created', priority: 1, title: 'Array Meta', metadata: { participants: ['user-1', 'user-2', 'user-3'], tags: [] } });
      const meta = (await rowByTitle('Array Meta')).metadata as any;
      expect(meta.participants).toHaveLength(3);
      expect(meta.participants[1]).toBe('user-2');
      expect(meta.tags).toHaveLength(0);
    });

    it('round-trips metadata with special string characters', async () => {
      await logFeedEvent({ eventType: 'match_created', priority: 1, title: 'Special Chars Meta', metadata: { message: 'Hello "world" & <test>' } });
      expect(((await rowByTitle('Special Chars Meta')).metadata as any).message).toBe('Hello "world" & <test>');
    });

    it('round-trips metadata with numeric and boolean values', async () => {
      await logFeedEvent({ eventType: 'match_completed', priority: 1, title: 'Mixed Types Meta', metadata: { count: 42, ratio: 0.75, active: true, disabled: false } });
      expect((await rowByTitle('Mixed Types Meta')).metadata).toEqual({ count: 42, ratio: 0.75, active: true, disabled: false });
    });
  });

  describe('event associations', () => {
    it('stores both matchId and tournamentId when both provided', async () => {
      const { game } = await seedMatch('match-dual');
      await createTournament(game.id, { id: 'tourney-dual' });
      await logFeedEvent({ eventType: 'tournament_phase_changed', priority: 2, title: 'Both IDs', matchId: 'match-dual', tournamentId: 'tourney-dual' });
      const row = await rowByTitle('Both IDs');
      expect(row.match_id).toBe('match-dual');
      expect(row.tournament_id).toBe('tourney-dual');
    });

    it('multiple events for same match all stored and retrievable', async () => {
      await seedMatch('multi-event-match');
      const matchId = 'multi-event-match';
      await logFeedEvent({ eventType: 'match_created', priority: 1, title: 'Created', matchId });
      await logFeedEvent({ eventType: 'match_phase_changed', priority: 1, title: 'Phase Change', matchId });
      await logFeedEvent({ eventType: 'match_completed', priority: 2, title: 'Completed', matchId });
      const { events, total } = await listFeed(db, { limit: 10, offset: 0, matchId });
      expect(total).toBe(3);
      expect(events.map((e) => e.event_type).sort()).toEqual(['match_completed', 'match_created', 'match_phase_changed']);
    });
  });

  describe('priority storage', () => {
    it('stores priority 1 (minimum) and 4 (maximum)', async () => {
      await logFeedEvent({ eventType: 'match_created', priority: 1, title: 'Priority One' });
      await logFeedEvent({ eventType: 'match_cancelled', priority: 4, title: 'Priority Four' });
      expect((await rowByTitle('Priority One')).priority).toBe(1);
      expect((await rowByTitle('Priority Four')).priority).toBe(4);
    });
  });

  describe('non-throwing behavior', () => {
    it('never throws, even when the insert fails (unknown match id violates the FK)', async () => {
      await expect(logFeedEvent({ eventType: 'match_created', priority: 1, title: 'Safe Call' })).resolves.toBeUndefined();
      await expect(logFeedEvent({ eventType: 'match_created', priority: 1, title: 'Bad FK', matchId: 'no-such-match' })).resolves.toBeUndefined();
      expect(await rowByTitle('Bad FK')).toBeUndefined();
    });

    it('all event types log without throwing', async () => {
      const eventTypes: Parameters<typeof logFeedEvent>[0]['eventType'][] = [
        'match_created', 'match_phase_changed', 'match_completed', 'match_cancelled', 'tournament_created',
        'tournament_phase_changed', 'tournament_started', 'tournament_completed', 'tournament_cancelled', 'update_available',
      ];
      for (const eventType of eventTypes) {
        await expect(logFeedEvent({ eventType, priority: 1, title: `Event ${eventType}` })).resolves.toBeUndefined();
      }
      expect(await pg().select().from(activityFeed)).toHaveLength(eventTypes.length);
    });
  });

  it('can join the caller’s transaction (and roll back with it)', async () => {
    await expect(db.transaction(async (tx) => {
      await logFeedEvent({ eventType: 'match_created', priority: 1, title: 'In Tx' }, tx);
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    expect(await rowByTitle('In Tx')).toBeUndefined();
  });
});

describe('deleting feed events', () => {
  it('deleteFeedEvents removes the given types for one match only', async () => {
    await seedMatch('m1');
    await createMatch((await pg().query.games.findFirst())!.id, (await pg().query.gameModes.findFirst())!.id, { id: 'm2' });
    await logFeedEvent({ eventType: 'match_scoring_required', priority: 2, title: 'a', matchId: 'm1' });
    await logFeedEvent({ eventType: 'match_scoring_required', priority: 2, title: 'b', matchId: 'm2' });
    await logFeedEvent({ eventType: 'match_created', priority: 2, title: 'c', matchId: 'm1' });
    await deleteFeedEvents('m1', ['match_scoring_required']);
    expect((await pg().select().from(activityFeed)).map((r) => r.title).sort()).toEqual(['b', 'c']);
  });

  it('removeFeedEvents with no types is a no-op and MATCH_ACTION_EVENTS lists the action items', async () => {
    await seedMatch('m1');
    await logFeedEvent({ eventType: 'match_scoring_required', priority: 2, title: 'a', matchId: 'm1' });
    await removeFeedEvents(db, 'm1', []);
    expect(await pg().select().from(activityFeed)).toHaveLength(1);
    expect([...MATCH_ACTION_EVENTS]).toEqual(['match_scoring_required', 'scorecard_player_matching_required']);
  });

  it('hasFeedEvent reports whether an event of that type exists for the match', async () => {
    await seedMatch('m1');
    expect(await hasFeedEvent(db, 'scorecard_player_matching_required', 'm1')).toBe(false);
    await logFeedEvent({ eventType: 'scorecard_player_matching_required', priority: 2, title: 'x', matchId: 'm1' });
    expect(await hasFeedEvent(db, 'scorecard_player_matching_required', 'm1')).toBe(true);
  });
});

describe('listFeed', () => {
  it('orders newest first and pages with a total', async () => {
    const t = (n: number) => new Date(Date.UTC(2026, 0, n));
    await pg().insert(activityFeed).values([
      { id: 'e1', event_type: 'x', priority: 1, title: 'one', created_at: t(1) },
      { id: 'e2', event_type: 'x', priority: 1, title: 'two', created_at: t(2) },
      { id: 'e3', event_type: 'x', priority: 1, title: 'three', created_at: t(3) },
    ]);
    const page = await listFeed(db, { limit: 2, offset: 0 });
    expect(page.total).toBe(3);
    expect(page.events.map((e) => e.id)).toEqual(['e3', 'e2']);
    expect((await listFeed(db, { limit: 2, offset: 2 })).events.map((e) => e.id)).toEqual(['e1']);
  });

  it('filters by type, match, tournament and date range', async () => {
    const { game } = await seedMatch('m1');
    await createTournament(game.id, { id: 't1' });
    await pg().insert(activityFeed).values([
      { id: 'a', event_type: 'one', priority: 1, title: 'a', match_id: 'm1', created_at: new Date('2026-01-01T00:00:00Z') },
      { id: 'b', event_type: 'two', priority: 1, title: 'b', tournament_id: 't1', created_at: new Date('2026-02-01T00:00:00Z') },
      { id: 'c', event_type: 'two', priority: 1, title: 'c', created_at: new Date('2026-03-01T00:00:00Z') },
    ]);
    expect((await listFeed(db, { limit: 10, offset: 0, eventType: 'two' })).events.map((e) => e.id)).toEqual(['c', 'b']);
    expect((await listFeed(db, { limit: 10, offset: 0, matchId: 'm1' })).events.map((e) => e.id)).toEqual(['a']);
    expect((await listFeed(db, { limit: 10, offset: 0, tournamentId: 't1' })).events.map((e) => e.id)).toEqual(['b']);
    const range = await listFeed(db, { limit: 10, offset: 0, dateFrom: new Date('2026-01-15T00:00:00Z'), dateTo: new Date('2026-02-15T00:00:00Z') });
    expect(range.events.map((e) => e.id)).toEqual(['b']);
    expect(range.total).toBe(1);
  });
});

describe('feed retention', () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  it('purgeFeedEventsOlderThan deletes only events past the retention window', async () => {
    await pg().insert(activityFeed).values([
      { id: 'old', event_type: 'x', priority: 1, title: 'old', created_at: daysAgo(200) },
      { id: 'edge', event_type: 'x', priority: 1, title: 'edge', created_at: daysAgo(100) },
      { id: 'new', event_type: 'x', priority: 1, title: 'new', created_at: daysAgo(1) },
    ]);
    expect(await purgeFeedEventsOlderThan(db, 180)).toBe(1);
    expect((await pg().select().from(activityFeed)).map((r) => r.id).sort()).toEqual(['edge', 'new']);
  });

  it('purgeFeedEventsOfType deletes one action type older than the cutoff', async () => {
    await pg().insert(activityFeed).values([
      { id: 'a', event_type: 'match_scoring_required', priority: 2, title: 'a', created_at: daysAgo(3) },
      { id: 'b', event_type: 'match_scoring_required', priority: 2, title: 'b', created_at: daysAgo(0) },
      { id: 'c', event_type: 'match_created', priority: 2, title: 'c', created_at: daysAgo(3) },
    ]);
    expect(await purgeFeedEventsOfType(db, 'match_scoring_required', daysAgo(1))).toBe(1);
    expect((await pg().select().from(activityFeed)).map((r) => r.id).sort()).toEqual(['b', 'c']);
  });
});
