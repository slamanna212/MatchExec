// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { discordSettings } from '../../../lib/db/schema';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

import { SettingsManager } from '../../../processes/discord-bot/modules/settings-manager';

setupPgTestFile();

describe('SettingsManager', () => {
  let manager: SettingsManager;

  beforeEach(() => {
    manager = new SettingsManager();
    vi.clearAllMocks();
  });

  it('returns null when no discord_settings row exists', async () => {
    expect(await manager.loadSettings()).toBeNull();
  });

  it('returns null when bot_token is empty', async () => {
    await getPgTestDb().insert(discordSettings).values({ id: 1, guild_id: 'guild-123', bot_token: '' });
    expect(await manager.loadSettings()).toBeNull();
  });

  it('returns trimmed settings with real booleans when bot_token is set', async () => {
    await getPgTestDb().insert(discordSettings).values({
      id: 1, guild_id: ' guild-123 ', bot_token: ' valid-token ', announcement_role_id: ' role-456 ',
      event_duration_minutes: 90, match_reminder_minutes: 15, player_reminder_minutes: 5,
      mention_everyone: true, announcer_voice: 'male', commander_dm_enabled: false,
    });
    expect(await manager.loadSettings()).toEqual({
      bot_token: 'valid-token',
      guild_id: 'guild-123',
      announcement_role_id: 'role-456',
      mention_everyone: true,
      event_duration_minutes: 90,
      match_reminder_minutes: 15,
      player_reminder_minutes: 5,
      announcer_voice: 'male',
      voice_announcements_enabled: true,
      signup_dm_enabled: true,
      commander_dm_enabled: false,
    });
  });

  it('leaves optional text fields undefined when null', async () => {
    await getPgTestDb().insert(discordSettings).values({ id: 1, guild_id: 'g', bot_token: 't' });
    const settings = await manager.loadSettings();
    expect(settings?.announcement_role_id).toBeUndefined();
    expect(settings?.announcer_voice).toBeUndefined();
  });

  it('returns null (and logs) when the query fails', async () => {
    const spy = vi.spyOn(getPgTestDb(), 'select').mockImplementation(() => { throw new Error('db down'); });
    expect(await manager.loadSettings()).toBeNull();
    spy.mockRestore();
  });
});
