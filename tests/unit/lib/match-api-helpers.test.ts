import { describe, it, expect } from 'vitest';
import { validateMatchRequest, parseMatchResponse } from '../../../src/app/api/matches/helpers';

describe('validateMatchRequest', () => {
  it('is invalid when name is missing', () => {
    expect(validateMatchRequest({ gameId: 'g1' } as any).valid).toBe(false);
  });

  it('is invalid when gameId is missing', () => {
    expect(validateMatchRequest({ name: 'Test' } as any).valid).toBe(false);
  });

  it('is invalid when name exceeds 255 characters', () => {
    expect(validateMatchRequest({ name: 'A'.repeat(256), gameId: 'g1' }).valid).toBe(false);
  });

  it('is invalid when description exceeds 1000 characters', () => {
    expect(validateMatchRequest({ name: 'T', gameId: 'g1', description: 'A'.repeat(1001) }).valid).toBe(false);
  });

  it('is invalid when livestreamLink exceeds 500 characters', () => {
    expect(validateMatchRequest({ name: 'T', gameId: 'g1', livestreamLink: 'A'.repeat(501) }).valid).toBe(false);
  });

  it('is invalid when rules is not casual or competitive', () => {
    expect(validateMatchRequest({ name: 'T', gameId: 'g1', rules: 'ranked' as any }).valid).toBe(false);
  });

  it('is invalid when rounds is 0 (below minimum of 1)', () => {
    expect(validateMatchRequest({ name: 'T', gameId: 'g1', rounds: 0 }).valid).toBe(false);
  });

  it('is invalid when rounds is 10 (above maximum of 9)', () => {
    expect(validateMatchRequest({ name: 'T', gameId: 'g1', rounds: 10 }).valid).toBe(false);
  });

  it('is valid with only required fields', () => {
    expect(validateMatchRequest({ name: 'Test Match', gameId: 'g1' }).valid).toBe(true);
  });

  it('is valid with rules=casual', () => {
    expect(validateMatchRequest({ name: 'T', gameId: 'g1', rules: 'casual' }).valid).toBe(true);
  });

  it('is valid with rules=competitive', () => {
    expect(validateMatchRequest({ name: 'T', gameId: 'g1', rules: 'competitive' }).valid).toBe(true);
  });

  it('is valid with rounds at boundary values 1 and 9', () => {
    expect(validateMatchRequest({ name: 'T', gameId: 'g1', rounds: 1 }).valid).toBe(true);
    expect(validateMatchRequest({ name: 'T', gameId: 'g1', rounds: 9 }).valid).toBe(true);
  });

  it('is valid when all optional fields are undefined', () => {
    const result = validateMatchRequest({
      name: 'T',
      gameId: 'g1',
      description: undefined,
      rules: undefined,
      rounds: undefined,
      livestreamLink: undefined,
    });
    expect(result.valid).toBe(true);
  });
});

describe('parseMatchResponse', () => {
  it('returns null for undefined input', () => {
    expect(parseMatchResponse(undefined)).toBeNull();
  });

  it('parses maps JSON string into an array', () => {
    const row = { id: 'm1', maps: JSON.stringify(['map-a', 'map-b']), map_codes: null } as any;
    expect(parseMatchResponse(row)?.maps).toEqual(['map-a', 'map-b']);
  });

  it('defaults maps to empty array when null', () => {
    const row = { id: 'm1', maps: null, map_codes: null } as any;
    expect(parseMatchResponse(row)?.maps).toEqual([]);
  });

  it('parses map_codes JSON string into an object', () => {
    const row = { id: 'm1', maps: null, map_codes: JSON.stringify({ 'map-1': 'ABC123' }) } as any;
    expect(parseMatchResponse(row)?.map_codes).toEqual({ 'map-1': 'ABC123' });
  });

  it('defaults map_codes to empty object when null', () => {
    const row = { id: 'm1', maps: null, map_codes: null } as any;
    expect(parseMatchResponse(row)?.map_codes).toEqual({});
  });

  it('falls back to empty array for malformed maps JSON', () => {
    const row = { id: 'm1', maps: 'not-valid-json', map_codes: null } as any;
    expect(parseMatchResponse(row)?.maps).toEqual([]);
  });

  it('falls back to empty object for malformed map_codes JSON', () => {
    const row = { id: 'm1', maps: null, map_codes: '{bad json}' } as any;
    expect(parseMatchResponse(row)?.map_codes).toEqual({});
  });

  it('passes through all other row fields unchanged', () => {
    const row = { id: 'm1', name: 'Test Match', status: 'created', maps: null, map_codes: null } as any;
    const result = parseMatchResponse(row);
    expect(result?.id).toBe('m1');
    expect(result?.name).toBe('Test Match');
    expect(result?.status).toBe('created');
  });
});
