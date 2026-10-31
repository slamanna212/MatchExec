// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { discordSettings, schedulerSettings, uiSettings } from '../../../lib/db/schema';
import { getAppSetting, setAppSetting } from '../../../src/lib/settings';
import { resetRateLimits } from '../../../src/server/middleware/rate-limit';
import { logger } from '@/lib/logger';

const checkForUpdate = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/discord-bot-restart', () => ({ restartDiscordBot: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../processes/scheduler/jobs/check-for-update', () => ({
  UpdateCheckJob: vi.fn().mockImplementation(function () { return { checkForUpdate }; }),
}));

import { restartDiscordBot } from '@/lib/discord-bot-restart';

setupPgTestFile({ seed: true });

const put = (path: string, json: unknown) => appRequest(path, { method: 'PUT', json });

beforeEach(async () => {
  vi.clearAllMocks();
  resetRateLimits();
  // app_settings is a preserved reference table: restore the keys these tests change
  await setAppSetting('log_level', 'warning');
  await setAppSetting('feed_retention_days', '180');
  await setAppSetting('update_check_enabled', 'true');
  await setAppSetting('update_check_last_run', '');
});

describe('Discord settings', () => {
  it('returns defaults when no row exists', async () => {
    const res = await appRequest('/api/settings/discord');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      bot_token: '', guild_id: '', mention_everyone: false, event_duration_minutes: 45, match_reminder_minutes: 10,
      player_reminder_minutes: 120, announcer_voice: 'wrestling-announcer', voice_announcements_enabled: false,
      winner_vote_enabled: true, signup_dm_enabled: true, commander_dm_enabled: true,
    });
  });

  it('persists updates, masks the token and restarts the bot', async () => {
    const res = await put('/api/settings/discord', {
      bot_token: ' secret-token ', guild_id: ' g1 ', announcement_role_id: 'role', mention_everyone: true,
      event_duration_minutes: 60, voice_announcements_enabled: true, winner_vote_enabled: false,
    });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ success: true });
    expect(restartDiscordBot).toHaveBeenCalledTimes(1);

    const get = await appRequest('/api/settings/discord');
    expect(get.data).toMatchObject({
      bot_token: '••••••••', guild_id: 'g1', announcement_role_id: 'role', mention_everyone: true, event_duration_minutes: 60,
      voice_announcements_enabled: true, winner_vote_enabled: false,
    });
    const [row] = await getPgTestDb().select().from(discordSettings);
    expect(row.bot_token).toBe('secret-token');
  });

  it('does not overwrite the token with the masked placeholder', async () => {
    await put('/api/settings/discord', { bot_token: 'real', guild_id: 'g' });
    await put('/api/settings/discord', { bot_token: '••••••••', guild_id: 'g2' });
    const [row] = await getPgTestDb().select().from(discordSettings);
    expect(row.bot_token).toBe('real');
    expect(row.guild_id).toBe('g2');
  });

  it('accepts numeric strings for durations and falls back to defaults for falsy values', async () => {
    await put('/api/settings/discord', { event_duration_minutes: '90', announcer_voice: '' });
    const get = await appRequest('/api/settings/discord');
    expect(get.data).toMatchObject({ event_duration_minutes: 90, announcer_voice: 'wrestling-announcer' });
  });

  it.each([
    [{ event_duration_minutes: 4 }, 'event_duration_minutes must be between 5 and 720'],
    [{ match_reminder_minutes: 1441 }, 'match_reminder_minutes must be between 1 and 1440'],
    [{ player_reminder_minutes: 'abc' }, 'player_reminder_minutes must be a number'],
  ])('rejects out-of-range durations %j', async (body, error) => {
    const res = await put('/api/settings/discord', body);
    expect(res.status).toBe(400);
    expect(res.data).toEqual({ error });
  });

  it('creates the singleton row but does not restart the bot for an empty update', async () => {
    const res = await put('/api/settings/discord', {});
    expect(res.status).toBe(200);
    expect(restartDiscordBot).not.toHaveBeenCalled();
    expect(await getPgTestDb().select().from(discordSettings)).toHaveLength(1);
  });

  it('rate limits to 20 updates per window', async () => {
    for (let i = 0; i < 20; i++) expect((await put('/api/settings/discord', {})).status).toBe(200);
    expect((await put('/api/settings/discord', {})).status).toBe(429);
  });
});

describe('Announcer settings', () => {
  it('returns defaults, then persisted values', async () => {
    expect((await appRequest('/api/settings/announcer')).data).toEqual({
      announcer_voice: 'wrestling-announcer', voice_announcements_enabled: false, match_start_delay_seconds: 45,
    });
    const res = await put('/api/settings/announcer', { announcer_voice: 'male', voice_announcements_enabled: true, match_start_delay_seconds: 12 });
    expect(res.data).toEqual({ success: true });
    expect((await appRequest('/api/settings/announcer')).data).toEqual({
      announcer_voice: 'male', voice_announcements_enabled: true, match_start_delay_seconds: 12,
    });
  });

  it.each([-1, 301, '5'])('rejects match_start_delay_seconds=%j', async (value) => {
    const res = await put('/api/settings/announcer', { match_start_delay_seconds: value });
    expect(res.status).toBe(400);
  });

  it('accepts 0 as a delay', async () => {
    expect((await put('/api/settings/announcer', { match_start_delay_seconds: 0 })).status).toBe(200);
    expect((await appRequest('/api/settings/announcer')).data.match_start_delay_seconds).toBe(0);
  });
});

describe('UI settings', () => {
  it('returns the fallback when no row exists, then the stored row', async () => {
    expect((await appRequest('/api/settings/ui')).data).toEqual({ auto_refresh_interval_seconds: 10 });
    const res = await put('/api/settings/ui', { auto_refresh_interval_seconds: 30 });
    expect(res.data).toEqual({ message: 'UI settings updated successfully' });
    const get = await appRequest('/api/settings/ui');
    expect(get.data.auto_refresh_interval_seconds).toBe(30);
    expect(typeof get.data.updated_at).toBe('string'); // ISO timestamp
    await put('/api/settings/ui', { auto_refresh_interval_seconds: 45 });
    expect(await getPgTestDb().select().from(uiSettings)).toHaveLength(1);
  });

  it.each([undefined, 0, 4, 301])('rejects auto_refresh_interval_seconds=%j', async (value) => {
    const res = await put('/api/settings/ui', { auto_refresh_interval_seconds: value });
    expect(res.status).toBe(400);
  });
});

describe('Scheduler settings', () => {
  it('returns defaults without a row, stored values with one', async () => {
    expect((await appRequest('/api/settings/scheduler')).data).toEqual({ match_check_cron: '0 */1 * * * *', channel_refresh_cron: '0 0 0 * * *' });
    await getPgTestDb().insert(schedulerSettings).values({ id: 1, match_check_cron: '0 */5 * * * *' });
    expect((await appRequest('/api/settings/scheduler')).data.match_check_cron).toBe('0 */5 * * * *');
  });

  it.each([
    ['*/5 * * *', '0 0 0 * * *'],
    ['0 */1 * * * 8', '0 0 0 * * *'],
    ['0 */1 * * * *', '0 0 24 * * *'],
  ])('rejects invalid cron %s / %s', async (match_check_cron, channel_refresh_cron) => {
    const res = await put('/api/settings/scheduler', { match_check_cron, channel_refresh_cron });
    expect(res.status).toBe(400);
    expect(res.data.error).toContain('Invalid cron expression');
  });

  it('updates with valid expressions (including step syntax) and returns the row', async () => {
    const res = await put('/api/settings/scheduler', { match_check_cron: '*/30 * * * * *', channel_refresh_cron: '0 0 1 * * *' });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ id: 1, match_check_cron: '*/30 * * * * *', channel_refresh_cron: '0 0 1 * * *' });
    const [row] = await getPgTestDb().select().from(schedulerSettings);
    expect(row.match_check_cron).toBe('*/30 * * * * *');
  });
});

describe('Log level', () => {
  it('returns the stored level', async () => {
    expect((await appRequest('/api/settings/log-level')).data).toEqual({ log_level: 'warning' });
    await setAppSetting('log_level', 'debug');
    expect((await appRequest('/api/settings/log-level')).data).toEqual({ log_level: 'debug' });
  });

  it.each(['debug', 'info', 'warning', 'error', 'critical'])('accepts %s, persists it and reloads the logger', async (level) => {
    const res = await put('/api/settings/log-level', { log_level: level });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ success: true, log_level: level });
    expect(await getAppSetting('log_level')).toBe(level);
    expect(logger.reload).toHaveBeenCalled();
  });

  it.each([{ log_level: 'verbose' }, {}])('rejects %j', async (body) => {
    expect((await put('/api/settings/log-level', body)).status).toBe(400);
  });
});

describe('Feed retention', () => {
  it('returns the stored value and the default when the row is missing', async () => {
    expect((await appRequest('/api/settings/feed-retention')).data).toEqual({ feed_retention_days: 180 });
    await setAppSetting('feed_retention_days', '90');
    expect((await appRequest('/api/settings/feed-retention')).data).toEqual({ feed_retention_days: 90 });
  });

  it.each(['abc', 0, 9999, undefined])('rejects %j', async (value) => {
    expect((await put('/api/settings/feed-retention', { feed_retention_days: value })).status).toBe(400);
  });

  it('updates and accepts numeric strings', async () => {
    const res = await put('/api/settings/feed-retention', { feed_retention_days: '365' });
    expect(res.data).toEqual({ success: true, feed_retention_days: 365 });
    expect(await getAppSetting('feed_retention_days')).toBe('365');
  });
});

describe('Update check', () => {
  it('GET returns typed flags', async () => {
    await setAppSetting('update_available', 'true');
    await setAppSetting('latest_version', 'v1.2.3');
    const res = await appRequest('/api/settings/update-check');
    expect(res.data).toEqual({ update_check_enabled: true, update_available: true, latest_version: 'v1.2.3', update_check_last_run: '' });
    await setAppSetting('update_available', 'false');
    await setAppSetting('latest_version', '');
  });

  it('PUT persists booleans only', async () => {
    expect((await put('/api/settings/update-check', { update_check_enabled: false })).data).toEqual({ success: true, update_check_enabled: false });
    expect(await getAppSetting('update_check_enabled')).toBe('false');
    for (const bad of [{}, { update_check_enabled: 'true' }, { update_check_enabled: 1 }]) {
      expect((await put('/api/settings/update-check', bad)).status).toBe(400);
    }
  });

  it('POST runs the job, rate limiting within 60 seconds of the last run', async () => {
    const ok = await appRequest('/api/settings/update-check', { method: 'POST' });
    expect(ok.status).toBe(200);
    expect(ok.data.success).toBe(true);
    expect(checkForUpdate).toHaveBeenCalledTimes(1);

    await setAppSetting('update_check_last_run', new Date(Date.now() - 30_000).toISOString());
    expect((await appRequest('/api/settings/update-check', { method: 'POST' })).status).toBe(429);

    await setAppSetting('update_check_last_run', new Date(Date.now() - 120_000).toISOString());
    expect((await appRequest('/api/settings/update-check', { method: 'POST' })).status).toBe(200);
  });
});

describe('GET /api/settings (aggregate)', () => {
  it('returns every section with defaults and the voice list', async () => {
    const res = await appRequest('/api/settings');
    expect(res.status).toBe(200);
    expect(Object.keys(res.data).sort()).toEqual(['announcer', 'discord', 'scheduler', 'ui', 'voices']);
    expect(res.data.discord.bot_token).toBe('');
    expect(res.data.ui).toEqual({ auto_refresh_interval_seconds: 10 });
    expect(res.data.scheduler.match_check_cron).toBe('0 */1 * * * *');
    const names = res.data.voices.map((v: { name: string }) => v.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(res.data.voices.length).toBeGreaterThan(0);
  });

  it('masks the bot token and mirrors the announcer fields', async () => {
    await put('/api/settings/discord', { bot_token: 'tok', announcer_voice: 'v1', voice_announcements_enabled: true });
    const res = await appRequest('/api/settings');
    expect(res.data.discord.bot_token).toBe('••••••••');
    expect(res.data.announcer).toEqual({ announcer_voice: 'v1', voice_announcements_enabled: true });
  });

  it('returns 500 with the shared error shape when the database fails', async () => {
    const spy = vi.spyOn(getPgTestDb(), 'select').mockImplementation(() => { throw new Error('boom'); });
    const res = await appRequest('/api/settings');
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.data).toEqual({ error: 'Failed to fetch settings' });
  });
});
