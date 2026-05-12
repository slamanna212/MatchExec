import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { mockDiscordClient, resetDiscordMocks } from '../../mocks/discord';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch, createMatchParticipant } from '../../utils/fixtures';

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

vi.mock('@/lib/scoring-functions', () => ({
  saveMatchResult: vi.fn().mockResolvedValue(undefined),
}));

let WinnerVoteHandler: any;

describe('WinnerVoteHandler', () => {
  let handler: any;
  let db: any;
  let game: any;
  let mode: any;

  beforeAll(async () => {
    const mod = await import('../../../processes/discord-bot/modules/winner-vote-handler');
    WinnerVoteHandler = mod.WinnerVoteHandler;
  });

  beforeEach(async () => {
    resetDiscordMocks();
    db = getTestDb();
    const testData = await seedBasicTestData();
    game = testData.game;
    mode = testData.mode;
    handler = new WinnerVoteHandler(mockDiscordClient as any, db);
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
      await db.run(
        `UPDATE match_participants SET receives_map_codes = 1, team_assignment = 'blue' WHERE id = ?`,
        [participant.id]
      );

      const mockMessage = { id: 'msg-sent-1', react: vi.fn().mockResolvedValue(undefined) };
      const mockUser = { send: vi.fn().mockResolvedValue(mockMessage) };
      mockDiscordClient.users.fetch = vi.fn().mockResolvedValue(mockUser);

      const result = await handler.sendWinnerVotePrompts(match.id, 'game-1', 'Hanamura');

      expect(result).toBe(true);
      expect(mockUser.send).toHaveBeenCalledOnce();
      expect(mockMessage.react).toHaveBeenCalledWith('🔵');
      expect(mockMessage.react).toHaveBeenCalledWith('🔴');

      const voteRow = await db.get(
        `SELECT * FROM discord_winner_vote_messages WHERE discord_message_id = ?`,
        ['msg-sent-1']
      );
      expect(voteRow).toBeTruthy();
      expect(voteRow.match_id).toBe(match.id);
      expect(voteRow.team_side).toBe('blue');
    });

    it('returns true even when one DM fails, as long as one succeeds', async () => {
      const match = await createMatch(game.id, mode.id);
      const p1 = await createMatchParticipant(match.id, 'discord-ok', 'OK');
      const p2 = await createMatchParticipant(match.id, 'discord-fail', 'Fail');
      await db.run(`UPDATE match_participants SET receives_map_codes = 1 WHERE id = ?`, [p1.id]);
      await db.run(`UPDATE match_participants SET receives_map_codes = 1 WHERE id = ?`, [p2.id]);

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
      const rows = await db.all(`SELECT * FROM discord_winner_vote_messages`);
      expect(rows).toHaveLength(0);
    });

    it('does nothing when no vote record exists for the message', async () => {
      const match = await createMatch(game.id, mode.id);
      const reaction = { emoji: { name: '🔵' }, message: { id: 'nonexistent-msg' } };
      await handler.handleReaction(reaction as any, { id: 'user-1' } as any);
      const row = await db.get(
        `SELECT * FROM discord_winner_vote_messages WHERE match_id = ?`,
        [match.id]
      );
      expect(row).toBeUndefined();
    });

    it('does not double-count a reaction when commander has already voted', async () => {
      const match = await createMatch(game.id, mode.id);
      await db.run(
        `INSERT INTO discord_winner_vote_messages
           (id, match_id, match_game_id, discord_user_id, discord_message_id, voted_for)
         VALUES ('vr1', ?, 'game-1', 'user-1', 'msg-already-voted', 'blue')`,
        [match.id]
      );

      const reaction = { emoji: { name: '🔴' }, message: { id: 'msg-already-voted' } };
      await handler.handleReaction(reaction as any, { id: 'user-1' } as any);

      const row = await db.get(
        `SELECT voted_for FROM discord_winner_vote_messages WHERE id = 'vr1'`
      );
      expect(row.voted_for).toBe('blue');
    });

    it('records vote and calls evaluateVotes on a valid unvoted reaction', async () => {
      const match = await createMatch(game.id, mode.id);
      await db.run(
        `INSERT INTO discord_winner_vote_messages
           (id, match_id, match_game_id, discord_user_id, discord_message_id, voted_for)
         VALUES ('vr2', ?, 'game-1', 'user-2', 'msg-unvoted', NULL)`,
        [match.id]
      );

      const evaluateSpy = vi.spyOn(handler as any, 'evaluateVotes').mockResolvedValue(undefined);
      const reaction = { emoji: { name: '🔵' }, message: { id: 'msg-unvoted' } };
      await handler.handleReaction(reaction as any, { id: 'user-2' } as any);

      const row = await db.get(
        `SELECT voted_for FROM discord_winner_vote_messages WHERE id = 'vr2'`
      );
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
      await db.run(
        `INSERT INTO discord_winner_vote_messages
           (id, match_id, match_game_id, discord_user_id, discord_message_id, voted_for)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, match.id, matchGameId, discordUserId, `msg-${id}`, votedFor]
      );
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
      await db.run(`UPDATE matches SET stats_enabled = 1 WHERE id = ?`, [match.id]);
      const result = await (handler as any).checkStatsGate(match.id, 'game-1');
      expect(result).toBe(false);
    });

    it('returns true when stats_enabled=1, stat defs exist, and no submission for this game', async () => {
      const match = await createMatch(game.id, mode.id);
      await db.run(`UPDATE matches SET stats_enabled = 1 WHERE id = ?`, [match.id]);
      await db.run(
        `INSERT INTO game_stat_definitions (id, game_id, name, display_name) VALUES (?, ?, ?, ?)`,
        ['stat-def-1', game.id, 'kills', 'Kills']
      );
      const result = await (handler as any).checkStatsGate(match.id, 'game-no-sub');
      expect(result).toBe(true);
    });

    it('returns false when stats_enabled=1, stat defs exist, and a submission already exists', async () => {
      const match = await createMatch(game.id, mode.id);
      await db.run(`UPDATE matches SET stats_enabled = 1 WHERE id = ?`, [match.id]);
      await db.run(
        `INSERT INTO game_stat_definitions (id, game_id, name, display_name) VALUES (?, ?, ?, ?)`,
        ['stat-def-2', game.id, 'deaths', 'Deaths']
      );
      await db.run(
        `INSERT INTO scorecard_submissions
           (id, match_id, match_game_id, team_side, screenshot_url)
         VALUES ('sub-existing', ?, 'game-has-sub', 'blue', 'http://example.com/img.png')`,
        [match.id]
      );
      const result = await (handler as any).checkStatsGate(match.id, 'game-has-sub');
      expect(result).toBe(false);
    });
  });

  // ─── submitWinner ───────────────────────────────────────────────────────────

  describe('submitWinner', () => {
    it('calls saveMatchResult mapping blue to team1', async () => {
      const { saveMatchResult } = await import('@/lib/scoring-functions');
      const match = await createMatch(game.id, mode.id);

      await handler.submitWinner(match.id, 'game-sw', 'blue');

      expect(saveMatchResult).toHaveBeenCalledWith('game-sw', expect.objectContaining({
        matchId: match.id,
        winner: 'team1',
      }));
    });

    it('calls saveMatchResult mapping red to team2', async () => {
      const { saveMatchResult } = await import('@/lib/scoring-functions');
      const match = await createMatch(game.id, mode.id);

      await handler.submitWinner(match.id, 'game-sw2', 'red');

      expect(saveMatchResult).toHaveBeenCalledWith('game-sw2', expect.objectContaining({
        matchId: match.id,
        winner: 'team2',
      }));
    });
  });
});
