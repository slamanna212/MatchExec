// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { setupPgTestFile } from '../../utils/pg-test-db';
import {
  ensureDiscordSettingsRow, getAnyDiscordSettings, getAppSetting, getAppSettingRow, getAppSettings, getDiscordSettings,
  getSchedulerSettings, getUiSettings, listVoices, setAppSetting, setAutoRefreshInterval, updateAppSetting,
  updateDiscordSettings, updateSchedulerCrons,
} from '../../../src/lib/settings';
import { db } from '../../../lib/db';

setupPgTestFile({ seed: true });

describe('app_settings', () => {
  it('reads single values, rows and maps (missing keys are absent)', async () => {
    expect(await getAppSetting('log_level')).toBe('warning');
    expect(await getAppSetting('nope')).toBeUndefined();
    expect((await getAppSettingRow('log_level'))?.data_type).toBe('string');
    expect(await getAppSettings(['log_level', 'feed_retention_days', 'nope'])).toEqual({ log_level: 'warning', feed_retention_days: '180' });
    expect(await getAppSettings([])).toEqual({});
  });

  it('updateAppSetting only touches existing rows and bumps updated_at', async () => {
    const before = (await getAppSettingRow('log_level'))!.updated_at;
    await new Promise((r) => setTimeout(r, 5));
    expect(await updateAppSetting('log_level', 'info')).toBe(true);
    const after = await getAppSettingRow('log_level');
    expect(after?.setting_value).toBe('info');
    expect(after!.updated_at.getTime()).toBeGreaterThan(before.getTime());
    expect(await updateAppSetting('missing_key', 'x')).toBe(false);
    expect(await getAppSetting('missing_key')).toBeUndefined();
    await updateAppSetting('log_level', 'warning');
  });

  it('setAppSetting inserts then updates', async () => {
    await setAppSetting('custom_heartbeat', 'a');
    await setAppSetting('custom_heartbeat', 'b');
    expect(await getAppSetting('custom_heartbeat')).toBe('b');
  });

  it('works inside a transaction and rolls back with it', async () => {
    await expect(db.transaction(async (tx) => {
      await setAppSetting('tx_key', 'inside', tx);
      expect(await getAppSetting('tx_key', tx)).toBe('inside');
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    expect(await getAppSetting('tx_key')).toBeUndefined();
  });
});

describe('discord_settings', () => {
  it('has no row until first update; ensure is idempotent', async () => {
    expect(await getDiscordSettings()).toBeUndefined();
    await ensureDiscordSettingsRow();
    await ensureDiscordSettingsRow();
    expect((await getDiscordSettings())?.guild_id).toBe('');
  });

  it('updateDiscordSettings creates the row and applies a partial patch', async () => {
    await updateDiscordSettings({ guild_id: 'g', bot_token: 't', mention_everyone: true });
    await updateDiscordSettings({ event_duration_minutes: 99 });
    await updateDiscordSettings({});
    const row = await getDiscordSettings();
    expect(row).toMatchObject({ guild_id: 'g', bot_token: 't', mention_everyone: true, event_duration_minutes: 99, match_reminder_minutes: 10 });
    expect((await getAnyDiscordSettings())?.id).toBe(1);
  });
});

describe('ui and scheduler settings', () => {
  it('setAutoRefreshInterval upserts the singleton', async () => {
    expect(await getUiSettings()).toBeUndefined();
    await setAutoRefreshInterval(20);
    await setAutoRefreshInterval(40);
    expect((await getUiSettings())?.auto_refresh_interval_seconds).toBe(40);
  });

  it('updateSchedulerCrons creates with defaults and updates only given fields', async () => {
    expect(await getSchedulerSettings()).toBeUndefined();
    const created = await updateSchedulerCrons({ match_check_cron: '0 */2 * * * *' });
    expect(created.match_check_cron).toBe('0 */2 * * * *');
    expect(created.channel_refresh_cron).toBe('0 */6 * * *'); // schema default
    const updated = await updateSchedulerCrons({ channel_refresh_cron: '0 0 1 * * *' });
    expect(updated).toMatchObject({ match_check_cron: '0 */2 * * * *', channel_refresh_cron: '0 0 1 * * *' });
  });
});

describe('voices', () => {
  it('lists seeded voices ordered by name', async () => {
    const list = await listVoices();
    expect(list.length).toBeGreaterThan(0);
    const names = list.map((v) => v.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});
