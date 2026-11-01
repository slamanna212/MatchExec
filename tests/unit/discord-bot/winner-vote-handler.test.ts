import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { mockDiscordClient, resetDiscordMocks } from '../../mocks/discord';
import { getPgTestDb, setupPgTestFile } from '../../utils/pg-test-db';
import { eq } from 'drizzle-orm';
import { discordWinnerVoteMessages, gameStatDefinitions, matchParticipants, matchTeams, matches, scorecardSubmissions } from '../../../lib/db/schema';
import { seedBasicTestData, createMatch, createMatchGame, createMatchParticipant } from '../../utils/pg-fixtures';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

vi.mock('discord.js', () => ({
  Client: vi.fn(() => mockDiscordClient),
  EmbedBuilder: vi.fn().mockImplementation(function (this: any) {
    this.setTitle = vi.fn().mockReturnThis();
    this.setDescription = vi.fn().mockReturnThis();
    this.setColor = vi.fn().mockReturnThis();
    this.setFooter = vi.fn().mockReturnThis();
    return this;
  }),
}));

vi.mock('@/lib/matches/results', () => ({
  saveMatchResult: vi.fn().mockResolvedValue(undefined),
  GameAlreadyScoredError: class GameAlreadyScoredError extends Error { name = 'GameAlreadyScoredError'; },
}));

let WinnerVoteHandler: any;

setupPgTestFile();

describe('WinnerVoteHandler', () => {
  let handler: any;
  let game: any;
  let mode: any;

  beforeAll(async () => {
    const mod = await import('../../../processes/discord-bot/modules/winner-vote-handler');
    WinnerVoteHandler = mod.WinnerVoteHandler;
  });

  beforeEach(async () => {
    resetDiscordMocks();
    const testData = await seedBasicTestData();
    game = testData.game;
    mode = testData.mode;
    handler = new WinnerVoteHandler(mockDiscordClient as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── sendWinnerVotePrompts ──────────────────────────────────────────────────

  describe('sendWinnerVotePrompts', () => {
    it('returns false when no commanders exist for the match', async () => {
      const match = await createMatch(game.id, mode.id);
      const result = await handler.sendWinnerVotePrompts(match.id, 'game-1', 'Hanamura');
      expect(result).toBe(false);
    });

    it('returns false when participants exist but none have receives_map_codes=1', async () => {
      const match = await createMatch(game.id, mode.id);
      await createMatchParticipant(match.id, 'discord-999', 'SomePlayer');
      const result = await handler.sendWinnerVotePrompts(match.id, 'game-1', 'Hanamura');
      expect(result).toBe(false);
    });

    it('returns true and inserts vote records when commanders receive DMs successfully', async () => {
      const match = await createMatch(game.id, mode.id);
      const participant = await createMatchParticipant(match.id, 'discord-blue-1', 'BlueCommander');
      await createMatchGame(match.id, { id: 'game-1' });
      await getPgTestDb().insert(matchTeams).values({ id: 't-blue-x', match_id: match.id, team_name: 'Blue', team_order: 0, is_reserve: false });
      await getPgTestDb().update(matchParticipants).set({ receives_map_codes: true, team_id: 't-blue-x' }).where(eq(matchParticipants.id, participant.id));

      const mockMessage = { id: 'msg-sent-1', react: vi.fn().mockResolvedValue(undefined) };
      const mockUser = { send: vi.fn().mockResolvedValue(mockMessage) };
      mockDiscordClient.users.fetch = vi.fn().mockResolvedValue(mockUser);

      const result = await handler.sendWinnerVotePrompts(match.id, 'game-1', 'Hanamura');

      expect(result).toBe(true);
      expect(mockUser.send).toHaveBeenCalledOnce();
      expect(mockMessage.react).toHaveBeenCalledWith('🔵');
      expect(mockMessage.react).toHaveBeenCalledWith('🔴');

      const [voteRow] = await getPgTestDb().select().from(discordWinnerVoteMessages).where(eq(discordWinnerVoteMessages.discord_message_id, 'msg-sent-1'));
      expect(voteRow).toBeTruthy();
      expect(voteRow.match_id).toBe(match.id);
      expect(voteRow.team_side).toBe('blue');
    });

    it('returns true even when one DM fails, as long as one succeeds', async () => {
      const match = await createMatch(game.id, mode.id);
      const p1 = await createMatchParticipant(match.id, 'discord-ok', 'OK');
      const p2 = await createMatchParticipant(match.id, 'discord-fail', 'Fail');
      await createMatchGame(match.id, { id: 'game-1' });
      await getPgTestDb().update(matchParticipants).set({ receives_map_codes: true }).where(eq(matchParticipants.id, p1.id));
      await getPgTestDb().update(matchParticipants).set({ receives_map_codes: true }).where(eq(matchParticipants.id, p2.id));

      const mockMessage = { id: 'msg-ok', react: vi.fn().mockResolvedValue(undefined) };
      mockDiscordClient.users.fetch = vi.fn()
        .mockResolvedValueOnce({ send: vi.fn().mockResolvedValue(mockMessage) })
        .mockRejectedValueOnce(new Error('User not found'));

      const result = await handler.sendWinnerVotePrompts(match.id, 'game-1', 'Map');
      expect(result).toBe(true);
    });
  });

  // ─── handleReaction ─────────────────────────────────────────────────────────

  describe('handleReaction', () => {
    it('ignores non-target emoji', async () => {
      const reaction = { emoji: { name: '👍' }, message: { id: 'msg-1' } };
      await handler.handleReaction(reaction as any, { id: 'user-1' } as any);
      const rows = await getPgTestDb().select().from(discordWinnerVoteMessages);
      expect(rows).toHaveLength(0);
    });

    it('does nothing when no vote record exists for the message', async () => {
      const match = await createMatch(game.id, mode.id);
      const reaction = { emoji: { name: '🔵' }, message: { id: 'nonexistent-msg' } };
      await handler.handleReaction(reaction as any, { id: 'user-1' } as any);
      const [row] = await getPgTestDb().select().from(discordWinnerVoteMessages).where(eq(discordWinnerVoteMessages.match_id, match.id));
      expect(row).toBeUndefined();
    });

    it('does not double-count a reaction when commander has already voted', async () => {
      const match = await createMatch(game.id, mode.id);
      await createMatchGame(match.id, { id: 'game-1' });
      await getPgTestDb().insert(discordWinnerVoteMessages).values({ id: 'vr1', match_id: match.id, match_game_id: 'game-1', discord_user_id: 'user-1', discord_message_id: 'msg-already-voted', voted_for: 'blue' });

      const reaction = { emoji: { name: '🔴' }, message: { id: 'msg-already-voted' } };
      await handler.handleReaction(reaction as any, { id: 'user-1' } as any);

      const [row] = await getPgTestDb().select().from(discordWinnerVoteMessages).where(eq(discordWinnerVoteMessages.id, 'vr1'));
      expect(row.voted_for).toBe('blue');
    });

    it('records vote and calls evaluateVotes on a valid unvoted reaction', async () => {
      const match = await createMatch(game.id, mode.id);
      await createMatchGame(match.id, { id: 'game-1' });
      await getPgTestDb().insert(discordWinnerVoteMessages).values({ id: 'vr2', match_id: match.id, match_game_id: 'game-1', discord_user_id: 'user-2', discord_message_id: 'msg-unvoted', voted_for: null });

      const evaluateSpy = vi.spyOn(handler as any, 'evaluateVotes').mockResolvedValue(undefined);
      const reaction = { emoji: { name: '🔵' }, message: { id: 'msg-unvoted' } };
      await handler.handleReaction(reaction as any, { id: 'user-2' } as any);

      const [row] = await getPgTestDb().select().from(discordWinnerVoteMessages).where(eq(discordWinnerVoteMessages.id, 'vr2'));
      expect(row.voted_for).toBe('blue');
      expect(evaluateSpy).toHaveBeenCalledWith(match.id, 'game-1');
    });
  });

  // ─── evaluateVotes ──────────────────────────────────────────────────────────

  describe('evaluateVotes', () => {
    let match: any;
    let submitSpy: any;
    let conflictSpy: any;
    let scorecardSpy: any;

    beforeEach(async () => {
      match = await createMatch(game.id, mode.id);
      submitSpy = vi.spyOn(handler as any, 'submitWinner').mockResolvedValue(undefined);
      conflictSpy = vi.spyOn(handler as any, 'notifyConflict').mockResolvedValue(undefined);
      scorecardSpy = vi.spyOn(handler as any, 'notifyScorecardRequired').mockResolvedValue(undefined);
      vi.spyOn(handler as any, 'checkStatsGate').mockResolvedValue(false);
    });

    async function insertVote(id: string, matchGameId: string, discordUserId: string, votedFor: string | null) {
      await createMatchGame(match.id, { id: matchGameId });
      await getPgTestDb().insert(discordWinnerVoteMessages).values({ id, match_id: match.id, match_game_id: matchGameId, discord_user_id: discordUserId, discord_message_id: `msg-${id}`, voted_for: votedFor as 'blue' | 'red' | null });
    }

    it('calls submitWinner when all commanders voted the same (consensus)', async () => {
      await insertVote('v1', 'game-ev', 'user-a', 'blue');
      await insertVote('v2', 'game-ev', 'user-b', 'blue');

      await (handler as any).evaluateVotes(match.id, 'game-ev');

      expect(submitSpy).toHaveBeenCalledWith(match.id, 'game-ev', 'blue');
      expect(conflictSpy).not.toHaveBeenCalled();
    });

    it('calls notifyConflict and NULLs winner when all voted but disagree', async () => {
      await insertVote('v3', 'game-conflict', 'user-a', 'blue');
      await insertVote('v4', 'game-conflict', 'user-b', 'red');

      await (handler as any).evaluateVotes(match.id, 'game-conflict');

      expect(conflictSpy).toHaveBeenCalledOnce();
      expect(submitSpy).not.toHaveBeenCalled();
    });

    it('calls notifyScorecardRequired instead of submitWinner when stats gate is blocked', async () => {
      vi.spyOn(handler as any, 'checkStatsGate').mockResolvedValue(true);
      await insertVote('v5', 'game-blocked', 'user-a', 'red');
      await insertVote('v6', 'game-blocked', 'user-b', 'red');

      await (handler as any).evaluateVotes(match.id, 'game-blocked');

      expect(scorecardSpy).toHaveBeenCalledOnce();
      expect(submitSpy).not.toHaveBeenCalled();
    });

    it('sets provisional winner when only some have voted and they agree', async () => {
      await insertVote('v7', 'game-partial', 'user-a', 'blue');
      await insertVote('v8', 'game-partial', 'user-b', null);

      await (handler as any).evaluateVotes(match.id, 'game-partial');

      expect(submitSpy).not.toHaveBeenCalled();
      expect(conflictSpy).not.toHaveBeenCalled();
    });

    it('does nothing when no one has voted yet', async () => {
      await insertVote('v9', 'game-novotes', 'user-a', null);
      await insertVote('v10', 'game-novotes', 'user-b', null);

      await (handler as any).evaluateVotes(match.id, 'game-novotes');

      expect(submitSpy).not.toHaveBeenCalled();
      expect(conflictSpy).not.toHaveBeenCalled();
    });

    it('returns early when there are no vote records', async () => {
      await (handler as any).evaluateVotes(match.id, 'game-empty');
      expect(submitSpy).not.toHaveBeenCalled();
    });
  });

  // ─── checkStatsGate ─────────────────────────────────────────────────────────

  describe('checkStatsGate', () => {
    it('returns false when match has stats_enabled=0', async () => {
      const match = await createMatch(game.id, mode.id);
      const result = await (handler as any).checkStatsGate(match.id, 'game-1');
      expect(result).toBe(false);
    });

    it('returns false when stats_enabled=1 but no stat definitions exist', async () => {
      const match = await createMatch(game.id, mode.id);
      await getPgTestDb().update(matches).set({ stats_enabled: true }).where(eq(matches.id, match.id));
      const result = await (handler as any).checkStatsGate(match.id, 'game-1');
      expect(result).toBe(false);
    });

    it('returns true when stats_enabled=1, stat defs exist, and no submission for this game', async () => {
      const match = await createMatch(game.id, mode.id);
      await getPgTestDb().update(matches).set({ stats_enabled: true }).where(eq(matches.id, match.id));
      await getPgTestDb().insert(gameStatDefinitions).values({ id: 'stat-def-1', game_id: game.id, name: 'kills', display_name: 'Kills' });
      const result = await (handler as any).checkStatsGate(match.id, 'game-no-sub');
      expect(result).toBe(true);
    });

    it('returns false when stats_enabled=1, stat defs exist, and a submission already exists', async () => {
      const match = await createMatch(game.id, mode.id);
      await getPgTestDb().update(matches).set({ stats_enabled: true }).where(eq(matches.id, match.id));
      await getPgTestDb().insert(gameStatDefinitions).values({ id: 'stat-def-2', game_id: game.id, name: 'deaths', display_name: 'Deaths' });
      await createMatchGame(match.id, { id: 'game-has-sub' });
      await getPgTestDb().insert(scorecardSubmissions).values({ id: 'sub-existing', match_id: match.id, match_game_id: 'game-has-sub', team_side: 'blue', screenshot_url: 'http://example.com/img.png' });
      const result = await (handler as any).checkStatsGate(match.id, 'game-has-sub');
      expect(result).toBe(false);
    });
  });

  // ─── submitWinner ───────────────────────────────────────────────────────────

  describe('submitWinner', () => {
    const addGame = (matchId: string, id: string, status: 'pending' | 'ongoing' | 'completed' = 'ongoing') =>
      createMatchGame(matchId, { id, round: 1, status });

    it('calls saveMatchResult mapping blue to team1', async () => {
      const { saveMatchResult } = await import('@/lib/matches/results');
      const match = await createMatch(game.id, mode.id, { status: 'battle' });
      await addGame(match.id, 'game-sw');

      await handler.submitWinner(match.id, 'game-sw', 'blue');

      expect(saveMatchResult).toHaveBeenCalledWith(expect.anything(), 'game-sw', expect.objectContaining({
        matchId: match.id,
        winner: 'team1',
      }), expect.anything());
    });

    it('calls saveMatchResult mapping red to team2', async () => {
      const { saveMatchResult } = await import('@/lib/matches/results');
      const match = await createMatch(game.id, mode.id, { status: 'battle' });
      await addGame(match.id, 'game-sw2');

      await handler.submitWinner(match.id, 'game-sw2', 'red');

      expect(saveMatchResult).toHaveBeenCalledWith(expect.anything(), 'game-sw2', expect.objectContaining({
        matchId: match.id,
        winner: 'team2',
      }), expect.anything());
    });

    it('never passes rescore, so it cannot overwrite a result', async () => {
      const { saveMatchResult } = await import('@/lib/matches/results');
      const match = await createMatch(game.id, mode.id, { status: 'battle' });
      await addGame(match.id, 'game-sw3');

      await handler.submitWinner(match.id, 'game-sw3', 'blue');

      const result = vi.mocked(saveMatchResult).mock.calls[0][2];
      expect(result.rescore).toBeUndefined();
    });

    it('does not override a map that was already scored', async () => {
      const { saveMatchResult } = await import('@/lib/matches/results');
      const match = await createMatch(game.id, mode.id, { status: 'battle' });
      await addGame(match.id, 'game-done', 'completed');

      await handler.submitWinner(match.id, 'game-done', 'red');

      expect(saveMatchResult).not.toHaveBeenCalled();
    });

    it('does not score a match that is no longer in battle', async () => {
      const { saveMatchResult } = await import('@/lib/matches/results');
      const match = await createMatch(game.id, mode.id, { status: 'complete' });
      await addGame(match.id, 'game-late');

      await handler.submitWinner(match.id, 'game-late', 'blue');

      expect(saveMatchResult).not.toHaveBeenCalled();
    });

    it('treats a concurrent first score as a no-op, not an error', async () => {
      const { saveMatchResult } = await import('@/lib/matches/results');
      const { logger } = await import('../../../src/lib/logger/server');
      const { GameAlreadyScoredError } = await import('@/lib/matches/results');
      vi.mocked(saveMatchResult).mockRejectedValueOnce(new GameAlreadyScoredError('game-race'));
      const match = await createMatch(game.id, mode.id, { status: 'battle' });
      await addGame(match.id, 'game-race');

      await handler.submitWinner(match.id, 'game-race', 'blue');

      expect(logger.error).not.toHaveBeenCalled();
    });
  });
});
