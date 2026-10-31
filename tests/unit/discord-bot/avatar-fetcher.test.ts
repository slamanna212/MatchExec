import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

import { getDiscordAvatarUrl } from '../../../processes/discord-bot/utils/avatar-fetcher';

function makeClient(user: { id: string; avatar: string | null }) {
  return {
    users: {
      fetch: vi.fn().mockResolvedValue(user),
    },
  };
}

describe('getDiscordAvatarUrl', () => {
  it('returns null when user has no avatar', async () => {
    const client = makeClient({ id: 'user-123', avatar: null });
    const result = await getDiscordAvatarUrl(client as never, 'user-123');
    expect(result).toBeNull();
  });

  it('constructs CDN URL with webp format for non-animated avatars', async () => {
    const client = makeClient({ id: 'user-123', avatar: 'abcdef1234567890' });
    const result = await getDiscordAvatarUrl(client as never, 'user-123');
    expect(result).toContain('cdn.discordapp.com');
    expect(result).toContain('user-123');
    expect(result).toContain('abcdef1234567890');
    expect(result).toContain('.webp');
  });

  it('uses gif format for animated avatars starting with a_', async () => {
    const client = makeClient({ id: 'user-456', avatar: 'a_animated1234' });
    const result = await getDiscordAvatarUrl(client as never, 'user-456');
    expect(result).toContain('.gif');
  });

  it('includes size=128 query parameter', async () => {
    const client = makeClient({ id: 'user-789', avatar: 'static_hash' });
    const result = await getDiscordAvatarUrl(client as never, 'user-789');
    expect(result).toContain('size=128');
  });

  it('fetches user using provided discordUserId', async () => {
    const client = makeClient({ id: 'user-999', avatar: 'hash' });
    await getDiscordAvatarUrl(client as never, 'user-999');
    expect(client.users.fetch).toHaveBeenCalledWith('user-999');
  });

  it('propagates error when users.fetch throws', async () => {
    const client = {
      users: { fetch: vi.fn().mockRejectedValue(new Error('Unknown User')) },
    };
    await expect(getDiscordAvatarUrl(client as never, 'bad-id')).rejects.toThrow('Unknown User');
  });

  it('URL contains the user id in the path', async () => {
    const client = makeClient({ id: 'user-abc', avatar: 'hashvalue' });
    const result = await getDiscordAvatarUrl(client as never, 'user-abc');
    expect(result).toContain('/avatars/user-abc/');
  });
});
