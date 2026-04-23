import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must be mocked before importing the module under test
vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(),
    readFile: vi.fn(),
  },
}));

vi.mock('@/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

import fsPromises from 'fs/promises';
import { SignupFormLoader } from '@lib/signup-forms';

const mockFs = fsPromises as unknown as {
  access: ReturnType<typeof vi.fn>;
  readFile: ReturnType<typeof vi.fn>;
};

const validSignupForm = {
  fields: [
    { id: 'username', type: 'text', label: 'Username', required: true },
    { id: 'notes', type: 'largetext', label: 'Notes', required: false },
  ],
  submitButton: { text: 'Sign Up', loadingText: 'Joining...' },
};

describe('SignupFormLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    SignupFormLoader.clearCache();
  });

  describe('loadSignupForm', () => {
    it('returns form from file when valid signup.json exists', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(validSignupForm));

      const result = await SignupFormLoader.loadSignupForm('overwatch');

      expect(result).not.toBeNull();
      expect(result!.fields).toHaveLength(2);
      expect(result!.submitButton.text).toBe('Sign Up');
    });

    it('returns cached form on second call without re-reading file', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(validSignupForm));

      await SignupFormLoader.loadSignupForm('overwatch');
      await SignupFormLoader.loadSignupForm('overwatch');

      expect(mockFs.readFile).toHaveBeenCalledOnce();
    });

    it('returns default form when signup.json does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      const result = await SignupFormLoader.loadSignupForm('unknown-game');

      expect(result).not.toBeNull();
      expect(result!.fields.some(f => f.id === 'username')).toBe(true);
      expect(result!.submitButton.text).toBe('Sign Up');
    });

    it('returns default form when file content is invalid JSON', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue('not valid json');

      const result = await SignupFormLoader.loadSignupForm('broken-game');
      // JSON.parse will throw, caught by outer try
      expect(result).not.toBeNull();
      // Should be default form
      expect(result!.submitButton.text).toBe('Sign Up');
    });

    it('returns default form when form structure is invalid (missing submitButton)', async () => {
      const invalidForm = { fields: [{ id: 'x', type: 'text', label: 'X', required: true }] };
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(invalidForm));

      const result = await SignupFormLoader.loadSignupForm('invalid-game');
      expect(result!.submitButton.text).toBe('Sign Up');
    });

    it('returns default form when fields contain invalid types', async () => {
      const invalidForm = {
        fields: [{ id: 'x', type: 'invalid-type', label: 'X', required: true }],
        submitButton: { text: 'Go', loadingText: 'Going...' },
      };
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(invalidForm));

      const result = await SignupFormLoader.loadSignupForm('invalid-type-game');
      expect(result!.submitButton.text).toBe('Sign Up');
    });
  });

  describe('clearCache', () => {
    it('clears cache for a specific game', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(validSignupForm));

      await SignupFormLoader.loadSignupForm('overwatch');
      SignupFormLoader.clearCache('overwatch');
      await SignupFormLoader.loadSignupForm('overwatch');

      expect(mockFs.readFile).toHaveBeenCalledTimes(2);
    });

    it('clears all caches when called without argument', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(validSignupForm));

      await SignupFormLoader.loadSignupForm('game1');
      await SignupFormLoader.loadSignupForm('game2');
      SignupFormLoader.clearCache();
      await SignupFormLoader.loadSignupForm('game1');
      await SignupFormLoader.loadSignupForm('game2');

      expect(mockFs.readFile).toHaveBeenCalledTimes(4);
    });
  });
});
