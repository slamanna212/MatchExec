import { describe, it, expect } from 'vitest';
import type { SeriesEntrantDto, SeriesEntrantMemberDto } from '@/shared/series-types';
import {
  currentMembers, defaultMemberRole, describeWithdrawResult, distinctDivisions, formerMembers, groupEntrantsByDivision,
  nextSeed, rosterState, rosteredPlayerKeys,
} from '@/components/series/series-entrants-shared';

const member = (id: string, username: string, role: SeriesEntrantMemberDto['role'] = 'player', left_at: string | null = null): SeriesEntrantMemberDto => ({
  id, entrant_id: 'e', series_id: 's', user_id: `u-${id}`, discord_user_id: `d-${id}`, username, role, joined_at: '2026-01-01T00:00:00Z', left_at,
});

const entrant = (id: string, name: string, over: Partial<SeriesEntrantDto> = {}): SeriesEntrantDto => ({
  id, series_id: 's', name, tag: null, color: null, logo_url: null, division: null, seed: null, status: 'active', source_entrant_id: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', members: [], ...over,
});

describe('groupEntrantsByDivision', () => {
  it('returns a single flat group when nobody has a division', () => {
    const groups = groupEntrantsByDivision([entrant('b', 'Bravo'), entrant('a', 'Alpha')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].division).toBeNull();
    expect(groups[0].entrants.map((e) => e.name)).toEqual(['Alpha', 'Bravo']);
  });

  it('groups by division, sorted by name, entrants without a division last, seeds first inside a group', () => {
    const groups = groupEntrantsByDivision([
      entrant('1', 'Zed', { division: 'Pacific', seed: 2 }),
      entrant('2', 'Amy', { division: 'Pacific', seed: 1 }),
      entrant('3', 'Bob', { division: 'Atlantic' }),
      entrant('4', 'Cat'),
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Atlantic', 'Pacific', 'No division']);
    expect(groups[1].entrants.map((e) => e.name)).toEqual(['Amy', 'Zed']);
  });

  it('lists distinct divisions and the next free seed', () => {
    const list = [entrant('1', 'A', { division: 'West', seed: 3 }), entrant('2', 'B', { division: ' West ' }), entrant('3', 'C', { division: 'East' })];
    expect(distinctDivisions(list)).toEqual(['East', 'West']);
    expect(nextSeed(list)).toBe(4);
    expect(nextSeed([])).toBe(1);
  });
});

describe('rosters', () => {
  const team = entrant('t', 'Team', {
    members: [member('1', 'Sub', 'sub'), member('2', 'Cap', 'captain'), member('3', 'Ply'), member('4', 'Gone', 'player', '2026-02-01T00:00:00Z')],
  });

  it('orders current members captain, players, subs and splits off former ones', () => {
    expect(currentMembers(team).map((m) => m.username)).toEqual(['Cap', 'Ply', 'Sub']);
    expect(formerMembers(team).map((m) => m.username)).toEqual(['Gone']);
  });

  it('reports roster fill against the bounds', () => {
    expect(rosterState(team, 5, 6)).toMatchObject({ state: 'short', count: 3, missing: 2 });
    expect(rosterState(team, 2, 3)).toMatchObject({ state: 'full', count: 3 });
    expect(rosterState(team, 2, 6)).toMatchObject({ state: 'ok' });
    expect(rosterState(entrant('e', 'Empty'), null, null)).toMatchObject({ state: 'empty', missing: 1 });
  });

  it('suggests captain for the first player of a team only', () => {
    expect(defaultMemberRole('team', entrant('e', 'Empty'))).toBe('captain');
    expect(defaultMemberRole('team', team)).toBe('player');
    expect(defaultMemberRole('solo', entrant('e', 'Empty'))).toBe('player');
  });

  it('collects the players on current rosters of non-withdrawn entrants', () => {
    const keys = rosteredPlayerKeys([team, entrant('w', 'Out', { status: 'withdrawn', members: [member('9', 'Out')] })]);
    expect([...keys].sort()).toEqual(['d-1', 'd-2', 'd-3']);
  });
});

describe('describeWithdrawResult', () => {
  it('summarises cancelled and forfeited matches', () => {
    expect(describeWithdrawResult('Alpha', 2, 1)).toBe('Alpha withdrawn: 2 matches cancelled, 1 match forfeited');
    expect(describeWithdrawResult('Alpha', 0, 0)).toBe('Alpha withdrawn');
  });
});
