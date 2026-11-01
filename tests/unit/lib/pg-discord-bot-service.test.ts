// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile } from '../../utils/pg-test-db';
import { db } from '../../../lib/db';
import { discordBotRequests } from '../../../lib/db/schema';
import { DiscordBotService } from '../../../lib/discord-bot-service';

vi.mock('../../../src/lib/logger/server', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() } }));

setupPgTestFile();
const service = () => new DiscordBotService(db);

describe('DiscordBotService', () => {
  it('creates a pending voice_test request with the user in jsonb data', async () => {
    const id = await service().requestVoiceTest('user-123', 'voice-abc');
    expect(id).toContain('voice_test_');
    const row = (await db.select().from(discordBotRequests).where(eq(discordBotRequests.id, id)))[0]!;
    expect(row).toMatchObject({ type: 'voice_test', status: 'pending', data: { userId: 'user-123', voiceId: 'voice-abc' } });
  });

  it('returns the existing live request for the same user, but not for another user', async () => {
    const first = await service().requestVoiceTest('u1');
    expect(await service().requestVoiceTest('u1')).toBe(first);
    expect(await service().requestVoiceTest('u2')).not.toBe(first);
  });

  it('fails stale pending requests of the user and creates a fresh one', async () => {
    const old = await service().requestVoiceTest('u1');
    await db.update(discordBotRequests).set({ created_at: new Date(Date.now() - 3 * 60_000) }).where(eq(discordBotRequests.id, old));
    const fresh = await service().requestVoiceTest('u1');
    expect(fresh).not.toBe(old);
    expect((await db.select().from(discordBotRequests).where(eq(discordBotRequests.id, old)))[0]).toMatchObject({ status: 'failed' });
  });

  it('getRequestStatus: null when missing, details when present, result as a JSON string', async () => {
    expect(await service().getRequestStatus('nope')).toBeNull();
    const id = await service().requestVoiceTest('u5', 'v');
    expect(await service().getRequestStatus(id)).toMatchObject({ id, status: 'pending', userId: 'u5', voiceId: 'v' });
    await db.update(discordBotRequests).set({ status: 'completed', result: { success: true } }).where(eq(discordBotRequests.id, id));
    const done = await service().getRequestStatus(id);
    expect(done).toMatchObject({ status: 'completed', result: '{"success":true}' });
    expect(typeof done!.created_at).toBe('string');
  });

  it('waitForRequestCompletion returns once the bot finished; a timeout marks the request failed', async () => {
    const id = await service().requestVoiceTest('u6');
    setTimeout(async () => { await db.update(discordBotRequests).set({ status: 'completed', result: { success: true } }).where(eq(discordBotRequests.id, id)); }, 100);
    expect((await service().waitForRequestCompletion(id, 5000)).status).toBe('completed');

    const slow = await service().requestVoiceTest('u7');
    await expect(service().waitForRequestCompletion(slow, 600)).rejects.toThrow(/timeout/i);
    expect((await db.select().from(discordBotRequests).where(eq(discordBotRequests.id, slow)))[0]).toMatchObject({ status: 'failed' });
  });
});
