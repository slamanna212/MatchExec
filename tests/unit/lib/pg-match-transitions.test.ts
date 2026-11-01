// @vitest-environment node
/**
 * Per-status transition effects on Postgres (ported from the old transition-handlers / -extended / -edge-cases suites):
 * the handlers write their Discord queue rows, the router dispatches, and `transitionMatch` validates.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createGame, createGameMode, createMatch } from '../../utils/pg-fixtures';
import {
  autoVoiceChannels, discordAnnouncementQueue, discordBotRequests, discordDeletionQueue, discordStatusUpdateQueue, gameMaps, matchGames,
  matchParticipants, matchTeams, matches,
} from '../../../lib/db/schema';
import { db } from '../../../lib/db';
import {
  AfterCommit, ALLOWED_TRANSITIONS, MapCodeService, MatchTransitionError, VoiceChannelService, handleAssignTransition, handleBattleTransition,
  handleCancelledTransition, handleCompleteTransition, handleGatherTransition, handleStatusTransition, isKnownStatus, transitionMatch,
} from '@/lib/matches';
import { deleteFeedEvents, logFeedEvent } from '@/lib/feed-helpers';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/feed-helpers')>()), logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));

setupPgTestFile();
const pg = () => getPgTestDb();

let gameId: string;
let modeId: string;
beforeEach(async () => {
  vi.mocked(logFeedEvent).mockClear();
  vi.mocked(deleteFeedEvents).mockClear();
  gameId = (await createGame()).id;
  modeId = (await createGameMode(gameId)).id;
});
afterEach(() => { vi.restoreAllMocks(); });

const run = async (fn: (after: AfterCommit) => Promise<unknown>) => {
  const after = new AfterCommit();
  await fn(after);
  await after.run();
};
const announcements = (matchId: string, type?: 'standard' | 'match_start') =>
  pg().select().from(discordAnnouncementQueue).where(type ? and(eq(discordAnnouncementQueue.match_id, matchId), eq(discordAnnouncementQueue.announcement_type, type)) : eq(discordAnnouncementQueue.match_id, matchId));
const statusUpdates = (matchId: string) => pg().select().from(discordStatusUpdateQueue).where(eq(discordStatusUpdateQueue.match_id, matchId));
const deletions = (matchId: string) => pg().select().from(discordDeletionQueue).where(eq(discordDeletionQueue.match_id, matchId));
const feedTypes = () => vi.mocked(logFeedEvent).mock.calls.map(([e]) => e.eventType);

describe('handleGatherTransition', () => {
  it('queues a pending standard announcement', async () => {
    const m = await createMatch(gameId, modeId, { status: 'created' });
    await run((a) => handleGatherTransition(db, m.id, a));
    const rows = await announcements(m.id, 'standard');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
  });

  it('does not create duplicate announcements', async () => {
    const m = await createMatch(gameId, modeId, { status: 'created' });
    await run((a) => handleGatherTransition(db, m.id, a));
    await run((a) => handleGatherTransition(db, m.id, a));
    expect(await announcements(m.id, 'standard')).toHaveLength(1);
  });

  it('logs a match_phase_changed feed event after the transaction', async () => {
    const m = await createMatch(gameId, modeId);
    await run((a) => handleGatherTransition(db, m.id, a));
    expect(feedTypes()).toEqual(['match_phase_changed']);
    expect(vi.mocked(logFeedEvent).mock.calls[0][0]).toMatchObject({ matchId: m.id, title: 'Match Signups Opened' });
  });

  it('does not throw for a nonexistent match', async () => {
    await expect(run((a) => handleGatherTransition(db, 'invalid-match-id', a))).resolves.toBeUndefined();
  });
});

describe('handleAssignTransition', () => {
  it('queues a pending status update', async () => {
    const m = await createMatch(gameId, modeId, { status: 'gather' });
    await run((a) => handleAssignTransition(db, m.id, a));
    const rows = await statusUpdates(m.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ new_status: 'assign', status: 'pending' });
  });

  it('creates Blue and Red teams (plus Reserve) for Normal mode', async () => {
    const m = await createMatch(gameId, modeId, { status: 'gather' });
    await run((a) => handleAssignTransition(db, m.id, a));
    const teams = await pg().select().from(matchTeams).where(and(eq(matchTeams.match_id, m.id), eq(matchTeams.is_reserve, false))).orderBy(matchTeams.team_order);
    expect(teams.map((t) => [t.team_name, t.team_order])).toEqual([['Blue', 0], ['Red', 1]]);
  });

  it('creates one team per participant for FFA mode', async () => {
    const ffa = await createGameMode(gameId, { scoring_type: 'FFA', name: 'Deathmatch' });
    const m = await createMatch(gameId, ffa.id, { status: 'gather' });
    await pg().insert(matchParticipants).values([
      { id: 'p1', match_id: m.id, user_id: 'u1', username: 'Alice' },
      { id: 'p2', match_id: m.id, user_id: 'u2', username: 'Bob' },
    ]);
    await run((a) => handleAssignTransition(db, m.id, a));
    const teams = await pg().select().from(matchTeams).where(and(eq(matchTeams.match_id, m.id), eq(matchTeams.is_reserve, false)));
    expect(teams.map((t) => t.team_name).sort()).toEqual(['Alice', 'Bob']);
  });

  it('is idempotent: calling twice does not duplicate teams', async () => {
    const m = await createMatch(gameId, modeId, { status: 'gather' });
    await run((a) => handleAssignTransition(db, m.id, a));
    await run((a) => handleAssignTransition(db, m.id, a));
    expect(await pg().select().from(matchTeams).where(and(eq(matchTeams.match_id, m.id), eq(matchTeams.is_reserve, false)))).toHaveLength(2);
  });

  it('leaves voice channel creation to transitionMatch, after commit', async () => {
    const setup = vi.spyOn(VoiceChannelService, 'setupMatchVoiceChannels').mockResolvedValue(true);
    const m = await createMatch(gameId, modeId, { status: 'gather' });
    await run((a) => handleAssignTransition(db, m.id, a));
    expect(setup).not.toHaveBeenCalled();
    await transitionMatch(m.id, 'assign');
    expect(setup).toHaveBeenCalledWith(m.id);
  });

  it('a failing voice channel setup does not fail the transition', async () => {
    vi.spyOn(VoiceChannelService, 'setupMatchVoiceChannels').mockRejectedValue(new Error('Voice setup failed'));
    const m = await createMatch(gameId, modeId, { status: 'gather' });
    await expect(transitionMatch(m.id, 'assign')).resolves.toEqual({ from: 'gather' });
    expect((await pg().select().from(matches).where(eq(matches.id, m.id)))[0].status).toBe('assign');
  });
});

describe('handleBattleTransition', () => {
  it('queues the welcome voice announcement', async () => {
    const queue = vi.spyOn(VoiceChannelService, 'queueVoiceAnnouncement').mockResolvedValue(true);
    const m = await createMatch(gameId, modeId, { status: 'assign' });
    await run((a) => handleBattleTransition(db, m.id, a));
    expect(queue).toHaveBeenCalledWith(expect.anything(), m.id, 'welcome');
  });

  it('queues the Discord match-start announcement', async () => {
    const m = await createMatch(gameId, modeId, { status: 'assign' });
    await run((a) => handleBattleTransition(db, m.id, a));
    const rows = await announcements(m.id, 'match_start');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
  });

  it('initialises the match games, the first one ongoing', async () => {
    await pg().insert(gameMaps).values({ id: 'battle-map-1', game_id: gameId, mode_id: modeId, name: 'Battle Map 1' });
    const m = await createMatch(gameId, modeId, { status: 'assign', maps: ['battle-map-1', 'battle-map-1'] });
    await run((a) => handleBattleTransition(db, m.id, a));
    const rows = await pg().select().from(matchGames).where(eq(matchGames.match_id, m.id)).orderBy(matchGames.round);
    expect(rows.map((r) => r.status)).toEqual(['ongoing', 'pending']);
  });

  it('processes the first map code', async () => {
    const spy = vi.spyOn(MapCodeService, 'processFirstMapCode').mockResolvedValue(true);
    const m = await createMatch(gameId, modeId, { status: 'assign' });
    await run((a) => handleBattleTransition(db, m.id, a));
    expect(spy).toHaveBeenCalledWith(expect.anything(), m.id);
  });

  it('logs the match start and the scoring-required prompt for the first map', async () => {
    const m = await createMatch(gameId, modeId, { status: 'assign', maps: ['m1'] });
    await run((a) => handleBattleTransition(db, m.id, a));
    expect(feedTypes()).toEqual(['match_started', 'match_scoring_required']);
  });

  it('keeps going when the voice announcement or the map code fail', async () => {
    vi.spyOn(VoiceChannelService, 'queueVoiceAnnouncement').mockRejectedValue(new Error('Failed'));
    vi.spyOn(MapCodeService, 'processFirstMapCode').mockRejectedValue(new Error('Failed'));
    const m = await createMatch(gameId, modeId, { status: 'assign' });
    await expect(run((a) => handleBattleTransition(db, m.id, a))).resolves.toBeUndefined();
    expect(await announcements(m.id, 'match_start')).toHaveLength(1);
    await expect(run((a) => handleBattleTransition(db, 'some-match-id', a))).resolves.toBeUndefined();
  });
});

describe('handleCompleteTransition / handleCancelledTransition', () => {
  it('queues the Discord deletion when a match completes', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    await run((a) => handleCompleteTransition(db, m.id, a));
    const rows = await deletions(m.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    expect(feedTypes()).toContain('match_completed');
  });

  it('queues the Discord deletion when a match is cancelled, and clears the scoring prompt', async () => {
    const m = await createMatch(gameId, modeId, { status: 'gather' });
    await run((a) => handleCancelledTransition(db, m.id, a));
    const rows = await deletions(m.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    expect(feedTypes()).toEqual(['match_cancelled']);
    expect(deleteFeedEvents).toHaveBeenCalledWith(m.id, ['match_scoring_required']);
  });

  it('both queue the cleanup of auto-created voice channels', async () => {
    for (const handler of [handleCompleteTransition, handleCancelledTransition]) {
      const m = await createMatch(gameId, modeId, { status: 'battle' });
      await pg().insert(autoVoiceChannels).values({ id: `av-${m.id}`, match_id: m.id, channel_id: 'chan-1', team_name: 'all' });
      await run((a) => handler(db, m.id, a));
      const reqs = (await pg().select().from(discordBotRequests)).filter((r) => (r.data as { matchId?: string }).matchId === m.id);
      expect(reqs.map((r) => r.type)).toEqual(['voice_channel_delete']);
      expect(await pg().select().from(autoVoiceChannels).where(eq(autoVoiceChannels.match_id, m.id))).toHaveLength(0);
    }
  });

  it('handles unknown matches without throwing', async () => {
    await expect(run((a) => handleCompleteTransition(db, 'ghost-match', a))).resolves.toBeUndefined();
    await expect(run((a) => handleCancelledTransition(db, 'invalid-match-id', a))).resolves.toBeUndefined();
  });
});

describe('handleStatusTransition routing', () => {
  it('routes each status to its handler', async () => {
    const created = await createMatch(gameId, modeId, { status: 'created' });
    await handleStatusTransition(db, created.id, 'gather');
    expect(await announcements(created.id, 'standard')).toHaveLength(1);

    const gather = await createMatch(gameId, modeId, { status: 'gather' });
    await handleStatusTransition(db, gather.id, 'assign');
    expect(await statusUpdates(gather.id)).toHaveLength(1);

    const assign = await createMatch(gameId, modeId, { status: 'assign' });
    await handleStatusTransition(db, assign.id, 'battle');
    expect(await announcements(assign.id, 'match_start')).toHaveLength(1);

    const battle = await createMatch(gameId, modeId, { status: 'battle' });
    await handleStatusTransition(db, battle.id, 'complete');
    expect(await deletions(battle.id)).toHaveLength(1);

    const cancel = await createMatch(gameId, modeId, { status: 'gather' });
    await handleStatusTransition(db, cancel.id, 'cancelled');
    expect(await deletions(cancel.id)).toHaveLength(1);
  });

  it('does nothing for unknown statuses and for "created"', async () => {
    const m = await createMatch(gameId, modeId, { status: 'created' });
    for (const status of ['unknown-status', 'nonexistent_status', 'created']) {
      await expect(handleStatusTransition(db, m.id, status)).resolves.toBeInstanceOf(AfterCommit);
    }
    expect(await announcements(m.id)).toHaveLength(0);
    expect(await statusUpdates(m.id)).toHaveLength(0);
    expect(await deletions(m.id)).toHaveLength(0);
  });

  it('collects the feed events and runs them only when asked', async () => {
    const m = await createMatch(gameId, modeId, { status: 'created' });
    const after = await handleStatusTransition(db, m.id, 'gather');
    expect(logFeedEvent).not.toHaveBeenCalled();
    await after.run();
    expect(logFeedEvent).toHaveBeenCalledTimes(1);
    await after.run(); // drained
    expect(logFeedEvent).toHaveBeenCalledTimes(1);
  });

  it('routes without validating the current state', async () => {
    const created = await createMatch(gameId, modeId, { status: 'created' });
    await handleStatusTransition(db, created.id, 'complete');
    expect(await deletions(created.id)).toHaveLength(1);
    const other = await createMatch(gameId, modeId, { status: 'created' });
    await expect(handleStatusTransition(db, other.id, 'cancelled')).resolves.toBeInstanceOf(AfterCommit);
  });

  it('is safe to call twice with the same status (the announcement is not duplicated)', async () => {
    const m = await createMatch(gameId, modeId, { status: 'gather' });
    await handleStatusTransition(db, m.id, 'gather');
    await handleStatusTransition(db, m.id, 'gather');
    expect(await announcements(m.id)).toHaveLength(1);
  });

  it('produces the matching queue entries for gather then assign in sequence', async () => {
    const m = await createMatch(gameId, modeId, { status: 'created' });
    await handleStatusTransition(db, m.id, 'gather');
    await handleStatusTransition(db, m.id, 'assign');
    expect(await announcements(m.id)).toHaveLength(1);
    expect((await statusUpdates(m.id))[0].new_status).toBe('assign');
  });

  it('tolerates nonexistent match ids for gather, complete and cancelled', async () => {
    for (const status of ['gather', 'complete', 'cancelled']) {
      await expect(handleStatusTransition(db, 'nonexistent-match-id', status)).resolves.toBeInstanceOf(AfterCommit);
    }
  });

  it('two concurrent gather or complete calls both resolve and queue once', async () => {
    const g = await createMatch(gameId, modeId, { status: 'created' });
    await Promise.all([handleStatusTransition(db, g.id, 'gather'), handleStatusTransition(db, g.id, 'gather')]);
    expect(await announcements(g.id)).toHaveLength(1);
    const c = await createMatch(gameId, modeId, { status: 'battle' });
    await expect(Promise.all([handleStatusTransition(db, c.id, 'complete'), handleStatusTransition(db, c.id, 'complete')])).resolves.toHaveLength(2);
  });
});

describe('the transition map', () => {
  const go = async (from: string, to: string, force = false) => {
    const m = await createMatch(gameId, modeId, { status: from as never });
    try {
      await transitionMatch(m.id, to as never, { force });
      return { ok: true as const, id: m.id };
    } catch (error) {
      if (error instanceof MatchTransitionError) return { ok: false as const, status: error.status, id: m.id };
      throw error;
    }
  };

  it.each([
    ['created', 'gather'], ['created', 'cancelled'], ['gather', 'assign'], ['gather', 'cancelled'], ['assign', 'battle'], ['assign', 'cancelled'],
    ['battle', 'cancelled'],
  ])('allows %s -> %s', async (from, to) => {
    expect((await go(from, to)).ok).toBe(true);
    expect(ALLOWED_TRANSITIONS[from]).toContain(to);
  });

  it.each([['created', 'assign'], ['created', 'battle'], ['gather', 'battle'], ['assign', 'complete'], ['battle', 'gather'], ['gather', 'created']])('rejects %s -> %s even when forced', async (from, to) => {
    const r = await go(from, to, true);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects same-status transitions', async () => {
    expect(await go('gather', 'gather')).toMatchObject({ ok: false, status: 400 });
  });

  it('treats complete and cancelled as terminal', async () => {
    for (const from of ['complete', 'cancelled']) {
      expect(await go(from, 'cancelled')).toMatchObject({ ok: false, status: 400 });
      expect(await go(from, 'complete', true)).toMatchObject({ ok: false, status: 400 });
      expect(await go(from, 'gather')).toMatchObject({ ok: false, status: 400 });
      expect(await go(from, 'created')).toMatchObject({ ok: false, status: 400 });
    }
  });

  it('404s an unknown match', async () => {
    await expect(transitionMatch('missing', 'gather')).rejects.toMatchObject({ status: 404 });
  });

  it('only completes a match whose games are all completed unless forced', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    await pg().insert(matchGames).values({ id: 'game-1', match_id: m.id, round: 1, status: 'pending' });
    await expect(transitionMatch(m.id, 'complete')).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/not all maps/) });
    expect((await pg().select().from(matches).where(eq(matches.id, m.id)))[0].status).toBe('battle');
    await expect(transitionMatch(m.id, 'complete', { force: true })).resolves.toEqual({ from: 'battle' });
  });

  it('completes a match with all games completed', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    await pg().insert(matchGames).values({ id: 'game-1', match_id: m.id, round: 1, status: 'completed' });
    await transitionMatch(m.id, 'complete');
    expect((await pg().select().from(matches).where(eq(matches.id, m.id)))[0].status).toBe('complete');
  });

  it('does not fire completion side effects twice', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    await transitionMatch(m.id, 'complete', { force: true });
    await expect(transitionMatch(m.id, 'complete', { force: true })).rejects.toBeInstanceOf(MatchTransitionError);
    expect(await deletions(m.id)).toHaveLength(1);
  });

  it('a rejected transition leaves no queue rows behind', async () => {
    const m = await createMatch(gameId, modeId, { status: 'created' });
    await expect(transitionMatch(m.id, 'battle')).rejects.toBeInstanceOf(MatchTransitionError);
    expect(await announcements(m.id)).toHaveLength(0);
  });

  it('recognises valid statuses only', () => {
    expect(['created', 'gather', 'assign', 'battle', 'complete', 'cancelled'].every(isKnownStatus)).toBe(true);
    expect([isKnownStatus('bogus'), isKnownStatus(undefined), isKnownStatus(3)]).toEqual([false, false, false]);
  });
});

describe('match cancel flow', () => {
  async function newMatchAt(status: 'created' | 'gather' | 'assign' | 'battle') {
    const m = await createMatch(gameId, modeId, { status: 'created' });
    for (const step of ['gather', 'assign', 'battle'] as const) {
      if (['created', 'gather', 'assign', 'battle'].indexOf(step) > ['created', 'gather', 'assign', 'battle'].indexOf(status)) break;
      await transitionMatch(m.id, step);
    }
    return m.id;
  }

  it.each(['created', 'gather', 'assign', 'battle'] as const)('cancels from %s, queues the deletion and persists the status', async (from) => {
    vi.spyOn(VoiceChannelService, 'setupMatchVoiceChannels').mockResolvedValue(true);
    const id = await newMatchAt(from);
    await expect(transitionMatch(id, 'cancelled')).resolves.toEqual({ from });
    expect((await pg().select().from(matches).where(eq(matches.id, id)))[0].status).toBe('cancelled');
    expect(await deletions(id)).toHaveLength(1);
  });

  it('a cancelled match cannot be moved on to any other status', async () => {
    const id = await newMatchAt('gather');
    await transitionMatch(id, 'cancelled');
    for (const to of ['created', 'gather', 'assign', 'battle', 'complete'] as const) {
      await expect(transitionMatch(id, to, { force: true })).rejects.toMatchObject({ status: 400 });
    }
    expect((await pg().select().from(matches).where(eq(matches.id, id)))[0].status).toBe('cancelled');
  });

  it('cancelling before gather queues no announcement', async () => {
    const id = await newMatchAt('created');
    await transitionMatch(id, 'cancelled');
    expect(await announcements(id)).toHaveLength(0);
  });
});
