import { describe, it, expect } from 'vitest';
import { plural } from '../../src/lib/utils/plural';

describe('plural', () => {
  it('uses the singular only for exactly one', () => {
    expect(plural(1, 'map')).toBe('1 map');
    expect(plural(0, 'map')).toBe('0 maps');
    expect(plural(2, 'mode')).toBe('2 modes');
  });
  it('supports irregular plurals', () => {
    expect(plural(1, 'person', 'people')).toBe('1 person');
    expect(plural(3, 'person', 'people')).toBe('3 people');
  });
});
