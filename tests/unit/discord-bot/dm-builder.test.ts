import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('discord.js', () => ({
  EmbedBuilder: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.data = { fields: [] as { name: string; value: string; inline?: boolean }[], color: 0 };
    this.setColor = vi.fn(function (this: { data: { color: number } }, c: number) { this.data.color = c; return this; });
    this.setTitle = vi.fn().mockReturnThis();
    this.setDescription = vi.fn().mockReturnThis();
    this.setFooter = vi.fn().mockReturnThis();
    this.setTimestamp = vi.fn().mockReturnThis();
    this.addFields = vi.fn(function (
      this: { data: { fields: { name: string; value: string; inline?: boolean }[] } },
      ...fields: { name: string; value: string; inline?: boolean }[]
    ) {
      this.data.fields.push(...fields);
      return this;
    });
    return this;
  }),
}));

import {
  buildSignupWelcomeEmbed,
  buildCommanderAssignedEmbed,
  sendDM,
} from '../../../processes/discord-bot/modules/dm-builder';

describe('dm-builder', () => {
  describe('buildSignupWelcomeEmbed', () => {
    it('sets title containing the event name', () => {
      const embed = buildSignupWelcomeEmbed('Overwatch Cup', 'Overwatch 2', '#0099ff', null, false, null);
       
      const title = (embed as any).setTitle.mock.calls[0]?.[0];
      expect(title).toContain('Overwatch Cup');
    });

    it('uses "Tournament" label when isTournament=true', () => {
      const embed = buildSignupWelcomeEmbed('Big Tourney', 'Valorant', null, null, true, null);
       
      const eventDetailsField = (embed as any).data.fields.find(
        (f: { name: string }) => f.name === '📅 Event Details'
      );
      expect(eventDetailsField?.value).toContain('Tournament');
    });

    it('uses "Match" label when isTournament=false', () => {
      const embed = buildSignupWelcomeEmbed('Quick Match', 'Valorant', null, null, false, null);
       
      const eventDetailsField = (embed as any).data.fields.find(
        (f: { name: string }) => f.name === '📅 Event Details'
      );
      expect(eventDetailsField?.value).toContain('Match');
    });

    it('includes reminder minutes in whatToExpect field when provided', () => {
      const embed = buildSignupWelcomeEmbed('Match', 'Game', null, null, false, 30);
       
      const whatField = (embed as any).data.fields.find(
        (f: { name: string }) => f.name === '⏰ What to Expect'
      );
      expect(whatField?.value).toContain('30');
    });

    it('does not include reminder text when playerReminderMinutes is null', () => {
      const embed = buildSignupWelcomeEmbed('Match', 'Game', null, null, false, null);
       
      const whatField = (embed as any).data.fields.find(
        (f: { name: string }) => f.name === '⏰ What to Expect'
      );
      expect(whatField?.value).not.toContain('reminder');
    });

    it('includes announcement URL field when provided', () => {
      const embed = buildSignupWelcomeEmbed(
        'Match', 'Game', null, null, false, null,
        'https://discord.com/channels/123/456/789'
      );
       
      const announcementField = (embed as any).data.fields.find(
        (f: { name: string }) => f.name === '📢 Announcement'
      );
      expect(announcementField).toBeDefined();
      expect(announcementField?.value).toContain('discord.com');
    });

    it('does not include announcement field when URL is null', () => {
      const embed = buildSignupWelcomeEmbed('Match', 'Game', null, null, false, null, null);
       
      const announcementField = (embed as any).data.fields.find(
        (f: { name: string }) => f.name === '📢 Announcement'
      );
      expect(announcementField).toBeUndefined();
    });

    it('includes timestamp in event details when startDate is valid ISO string', () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString();
      const embed = buildSignupWelcomeEmbed('Match', 'Game', null, futureDate, false, null);
       
      const eventDetailsField = (embed as any).data.fields.find(
        (f: { name: string }) => f.name === '📅 Event Details'
      );
      // Discord timestamp format: <t:UNIX:F>
      expect(eventDetailsField?.value).toContain('<t:');
    });

    it('applies default color when gameColor is null', () => {
      const embed = buildSignupWelcomeEmbed('Match', 'Game', null, null, false, null);
       
      expect((embed as any).data.color).toBe(0x5865F2);
    });

    it('parses hex game color correctly', () => {
      const embed = buildSignupWelcomeEmbed('Match', 'Game', '#ff5500', null, false, null);
       
      expect((embed as any).data.color).toBe(0xff5500);
    });
  });

  describe('buildCommanderAssignedEmbed', () => {
    it('uses blue color for blue team side', () => {
      const embed = buildCommanderAssignedEmbed('Match X', 'OW2', null, 'blue');
       
      expect((embed as any).data.color).toBe(0x3498db);
    });

    it('uses red color for red team side', () => {
      const embed = buildCommanderAssignedEmbed('Match X', 'OW2', null, 'red');
       
      expect((embed as any).data.color).toBe(0xe74c3c);
    });

    it('uses game color for unknown team side', () => {
      const embed = buildCommanderAssignedEmbed('Match X', 'OW2', '#aabbcc', 'spectator');
       
      expect((embed as any).data.color).toBe(0xaabbcc);
    });

    it('mentions Blue team in description', () => {
      const embed = buildCommanderAssignedEmbed('Battle', 'Valorant', null, 'blue');
       
      const descArg = (embed as any).setDescription.mock.calls[0]?.[0];
      expect(descArg).toContain('Blue');
    });

    it('mentions Red team in description', () => {
      const embed = buildCommanderAssignedEmbed('Battle', 'Valorant', null, 'red');
       
      const descArg = (embed as any).setDescription.mock.calls[0]?.[0];
      expect(descArg).toContain('Red');
    });

    it('includes match name in description', () => {
      const embed = buildCommanderAssignedEmbed('Grand Final', 'CS2', null, 'blue');
       
      const descArg = (embed as any).setDescription.mock.calls[0]?.[0];
      expect(descArg).toContain('Grand Final');
    });

    it('includes game name in description', () => {
      const embed = buildCommanderAssignedEmbed('Match', 'League of Legends', null, 'red');
       
      const descArg = (embed as any).setDescription.mock.calls[0]?.[0];
      expect(descArg).toContain('League of Legends');
    });
  });

  describe('sendDM', () => {
    it('sends embed to the fetched user without throwing', async () => {
      const mockSend = vi.fn().mockResolvedValue(undefined);
      const mockUser = { send: mockSend };
      const mockClient = { users: { fetch: vi.fn().mockResolvedValue(mockUser) } };
      const mockEmbed = {} as never;

      await sendDM(mockClient as never, 'user-123', mockEmbed);

      expect(mockClient.users.fetch).toHaveBeenCalledWith('user-123');
      expect(mockSend).toHaveBeenCalledWith({ embeds: [mockEmbed] });
    });

    it('swallows error when user DMs are disabled (fetch throws)', async () => {
      const mockClient = {
        users: { fetch: vi.fn().mockRejectedValue(new Error('Cannot send messages to this user')) },
      };

      await expect(
        sendDM(mockClient as never, 'user-no-dms', {} as never)
      ).resolves.not.toThrow();
    });

    it('swallows error when user.send() throws', async () => {
      const mockUser = { send: vi.fn().mockRejectedValue(new Error('DMs disabled')) };
      const mockClient = { users: { fetch: vi.fn().mockResolvedValue(mockUser) } };

      await expect(
        sendDM(mockClient as never, 'user-dm-off', {} as never)
      ).resolves.not.toThrow();
    });
  });
});
