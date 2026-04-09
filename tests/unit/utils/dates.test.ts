import { describe, it, expect } from 'vitest';
import { parseDbTimestamp } from '../../../src/lib/utils/dates';

describe('parseDbTimestamp', () => {
  it('returns null for null input', () => {
    expect(parseDbTimestamp(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseDbTimestamp(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseDbTimestamp('')).toBeNull();
  });

  it('parses a UTC string with Z suffix', () => {
    const result = parseDbTimestamp('2025-08-09T00:40:16Z');
    expect(result).toBeInstanceOf(Date);
    expect(result?.getUTCFullYear()).toBe(2025);
    expect(result?.getUTCMonth()).toBe(7); // 0-indexed
    expect(result?.getUTCDate()).toBe(9);
  });

  it('parses a SQLite plain format (no timezone) as UTC', () => {
    const result = parseDbTimestamp('2025-08-09 00:40:16');
    expect(result).toBeInstanceOf(Date);
    expect(result?.getUTCFullYear()).toBe(2025);
    expect(result?.getUTCMonth()).toBe(7);
    expect(result?.getUTCDate()).toBe(9);
    expect(result?.getUTCHours()).toBe(0);
    expect(result?.getUTCMinutes()).toBe(40);
    expect(result?.getUTCSeconds()).toBe(16);
  });

  it('parses a string with positive timezone offset', () => {
    const result = parseDbTimestamp('2025-08-09T00:40:16+05:30');
    expect(result).toBeInstanceOf(Date);
  });

  it('parses a string with negative timezone offset', () => {
    const result = parseDbTimestamp('2025-08-09T00:40:16-07:00');
    expect(result).toBeInstanceOf(Date);
  });

  it('SQLite plain format returns same UTC time as equivalent Z string', () => {
    const plain = parseDbTimestamp('2025-08-09 00:40:16');
    const withZ = parseDbTimestamp('2025-08-09T00:40:16Z');
    expect(plain?.getTime()).toBe(withZ?.getTime());
  });
});
