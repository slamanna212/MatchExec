// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { discordChannels, discordSettings } from '../../../lib/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));

setupPgTestFile();

async function configureGuild(guildId = 'guild-123', botToken = 'token-abc') {
  await getPgTestDb().insert(discordSettings).values({ id: 1, guild_id: guildId, bot_token: botToken });
}

async function addChannel(id: string, overrides: Partial<typeof discordChannels.$inferInsert> = {}) {
  await getPgTestDb().insert(discordChannels).values({
    id, guild_id: 'guild-123', discord_channel_id: `dc-${id}`, name: id, type: 0, channel_type: 'text', ...overrides,
  });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('GET /api/channels', () => {
  it('returns [] when there are no channels', async () => {
    const res = await appRequest('/api/channels');
    expect(res.status).toBe(200);
    expect(res.data).toEqual([]);
  });

  it('returns booleans, ISO timestamps and orders by type then name', async () => {
    await configureGuild();
    await addChannel('ch-z', { channel_name: 'zebra', send_announcements: true, send_reminders: false });
    await addChannel('ch-a', { channel_name: 'alpha' });
    await addChannel('ch-v', { channel_name: 'lobby', type: 2, channel_type: 'voice' });

    const res = await appRequest('/api/channels');
    expect(res.status).toBe(200);
    expect(res.data.map((c: any) => c.id)).toEqual(['ch-a', 'ch-z', 'ch-v']);
    const zebra = res.data[1];
    expect(zebra.send_announcements).toBe(true);
    expect(zebra.send_reminders).toBe(false);
    expect(zebra.last_name_refresh).toBeNull();
    expect(new Date(zebra.created_at).toISOString()).toBe(zebra.created_at);
    expect(Object.keys(zebra).sort()).toEqual([
      'channel_name', 'channel_type', 'created_at', 'discord_channel_id', 'id', 'last_name_refresh', 'send_announcements',
      'send_health_alerts', 'send_match_start', 'send_reminders', 'send_signup_updates', 'updated_at',
    ]);
  });
});

describe('POST /api/channels', () => {
  const post = (json: unknown) => appRequest('/api/channels', { method: 'POST', json });

  it('validates input', async () => {
    expect((await post({ channel_type: 'text' })).status).toBe(400);
    expect((await post({ discord_channel_id: 'dc-999' })).status).toBe(400);
    const invalid = await post({ discord_channel_id: 'dc-999', channel_type: 'invalid' });
    expect(invalid.status).toBe(400);
    expect(invalid.data.error).toBe('Channel type must be text or voice');
    const voice = await post({ discord_channel_id: 'dc-999', channel_type: 'voice' });
    expect(voice.status).toBe(400);
    expect(voice.data.error).toBe('Voice channels are automatically created and cannot be manually added');
  });

  it('returns 400 when no guild is configured', async () => {
    const res = await post({ discord_channel_id: 'dc-999', channel_type: 'text' });
    expect(res.status).toBe(400);
    expect(res.data.error).toBe('Discord guild not configured');
  });

  it('creates a text channel with the given flags (others default to false)', async () => {
    await configureGuild();
    const res = await post({ discord_channel_id: 'dc-new', channel_type: 'text', send_announcements: true, send_health_alerts: 1 });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ success: true, message: 'Channel created successfully' });
    const [row] = await getPgTestDb().select().from(discordChannels).where(eq(discordChannels.id, res.data.id));
    expect(row).toMatchObject({
      guild_id: 'guild-123', discord_channel_id: 'dc-new', name: 'Channel dc-new', type: 0, channel_type: 'text',
      send_announcements: true, send_reminders: false, send_match_start: false, send_signup_updates: false, send_health_alerts: true,
    });
  });

  it('returns 409 for a duplicate discord channel id', async () => {
    await configureGuild();
    await addChannel('existing', { discord_channel_id: 'dc-dup' });
    const res = await post({ discord_channel_id: 'dc-dup', channel_type: 'text' });
    expect(res.status).toBe(409);
    expect(res.data.error).toBe('Channel already exists');
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await appRequest('/api/channels', { method: 'POST', body: '{nope', headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/channels/:channelId', () => {
  const put = (id: string, json: unknown) => appRequest(`/api/channels/${id}`, { method: 'PUT', json });

  it('returns 404 for an unknown channel and 400 for an over-long id', async () => {
    expect((await put('nonexistent', { send_announcements: true })).status).toBe(404);
    const long = await put('x'.repeat(101), {});
    expect(long.status).toBe(400);
    expect(long.data.error).toBe('Invalid ID');
  });

  it('rejects voice channels', async () => {
    await configureGuild();
    await addChannel('vc-1', { type: 2, channel_type: 'voice' });
    const res = await put('vc-1', { send_announcements: true });
    expect(res.status).toBe(400);
    expect(res.data.error).toBe('Notification settings only apply to text channels');
  });

  it('sets all five flags (missing ones become false) and bumps updated_at', async () => {
    await configureGuild();
    await addChannel('ch-txt', { send_reminders: true, send_signup_updates: true });
    const before = (await getPgTestDb().select().from(discordChannels).where(eq(discordChannels.id, 'ch-txt')))[0];

    const res = await put('ch-txt', { send_announcements: true, send_match_start: 1 });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ success: true, message: 'Channel notification settings updated successfully' });

    const [row] = await getPgTestDb().select().from(discordChannels).where(eq(discordChannels.id, 'ch-txt'));
    expect(row).toMatchObject({
      send_announcements: true, send_reminders: false, send_match_start: true, send_signup_updates: false, send_health_alerts: false,
    });
    expect(row.updated_at.getTime()).toBeGreaterThanOrEqual(before.updated_at.getTime());
  });
});

describe('DELETE /api/channels/:channelId', () => {
  it('returns 404 for an unknown channel', async () => {
    expect((await appRequest('/api/channels/nope', { method: 'DELETE' })).status).toBe(404);
  });

  it('deletes an existing channel', async () => {
    await configureGuild();
    await addChannel('ch-del');
    const res = await appRequest('/api/channels/ch-del', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ success: true, message: 'Channel deleted successfully' });
    expect(await getPgTestDb().select().from(discordChannels)).toHaveLength(0);
  });
});

describe('POST /api/channels/refresh-names', () => {
  const refresh = () => appRequest('/api/channels/refresh-names', { method: 'POST' });

  it('returns 400 when the bot is not configured', async () => {
    const res = await refresh();
    expect(res.status).toBe(400);
    expect(res.data.error).toBe('Discord bot not configured');
  });

  it('returns 0 channels when none exist', async () => {
    await configureGuild('guild-abc', 'token-xyz');
    const res = await refresh();
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ success: true, updated_count: 0, removed_count: 0, total_channels: 0 });
  });

  it('updates names, removes channels Discord reports as deleted, and collects errors', async () => {
    await configureGuild('guild-123', 'token-xyz');
    await addChannel('ok', { discord_channel_id: 'd-ok' });
    await addChannel('gone', { discord_channel_id: 'd-gone' });
    await addChannel('boom', { discord_channel_id: 'd-boom' });

    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>).Authorization).toBe('Bot token-xyz');
      if (url.endsWith('/d-ok')) return new Response(JSON.stringify({ name: 'general' }), { status: 200 });
      if (url.endsWith('/d-gone')) return new Response('{}', { status: 404 });
      return new Response('{}', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await refresh();
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ success: true, updated_count: 1, removed_count: 1, total_channels: 3 });
    expect(res.data.errors).toEqual(['Failed to refresh channel d-boom: HTTP 500']);

    const rows = await getPgTestDb().select().from(discordChannels);
    expect(rows.map((r) => r.id).sort()).toEqual(['boom', 'ok']);
    const ok = rows.find((r) => r.id === 'ok')!;
    expect(ok.channel_name).toBe('general');
    expect(ok.last_name_refresh).toBeInstanceOf(Date);
  });
});
