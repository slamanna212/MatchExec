import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

import { SettingsManager } from '../../../processes/discord-bot/modules/settings-manager';
import { getTestDb } from '../../utils/test-db';

describe('SettingsManager', () => {
  let db: any;
  let manager: SettingsManager;

  beforeEach(async () => {
    db = getTestDb();
    manager = new SettingsManager(db as any);
    vi.clearAllMocks();
  });

  describe('loadSettings', () => {
    it('returns null when no discord_settings row exists', async () => {
      const settings = await manager.loadSettings();
      expect(settings).toBeNull();
    });

    it('returns null when bot_token is empty', async () => {
      await db.run(`
        INSERT INTO discord_settings (id, guild_id, bot_token)
        VALUES (1, 'guild-123', '')
      `);

      const settings = await manager.loadSettings();
      expect(settings).toBeNull();
    });

    it('returns settings when bot_token is set', async () => {
      await db.run(`
        INSERT INTO discord_settings (id, guild_id, bot_token, event_duration_minutes, match_reminder_minutes)
        VALUES (1, 'guild-123', 'valid-token', 60, 30)
      `);

      const settings = await manager.loadSettings();
      expect(settings).not.toBeNull();
      expect(settings!.bot_token).toBe('valid-token');
      expect(settings!.guild_id).toBe('guild-123');
    });

    it('includes all relevant settings fields', async () => {
      await db.run(`
        INSERT INTO discord_settings (id, guild_id, bot_token, announcement_role_id, event_duration_minutes, match_reminder_minutes, player_reminder_minutes)
        VALUES (1, 'guild-123', 'valid-token', 'role-456', 90, 15, 5)
      `);

      const settings = await manager.loadSettings();
      expect(settings).not.toBeNull();
      expect(settings!.announcement_role_id).toBe('role-456');
      expect(settings!.event_duration_minutes).toBe(90);
      expect(settings!.match_reminder_minutes).toBe(15);
      expect(settings!.player_reminder_minutes).toBe(5);
    });
  });
});
