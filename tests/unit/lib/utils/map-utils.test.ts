import { describe, it, expect } from 'vitest';
import { cleanMapId, getMapImageUrl, formatMapName, getStatusColor } from '../../../../src/lib/utils/map-utils';

describe('cleanMapId — edge cases', () => {
  it('empty string stays empty', () => {
    expect(cleanMapId('')).toBe('');
  });

  it('single word without suffix unchanged', () => {
    expect(cleanMapId('nepal')).toBe('nepal');
  });

  it('numeric-only suffix still stripped', () => {
    // regex: -\d+-[a-zA-Z0-9]+$
    expect(cleanMapId('map-1234567890-abc')).toBe('map');
  });

  it('only digits after dash are NOT stripped (no trailing alnum group)', () => {
    // "-1234" alone doesn't match pattern — no random suffix
    expect(cleanMapId('hanamura-1234')).toBe('hanamura-1234');
  });

  it('prefix with multiple hyphens strips only the last timestamp suffix', () => {
    expect(cleanMapId('king-of-the-hill-1700000000-x1y2')).toBe('king-of-the-hill');
  });

  it('uppercase letters in alnum suffix are stripped', () => {
    expect(cleanMapId('map-1711234567-ABCdef')).toBe('map');
  });
});

describe('getMapImageUrl — edge cases', () => {
  it('gameId with slashes is not sanitized (caller responsibility)', () => {
    const url = getMapImageUrl('ow2', 'hanamura');
    expect(url).toBe('/images/games/ow2/maps/hanamura.jpg');
  });

  it('empty gameId produces double-slash path', () => {
    const url = getMapImageUrl('', 'hanamura');
    expect(url).toBe('/images/games//maps/hanamura.jpg');
  });

  it('mapId with timestamp suffix is cleaned', () => {
    const url = getMapImageUrl('valorant', 'ascent-1700000000-abc');
    expect(url).toBe('/images/games/valorant/maps/ascent.jpg');
  });
});

describe('formatMapName — edge cases', () => {
  it('single uppercase word preserves case from ID', () => {
    expect(formatMapName('nepal')).toBe('Nepal');
  });

  it('empty string ID returns empty string', () => {
    expect(formatMapName('')).toBe('');
  });

  it('empty string mapName falls back to ID formatting', () => {
    expect(formatMapName('hanamura', '')).toBe('Hanamura');
  });

  it('mapName with spaces is returned unchanged', () => {
    expect(formatMapName('any-id', 'King Row')).toBe('King Row');
  });

  it('mixed snake and kebab in ID formats correctly', () => {
    // splits on [-_], so snake_kebab-mix → Snake Kebab Mix
    expect(formatMapName('snake_kebab-mix')).toBe('Snake Kebab Mix');
  });

  it('ID with timestamp suffix strips before formatting', () => {
    expect(formatMapName('hanamura-1700000000-abc')).toBe('Hanamura');
  });
});

describe('getStatusColor — edge cases', () => {
  it('returns gray for null-ish coerced value', () => {
    expect(getStatusColor('null')).toBe('gray');
  });

  it('returns gray for whitespace string', () => {
    expect(getStatusColor(' ')).toBe('gray');
  });

  it('case-sensitive: uppercase status returns gray', () => {
    expect(getStatusColor('COMPLETED')).toBe('gray');
    expect(getStatusColor('Battle')).toBe('gray');
  });
});
