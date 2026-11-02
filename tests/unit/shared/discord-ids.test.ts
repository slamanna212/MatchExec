import { describe, it, expect } from 'vitest';
import { discordIdError, isDiscordId } from '../../../shared/discord-ids';

describe('discord ids', () => {
  it('accepts 17-20 digit numbers, with surrounding whitespace', () => {
    for (const id of ['12345678901234567', '1411105312588697712', '12345678901234567890', '  1411105312588697712 ']) expect(isDiscordId(id)).toBe(true);
  });
  it('rejects everything else', () => {
    for (const id of ['', 'abc', '1234567890123456', '123456789012345678901', '1411105312588697712a', '-1411105312588697712', '1.5e17', 123, null, undefined]) {
      expect(isDiscordId(id)).toBe(false);
    }
  });
  it('reports a message for a bad value, nothing for a good or optional-blank one', () => {
    expect(discordIdError('abc', 'Guild ID')).toMatch(/Guild ID must be a Discord ID/);
    expect(discordIdError('1411105312588697712', 'Guild ID')).toBeNull();
    expect(discordIdError('', 'Role ID')).toBeNull();
    expect(discordIdError('   ', 'Role ID')).toBeNull();
    expect(discordIdError('', 'Guild ID', true)).toBe('Guild ID is required');
  });
});
