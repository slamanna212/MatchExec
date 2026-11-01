// @vitest-environment node
/** Tournament status transition effects: Discord queue rows, solo-team creation, first-round start, feed events. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createGameMode, createMatch, createTournament } from '../../utils/pg-fixtures';
import { bracketGame, insertParticipants, insertTeams } from '../../utils/pg-tournament-fixtures';
import {
  discordAnnouncementQueue, discordDeletionQueue, discordMatchMessages, discordStatusUpdateQueue, matchGames, matches, tournamentMatches,
  tournamentParticipants, tournamentTeamMembers, tournamentTeams, tournaments,
} from '../../../lib/db/schema';
import { db } from '../../../lib/db';
import { logFeedEvent } from '@/lib/feed-helpers';
import {
  ALLOWED_TRANSITIONS, TournamentError, autoCreateSoloTeams, handleAssignTransition, handleBattleTransition, handleEndTransition,
  handleGatherTransition, isKnownStatus, startFirstRoundMatches, transitionTournament, validateStatusTransition,
} from '@/lib/tournaments';
import { AfterCommit } from '@/lib/matches/effects';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', () => ({ logFeedEvent: vi.fn().mockResolvedValue(undefined), deleteFeedEvents: vi.fn() }));

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
const tp = (id: string, o: Partial<typeof tournaments.$inferInsert> = {}) => createTournament(gameId, { id, name: `Tourney ${id}`, game_mode_id: modeId, ...o });
const run = async (fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0], after: AfterCommit) => Promise<void>) => {
  const after = new AfterCommit();
  await db.transaction((tx) => fn(tx, after));
  await after.run();
};

describe('transition rules (pure)', () => {
  it('allows forward single steps and cancellation only', () => {
    expect(ALLOWED_TRANSITIONS.created).toEqual(['gather', 'cancelled']);
    expect(ALLOWED_TRANSITIONS.complete).toEqual([]);
    expect(validateStatusTransition('created', 'gather')).toBeNull();
    expect(validateStatusTransition('battle', 'cancelled')).toBeNull();
    expect(validateStatusTransition('created', 'battle')).toBe('Cannot transition tournament from "created" to "battle"');
    expect(validateStatusTransition('gather', 'gather')).toBe('Tournament is already in "gather" status');
    expect(validateStatusTransition('complete', 'gather')).toContain('Cannot transition');
    expect(validateStatusTransition('mystery', 'gather')).toContain('Cannot transition');
  });

  it('isKnownStatus recognises the flow steps', () => {
    for (const s of ['created', 'gather', 'assign', 'battle', 'complete', 'cancelled']) expect(isKnownStatus(s)).toBe(true);
    expect(isKnownStatus('nope')).toBe(false);
    expect(isKnownStatus(undefined)).toBe(false);
  });
});

describe('handleGatherTransition', () => {
  it('queues one tournament announcement (pending) and does not duplicate it', async () => {
    const t = await tp('t1');
    await run((tx, a) => handleGatherTransition(tx, t.id, a));
    await run((tx, a) => handleGatherTransition(tx, t.id, a));
    const rows = await pg().select().from(discordAnnouncementQueue).where(eq(discordAnnouncementQueue.match_id, t.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ announcement_type: 'tournament', status: 'pending' });
  });

  it('logs a tournament_phase_changed feed event after commit', async () => {
    const t = await tp('t1');
    await run((tx, a) => handleGatherTransition(tx, t.id, a));
    expect(logFeedEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'tournament_phase_changed', tournamentId: t.id, title: 'Tournament Signups Opened' }));
  });

  it('does not throw for an unknown tournament', async () => {
    await expect(run((tx, a) => handleGatherTransition(tx, 'nonexistent', a))).resolves.toBeUndefined();
  });

  it('writes nothing when the surrounding transaction rolls back, and feed events only fire after commit', async () => {
    const t = await tp('t1');
    const after = new AfterCommit();
    await expect(db.transaction(async (tx) => { await handleGatherTransition(tx, t.id, after); throw new Error('rollback'); })).rejects.toThrow('rollback');
    expect(await pg().select().from(discordAnnouncementQueue)).toHaveLength(0);
    expect(logFeedEvent).not.toHaveBeenCalled();
  });
});

describe('handleAssignTransition', () => {
  it('queues a Discord status update for the tournament and for each of its matches, and a feed event', async () => {
    const t = await tp('t1');
    await createMatch(gameId, modeId, { id: 'tm1', tournament_id: t.id, status: 'assign' });
    await run((tx, a) => handleAssignTransition(tx, t.id, a));
    const updates = await pg().select().from(discordStatusUpdateQueue);
    expect(updates.map((u) => [u.match_id, u.new_status]).sort()).toEqual([['t1', 'assign'], ['tm1', 'assign']]);
    expect(logFeedEvent).toHaveBeenCalledWith(expect.objectContaining({ title: 'Tournament Signups Closed' }));
  });

  it('auto-creates solo teams when the mode has team_size = 1 and no teams exist', async () => {
    const solo = await createGameMode(gameId, { team_size: 1, max_teams: 16, name: 'Solo' });
    const t = await tp('t1', { game_mode_id: solo.id });
    await insertParticipants(t.id, 2);
    await run((tx, a) => handleAssignTransition(tx, t.id, a));
    const teams = await pg().select().from(tournamentTeams).where(eq(tournamentTeams.tournament_id, t.id));
    expect(teams.map((x) => x.team_name).sort()).toEqual(['User p0', 'User p1']);
    const members = await pg().select().from(tournamentTeamMembers);
    expect(members).toHaveLength(2);
    const parts = await pg().select().from(tournamentParticipants);
    expect(parts.every((p) => teams.some((x) => x.id === p.team_assignment))).toBe(true);
  });

  it('also creates solo teams for FFA / Position modes (NULL team size)', async () => {
    for (const scoring of ['FFA', 'Position'] as const) {
      const mode = await createGameMode(gameId, { scoring_type: scoring, team_size: null, name: scoring });
      const t = await tp(`t-${scoring}`, { game_mode_id: mode.id, format: 'cumulative-points' });
      await insertParticipants(t.id, 3);
      expect(await autoCreateSoloTeams(db, t)).toBe(3);
    }
  });

  it('does not auto-create teams when teams already exist, for team modes, or without participants', async () => {
    const withTeams = await tp('t1');
    await insertTeams(withTeams.id, 1);
    await insertParticipants(withTeams.id, 2);
    await run((tx, a) => handleAssignTransition(tx, withTeams.id, a));
    expect(await pg().select().from(tournamentTeams).where(eq(tournamentTeams.tournament_id, 't1'))).toHaveLength(1);

    const teamMode = await tp('t2');
    await insertParticipants(teamMode.id, 4);
    expect(await autoCreateSoloTeams(db, teamMode)).toBe(0);

    const solo = await createGameMode(gameId, { team_size: 1, name: 'Solo' });
    const empty = await tp('t3', { game_mode_id: solo.id });
    expect(await autoCreateSoloTeams(db, empty)).toBe(0);
  });

  it('falls back to "any solo mode in the game" when the tournament mode does not resolve', async () => {
    await createGameMode(gameId, { team_size: 1, name: 'Solo' });
    const t = await tp('t1', { game_mode_id: 'vanished-mode' });
    await insertParticipants(t.id, 2);
    expect(await autoCreateSoloTeams(db, t)).toBe(2);
  });
});

describe('handleBattleTransition / startFirstRoundMatches', () => {
  async function linkMatch(tournamentId: string, id: string, round: number, status: 'assign' | 'complete' = 'assign') {
    await createMatch(gameId, modeId, { id, status, tournament_id: tournamentId, maps: ['map-x'] });
    await pg().insert(tournamentMatches).values({ match_id: id, tournament_id: tournamentId, round, bracket_type: 'winners', match_order: 1 });
  }

  it('starts round-1 matches: battle status, a match_start announcement and game rows', async () => {
    const t = await tp('t1');
    await linkMatch(t.id, 'r1', 1);
    await run((tx, a) => handleBattleTransition(tx, t.id, a));
    expect((await pg().select().from(matches).where(eq(matches.id, 'r1')))[0].status).toBe('battle');
    const ann = await pg().select().from(discordAnnouncementQueue).where(eq(discordAnnouncementQueue.match_id, 'r1'));
    expect(ann.map((a) => a.announcement_type)).toEqual(['match_start']);
    expect(await pg().select().from(matchGames).where(eq(matchGames.match_id, 'r1'))).toHaveLength(1);
    expect(logFeedEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'tournament_started' }));
  });

  it('leaves matches of later rounds and matches not waiting in assign alone', async () => {
    const t = await tp('t1');
    await linkMatch(t.id, 'r2', 2);
    await linkMatch(t.id, 'done', 1, 'complete');
    expect(await startFirstRoundMatches(db, t.id)).toBe(0);
    expect((await pg().select().from(matches).where(eq(matches.id, 'r2')))[0].status).toBe('assign');
    expect((await pg().select().from(matches).where(eq(matches.id, 'done')))[0].status).toBe('complete');
  });

  it('does not throw when there are no first-round matches', async () => {
    const t = await tp('t1');
    await expect(run((tx, a) => handleBattleTransition(tx, t.id, a))).resolves.toBeUndefined();
  });

  it('is idempotent: a match already started is not started twice', async () => {
    const t = await tp('t1');
    await linkMatch(t.id, 'r1', 1);
    expect(await startFirstRoundMatches(db, t.id)).toBe(1);
    expect(await startFirstRoundMatches(db, t.id)).toBe(0);
    expect(await pg().select().from(discordAnnouncementQueue)).toHaveLength(1);
  });
});

describe('handleEndTransition', () => {
  it('queues the Discord event deletion when the tournament has a Discord event', async () => {
    const t = await tp('t1');
    await pg().insert(discordMatchMessages).values({ id: 'msg1', match_id: t.id, discord_event_id: 'evt123', message_id: 'msg123', channel_id: 'ch123', message_type: 'tournament' });
    await run((tx, a) => handleEndTransition(tx, t.id, 'complete', a));
    expect(await pg().select().from(discordDeletionQueue).where(eq(discordDeletionQueue.match_id, t.id))).toHaveLength(1);
  });

  it('queues nothing without a Discord event, and does not throw for either status or unknown tournaments', async () => {
    const t = await tp('t1');
    await expect(run((tx, a) => handleEndTransition(tx, t.id, 'cancelled', a))).resolves.toBeUndefined();
    await expect(run((tx, a) => handleEndTransition(tx, t.id, 'complete', a))).resolves.toBeUndefined();
    await expect(run((tx, a) => handleEndTransition(tx, 'nonexistent', 'cancelled', a))).resolves.toBeUndefined();
    expect(await pg().select().from(discordDeletionQueue)).toHaveLength(0);
  });

  it('logs tournament_completed / tournament_cancelled feed events', async () => {
    const t = await tp('t1');
    await run((tx, a) => handleEndTransition(tx, t.id, 'complete', a));
    expect(logFeedEvent).toHaveBeenLastCalledWith(expect.objectContaining({ eventType: 'tournament_completed', description: '"Tourney t1" is over' }));
    await run((tx, a) => handleEndTransition(tx, t.id, 'cancelled', a));
    expect(logFeedEvent).toHaveBeenLastCalledWith(expect.objectContaining({ eventType: 'tournament_cancelled', description: '"Tourney t1" was cancelled' }));
  });
});

describe('transitionTournament', () => {
  it('moves the status, runs the effects and returns the updated tournament with game info', async () => {
    const t = await tp('t1');
    const updated = await transitionTournament(db, t.id, 'gather');
    expect(updated).toMatchObject({ id: t.id, status: 'gather', game_name: 'Test Game', participant_count: 0 });
    expect(await pg().select().from(discordAnnouncementQueue)).toHaveLength(1);
    expect(logFeedEvent).toHaveBeenCalledTimes(1);
  });

  it('throws TournamentError with the HTTP status for each failure', async () => {
    await tp('t1', { status: 'gather' });
    await expect(transitionTournament(db, 'missing', 'gather')).rejects.toMatchObject({ status: 404 });
    await expect(transitionTournament(db, 't1', 'wrong')).rejects.toMatchObject({ status: 400, message: 'Invalid status provided' });
    await expect(transitionTournament(db, 't1', 'created')).rejects.toBeInstanceOf(TournamentError);
    await expect(transitionTournament(db, 't1', 'battle')).rejects.toMatchObject({ status: 400 });
    expect((await pg().select().from(tournaments).where(eq(tournaments.id, 't1')))[0].status).toBe('gather');
  });
});
