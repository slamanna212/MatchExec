import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn<() => boolean>(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn<() => string | Buffer>(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: mocks.existsSync,
    mkdirSync: mocks.mkdirSync,
    writeFileSync: mocks.writeFileSync,
    readFileSync: mocks.readFileSync,
  },
  existsSync: mocks.existsSync,
  mkdirSync: mocks.mkdirSync,
  writeFileSync: mocks.writeFileSync,
  readFileSync: mocks.readFileSync,
}));

import {
  writeDbStatus,
  readDbStatus,
  markDbReady,
  markDbNotReady,
} from '@lib/database/status';

describe('database/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('writeDbStatus', () => {
    it('writes JSON status to file when directory exists', () => {
      mocks.existsSync.mockReturnValue(true);

      writeDbStatus({ ready: true, progress: 'Done', timestamp: 12345 });

      expect(mocks.writeFileSync).toHaveBeenCalledOnce();
      const content = mocks.writeFileSync.mock.calls[0][1] as string;
      const parsed = JSON.parse(content);
      expect(parsed.ready).toBe(true);
      expect(parsed.progress).toBe('Done');
    });

    it('creates directory when it does not exist', () => {
      mocks.existsSync.mockReturnValue(false);

      writeDbStatus({ ready: false, progress: 'Init', timestamp: 1 });

      expect(mocks.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('does not throw when writeFileSync fails', () => {
      mocks.existsSync.mockReturnValue(true);
      mocks.writeFileSync.mockImplementation(() => { throw new Error('disk full'); });

      expect(() => writeDbStatus({ ready: false, progress: 'fail', timestamp: 1 })).not.toThrow();
    });
  });

  describe('readDbStatus', () => {
    it('returns parsed status when file exists', () => {
      const stored = { ready: true, progress: 'Database ready', timestamp: 999 };
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue(JSON.stringify(stored));

      const result = readDbStatus();

      expect(result.ready).toBe(true);
      expect(result.progress).toBe('Database ready');
    });

    it('returns default status when file does not exist', () => {
      mocks.existsSync.mockReturnValue(false);

      const result = readDbStatus();

      expect(result.ready).toBe(false);
      expect(result.progress).toBe('Initializing database...');
      expect(typeof result.timestamp).toBe('number');
    });

    it('returns default status when file contains invalid JSON', () => {
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue('not-json');

      const result = readDbStatus();

      expect(result.ready).toBe(false);
    });

    it('returns default status when readFileSync throws', () => {
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockImplementation(() => { throw new Error('read error'); });

      const result = readDbStatus();

      expect(result.ready).toBe(false);
    });
  });

  describe('markDbReady', () => {
    it('writes ready=true with "Database ready" progress', () => {
      mocks.existsSync.mockReturnValue(true);

      markDbReady();

      expect(mocks.writeFileSync).toHaveBeenCalledOnce();
      const content = mocks.writeFileSync.mock.calls[0][1] as string;
      const parsed = JSON.parse(content);
      expect(parsed.ready).toBe(true);
      expect(parsed.progress).toBe('Database ready');
    });
  });

  describe('markDbNotReady', () => {
    it('writes ready=false with provided progress message', () => {
      mocks.existsSync.mockReturnValue(true);

      markDbNotReady('Running migrations...');

      expect(mocks.writeFileSync).toHaveBeenCalledOnce();
      const content = mocks.writeFileSync.mock.calls[0][1] as string;
      const parsed = JSON.parse(content);
      expect(parsed.ready).toBe(false);
      expect(parsed.progress).toBe('Running migrations...');
    });
  });
});
