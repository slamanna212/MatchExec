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

  it('resolves the affected CS2 match maps when the listed mode contains a hyphen', () => {
    const csModes = [{ id: 'arms-race', name: 'Arms Race' }, { id: 'premier', name: 'Premier' }, { id: 'normal', name: 'Normal' }];
    const maps = ['train', 'nuke', 'office', 'italy', 'shoots', 'pool-day'].map(id => ({
      id: `${id}-arms-race`, name: id, modeId: 'arms-race', modeName: 'All Modes', imageUrl: `/assets/${id}.png`,
    }));
    const idx = indexMapsWithModeVariants(maps, csModes);
    for (const id of ['train', 'nuke', 'office', 'shoots', 'pool-day']) {
      expect(idx[`${id}-premier`]).toMatchObject({ name: id, imageUrl: `/assets/${id}.png`, modeName: 'Premier' });
    }
    expect(idx['italy-normal'].imageUrl).toBe('/assets/italy.png');
    expect(idx['train-arms-premier']).toBeUndefined();
  });

  it('matches the longest known mode suffix when modeId is absent', () => {
    const idx = indexMapsWithModeVariants(
      [{ id: 'pool-day-arms-race', modeName: 'All Modes', imageUrl: '/pool.webp' }],
      [{ id: 'race', name: 'Race' }, { id: 'arms-race', name: 'Arms Race' }, { id: 'normal', name: 'Normal' }],
    );
    expect(idx['pool-day-normal'].imageUrl).toBe('/pool.webp');
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
