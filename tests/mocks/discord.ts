import { vi } from 'vitest';

// Mock Discord.js Client
export const mockDiscordClient = {
  user: { id: 'bot-user-id', tag: 'TestBot#1234' },
  guilds: {
    cache: new Map(),
    fetch: vi.fn(),
  },
  channels: {
    cache: new Map(),
    fetch: vi.fn(),
  },
  users: {
    cache: new Map(),
    fetch: vi.fn(),
  },
  login: vi.fn().mockResolvedValue('token'),
  destroy: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  emit: vi.fn(),
  isReady: vi.fn().mockReturnValue(true),
};

// Mock Discord Channel
export function createMockChannel(overrides = {}) {
  return {
    id: 'channel-123',
    name: 'test-channel',
    type: 0, // GuildText
    send: vi.fn().mockResolvedValue({ id: 'message-123' }),
    delete: vi.fn().mockResolvedValue(undefined),
    isTextBased: vi.fn().mockReturnValue(true),
    ...overrides,
  };
}

// Mock Discord Guild
export function createMockGuild(overrides = {}) {
  return {
    id: '284838321008207599',
    name: 'Test Server',
    channels: {
      cache: new Map(),
      create: vi.fn().mockResolvedValue(createMockChannel()),
      fetch: vi.fn(),
    },
    members: {
      cache: new Map(),
      fetch: vi.fn(),
    },
    ...overrides,
  };
}

// Mock Discord Message
export function createMockMessage(overrides = {}) {
  return {
    id: '1462509762519502988',
    content: 'Test message',
    channel: createMockChannel(),
    author: { id: 'user-123', tag: 'User#1234' },
    edit: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue({ id: 'reply-123' }),
    ...overrides,
  };
}

// Mock Voice Connection
export function createMockVoiceConnection() {
  return {
    state: { status: 'ready' },
    subscribe: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn(),
  };
}

// Reset all mocks
export function resetDiscordMocks() {
  vi.clearAllMocks();
  mockDiscordClient.guilds.cache.clear();
  mockDiscordClient.channels.cache.clear();
  mockDiscordClient.users.cache.clear();
}
