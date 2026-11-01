// @vitest-environment node
import { beforeEach, describe, it, expect } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { setupPgTestFile } from '../../utils/pg-test-db';
import { seedQueueFixtures } from '../../utils/pg-queue-fixtures';
import { db } from '../../../lib/db';
import {
  discordAnnouncementQueue, discordBotRequests, discordReminderQueue, discordStatsReportQueue, discordVoiceAnnouncementQueue,
  statsProcessingQueue,
} from '../../../lib/db/schema';
import {
  alreadyPosted, backoffMs, claimJobById, claimJobs, completeJob, countFailed, enqueueAnnouncement, enqueueBotRequest, enqueueDeletion,
  enqueueHealthAlert, enqueueMatchReminder, enqueueScorecardPrompt, enqueueStatsProcessing, enqueueStatsReport, enqueueStatusUpdate,
  expireOldBotRequests, failJob, findActiveVoiceTest, hasAnnouncement, matchIdsWithLiveReminder, nonOverlapping, purgeFinished,
  QUEUE_NAMES, QUEUE_TABLES, recordExternalResult, releaseJob, requeueJob, resetAbandonedClaims, getTimedAnnouncement,
  enqueueVoiceAnnouncement, makeWorkerId,
} from '../../../src/lib/discord-queues';

setupPgTestFile();
beforeEach(async () => { await seedQueueFixtures(); });

const past = (ms: number) => new Date(Date.now() - ms);

async function announcement(id: string, over: Partial<typeof discordAnnouncementQueue.$inferInsert> = {}) {
  await db.insert(discordAnnouncementQueue).values({ id, match_id: 'm1', announcement_type: 'standard', ...over });
}
async function row(id: string) {
  return (await db.select().from(discordAnnouncementQueue).where(eq(discordAnnouncementQueue.id, id)))[0]!;
}

describe('registry', () => {
  it('covers all 19 queue / job tables and each has the worker columns', () => {
    expect(QUEUE_NAMES).toHaveLength(19);
    for (const name of QUEUE_NAMES) {
      const t = QUEUE_TABLES[name] as unknown as Record<string, unknown>;
      for (const col of ['id', 'status', 'attempts', 'max_attempts', 'claimed_at', 'claimed_by', 'next_attempt_at', 'last_error', 'processed_at', 'created_at']) {
        expect(t[col], `${name}.${col}`).toBeDefined();
      }
    }
  });
});

describe('claimJobs', () => {
  it('claims pending rows oldest first, marks them processing and counts the attempt', async () => {
    await announcement('a2', { created_at: past(1000) });
    await announcement('a1', { created_at: past(5000) });
    await announcement('a3', { created_at: past(500) });

    const claimed = await claimJobs(db, 'announcement', { limit: 2, workerId: 'w1' });
    expect(claimed.map((r) => r.id)).toEqual(['a1', 'a2']);
    expect(claimed.every((r) => r.status === 'processing' && r.attempts === 1 && r.claimed_by === 'w1' && r.claimed_at instanceof Date)).toBe(true);

    expect((await row('a3')).status).toBe('pending');
    // already-claimed rows are never handed out again
    expect((await claimJobs(db, 'announcement', { limit: 10 })).map((r) => r.id)).toEqual(['a3']);
    expect(await claimJobs(db, 'announcement')).toEqual([]);
  });

  it('honours next_attempt_at and an extra readiness condition', async () => {
    await announcement('later', { next_attempt_at: new Date(Date.now() + 60_000) });
    await announcement('due', { next_attempt_at: past(1000) });
    await announcement('sched', { scheduled_for: new Date(Date.now() + 60_000) });

    const ready = sql`${discordAnnouncementQueue.scheduled_for} IS NULL OR ${discordAnnouncementQueue.scheduled_for} <= now()`;
    expect((await claimJobs(db, 'announcement', { where: ready })).map((r) => r.id)).toEqual(['due']);
  });

  it('only claims pending rows (not failed / completed)', async () => {
    await announcement('f', { status: 'failed' });
    await announcement('c', { status: 'completed' });
    expect(await claimJobs(db, 'announcement')).toEqual([]);
  });

  it('claimJobById claims one specific pending row once', async () => {
    await announcement('x');
    expect((await claimJobById(db, 'announcement', 'x'))?.attempts).toBe(1);
    expect(await claimJobById(db, 'announcement', 'x')).toBeUndefined();
  });

  it('makeWorkerId includes role and pid', () => {
    expect(makeWorkerId('discord-bot')).toMatch(new RegExp(`^discord-bot:.+:${process.pid}$`));
  });
});

describe('completeJob / failJob / releaseJob', () => {
  it('complete moves processing -> completed, stamps processed_at, clears the error and applies extra columns', async () => {
    await announcement('a', { last_error: 'old' });
    await claimJobs(db, 'announcement');
    expect(await completeJob(db, 'announcement', 'a', { set: { posted_at: new Date() } })).toBe(true);
    const r = await row('a');
    expect(r.status).toBe('completed');
    expect(r.processed_at).toBeInstanceOf(Date);
    expect(r.posted_at).toBeInstanceOf(Date);
    expect(r.last_error).toBeNull();
    // not processing any more -> no-op
    expect(await completeJob(db, 'announcement', 'a')).toBe(false);
  });

  it("complete uses status 'sent' for the prompt queues", async () => {
    const id = await enqueueScorecardPrompt(db, { matchId: 'm', matchGameId: 'g', mapName: 'Map' });
    await claimJobs(db, 'scorecardPrompt');
    expect(await completeJob(db, 'scorecardPrompt', id, { status: 'sent' })).toBe(true);
    expect((await claimJobs(db, 'scorecardPrompt'))).toEqual([]);
  });

  it('fail sends the row back to pending with exponential backoff while attempts remain', async () => {
    await announcement('a', { max_attempts: 3 });
    await claimJobs(db, 'announcement');
    const before = Date.now();
    expect(await failJob(db, 'announcement', 'a', new Error('boom'))).toBe('pending');
    const r1 = await row('a');
    expect(r1).toMatchObject({ status: 'pending', last_error: 'boom', attempts: 1 });
    // attempt 1 -> 30s
    expect(r1.next_attempt_at!.getTime() - before).toBeGreaterThan(25_000);
    expect(r1.next_attempt_at!.getTime() - before).toBeLessThan(40_000);
    // backoff hides it from claim until due
    expect(await claimJobs(db, 'announcement')).toEqual([]);

    // second failure: 60s
    await db.update(discordAnnouncementQueue).set({ next_attempt_at: past(1) }).where(eq(discordAnnouncementQueue.id, 'a'));
    await claimJobs(db, 'announcement');
    await failJob(db, 'announcement', 'a', 'again');
    const r2 = await row('a');
    expect(r2.attempts).toBe(2);
    expect(r2.next_attempt_at!.getTime() - Date.now()).toBeGreaterThan(55_000);
  });

  it('fail goes to failed once attempts reach max_attempts (and records processed_at / error)', async () => {
    await announcement('a', { max_attempts: 2 });
    for (let i = 0; i < 2; i++) {
      await db.update(discordAnnouncementQueue).set({ next_attempt_at: null }).where(eq(discordAnnouncementQueue.id, 'a'));
      await claimJobs(db, 'announcement');
      const outcome = await failJob(db, 'announcement', 'a', 'nope');
      expect(outcome).toBe(i === 0 ? 'pending' : 'failed');
    }
    const r = await row('a');
    expect(r).toMatchObject({ status: 'failed', last_error: 'nope', attempts: 2, next_attempt_at: null });
    expect(r.processed_at).toBeInstanceOf(Date);
    expect(await claimJobs(db, 'announcement')).toEqual([]);
  });

  it('permanent failures skip the retries; custom columns are applied; non-processing rows are untouched', async () => {
    await db.insert(discordBotRequests).values({ id: 'b', type: 'voice_test', data: { userId: 'u' } });
    expect(await failJob(db, 'botRequest', 'b', 'x')).toBeUndefined(); // still pending, not claimed
    await claimJobs(db, 'botRequest');
    expect(await failJob(db, 'botRequest', 'b', 'bad', { permanent: true, set: { result: { success: false, message: 'bad' } } })).toBe('failed');
    const r = (await db.select().from(discordBotRequests).where(eq(discordBotRequests.id, 'b')))[0]!;
    expect(r).toMatchObject({ status: 'failed', result: { success: false, message: 'bad' }, attempts: 1 });
  });

  it('release returns the claim without spending an attempt and delays the next claim', async () => {
    await announcement('a');
    await claimJobs(db, 'announcement');
    expect(await releaseJob(db, 'announcement', 'a', 60_000)).toBe(true);
    const r = await row('a');
    expect(r).toMatchObject({ status: 'pending', attempts: 0, claimed_by: null, claimed_at: null });
    expect(r.next_attempt_at!.getTime()).toBeGreaterThan(Date.now() + 50_000);
    expect(await claimJobs(db, 'announcement')).toEqual([]);

    await releaseJob(db, 'announcement', 'a'); // not processing: no-op
    await db.update(discordAnnouncementQueue).set({ next_attempt_at: null }).where(eq(discordAnnouncementQueue.id, 'a'));
    expect((await claimJobs(db, 'announcement'))[0]?.attempts).toBe(1);
  });

  it('requeue resets a finished row with a fresh attempt budget', async () => {
    await announcement('a', { status: 'failed', attempts: 5, last_error: 'x', processed_at: new Date() });
    expect(await requeueJob(db, 'announcement', 'a')).toBe(true);
    expect(await row('a')).toMatchObject({ status: 'pending', attempts: 0, last_error: null, processed_at: null });
  });

  it('backoffMs doubles and is capped', () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(20)).toBe(15 * 60_000);
  });
});

describe('resetAbandonedClaims', () => {
  it('resets stale processing claims to pending and leaves fresh ones alone', async () => {
    await announcement('stale', { status: 'processing', attempts: 1, claimed_at: past(10 * 60_000), claimed_by: 'dead' });
    await announcement('fresh', { status: 'processing', attempts: 1, claimed_at: past(1000), claimed_by: 'alive' });

    expect(await resetAbandonedClaims(db, ['announcement'])).toBe(1);
    expect(await row('stale')).toMatchObject({ status: 'pending', claimed_by: null, claimed_at: null });
    expect((await row('stale')).last_error).toMatch(/abandoned/i);
    expect((await row('fresh')).status).toBe('processing');
    // the reset row is claimable again
    expect((await claimJobs(db, 'announcement')).map((r) => r.id)).toEqual(['stale']);
  });

  it('fails the row instead when its attempts are exhausted', async () => {
    await announcement('x', { status: 'processing', attempts: 5, max_attempts: 5, claimed_at: past(10 * 60_000) });
    await resetAbandonedClaims(db, ['announcement']);
    expect(await row('x')).toMatchObject({ status: 'failed' });
  });

  it('uses per-queue timeouts and fails (never replays) abandoned bot requests', async () => {
    await db.insert(discordVoiceAnnouncementQueue).values({ id: 'v', match_id: 'm', announcement_type: 'welcome', status: 'processing', attempts: 1, claimed_at: past(3 * 60_000) });
    await db.insert(discordBotRequests).values({ id: 'br', type: 'voice_channel_create', status: 'processing', attempts: 1, claimed_at: past(6 * 60_000) });
    await db.insert(statsProcessingQueue).values({ id: 's', submission_id: 'sub', match_id: 'm', match_game_id: 'g', status: 'processing', attempts: 1, claimed_at: past(6 * 60_000) });

    await resetAbandonedClaims(db);
    const get = async (t: typeof discordVoiceAnnouncementQueue | typeof discordBotRequests | typeof statsProcessingQueue, id: string) =>
      (await db.select({ status: t.status }).from(t).where(eq(t.id, id)))[0]!.status;
    expect(await get(discordVoiceAnnouncementQueue, 'v')).toBe('pending'); // 2 min timeout
    expect(await get(discordBotRequests, 'br')).toBe('failed'); // onAbandon: fail
    expect(await get(statsProcessingQueue, 's')).toBe('processing'); // 10 min timeout, not yet
  });
});

describe('external result (no duplicate Discord posts)', () => {
  it('records the message id and exposes it on the next claim', async () => {
    await announcement('a');
    const [first] = await claimJobs(db, 'announcement');
    expect(alreadyPosted(first!)).toBe(false);
    await recordExternalResult(db, 'announcement', 'a', 'discord-msg-1');
    // crash before completing: the claim is abandoned and reset...
    await db.update(discordAnnouncementQueue).set({ claimed_at: past(10 * 60_000) }).where(eq(discordAnnouncementQueue.id, 'a'));
    await resetAbandonedClaims(db, ['announcement']);
    // ...and the retry sees the post already happened
    const [retry] = await claimJobs(db, 'announcement');
    expect(retry!.external_message_id).toBe('discord-msg-1');
    expect(alreadyPosted(retry!)).toBe(true);
  });
});

describe('maintenance helpers', () => {
  it('purgeFinished deletes only old finished rows; countFailed counts failures', async () => {
    await announcement('old', { status: 'completed', processed_at: past(2 * 3600_000) });
    await announcement('new', { status: 'completed', processed_at: past(1000) });
    await announcement('pend');
    await announcement('failed', { status: 'failed', processed_at: past(1000) });
    expect(await countFailed(db, ['announcement', 'reminder'])).toBe(1);
    expect(await purgeFinished(db, 'announcement', 3600_000)).toBe(1);
    const ids = (await db.select({ id: discordAnnouncementQueue.id }).from(discordAnnouncementQueue)).map((r) => r.id).sort();
    expect(ids).toEqual(['failed', 'new', 'pend']);
  });

  it('nonOverlapping skips a tick while the previous one is running and swallows errors', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let runs = 0;
    const errors: unknown[] = [];
    const tick = nonOverlapping(async () => { runs++; await gate; }, (e) => errors.push(e));
    const first = tick();
    expect(await tick()).toBe(false); // overlapping tick skipped
    release();
    expect(await first).toBe(true);
    expect(runs).toBe(1);
    expect(await tick()).toBe(true); // runs again once the previous finished
    expect(runs).toBe(2);

    const failing = nonOverlapping(async () => { throw new Error('x'); }, (e) => errors.push(e));
    await expect(failing()).resolves.toBe(true);
    expect(errors).toHaveLength(1);
    await expect(failing()).resolves.toBe(true); // flag was reset after the failure
  });
});

describe('enqueue', () => {
  it('announcements: dedupe by match + type + status, optional data match', async () => {
    expect(await enqueueAnnouncement(db, { matchId: 'm1', type: 'standard', dedupe: ['pending', 'processing'] })).toMatch(/^announce_/);
    expect(await enqueueAnnouncement(db, { matchId: 'm1', type: 'standard', dedupe: ['pending', 'processing'] })).toBeNull();
    expect(await enqueueAnnouncement(db, { matchId: 'm1', type: 'match_start' })).not.toBeNull();
    expect(await enqueueAnnouncement(db, { matchId: 'm1', type: 'match_start' })).not.toBeNull(); // no dedupe requested
    expect(await hasAnnouncement(db, 'm1', 'standard')).toBe(true);
    expect(await hasAnnouncement(db, 'm2', 'standard')).toBe(false);

    // completed rows no longer count for a pending/processing dedupe, but do for an all-status one
    await db.update(discordAnnouncementQueue).set({ status: 'completed' }).where(eq(discordAnnouncementQueue.announcement_type, 'standard'));
    expect(await enqueueAnnouncement(db, { matchId: 'm1', type: 'standard', dedupe: ['pending', 'processing'] })).not.toBeNull();
    expect(await enqueueAnnouncement(db, { matchId: 'm9', type: 'standard', dedupe: ['pending', 'processing', 'completed', 'failed'] })).not.toBeNull();
    expect(await enqueueAnnouncement(db, { matchId: 'm9', type: 'standard', dedupe: ['pending', 'processing', 'completed', 'failed'] })).toBeNull();
  });

  it('timed announcements store jsonb timing data and are found by payload', async () => {
    const data = { id: '1hour', value: 1, unit: 'hours' };
    const when = new Date(Date.now() + 3600_000);
    const id = await enqueueAnnouncement(db, { matchId: 'm1', type: 'timed', data, scheduledFor: when });
    const stored = (await db.select().from(discordAnnouncementQueue).where(eq(discordAnnouncementQueue.id, id!)))[0]!;
    expect(stored.announcement_data).toEqual(data);
    expect(stored.scheduled_for?.getTime()).toBe(when.getTime());
    expect((await getTimedAnnouncement(db, 'm1', { unit: 'hours', value: 1, id: '1hour' }))?.status).toBe('pending');
    expect(await getTimedAnnouncement(db, 'm1', { id: 'other', value: 2, unit: 'hours' })).toBeUndefined();
    expect(await enqueueAnnouncement(db, { matchId: 'm1', type: 'timed', data, dedupe: ['pending', 'processing', 'completed'] })).toBeNull();
  });

  it('tournament ids are accepted where a match id is expected (no FK to matches)', async () => {
    await enqueueAnnouncement(db, { matchId: 'tournament_1', type: 'tournament' });
    await enqueueStatusUpdate(db, 'tournament_1', 'assign');
    await enqueueDeletion(db, 'deleted-match');
    expect(await claimJobs(db, 'statusUpdate')).toHaveLength(1);
  });

  it('match reminders are unique per match while not failed; stats reports unique per match', async () => {
    const t = new Date(Date.now() + 60_000);
    expect(await enqueueMatchReminder(db, { matchId: 'm1', minutesBefore: 30, reminderTime: t })).not.toBeNull();
    expect(await enqueueMatchReminder(db, { matchId: 'm1', minutesBefore: 30, reminderTime: t })).toBeNull();
    expect(await matchIdsWithLiveReminder(db, ['m1', 'm2'])).toEqual(new Set(['m1']));
    await db.update(discordReminderQueue).set({ status: 'failed' }).where(eq(discordReminderQueue.match_id, 'm1'));
    expect(await matchIdsWithLiveReminder(db, ['m1'])).toEqual(new Set());
    expect(await enqueueMatchReminder(db, { matchId: 'm1', minutesBefore: 30, reminderTime: t })).not.toBeNull();

    expect(await enqueueStatsReport(db, 'm1')).not.toBeNull();
    expect(await enqueueStatsReport(db, 'm1')).toBeNull();
    expect(await db.select().from(discordStatsReportQueue)).toHaveLength(1);
  });

  it('voice announcements allow 1 + 3 attempts; stats processing 1 + 3 retries', async () => {
    const v = await enqueueVoiceAnnouncement(db, { matchId: 'm', type: 'welcome', blueChannel: 'b', redChannel: 'r', firstTeam: 'blue' });
    expect((await db.select().from(discordVoiceAnnouncementQueue).where(eq(discordVoiceAnnouncementQueue.id, v)))[0]!.max_attempts).toBe(4);
    const s = await enqueueStatsProcessing(db, { submissionId: 'sub', matchId: 'm', matchGameId: 'g' });
    expect((await db.select().from(statsProcessingQueue).where(eq(statsProcessingQueue.id, s)))[0]!.max_attempts).toBe(4);
  });

  it('health alerts and bot requests', async () => {
    await enqueueHealthAlert(db, { title: 'Down', description: 'bot down' });
    const [alert] = await claimJobs(db, 'healthAlert');
    expect(alert).toMatchObject({ severity: 'critical', title: 'Down', description: 'bot down' });

    const id = await enqueueBotRequest(db, 'voice_test', { userId: 'u1', voiceId: 'v' });
    expect(id).toMatch(/^voice_test_/);
    expect((await findActiveVoiceTest(db, 'u1'))?.id).toBe(id);
    expect(await findActiveVoiceTest(db, 'u2')).toBeUndefined();
  });

  it('expireOldBotRequests fails open requests older than the cutoff only', async () => {
    await db.insert(discordBotRequests).values([
      { id: 'old', type: 'voice_test', created_at: past(10 * 60_000) },
      { id: 'young', type: 'voice_test', created_at: past(1000) },
      { id: 'done', type: 'voice_test', status: 'completed', created_at: past(10 * 60_000) },
    ]);
    expect(await expireOldBotRequests(db)).toBe(1);
    const get = async (id: string) => (await db.select().from(discordBotRequests).where(eq(discordBotRequests.id, id)))[0]!;
    expect((await get('old')).status).toBe('failed');
    expect((await get('old')).result).toEqual({ success: false, message: 'Request abandoned - too old' });
    expect((await get('young')).status).toBe('pending');
    expect((await get('done')).status).toBe('completed');
  });
});
