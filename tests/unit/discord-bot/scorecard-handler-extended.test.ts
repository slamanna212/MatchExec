import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch, createMatchParticipant } from '../../utils/fixtures';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('discord.js', () => ({
  EmbedBuilder: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.data = { fields: [] as unknown[] };
    this.setTitle = vi.fn().mockReturnThis();
    this.setDescription = vi.fn().mockReturnThis();
    this.setColor = vi.fn().mockReturnThis();
    this.setFooter = vi.fn().mockReturnThis();
    return this;
  }),
}));

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn<() => boolean>().mockReturnValue(false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('fs', () => ({
  default: fsMocks,
  existsSync: fsMocks.existsSync,
  mkdirSync: fsMocks.mkdirSync,
  writeFileSync: fsMocks.writeFileSync,
}));

import { ScorecardHandler } from '../../../processes/discord-bot/modules/scorecard-handler';

describe('ScorecardHandler — Extended', () => {
   
  let db: any;
   
  let game: any;
   
  let mode: any;
   
  let mockClient: any;
  let handler: ScorecardHandler;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    db = getTestDb();
    vi.clearAllMocks();
    fsMocks.existsSync.mockReturnValue(true);

    mockClient = {
      users: {
        fetch: vi.fn().mockResolvedValue({
          send: vi.fn().mockResolvedValue({ id: 'dm-msg-ext' }),
        }),
      },
    };

    handler = new ScorecardHandler(mockClient, db, null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function insertMatchGame(matchId: string, id: string) {
    await db.run(
      `INSERT INTO match_games (id, match_id, round, status) VALUES (?, ?, 1, 'ongoing')`,
      [id, matchId]
    );
  }

  async function insertScorecardDm(opts: {
    id: string; matchId: string; matchGameId: string;
    discordUserId: string; messageId: string; participantId?: string; teamSide?: string;
  }) {
    await db.run(
      `INSERT INTO scorecard_dm_messages
         (id, match_id, match_game_id, discord_user_id, discord_message_id, participant_id, team_side)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [opts.id, opts.matchId, opts.matchGameId, opts.discordUserId, opts.messageId,
        opts.participantId ?? null, opts.teamSide ?? 'blue']
    );
  }

  describe('handleNonReplyDM — extended', () => {
    it('does not reply when match_game is not ongoing', async () => {
      const match = await createMatch(game.id, mode.id);
      const mgId = `mg-ext-notong-${Date.now()}`;
      await db.run(
        `INSERT INTO match_games (id, match_id, round, status) VALUES (?, ?, 1, 'completed')`,
        [mgId, match.id]
      );
      await insertScorecardDm({ id: 'dm-notong', matchId: match.id, matchGameId: mgId, discordUserId: 'u-notong', messageId: 'msg-notong' });

      const msg = { author: { id: 'u-notong' }, reply: vi.fn() };
      await handler.handleNonReplyDM(msg as never);
      expect(msg.reply).not.toHaveBeenCalled();
    });

    it('replies when there is exactly one ongoing match game with pending scorecard', async () => {
      const match = await createMatch(game.id, mode.id);
      const mgId = `mg-ext-one-${Date.now()}`;
      await insertMatchGame(match.id, mgId);
      await insertScorecardDm({ id: 'dm-one', matchId: match.id, matchGameId: mgId, discordUserId: 'u-one', messageId: 'msg-one' });

      const msg = { author: { id: 'u-one' }, reply: vi.fn().mockResolvedValue(undefined) };
      await handler.handleNonReplyDM(msg as never);
      expect(msg.reply).toHaveBeenCalledOnce();
    });

    it('does not reply for a different user even if pending scorecard exists', async () => {
      const match = await createMatch(game.id, mode.id);
      const mgId = `mg-ext-diff-${Date.now()}`;
      await insertMatchGame(match.id, mgId);
      await insertScorecardDm({ id: 'dm-diff', matchId: match.id, matchGameId: mgId, discordUserId: 'u-A', messageId: 'msg-diff' });

      const msg = { author: { id: 'u-B' }, reply: vi.fn() };
      await handler.handleNonReplyDM(msg as never);
      expect(msg.reply).not.toHaveBeenCalled();
    });
  });

  describe('handleDMReply — extended', () => {
    it('returns early when message has no reference', async () => {
      const msg = { reference: null, author: { id: 'u-noref' }, reply: vi.fn() };
      await handler.handleDMReply(msg as never);
      expect(msg.reply).not.toHaveBeenCalled();
    });

    it('returns early when reference does not match any scorecard DM record', async () => {
      const msg = {
        reference: { messageId: 'no-such-message' },
        author: { id: 'u-nomatch' },
        reply: vi.fn(),
        attachments: { filter: vi.fn().mockReturnValue({ size: 0, first: vi.fn() }) },
      };
      await handler.handleDMReply(msg as never);
      expect(msg.reply).not.toHaveBeenCalled();
    });

    it('replies with error when attachment download fetch fails', async () => {
      const match = await createMatch(game.id, mode.id);
      const mgId = `mg-ext-dlf-${Date.now()}`;
      await insertMatchGame(match.id, mgId);
      const p = await createMatchParticipant(match.id, 'disc-dlf', 'DlFailPlayer');
      await insertScorecardDm({
        id: 'dm-dlf', matchId: match.id, matchGameId: mgId,
        discordUserId: 'disc-dlf', messageId: 'msg-dlf', participantId: p.id, teamSide: 'blue',
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false }) as never;

      const mockAttachment = { url: 'https://cdn.example.com/img.png', contentType: 'image/png', name: 'img.png' };
      const msg = {
        reference: { messageId: 'msg-dlf' },
        author: { id: 'disc-dlf' },
        id: 'reply-dlf',
        reply: vi.fn().mockResolvedValue(undefined),
        attachments: { filter: vi.fn().mockReturnValue({ size: 1, first: () => mockAttachment }) },
      };

      await handler.handleDMReply(msg as never);
      globalThis.fetch = originalFetch;

      expect(msg.reply).toHaveBeenCalledOnce();
      expect(msg.reply.mock.calls[0][0]).toContain('Failed');
    });

    it('filters out non-image attachments and replies with error', async () => {
      const match = await createMatch(game.id, mode.id);
      const mgId = `mg-ext-nonimg-${Date.now()}`;
      await insertMatchGame(match.id, mgId);
      await insertScorecardDm({
        id: 'dm-nonimg', matchId: match.id, matchGameId: mgId,
        discordUserId: 'u-nonimg', messageId: 'msg-nonimg',
      });

      // Simulate attachments.filter returning empty (non-image content type filtered out)
      const msg = {
        reference: { messageId: 'msg-nonimg' },
        author: { id: 'u-nonimg' },
        id: 'reply-nonimg',
        reply: vi.fn().mockResolvedValue(undefined),
        attachments: { filter: vi.fn().mockReturnValue({ size: 0, first: vi.fn() }) },
      };

      await handler.handleDMReply(msg as never);

      expect(msg.reply).toHaveBeenCalledOnce();
      expect(msg.reply.mock.calls[0][0]).toContain('screenshot image');
    });

    it('creates submission and processing queue entry on success', async () => {
      const match = await createMatch(game.id, mode.id);
      const mgId = `mg-ext-ok-${Date.now()}`;
      await insertMatchGame(match.id, mgId);
      const p = await createMatchParticipant(match.id, 'disc-ok-ext', 'OkPlayer');
      await insertScorecardDm({
        id: 'dm-ok', matchId: match.id, matchGameId: mgId,
        discordUserId: 'disc-ok-ext', messageId: 'msg-ok', participantId: p.id, teamSide: 'red',
      });

      fsMocks.existsSync.mockReturnValue(true);
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(200)),
      }) as never;

      const mockAttachment = { url: 'https://cdn.example.com/sc.png', contentType: 'image/png', name: 'sc.png' };
      const msg = {
        reference: { messageId: 'msg-ok' },
        author: { id: 'disc-ok-ext' },
        id: 'reply-ok',
        reply: vi.fn().mockResolvedValue(undefined),
        attachments: { filter: vi.fn().mockReturnValue({ size: 1, first: () => mockAttachment }) },
      };

      await handler.handleDMReply(msg as never);
      globalThis.fetch = originalFetch;

      expect(msg.reply).toHaveBeenCalledOnce();
      expect(msg.reply.mock.calls[0][0]).toContain('Screenshot received');

      const subs = await db.all(
        `SELECT * FROM scorecard_submissions WHERE match_id = ?`, [match.id]
      );
      expect(subs).toHaveLength(1);
      expect(subs[0].team_side).toBe('red');

      const queue = await db.all(
        `SELECT * FROM stats_processing_queue WHERE match_id = ?`, [match.id]
      );
      expect(queue).toHaveLength(1);
    });

    it('second DM reply for same match creates a second submission', async () => {
      const match = await createMatch(game.id, mode.id);
      const mgId = `mg-ext-2nd-${Date.now()}`;
      await insertMatchGame(match.id, mgId);
      const p = await createMatchParticipant(match.id, 'disc-2nd', '2ndPlayer');
      await insertScorecardDm({
        id: 'dm-2nd-a', matchId: match.id, matchGameId: mgId,
        discordUserId: 'disc-2nd', messageId: 'msg-2nd-a', participantId: p.id, teamSide: 'blue',
      });
      await insertScorecardDm({
        id: 'dm-2nd-b', matchId: match.id, matchGameId: mgId,
        discordUserId: 'disc-2nd', messageId: 'msg-2nd-b', participantId: p.id, teamSide: 'blue',
      });

      fsMocks.existsSync.mockReturnValue(true);
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      }) as never;

      const mockAttachment = { url: 'https://cdn.example.com/a.png', contentType: 'image/png', name: 'a.png' };
      const makeMsg = (refId: string, replyId: string) => ({
        reference: { messageId: refId },
        author: { id: 'disc-2nd' },
        id: replyId,
        reply: vi.fn().mockResolvedValue(undefined),
        attachments: { filter: vi.fn().mockReturnValue({ size: 1, first: () => mockAttachment }) },
      });

      await handler.handleDMReply(makeMsg('msg-2nd-a', 'reply-2nd-a') as never);
      await handler.handleDMReply(makeMsg('msg-2nd-b', 'reply-2nd-b') as never);
      globalThis.fetch = originalFetch;

      const subs = await db.all(
        `SELECT * FROM scorecard_submissions WHERE match_id = ?`, [match.id]
      );
      expect(subs).toHaveLength(2);
    });
  });

  describe('updateSettings', () => {
    it('updates settings to a new non-null value', () => {
      expect(() =>
        handler.updateSettings({ guild_id: 'g-new', bot_token: 'tok-new' } as never)
      ).not.toThrow();
    });

    it('updates settings to null', () => {
      expect(() => handler.updateSettings(null)).not.toThrow();
    });
  });
});
