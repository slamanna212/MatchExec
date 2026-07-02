import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger/client', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

import { getVersionInfo } from '../../../src/lib/version-client';

const makeResponse = (body: unknown, ok = true, status = 200) =>
  ({
    ok,
    status,
    json: async () => body,
  }) as unknown as Response;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getVersionInfo (client)', () => {
  it('returns version info from 200 response', async () => {
    const payload = {
      version: 'v1.2.3',
      branch: 'main',
      commitHash: 'abc123',
      isDev: false,
      updateAvailable: false,
      latestVersion: 'v1.2.3',
      platform: null,
    };
    global.fetch = vi.fn().mockResolvedValue(makeResponse(payload));

    const info = await getVersionInfo();
    expect(info.version).toBe('v1.2.3');
    expect(info.branch).toBe('main');
    expect(info.commitHash).toBe('abc123');
    expect(info.isDev).toBe(false);
    expect(info.updateAvailable).toBe(false);
  });

  it('calls /api/version endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue(makeResponse({}));
    await getVersionInfo();
    expect(global.fetch).toHaveBeenCalledWith('/api/version');
  });

  it('returns fallback on 404 response', async () => {
    global.fetch = vi.fn().mockResolvedValue(makeResponse({}, false, 404));
    const info = await getVersionInfo();
    expect(info.version).toBe('unknown');
    expect(info.branch).toBe('unknown');
    expect(info.commitHash).toBe('unknown');
    expect(info.updateAvailable).toBe(false);
    expect(info.latestVersion).toBe('');
    expect(info.platform).toBeNull();
  });

  it('returns fallback on 500 response', async () => {
    global.fetch = vi.fn().mockResolvedValue(makeResponse({}, false, 500));
    const info = await getVersionInfo();
    expect(info.version).toBe('unknown');
  });

  it('returns fallback when fetch throws (network error)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));
    const info = await getVersionInfo();
    expect(info.version).toBe('unknown');
  });

  it('does not throw on network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('timeout'));
    await expect(getVersionInfo()).resolves.toBeDefined();
  });

  it('returns all expected keys in fallback', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('err'));
    const info = await getVersionInfo();
    const keys = ['version', 'branch', 'commitHash', 'isDev', 'updateAvailable', 'latestVersion', 'platform'];
    for (const key of keys) {
      expect(info).toHaveProperty(key);
    }
  });

  it('response shape mismatch still returns the parsed object', async () => {
    // The function just returns response.json() — no validation
    const partial = { version: 'v9.0.0' };
    global.fetch = vi.fn().mockResolvedValue(makeResponse(partial));
    const info = await getVersionInfo();
    expect(info.version).toBe('v9.0.0');
  });
});
