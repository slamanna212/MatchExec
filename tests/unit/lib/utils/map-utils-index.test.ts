import { describe, it, expect } from 'vitest';
import { formatMapName, indexMapsWithModeVariants } from '../../../../src/lib/utils/map-utils';

const modes = [{ id: 'standard', name: 'Standard' }, { id: 'nobuild', name: 'No Build' }, { id: 'solo', name: 'Solo' }];
// What /api/games/fortnite/maps returns: one row for the map, under the first mode's id.
const dedup = [{ id: 'battleisland-nobuild', name: 'Battle Island', modeName: 'All Modes', imageUrl: '/i.webp' }];

describe('indexMapsWithModeVariants', () => {
  it('finds a map under every mode id, not just the one the endpoint listed', () => {
    const idx = indexMapsWithModeVariants(dedup, modes);
    expect(idx['battleisland-nobuild']).toMatchObject({ name: 'Battle Island', modeName: 'All Modes' }); // the listed row is untouched
    expect(idx['battleisland-standard']).toMatchObject({ name: 'Battle Island', imageUrl: '/i.webp', modeName: 'Standard', mode_id: 'standard', id: 'battleisland-standard' });
    expect(idx['battleisland-solo']).toMatchObject({ modeName: 'Solo', mode_id: 'solo' });
  });

  it('never replaces a row that already exists under that id', () => {
    const real = { id: 'ascent-premier', name: 'Ascent (Premier)', modeName: 'Premier' };
    const idx = indexMapsWithModeVariants([{ id: 'ascent-normal', name: 'Ascent', modeName: 'All Modes' }, real], [{ id: 'premier', name: 'Premier' }, { id: 'normal', name: 'Normal' }]);
    expect(idx['ascent-premier']).toBe(real);
  });

  it('leaves games with per-mode map rows alone', () => {
    const maps = [{ id: 'ascent-normal', name: 'Ascent', modeName: 'Normal' }];
    const idx = indexMapsWithModeVariants(maps, [{ id: 'premier', name: 'Premier' }]);
    expect(Object.keys(idx)).toEqual(['ascent-normal']);
  });
});

describe('formatMapName fallback', () => {
  it('turns a raw id into a readable name when nothing resolves', () => {
    expect(formatMapName('battleisland-standard')).toBe('Battleisland Standard');
    expect(formatMapName('ascent-normal-1793626179409-o4v9debkg')).toBe('Ascent Normal');
  });
});
