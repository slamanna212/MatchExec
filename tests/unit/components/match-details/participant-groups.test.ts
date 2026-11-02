import { describe, it, expect } from 'vitest';
import { layoutParticipants } from '../../../../src/components/match-details/participant-groups';

const p = (id: string, order: number | null, name: string | null = null, assignment?: 'blue' | 'red' | 'reserve') => ({
  id, team_order: order, team_name: name, team_assignment: assignment ?? (order === 0 ? 'blue' : order === 1 ? 'red' : null),
});

describe('layoutParticipants', () => {
  it('is flat for FFA regardless of team orders', () => {
    const layout = layoutParticipants([p('1', 0), p('2', 1), p('3', 2)], 'FFA');
    expect(layout.kind).toBe('flat');
  });

  it('is flat for Position when every team has at most one participant', () => {
    expect(layoutParticipants([p('1', 0), p('2', 1)], 'Position').kind).toBe('flat');
  });

  it('is flat for Position when nobody is on a team yet', () => {
    expect(layoutParticipants([p('1', null)], 'Position').kind).toBe('flat');
  });

  it('groups Position team modes into teams in order with the reserve as unassigned', () => {
    const layout = layoutParticipants([p('1', 1, 'Team 2'), p('2', 0, 'Team 1'), p('3', 0, 'Team 1'), p('4', 99, 'Reserve', 'reserve')], 'Position');
    expect(layout.kind).toBe('teams');
    if (layout.kind !== 'teams') return;
    expect(layout.teams.map((t) => [t.title, t.players.length])).toEqual([['Team 1', 2], ['Team 2', 1]]);
    expect(layout.unassigned.map((x) => x.id)).toEqual(['4']);
  });

  it('is two sides for Normal with at most two teams', () => {
    const layout = layoutParticipants([p('1', 0, 'Blue'), p('2', 1, 'Red'), p('3', null)], 'Normal');
    expect(layout.kind).toBe('sides');
    if (layout.kind !== 'sides') return;
    expect([layout.blue.title, layout.red.title]).toEqual(['Blue Team', 'Red Team']);
    expect(layout.unassigned.map((x) => x.id)).toEqual(['3']);
  });

  it('uses real team names for named two-team matches', () => {
    const layout = layoutParticipants([p('1', 0, 'Alpha'), p('2', 1, 'Charlie')], 'Normal');
    expect(layout.kind === 'sides' && [layout.blue.title, layout.red.title]).toEqual(['Alpha', 'Charlie']);
  });

  it('is one section per team for Normal with three or more teams', () => {
    const layout = layoutParticipants([p('1', 0, 'Team 1'), p('2', 1, 'Team 2'), p('3', 2, 'Team 3')], 'Normal');
    expect(layout.kind).toBe('teams');
  });

  it('falls back to team_assignment for participants without team metadata', () => {
    const layout = layoutParticipants([{ id: '1', team_assignment: 'blue' as const }, { id: '2', team_assignment: 'red' as const }], 'Normal');
    expect(layout.kind).toBe('sides');
    if (layout.kind !== 'sides') return;
    expect(layout.blue.players.map((x) => x.id)).toEqual(['1']);
    expect(layout.red.players.map((x) => x.id)).toEqual(['2']);
  });
});
