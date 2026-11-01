// @vitest-environment node
/** ScorecardHandler on Postgres (ported from scorecard-handler{,-extended}.test.ts): prompts, DM replies, blob storage. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { PNG_BYTES, addMatchGame, addParticipant, seedStatsMatch, type StatsFixture } from '../../utils/pg-stats-fixtures';
import { blobs, gameStatDefinitions, matchGames, scorecardDmMessages, scorecardSubmissions, statsProcessingQueue, statsSettings } from '../../../lib/db/schema';
import { db } from '../../../lib/db';
import { recordScorecardDm } from '../../../src/lib/stats';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('discord.js', () => ({
  EmbedBuilder: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.data = { fields: [] };
    this.setTitle = vi.fn().mockReturnThis();
    this.setDescription = vi.fn().mockReturnThis();
    this.setColor = vi.fn().mockReturnThis();
    this.setFooter = vi.fn().mockReturnThis();
    return this;
  }),
}));

import { ScorecardHandler } from '../../../processes/discord-bot/modules/scorecard-handler';

setupPgTestFile();
const pg = () => getPgTestDb();

let fx: StatsFixture;
let mockClient: any;
let handler: ScorecardHandler;
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  vi.clearAllMocks();
  fx = await seedStatsMatch();
  mockClient = { users: { fetch: vi.fn().mockResolvedValue({ send: vi.fn().mockResolvedValue({ id: 'dm-msg-123' }) }) } };
  handler = new ScorecardHandler(mockClient, null);
});
afterEach(() => { globalThis.fetch = originalFetch; });

const dm = (over: Partial<Parameters<typeof recordScorecardDm>[1]> & { discordUserId: string; discordMessageId: string }) =>
  recordScorecardDm(db, { matchId: fx.match.id, matchGameId: fx.matchGameId, participantId: null, teamSide: 'blue', ...over });

function replyMessage(opts: { ref?: string | null; userId: string; id?: string; attachment?: { url: string; contentType: string | null; name: string } | null }) {
  return {
    reference: opts.ref === null ? null : { messageId: opts.ref },
    author: { id: opts.userId },
    id: opts.id ?? 'reply-1',
    reply: vi.fn().mockResolvedValue(undefined),
    attachments: { filter: vi.fn().mockReturnValue(opts.attachment ? { size: 1, first: () => opts.attachment } : { size: 0, first: vi.fn() }) },
  };
}
const mockDownload = (ok = true, bytes: Buffer = PNG_BYTES) => {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok, arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)) }) as never;
};
const png = { url: 'https://cdn.example.com/sc.png', contentType: 'image/png', name: 'sc.png' };

describe('sendScorecardPrompts', () => {
  it('returns false when stats are disabled (no stats_settings row)', async () => {
    expect(await handler.sendScorecardPrompts(fx.match.id, fx.matchGameId, 'Test Map')).toBe(false);
  });

  it('returns false when stats are enabled but the game has no stat definitions', async () => {
    await pg().insert(statsSettings).values({ id: 1, enabled: true });
    expect(await handler.sendScorecardPrompts(fx.match.id, fx.matchGameId, 'Test Map')).toBe(false);
  });

  it('returns false when the match is not found', async () => {
    await pg().insert(statsSettings).values({ id: 1, enabled: true });
    expect(await handler.sendScorecardPrompts('nonexistent-match', 'game-1', 'Test Map')).toBe(false);
  });

  it('returns false when no commanders are configured', async () => {
    await pg().insert(statsSettings).values({ id: 1, enabled: true });
    await pg().insert(gameStatDefinitions).values({ id: 'kills', game_id: fx.game.id, name: 'kills', display_name: 'Kills' });
    await addParticipant(fx.match.id); // not a commander (receives_map_codes = false)
    expect(await handler.sendScorecardPrompts(fx.match.id, fx.matchGameId, 'Test Map')).toBe(false);
  });

  it('DMs the commanders, records the prompt and returns true', async () => {
    await pg().insert(statsSettings).values({ id: 1, enabled: true });
    await pg().insert(gameStatDefinitions).values({ id: 'kills', game_id: fx.game.id, name: 'kills', display_name: 'Kills' });
    const c = await addParticipant(fx.match.id, { receives_map_codes: true, discord_user_id: 'discord-u1', username: 'Commander' });

    expect(await handler.sendScorecardPrompts(fx.match.id, fx.matchGameId, 'Test Map')).toBe(true);
    expect(mockClient.users.fetch).toHaveBeenCalledWith('discord-u1');
    const [row] = await pg().select().from(scorecardDmMessages);
    expect(row).toMatchObject({ match_id: fx.match.id, match_game_id: fx.matchGameId, discord_user_id: 'discord-u1', discord_message_id: 'dm-msg-123', participant_id: c.id });
  });

  it('returns false when every DM fails', async () => {
    await pg().insert(statsSettings).values({ id: 1, enabled: true });
    await pg().insert(gameStatDefinitions).values({ id: 'kills', game_id: fx.game.id, name: 'kills', display_name: 'Kills' });
    await addParticipant(fx.match.id, { receives_map_codes: true });
    mockClient.users.fetch.mockRejectedValue(new Error('cannot DM'));
    expect(await handler.sendScorecardPrompts(fx.match.id, fx.matchGameId, 'Test Map')).toBe(false);
    expect(await pg().select().from(scorecardDmMessages)).toHaveLength(0);
  });
});

describe('handleNonReplyDM', () => {
  it('does not reply when the user has no pending scorecard records', async () => {
    const msg = { author: { id: 'user-no-pending' }, reply: vi.fn() };
    await handler.handleNonReplyDM(msg as never);
    expect(msg.reply).not.toHaveBeenCalled();
  });

  it('replies with instructions when the user has a pending scorecard on an ongoing map', async () => {
    await dm({ discordUserId: 'u-one', discordMessageId: 'msg-one' });
    const msg = { author: { id: 'u-one' }, reply: vi.fn().mockResolvedValue(undefined) };
    await handler.handleNonReplyDM(msg as never);
    expect(msg.reply).toHaveBeenCalledOnce();
    expect(msg.reply.mock.calls[0][0]).toContain('reply directly');
  });

  it('does not reply when the map is not ongoing', async () => {
    await pg().update(matchGames).set({ status: 'completed' }).where(eq(matchGames.id, fx.matchGameId));
    await dm({ discordUserId: 'u-notong', discordMessageId: 'msg-notong' });
    const msg = { author: { id: 'u-notong' }, reply: vi.fn() };
    await handler.handleNonReplyDM(msg as never);
    expect(msg.reply).not.toHaveBeenCalled();
  });

  it('does not reply for a different user', async () => {
    await dm({ discordUserId: 'u-A', discordMessageId: 'msg-diff' });
    const msg = { author: { id: 'u-B' }, reply: vi.fn() };
    await handler.handleNonReplyDM(msg as never);
    expect(msg.reply).not.toHaveBeenCalled();
  });

  it('replies when any of several pending maps is ongoing', async () => {
    const map2 = await addMatchGame(fx.match.id, 2, 'completed');
    await dm({ discordUserId: 'u-many', discordMessageId: 'm-a', matchGameId: map2 });
    await dm({ discordUserId: 'u-many', discordMessageId: 'm-b' });
    const msg = { author: { id: 'u-many' }, reply: vi.fn().mockResolvedValue(undefined) };
    await handler.handleNonReplyDM(msg as never);
    expect(msg.reply).toHaveBeenCalledOnce();
  });
});

describe('handleDMReply', () => {
  it('returns early when the message has no reference', async () => {
    const msg = replyMessage({ ref: null, userId: 'u' });
    await handler.handleDMReply(msg as never);
    expect(msg.reply).not.toHaveBeenCalled();
  });

  it('returns early when the replied message is not a scorecard DM', async () => {
    const msg = replyMessage({ ref: 'unknown-msg', userId: 'u' });
    await handler.handleDMReply(msg as never);
    expect(msg.reply).not.toHaveBeenCalled();
  });

  it('ignores a reply to a prompt that belongs to another user', async () => {
    await dm({ discordUserId: 'owner', discordMessageId: 'msg-x' });
    const msg = replyMessage({ ref: 'msg-x', userId: 'intruder', attachment: png });
    await handler.handleDMReply(msg as never);
    expect(msg.reply).not.toHaveBeenCalled();
  });

  it('asks for an image when no image attachment is provided (also when non-images were filtered out)', async () => {
    await dm({ discordUserId: 'user-reply', discordMessageId: 'msg-scorecard' });
    const msg = replyMessage({ ref: 'msg-scorecard', userId: 'user-reply' });
    await handler.handleDMReply(msg as never);
    expect(msg.reply).toHaveBeenCalledOnce();
    expect(msg.reply.mock.calls[0][0]).toContain('screenshot image');
    expect(await pg().select().from(scorecardSubmissions)).toHaveLength(0);
  });

  it('replies with an error when the attachment download fails and stores nothing', async () => {
    await dm({ discordUserId: 'disc-dlf', discordMessageId: 'msg-dlf' });
    mockDownload(false);
    const msg = replyMessage({ ref: 'msg-dlf', userId: 'disc-dlf', attachment: png });
    await handler.handleDMReply(msg as never);
    expect(msg.reply).toHaveBeenCalledOnce();
    expect(msg.reply.mock.calls[0][0]).toContain('Failed');
    expect(await pg().select().from(blobs)).toHaveLength(0);
    expect(await pg().select().from(scorecardSubmissions)).toHaveLength(0);
  });

  it('stores the screenshot as a blob and creates the submission and the extraction job together', async () => {
    const p = await addParticipant(fx.match.id, { discord_user_id: 'user-img', username: 'Tester' });
    await dm({ discordUserId: 'user-img', discordMessageId: 'msg-sc-dm', participantId: p.id, teamSide: 'red' });
    mockDownload();
    const msg = replyMessage({ ref: 'msg-sc-dm', userId: 'user-img', id: 'reply-msg-img', attachment: png });

    await handler.handleDMReply(msg as never);

    expect(msg.reply.mock.calls[0][0]).toContain('Screenshot received');
    const [sub] = await pg().select().from(scorecardSubmissions);
    expect(sub).toMatchObject({
      match_id: fx.match.id, match_game_id: fx.matchGameId, submitted_by_discord_user_id: 'user-img', submitted_by_participant_id: p.id,
      team_side: 'red', discord_message_id: 'reply-msg-img',
    });
    expect(sub.screenshot_url).toMatch(new RegExp(`^/uploads/scorecards/${fx.match.id}/\\d+_[0-9a-f]{16}\\.png$`));
    const [blob] = await pg().select().from(blobs);
    expect(blob).toMatchObject({ path: sub.screenshot_url, kind: 'scorecard', owner_type: 'match', owner_id: fx.match.id, content_type: 'image/png', size: PNG_BYTES.length });
    const [job] = await pg().select().from(statsProcessingQueue);
    expect(job).toMatchObject({ submission_id: sub.id, match_id: fx.match.id, match_game_id: fx.matchGameId, status: 'pending' });
  });

  it('defaults the side to blue when the prompt had none, and the extension to .jpg for unknown types', async () => {
    await dm({ discordUserId: 'u-def', discordMessageId: 'msg-def', teamSide: null });
    mockDownload();
    const msg = replyMessage({ ref: 'msg-def', userId: 'u-def', attachment: { url: 'https://cdn.example.com/x', contentType: 'application/octet-stream', name: 'x.png' } });
    await handler.handleDMReply(msg as never);
    const [sub] = await pg().select().from(scorecardSubmissions);
    expect(sub.team_side).toBe('blue');
    expect(sub.screenshot_url).toMatch(/\.jpg$/);
  });

  it('a second DM reply for the same map creates a second submission', async () => {
    await dm({ discordUserId: 'disc-2nd', discordMessageId: 'msg-2nd-a' });
    await dm({ discordUserId: 'disc-2nd', discordMessageId: 'msg-2nd-b' });
    mockDownload();
    await handler.handleDMReply(replyMessage({ ref: 'msg-2nd-a', userId: 'disc-2nd', id: 'reply-a', attachment: png }) as never);
    await handler.handleDMReply(replyMessage({ ref: 'msg-2nd-b', userId: 'disc-2nd', id: 'reply-b', attachment: png }) as never);
    expect(await pg().select().from(scorecardSubmissions)).toHaveLength(2);
    expect(await pg().select().from(blobs)).toHaveLength(2);
  });

  it('handling the same reply message twice creates one submission', async () => {
    await dm({ discordUserId: 'disc-dup', discordMessageId: 'msg-dup' });
    mockDownload();
    const msg = () => replyMessage({ ref: 'msg-dup', userId: 'disc-dup', id: 'reply-dup', attachment: png });
    await handler.handleDMReply(msg() as never);
    await handler.handleDMReply(msg() as never);
    expect(await pg().select().from(scorecardSubmissions)).toHaveLength(1);
    expect(await pg().select().from(statsProcessingQueue)).toHaveLength(1);
  });

  it('triggers a held winner vote once the scorecard arrived', async () => {
    const winnerVote = { submitWinner: vi.fn().mockResolvedValue(undefined) };
    handler.setWinnerVoteHandler(winnerVote as never);
    const { discordWinnerVoteMessages } = await import('../../../lib/db/schema');
    const c = await addParticipant(fx.match.id, { receives_map_codes: true });
    await pg().insert(discordWinnerVoteMessages).values({
      id: 'v1', match_id: fx.match.id, match_game_id: fx.matchGameId, discord_user_id: 'd1', discord_message_id: 'vm1', participant_id: c.id, voted_for: 'blue',
    });
    await dm({ discordUserId: 'u-vote', discordMessageId: 'msg-vote' });
    mockDownload();
    await handler.handleDMReply(replyMessage({ ref: 'msg-vote', userId: 'u-vote', attachment: png }) as never);
    expect(winnerVote.submitWinner).toHaveBeenCalledWith(fx.match.id, fx.matchGameId, 'blue');
  });
});

describe('updateSettings', () => {
  it('accepts a new non-null value and null', () => {
    expect(() => handler.updateSettings({ guild_id: 'g-new', bot_token: 'tok-new' } as never)).not.toThrow();
    expect(() => handler.updateSettings(null)).not.toThrow();
  });
});
