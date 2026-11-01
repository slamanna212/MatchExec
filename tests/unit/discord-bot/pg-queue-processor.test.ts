// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile } from '../../utils/pg-test-db';
import { seedQueueFixtures } from '../../utils/pg-queue-fixtures';
import { db } from '../../../lib/db';
import {
  discordAnnouncementQueue, discordBotRequests, discordSettings, discordMatchWinnerQueue, discordVoiceAnnouncementQueue,
  discordStatsReportQueue, discordHealthAlertQueue, discordScorecardPromptQueue, discordWinnerVoteQueue, discordDeletionQueue,
  discordReminderQueue, discordMapCodeQueue, discordScoreNotificationQueue, discordStatusUpdateQueue, discordMatchMessages, matches,
  matchGames,
} from '../../../lib/db/schema';
import {
  enqueueAnnouncement, enqueueBotRequest, enqueueDeletion, enqueueHealthAlert, enqueueMapCode, enqueueMatchReminder,
  enqueueMatchWinner, enqueueScoreNotification, enqueueScorecardPrompt, enqueueStatsReport, enqueueStatusUpdate,
  enqueueVoiceAnnouncement, enqueueWinnerVote,
} from '../../../src/lib/discord-queues';

vi.mock('../../../src/lib/logger/server', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() } }));
vi.mock('discord.js', () => {
  const embed = () => ({ setTitle: vi.fn().mockReturnThis(), setImage: vi.fn().mockReturnThis(), addFields: vi.fn().mockReturnThis(), data: { fields: [] } });
  return {
    EmbedBuilder: Object.assign(vi.fn().mockImplementation(embed), { from: vi.fn().mockImplementation(embed) }),
    AttachmentBuilder: vi.fn().mockImplementation(() => ({})),
  };
});

setupPgTestFile();

let QueueProcessor: typeof import('../../../processes/discord-bot/modules/queue-processor').QueueProcessor;
beforeAll(async () => { ({ QueueProcessor } = await import('../../../processes/discord-bot/modules/queue-processor')); });

const client = { isReady: vi.fn(() => true), channels: { fetch: vi.fn() }, guilds: { fetch: vi.fn() } };

function make(handlers: Record<string, any> = {}) {
  const announcement = {
    postEventAnnouncement: vi.fn().mockResolvedValue({ success: true, mainMessage: { id: 'msg-1', channelId: 'c1' } }),
    postTimedReminder: vi.fn().mockResolvedValue({ success: true, messageId: 'rem-1' }),
    postMatchStartAnnouncement: vi.fn().mockResolvedValue({ success: true }),
    postMapScoreNotification: vi.fn().mockResolvedValue({ success: true, messageId: 'score-1' }),
    postMatchWinnerNotification: vi.fn().mockResolvedValue({ success: true, messageId: 'win-1' }),
    postTournamentWinnerNotification: vi.fn().mockResolvedValue({ success: true }),
    postHealthAlert: vi.fn().mockResolvedValue('alert-msg'),
    createMapsThread: vi.fn(),
    ...handlers.announcement,
  };
  const reminder = { sendPlayerReminders: vi.fn().mockResolvedValue(true), sendMapCodePMs: vi.fn().mockResolvedValue(true), ...handlers.reminder };
  const voice = { playTeamAnnouncements: vi.fn().mockResolvedValue({ success: true }), updateFirstTeam: vi.fn(), testVoiceLineForUser: vi.fn().mockResolvedValue({ success: true }), ...handlers.voice };
  const qp = new QueueProcessor(client as never, null, announcement as never, reminder as never, { createDiscordEvent: vi.fn(), deleteDiscordEvent: vi.fn() } as never, voice as never, null);
  return { qp, announcement, reminder, voice };
}

beforeEach(async () => {
  vi.clearAllMocks();
  client.isReady.mockReturnValue(true);
  await seedQueueFixtures();
  await db.insert(discordSettings).values({ id: 1, guild_id: 'guild-1', bot_token: 't', match_start_delay_seconds: 45 });
  // matches start in an hour (reminders for matches that already started are stale)
  const inAnHour = new Date(Date.now() + 3600_000);
  await db.update(matches).set({ name: 'Match One', status: 'gather', start_date: inAnHour, start_time: inAnHour });
});

const one = async <T extends { id: any }>(t: T, id: string) => (await db.select().from(t as never).where(eq((t as any).id, id)))[0] as any;

describe('announcements', () => {
  it('posts, records the message id, tracks the message and completes', async () => {
    const id = (await enqueueAnnouncement(db, { matchId: 'm1', type: 'standard' }))!;
    const { qp, announcement } = make();
    await qp.processAnnouncementQueue();
    expect(announcement.postEventAnnouncement).toHaveBeenCalledTimes(1);
    const row = await one(discordAnnouncementQueue, id);
    expect(row).toMatchObject({ status: 'completed', external_message_id: 'msg-1', attempts: 1, last_error: null });
    expect(row.posted_at).toBeInstanceOf(Date);
    expect(await db.select().from(discordMatchMessages).where(eq(discordMatchMessages.match_id, 'm1'))).toMatchObject([{ message_id: 'msg-1', channel_id: 'c1', message_type: 'announcement' }]);
  });

  it('timed announcements pass the jsonb timing data and honour scheduled_for', async () => {
    await enqueueAnnouncement(db, { matchId: 'm1', type: 'timed', data: { id: 'x', value: 1, unit: 'hours' }, scheduledFor: new Date(Date.now() - 1000) });
    const future = (await enqueueAnnouncement(db, { matchId: 'm2', type: 'timed', data: { id: 'y', value: 3, unit: 'hours' }, scheduledFor: new Date(Date.now() + 3600_000) }))!;
    const { qp, announcement } = make();
    await qp.processAnnouncementQueue();
    expect(announcement.postTimedReminder).toHaveBeenCalledTimes(1);
    expect(announcement.postTimedReminder.mock.calls[0][0]._timingInfo).toEqual({ id: 'x', value: 1, unit: 'hours' });
    expect((await one(discordAnnouncementQueue, future)).status).toBe('pending');
  });

  it('a thrown error goes back to pending with backoff; a "false" result fails permanently', async () => {
    const a = (await enqueueAnnouncement(db, { matchId: 'm1', type: 'standard' }))!;
    const b = (await enqueueAnnouncement(db, { matchId: 'm2', type: 'standard' }))!;
    const { qp, announcement } = make();
    announcement.postEventAnnouncement.mockRejectedValueOnce(new Error('discord down')).mockResolvedValueOnce(false);
    await qp.processAnnouncementQueue();
    const rows = [await one(discordAnnouncementQueue, a), await one(discordAnnouncementQueue, b)];
    const retried = rows.find((r) => r.last_error === 'discord down');
    expect(retried).toMatchObject({ status: 'pending', attempts: 1 });
    expect(retried.next_attempt_at.getTime()).toBeGreaterThan(Date.now());
    expect(rows.find((r) => r.last_error === 'Failed to post announcement')).toMatchObject({ status: 'failed' });
  });

  it('a retry after a crash does not post twice when the external message id is known', async () => {
    const id = (await enqueueAnnouncement(db, { matchId: 'm1', type: 'standard' }))!;
    await db.update(discordAnnouncementQueue).set({ external_message_id: 'already' }).where(eq(discordAnnouncementQueue.id, id));
    const { qp, announcement } = make();
    await qp.processAnnouncementQueue();
    expect(announcement.postEventAnnouncement).not.toHaveBeenCalled();
    expect((await one(discordAnnouncementQueue, id)).status).toBe('completed');
  });

  it('a missing match is retried with backoff, not lost', async () => {
    const id = (await enqueueAnnouncement(db, { matchId: 'ghost', type: 'standard' }))!;
    const { qp, announcement } = make();
    await qp.processAnnouncementQueue();
    expect(announcement.postEventAnnouncement).not.toHaveBeenCalled();
    expect(await one(discordAnnouncementQueue, id)).toMatchObject({ status: 'pending', last_error: 'Match or tournament not found' });
  });

  it('does nothing when the client is not ready', async () => {
    const id = (await enqueueAnnouncement(db, { matchId: 'm1', type: 'standard' }))!;
    client.isReady.mockReturnValue(false);
    await make().qp.processAnnouncementQueue();
    expect((await one(discordAnnouncementQueue, id)).status).toBe('pending');
  });
});

describe('other queues', () => {
  it('deletion + status update complete', async () => {
    const d = await enqueueDeletion(db, 'm1');
    const s = await enqueueStatusUpdate(db, 'm1', 'battle');
    const { qp } = make();
    await qp.processDeletionQueue();
    await qp.processStatusUpdateQueue();
    expect((await one(discordDeletionQueue, d)).status).toBe('completed');
    expect((await one(discordStatusUpdateQueue, s)).status).toBe('completed');
  });

  it('reminders: due ones are sent, future ones wait, stale ones complete without posting', async () => {
    await enqueueMatchReminder(db, { matchId: 'm1', minutesBefore: 30, reminderTime: new Date(Date.now() - 1000) });
    await enqueueMatchReminder(db, { matchId: 'm2', minutesBefore: 30, reminderTime: new Date(Date.now() + 3600_000) });
    const { qp, announcement } = make();
    await qp.processReminderQueue();
    expect(announcement.postTimedReminder).toHaveBeenCalledTimes(1);
    const rows = await db.select().from(discordReminderQueue);
    expect(rows.find((r) => r.match_id === 'm1')).toMatchObject({ status: 'completed', external_message_id: 'rem-1' });
    expect(rows.find((r) => r.match_id === 'm2')?.status).toBe('pending');

    const started = new Date(Date.now() - 1000);
    await db.update(matches).set({ start_date: started, start_time: started }).where(eq(matches.id, 'm9'));
    await enqueueMatchReminder(db, { matchId: 'm9', minutesBefore: 5, reminderTime: new Date(Date.now() - 1000) });
    const stale = make();
    await stale.qp.processReminderQueue();
    expect(stale.announcement.postTimedReminder).not.toHaveBeenCalled();
    expect(rows.find((r) => r.match_id === 'm9')).toBeUndefined();
    expect((await db.select().from(discordReminderQueue).where(eq(discordReminderQueue.match_id, 'm9')))[0].status).toBe('completed');
  });

  it('score notification: posts with jsonb players, records the id', async () => {
    const id = await enqueueScoreNotification(db, { matchId: 'm1', gameId: 'overwatch2', mapId: 'x', gameNumber: 1, winner: 'team1', winningTeamName: 'Blue', winningPlayers: ['a', 'b'] });
    const { qp, announcement } = make();
    await qp.processScoreNotificationQueue();
    expect(announcement.postMapScoreNotification).toHaveBeenCalledWith(expect.objectContaining({ matchName: 'Match One', winningPlayers: ['a', 'b'], gameId: 'overwatch2' }));
    expect(await one(discordScoreNotificationQueue, id)).toMatchObject({ status: 'completed', external_message_id: 'score-1' });
  });

  it('map code PMs complete; failure is permanent (no replayed DMs)', async () => {
    const ok = await enqueueMapCode(db, { matchId: 'm1', mapName: 'A', mapCode: '1' });
    const { qp, reminder } = make();
    await qp.processMapCodeQueue();
    expect(reminder.sendMapCodePMs).toHaveBeenCalledWith('m1', 'A', '1');
    expect((await one(discordMapCodeQueue, ok)).status).toBe('completed');

    const bad = await enqueueMapCode(db, { matchId: 'm1', mapName: 'B', mapCode: '2' });
    reminder.sendMapCodePMs.mockResolvedValueOnce(false);
    await qp.processMapCodeQueue();
    expect(await one(discordMapCodeQueue, bad)).toMatchObject({ status: 'failed', last_error: 'Failed to send map code PMs' });
  });

  it('match winner: waits (without spending an attempt) until map notifications are done, then posts', async () => {
    const id = await enqueueMatchWinner(db, { matchId: 'm1', matchName: 'Match One', gameId: 'g', winner: 'team1', winningTeamName: 'Blue', winningPlayers: [], team1Score: 2, team2Score: 0, totalMaps: 2 });
    await db.insert(matchGames).values([
      { id: 'm1_game_1', match_id: 'm1', round: 1, status: 'completed', discord_notified: true },
      { id: 'm1_game_2', match_id: 'm1', round: 2, status: 'completed', discord_notified: false },
    ]);
    const { qp, announcement } = make();
    await qp.processMatchWinnerNotificationQueue();
    expect(announcement.postMatchWinnerNotification).not.toHaveBeenCalled();
    expect(await one(discordMatchWinnerQueue, id)).toMatchObject({ status: 'pending', attempts: 0 });

    // tournament winners skip the gate and the 15s delay
    const t = await enqueueMatchWinner(db, { matchId: 'tournament_1', matchName: '🏆 Cup', gameId: 'g', winner: 'tournament', winningTeamName: 'A', winningPlayers: ['x'], team1Score: 4, team2Score: 1, totalMaps: 1 });
    await qp.processMatchWinnerNotificationQueue();
    expect(announcement.postTournamentWinnerNotification).toHaveBeenCalledWith(expect.objectContaining({ tournamentName: 'Cup', format: 'double-elimination', totalParticipants: 4 }));
    expect((await one(discordMatchWinnerQueue, t)).status).toBe('completed');
  });

  it('voice: welcome waits for the start delay (released, not failed); other types play', async () => {
    const w = await enqueueVoiceAnnouncement(db, { matchId: 'm1', type: 'welcome', blueChannel: 'b', redChannel: 'r', firstTeam: 'blue' });
    const f = await enqueueVoiceAnnouncement(db, { matchId: 'm1', type: 'finish', blueChannel: 'b', redChannel: 'r', firstTeam: 'red' });
    const { qp, voice } = make();
    await qp.processVoiceAnnouncementQueue();
    expect(voice.playTeamAnnouncements).toHaveBeenCalledTimes(1);
    expect(await one(discordVoiceAnnouncementQueue, f)).toMatchObject({ status: 'completed' });
    expect(await one(discordVoiceAnnouncementQueue, w)).toMatchObject({ status: 'pending', attempts: 0 });
  });

  it('stats report, health alert (message id recorded), scorecard prompt and winner vote', async () => {
    await enqueueStatsReport(db, 'm1');
    const h = await enqueueHealthAlert(db, { title: 'Down', description: 'x' });
    const sp = await enqueueScorecardPrompt(db, { matchId: 'm', matchGameId: 'g', mapName: 'X' });
    const wv = await enqueueWinnerVote(db, { matchId: 'm', matchGameId: 'g', mapName: 'X' });
    const { qp, announcement } = make();
    qp.setStatsReportHandler({ processMatch: vi.fn() } as never);
    qp.setScorecardHandler({ sendScorecardPrompts: vi.fn().mockResolvedValue(true) } as never);
    qp.setWinnerVoteHandler({ sendWinnerVotePrompts: vi.fn().mockResolvedValue(false) } as never);
    await qp.processStatsReportQueue();
    await qp.processHealthAlertQueue();
    await qp.processScorecardPromptQueue();
    await qp.processWinnerVoteQueue();
    expect((await db.select().from(discordStatsReportQueue))[0]!.status).toBe('completed');
    expect(announcement.postHealthAlert).toHaveBeenCalledTimes(1);
    expect(await one(discordHealthAlertQueue, h)).toMatchObject({ status: 'completed', external_message_id: 'alert-msg' });
    expect((await one(discordScorecardPromptQueue, sp)).status).toBe('sent');
    expect(await one(discordWinnerVoteQueue, wv)).toMatchObject({ status: 'failed' });
  });
});

describe('bot requests', () => {
  it('voice channel create stores a jsonb result the web side can read', async () => {
    const id = await enqueueBotRequest(db, 'voice_channel_create', { matchId: 'm1', categoryId: 'cat', channelNames: ['A', 'B'] });
    const guild = { channels: { create: vi.fn().mockResolvedValueOnce({ id: 'c1', delete: vi.fn() }).mockResolvedValueOnce({ id: 'c2', delete: vi.fn() }) } };
    client.guilds.fetch.mockResolvedValue(guild);
    await make().qp.processDiscordBotRequests();
    expect(await one(discordBotRequests, id)).toMatchObject({ status: 'completed', result: { success: true, channelIds: ['c1', 'c2'], blueChannelId: 'c1', redChannelId: 'c2' } });
  });

  it('cleans up already-created channels when a later one fails, and fails the request (never replayed)', async () => {
    const id = await enqueueBotRequest(db, 'voice_channel_create', { matchId: 'm1', categoryId: 'cat', channelNames: ['A', 'B'] });
    const del = vi.fn();
    client.guilds.fetch.mockResolvedValue({ channels: { create: vi.fn().mockResolvedValueOnce({ id: 'c1', delete: del }).mockRejectedValueOnce(new Error('limit')) } });
    await make().qp.processDiscordBotRequests();
    expect(del).toHaveBeenCalled();
    expect(await one(discordBotRequests, id)).toMatchObject({ status: 'failed', result: { success: false, message: 'limit' } });
  });

  it('delete request completes; unknown types fail; old finished requests are purged', async () => {
    const del = await enqueueBotRequest(db, 'voice_channel_delete', { channelId: 'ch', matchId: 'm1' });
    const unknown = 'unk';
    await db.insert(discordBotRequests).values({ id: unknown, type: 'mystery', data: {} });
    const chan = { delete: vi.fn() };
    client.channels.fetch.mockResolvedValue(chan);
    const old = 'old';
    await db.insert(discordBotRequests).values({ id: old, type: 'voice_test', status: 'completed', updated_at: new Date(Date.now() - 2 * 3600_000) });
    await make().qp.processDiscordBotRequests();
    expect(chan.delete).toHaveBeenCalled();
    expect((await one(discordBotRequests, del)).status).toBe('completed');
    expect(await one(discordBotRequests, unknown)).toMatchObject({ status: 'failed' });
    expect(await one(discordBotRequests, old)).toBeUndefined();
  });
});

describe('processAllQueues', () => {
  it('never runs two ticks at once and resets abandoned claims first', async () => {
    const id = (await enqueueAnnouncement(db, { matchId: 'm1', type: 'standard' }))!;
    await db.update(discordAnnouncementQueue).set({ status: 'processing', attempts: 1, claimed_at: new Date(Date.now() - 3600_000), claimed_by: 'dead' }).where(eq(discordAnnouncementQueue.id, id));
    const { qp, announcement } = make();
    let release!: () => void;
    announcement.postEventAnnouncement.mockImplementation(() => new Promise((r) => { release = () => r({ success: true, mainMessage: { id: 'm', channelId: 'c' } }); }));
    const first = qp.processAllQueues();
    await vi.waitFor(() => expect(announcement.postEventAnnouncement).toHaveBeenCalledTimes(1));
    await qp.processAllQueues(); // skipped: previous tick still running
    expect(announcement.postEventAnnouncement).toHaveBeenCalledTimes(1);
    release();
    await first;
    expect((await one(discordAnnouncementQueue, id)).status).toBe('completed');
  });
});
