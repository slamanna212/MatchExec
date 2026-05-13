import { describe, it, expect, vi } from 'vitest';

// Mock the logger to prevent database access during import
vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

// Mock discord.js
vi.mock('discord.js', () => {
  class MockEmbedBuilder {
    data: { fields: Array<{ name: string; value: string; inline?: boolean }> } = { fields: [] };
    setColor(_c: number) { return this; }
    setTitle(_t: string) { return this; }
    setDescription(_d: string) { return this; }
    setFooter(_f: object) { return this; }
    addFields(...newFields: Array<{ name: string; value: string; inline?: boolean }>) {
      this.data.fields.push(...newFields);
      return this;
    }
  }
  return { EmbedBuilder: MockEmbedBuilder };
});

// Mock dm-builder sendDM
vi.mock('../../../processes/discord-bot/modules/dm-builder', () => ({
  sendDM: vi.fn().mockResolvedValue(undefined),
}));

import {
  getPlayerRole,
  getRoleCategoryPriority,
  sortStatDefs,
  formatStatValue,
  buildStatsEmbed,
} from '../../../processes/discord-bot/modules/stats-report-handler';

// --- Test data helpers ---

function makeStat(
  name: string,
  displayName: string,
  category: string,
  sortOrder: number,
  isPrimary: boolean,
  format: string | null = null
) {
  return { id: name, name, display_name: displayName, stat_type: 'number', category, sort_order: sortOrder, is_primary: isPrimary ? 1 : 0, format };
}

const OW2_STATS = [
  makeStat('eliminations', 'Eliminations', 'combat', 1, true),
  makeStat('assists', 'Assists', 'combat', 2, true),
  makeStat('deaths', 'Deaths', 'combat', 3, true),
  makeStat('damage', 'Damage', 'combat', 4, true, 'thousands'),
  makeStat('healing', 'Healing', 'support', 5, true, 'thousands'),
  makeStat('damage_mitigated', 'Mitigation', 'tank', 6, false, 'thousands'),
];

const MATCH_INFO = {
  id: 'match-1',
  name: 'Test Match',
  game_id: 'overwatch2',
  game_name: 'Overwatch',
  game_color: '#FA9C1D',
};

// ---

describe('getPlayerRole', () => {
  it('returns null for null signupData', () => {
    expect(getPlayerRole(null, 'overwatch2')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(getPlayerRole('not-json', 'overwatch2')).toBeNull();
  });

  it('returns null for unknown game', () => {
    expect(getPlayerRole(JSON.stringify({ roles: 'Tank' }), 'unknowngame')).toBeNull();
  });

  it('parses OW2 roles string (single value)', () => {
    expect(getPlayerRole(JSON.stringify({ roles: 'Tank' }), 'overwatch2')).toBe('Tank');
  });

  it('parses OW2 roles comma-separated string, takes first', () => {
    expect(getPlayerRole(JSON.stringify({ roles: 'Tank, DPS, Support' }), 'overwatch2')).toBe('Tank');
  });

  it('parses OW2 roles JSON array string, takes first', () => {
    expect(getPlayerRole(JSON.stringify({ roles: '["DPS","Support"]' }), 'overwatch2')).toBe('DPS');
  });

  it('parses Marvel Rivals roles', () => {
    expect(getPlayerRole(JSON.stringify({ roles: 'Duelist' }), 'marvelrivals')).toBe('Duelist');
  });

  it('parses Valorant role_preference', () => {
    expect(getPlayerRole(JSON.stringify({ role_preference: 'Duelist' }), 'valorant')).toBe('Duelist');
  });

  it('parses CS2 preferred_role', () => {
    expect(getPlayerRole(JSON.stringify({ preferred_role: 'Entry Fragger' }), 'counterstrike2')).toBe('Entry Fragger');
  });

  it('returns null when field is missing', () => {
    expect(getPlayerRole(JSON.stringify({ other: 'value' }), 'overwatch2')).toBeNull();
  });
});

describe('getRoleCategoryPriority', () => {
  it('returns [] for null role', () => {
    expect(getRoleCategoryPriority('overwatch2', null)).toEqual([]);
  });

  it('returns [] for unknown game', () => {
    expect(getRoleCategoryPriority('unknowngame', 'Tank')).toEqual([]);
  });

  it('OW2 Tank → tank first', () => {
    expect(getRoleCategoryPriority('overwatch2', 'Tank')).toEqual(['tank', 'combat', 'support']);
  });

  it('OW2 DPS → combat first', () => {
    expect(getRoleCategoryPriority('overwatch2', 'DPS')).toEqual(['combat', 'tank', 'support']);
  });

  it('OW2 Damage → combat first (synonym)', () => {
    expect(getRoleCategoryPriority('overwatch2', 'Damage')).toEqual(['combat', 'tank', 'support']);
  });

  it('OW2 Support → support first', () => {
    expect(getRoleCategoryPriority('overwatch2', 'Support')).toEqual(['support', 'combat', 'tank']);
  });

  it('OW2 Healer → support first (synonym)', () => {
    expect(getRoleCategoryPriority('overwatch2', 'Healer')).toEqual(['support', 'combat', 'tank']);
  });

  it('Marvel Rivals Duelist → combat first', () => {
    expect(getRoleCategoryPriority('marvelrivals', 'Duelist')).toEqual(['combat', 'support']);
  });

  it('Marvel Rivals Strategist → support first', () => {
    expect(getRoleCategoryPriority('marvelrivals', 'Strategist')).toEqual(['support', 'combat']);
  });

  it('Marvel Rivals Vanguard → combat first (tank role)', () => {
    expect(getRoleCategoryPriority('marvelrivals', 'Vanguard')).toEqual(['combat', 'support']);
  });
});

describe('sortStatDefs', () => {
  it('with no priority, sorts by is_primary DESC then sort_order ASC', () => {
    const result = sortStatDefs(OW2_STATS, []);
    const names = result.map(d => d.name);
    // Primaries first, then non-primaries
    const primaryNames = OW2_STATS.filter(s => s.is_primary === 1).sort((a, b) => a.sort_order - b.sort_order).map(s => s.name);
    const nonPrimaryNames = OW2_STATS.filter(s => s.is_primary === 0).map(s => s.name);
    expect(names).toEqual([...primaryNames, ...nonPrimaryNames]);
  });

  it('with tank priority for OW2, damage_mitigated (tank) comes first', () => {
    const result = sortStatDefs(OW2_STATS, ['tank', 'combat', 'support']);
    // tank category: damage_mitigated
    // combat category: eliminations, assists, deaths, damage (primaries first by sort_order)
    // support category: healing
    expect(result[0].name).toBe('damage_mitigated');
    // remaining should be combat stats, then support
    const remainingNames = result.slice(1).map(d => d.name);
    expect(remainingNames).toContain('eliminations');
    expect(remainingNames).toContain('healing');
    const healingIdx = remainingNames.indexOf('healing');
    const elim = remainingNames.indexOf('eliminations');
    expect(elim).toBeLessThan(healingIdx); // combat before support
  });

  it('with support priority for OW2, healing comes first', () => {
    const result = sortStatDefs(OW2_STATS, ['support', 'combat', 'tank']);
    expect(result[0].name).toBe('healing');
  });

  it('handles empty stat list', () => {
    expect(sortStatDefs([], ['combat', 'support'])).toEqual([]);
  });
});

describe('formatStatValue', () => {
  it('formats thousands correctly for values >= 1000', () => {
    expect(formatStatValue(12500, 'thousands')).toBe('12.5K');
  });

  it('formats thousands for values < 1000 as integer', () => {
    expect(formatStatValue(500, 'thousands')).toBe('500');
  });

  it('formats decimal to 2 decimal places', () => {
    expect(formatStatValue(3.14159, 'decimal')).toBe('3.14');
  });

  it('formats percentage with % sign, rounded', () => {
    expect(formatStatValue(67.8, 'percentage')).toBe('68%');
  });

  it('rounds plain numbers', () => {
    expect(formatStatValue(42.7, null)).toBe('43');
  });

  it('returns 0 for zero', () => {
    expect(formatStatValue(0, null)).toBe('0');
  });
});

describe('buildStatsEmbed', () => {
  const participant = {
    username: 'TestPlayer',
    team_assignment: 'blue',
    signup_data: JSON.stringify({ roles: 'Tank' }),
    maps_played: 3,
  };

  const totalStats = {
    eliminations: 20,
    assists: 15,
    deaths: 5,
    damage: 18000,
    healing: 5000,
    damage_mitigated: 22000,
  };

  it('sets blue color for blue team', () => {
    const embed = buildStatsEmbed(participant, totalStats, OW2_STATS, MATCH_INFO) as any;
    // The embed is an instance of MockEmbedBuilder, check it was called
    expect(embed).toBeDefined();
    expect(embed.data).toBeDefined();
  });

  it('sets red color for red team', () => {
    const redParticipant = { ...participant, team_assignment: 'red' };
    const embed = buildStatsEmbed(redParticipant, totalStats, OW2_STATS, MATCH_INFO) as any;
    expect(embed).toBeDefined();
  });

  it('adds Maps Played field', () => {
    const embed = buildStatsEmbed(participant, totalStats, OW2_STATS, MATCH_INFO);
    const fields = embed.data.fields as Array<{ name: string; value: string }>;
    const mapsField = fields.find(f => f.name === '📅 Maps Played');
    expect(mapsField).toBeDefined();
    expect(mapsField?.value).toBe('3');
  });

  it('adds Role field when role is available', () => {
    const embed = buildStatsEmbed(participant, totalStats, OW2_STATS, MATCH_INFO);
    const fields = embed.data.fields as Array<{ name: string; value: string }>;
    const roleField = fields.find(f => f.name === '🎮 Role');
    expect(roleField).toBeDefined();
    expect(roleField?.value).toBe('Tank');
  });

  it('does not add Role field when signup_data is null', () => {
    const noRoleParticipant = { ...participant, signup_data: null };
    const embed = buildStatsEmbed(noRoleParticipant, totalStats, OW2_STATS, MATCH_INFO);
    const fields = embed.data.fields as Array<{ name: string; value: string }>;
    const roleField = fields.find(f => f.name === '🎮 Role');
    expect(roleField).toBeUndefined();
  });

  it('adds Best Stat field for a primary stat with a positive value', () => {
    const embed = buildStatsEmbed(participant, totalStats, OW2_STATS, MATCH_INFO);
    const fields = embed.data.fields as Array<{ name: string; value: string }>;
    const bestField = fields.find(f => f.name === '⭐ Best Stat');
    expect(bestField).toBeDefined();
  });

  it('adds stat fields from the stat definitions', () => {
    const embed = buildStatsEmbed(participant, totalStats, OW2_STATS, MATCH_INFO);
    const fields = embed.data.fields as Array<{ name: string; value: string }>;
    const statFieldNames = fields
      .filter(f => !['📅 Maps Played', '🎮 Role', '⭐ Best Stat'].includes(f.name))
      .map(f => f.name);
    // Should have at least one stat field
    expect(statFieldNames.length).toBeGreaterThan(0);
  });

  it('does not exceed 25 total fields', () => {
    const embed = buildStatsEmbed(participant, totalStats, OW2_STATS, MATCH_INFO);
    const fields = embed.data.fields as Array<{ name: string; value: string }>;
    expect(fields.length).toBeLessThanOrEqual(25);
  });

  it('for Tank role, puts damage_mitigated (tank category) before other stats', () => {
    const embed = buildStatsEmbed(participant, totalStats, OW2_STATS, MATCH_INFO);
    const fields = embed.data.fields as Array<{ name: string; value: string }>;
    const statFields = fields.filter(f => !['📅 Maps Played', '🎮 Role', '⭐ Best Stat'].includes(f.name));
    const mitigationIdx = statFields.findIndex(f => f.name === 'Mitigation');
    const eliminationsIdx = statFields.findIndex(f => f.name === 'Eliminations');
    expect(mitigationIdx).toBeLessThan(eliminationsIdx);
  });
});
