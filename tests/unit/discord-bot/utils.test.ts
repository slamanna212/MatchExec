import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

import { Utils } from '../../../processes/discord-bot/modules/utils';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData } from '../../utils/fixtures';

describe('Utils', () => {
  let db: any;
  let utils: Utils;

  beforeEach(async () => {
    await seedBasicTestData();
    db = getTestDb();
    vi.clearAllMocks();
    utils = new Utils(db as any);
  });

  // ─── parseGameColor ───────────────────────────────────────────────────────────

  describe('parseGameColor', () => {
    it('returns default green for undefined', () => {
      expect(utils.parseGameColor(undefined)).toBe(0x4caf50);
    });

    it('returns default green for empty string', () => {
      expect(utils.parseGameColor('')).toBe(0x4caf50);
    });

    it('parses hex color with # prefix', () => {
      expect(utils.parseGameColor('#ff0000')).toBe(0xff0000);
    });

    it('parses hex color without # prefix', () => {
      expect(utils.parseGameColor('00ff00')).toBe(0x00ff00);
    });

    it('parses mixed case hex', () => {
      expect(utils.parseGameColor('#FFFFFF')).toBe(0xFFFFFF);
    });
  });

  // ─── generateId ──────────────────────────────────────────────────────────────

  describe('generateId', () => {
    it('generates ID with prefix', () => {
      const id = utils.generateId('match');
      expect(id.startsWith('match_')).toBe(true);
    });

    it('generates unique IDs', () => {
      const id1 = utils.generateId('test');
      const id2 = utils.generateId('test');
      expect(id1).not.toBe(id2);
    });

    it('uses provided prefix', () => {
      expect(utils.generateId('tournament').startsWith('tournament_')).toBe(true);
    });
  });

  // ─── formatUptime ─────────────────────────────────────────────────────────────

  describe('formatUptime', () => {
    it('formats 0 seconds', () => {
      expect(utils.formatUptime(0)).toBe('0h 0m 0s');
    });

    it('formats seconds', () => {
      expect(utils.formatUptime(45)).toBe('0h 0m 45s');
    });

    it('formats minutes', () => {
      expect(utils.formatUptime(90)).toBe('0h 1m 30s');
    });

    it('formats hours', () => {
      expect(utils.formatUptime(3600)).toBe('1h 0m 0s');
    });

    it('formats mixed hours minutes seconds', () => {
      expect(utils.formatUptime(3723)).toBe('1h 2m 3s');
    });

    it('formats large uptime', () => {
      const result = utils.formatUptime(86400); // 24 hours
      expect(result).toBe('24h 0m 0s');
    });
  });

  // ─── getChannelsForNotificationType ──────────────────────────────────────────

  describe('getChannelsForNotificationType', () => {
    it('returns empty array when no channels', async () => {
      const result = await utils.getChannelsForNotificationType('announcements');
      expect(result).toHaveLength(0);
    });

    it('returns channels with matching notification type enabled', async () => {
      await db.run(`INSERT OR IGNORE INTO discord_settings (id, guild_id, bot_token) VALUES (1, 'g1', 'tok')`);
      await db.run(
        `INSERT INTO discord_channels (id, guild_id, discord_channel_id, name, type, channel_type, send_announcements)
         VALUES ('ch-1', 'g1', 'dc-1', 'announce', 0, 'text', 1)`
      );

      const result = await utils.getChannelsForNotificationType('announcements');
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].send_announcements).toBe(true);
    });

    it('filters correctly - only returns channels with that type enabled', async () => {
      await db.run(`INSERT OR IGNORE INTO discord_settings (id, guild_id, bot_token) VALUES (1, 'g1', 'tok')`);
      await db.run(
        `INSERT INTO discord_channels (id, guild_id, discord_channel_id, name, type, channel_type, send_announcements, send_reminders)
         VALUES ('ch-2', 'g1', 'dc-2', 'reminders', 0, 'text', 0, 1)`
      );

      const annResult = await utils.getChannelsForNotificationType('announcements');
      const reminderResult = await utils.getChannelsForNotificationType('reminders');

      // reminders channel should not appear in announcements query
      const hasRemindersInAnn = annResult.some((c: any) => c.id === 'ch-2');
      expect(hasRemindersInAnn).toBe(false);

      // reminders channel should appear in reminders query
      const hasRemindersInRem = reminderResult.some((c: any) => c.id === 'ch-2');
      expect(hasRemindersInRem).toBe(true);
    });

    it('handles all valid notification types', async () => {
      for (const type of ['announcements', 'reminders', 'match_start', 'signup_updates'] as const) {
        const result = await utils.getChannelsForNotificationType(type);
        expect(Array.isArray(result)).toBe(true);
      }
    });
  });
});
