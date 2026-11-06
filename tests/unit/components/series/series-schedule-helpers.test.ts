import { describe, it, expect } from 'vitest';
import type { SeriesStageDto } from '@/shared/series-types';
import {
  buildSchedule, defaultCounts, editLevel, eventMovePatch, groupEventsByWeek, isSeedable, recentResults, seedOverride, stageMovePatch,
  unplayedInBatch, upcomingEvents, versusLine,
} from '@/components/series/series-schedule-helpers';
import type { SeriesEventView } from '@/components/series/series-shared';

const ev = (id: string, order: number, over: Partial<SeriesEventView> = {}): SeriesEventView => ({
  id, series_id: 's1', stage_id: null, event_type: 'match', match_id: `m-${id}`, tournament_id: null, event_order: order, event_date: null,
  points_multiplier: 1, role: 'regular', week: null, counts_for_standings: true, batch_id: null, status: 'live', entrant_ids: null,
  seeding_rule: null, name: `Event ${id}`, target_status: 'created', start_date: null, game_id: null, game_name: null, game_icon: null,
  game_color: null, ...over,
});
const stage = (id: string, order: number, over: Partial<SeriesStageDto> = {}): SeriesStageDto => ({
  id, series_id: 's1', name: `Stage ${id}`, stage_order: order, status: 'upcoming', counts_toward_season: true, scoring_config: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
});

describe('groupEventsByWeek', () => {
  it('returns one header-less group when no event has a week', () => {
    const { groups, showHeaders } = groupEventsByWeek([ev('b', 2), ev('a', 1)]);
    expect(showHeaders).toBe(false);
    expect(groups).toHaveLength(1);
    expect(groups[0].events.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('groups by week ascending with week-less events last', () => {
    const { groups, showHeaders } = groupEventsByWeek([ev('a', 1, { week: 2 }), ev('b', 2, { week: 1 }), ev('c', 3), ev('d', 4, { week: 2 })]);
    expect(showHeaders).toBe(true);
    expect(groups.map((g) => g.week)).toEqual([1, 2, null]);
    expect(groups[1].events.map((e) => e.id)).toEqual(['a', 'd']);
  });
});

describe('buildSchedule', () => {
  it('lists stages in order, each with its events, and hides an empty Unstaged group', () => {
    const sections = buildSchedule(
      [stage('2', 2), stage('1', 1)],
      [ev('a', 1, { stage_id: '1' }), ev('b', 2, { stage_id: '2' }), ev('c', 3, { stage_id: '1' })],
    );
    expect(sections.map((s) => s.key)).toEqual(['1', '2']);
    expect(sections[0].events.map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('appends an Unstaged group for events without a (known) stage', () => {
    const sections = buildSchedule([stage('1', 1)], [ev('a', 1, { stage_id: '1' }), ev('b', 2), ev('c', 3, { stage_id: 'gone' })]);
    expect(sections.map((s) => s.stage?.id ?? 'unstaged')).toEqual(['1', 'unstaged']);
    expect(sections[1].events.map((e) => e.id)).toEqual(['b', 'c']);
  });

  it('shows Unstaged as the only section for a series without stages (even when empty)', () => {
    expect(buildSchedule([], []).map((s) => s.stage)).toEqual([null]);
    expect(buildSchedule([], [ev('a', 1)])[0].events).toHaveLength(1);
  });

  it('groups a stage by week only when its events have weeks', () => {
    const [s1, s2] = buildSchedule(
      [stage('1', 1), stage('2', 2)],
      [ev('a', 1, { stage_id: '1', week: 1 }), ev('b', 2, { stage_id: '1', week: 2 }), ev('c', 3, { stage_id: '2' })],
    );
    expect(s1.showWeekHeaders).toBe(true);
    expect(s1.weeks.map((w) => w.week)).toEqual([1, 2]);
    expect(s2.showWeekHeaders).toBe(false);
  });
});

describe('move patches', () => {
  const list = [ev('a', 1), ev('b', 3), ev('c', 7)];

  it('moves an event to its neighbour\'s order (the server swaps)', () => {
    expect(eventMovePatch(list, 'b', -1)).toEqual({ event_order: 1 });
    expect(eventMovePatch(list, 'b', 1)).toEqual({ event_order: 7 });
  });

  it('returns null at the ends and for unknown events', () => {
    expect(eventMovePatch(list, 'a', -1)).toBeNull();
    expect(eventMovePatch(list, 'c', 1)).toBeNull();
    expect(eventMovePatch(list, 'zz', 1)).toBeNull();
  });

  it('moves stages by their neighbour\'s stage_order', () => {
    const stages = [stage('x', 1), stage('y', 2), stage('z', 3)];
    expect(stageMovePatch(stages, 'y', -1)).toEqual({ stage_order: 1 });
    expect(stageMovePatch(stages, 'y', 1)).toEqual({ stage_order: 3 });
    expect(stageMovePatch(stages, 'x', -1)).toBeNull();
  });
});

describe('editLevel / defaults', () => {
  it('maps series status to what can still be edited', () => {
    expect(editLevel('created')).toBe('full');
    expect(editLevel('registration')).toBe('full');
    expect(editLevel('active')).toBe('placement');
    expect(editLevel('complete')).toBe('none');
    expect(editLevel('cancelled')).toBe('none');
  });

  it('only regular events count by default', () => {
    expect(defaultCounts('regular')).toBe(true);
    expect(defaultCounts('stage_playoff')).toBe(false);
    expect(defaultCounts('exhibition')).toBe(false);
  });
});

describe('playoffs helpers', () => {
  const rule = (over: object = {}) => ({ source: 'stage' as const, stage_id: '1', top: 4, format: 'single-elimination' as const, template: { name: 'Playoffs' }, ...over });

  it('a planned stage playoff is seedable once its source stage is complete', () => {
    const planned = ev('p', 9, { status: 'planned', match_id: null, seeding_rule: rule() });
    expect(isSeedable(planned, [stage('1', 1, { status: 'active' })])).toBe(false);
    expect(isSeedable(planned, [stage('1', 1, { status: 'complete' })])).toBe(true);
    expect(isSeedable(ev('a', 1), [stage('1', 1, { status: 'complete' })])).toBe(false);
  });

  it('a season playoff needs every other stage complete', () => {
    const planned = ev('p', 9, { status: 'planned', stage_id: '3', match_id: null, seeding_rule: rule({ source: 'season', stage_id: null }) });
    expect(isSeedable(planned, [stage('1', 1, { status: 'complete' }), stage('3', 3)])).toBe(true);
    expect(isSeedable(planned, [stage('1', 1, { status: 'active' }), stage('3', 3)])).toBe(false);
  });

  it('seedOverride is only set when the order changed', () => {
    const q = (id: string, seed: number) => ({ entrant_id: id, name: id, seed, rank: seed, division: null });
    expect(seedOverride([q('a', 1), q('b', 2)], ['a', 'b'])).toBeUndefined();
    expect(seedOverride([q('a', 1), q('b', 2)], ['b', 'a'])).toEqual(['b', 'a']);
  });
});

describe('overview helpers', () => {
  it('lists unfinished live events soonest first and finished ones as results', () => {
    const events = [
      ev('late', 1, { start_date: '2026-03-01T00:00:00Z' }),
      ev('soon', 2, { start_date: '2026-02-01T00:00:00Z' }),
      ev('done', 3, { target_status: 'complete', start_date: '2026-01-01T00:00:00Z' }),
      ev('plan', 4, { status: 'planned', target_status: null }),
    ];
    expect(upcomingEvents(events).map((e) => e.id)).toEqual(['soon', 'late']);
    expect(recentResults(events).map((e) => e.id)).toEqual(['done']);
  });

  it('counts the unplayed events of a batch', () => {
    const events = [ev('a', 1, { batch_id: 'b1' }), ev('b', 2, { batch_id: 'b1', target_status: 'complete' }), ev('c', 3, { batch_id: 'b2' })];
    expect(unplayedInBatch(events, 'b1')).toBe(1);
  });

  it('versusLine needs exactly two entrants', () => {
    const e = (id: string) => ({ entrant_id: id, name: id, color: null });
    expect(versusLine({ entrants: [e('a'), e('b')] })).not.toBeNull();
    expect(versusLine({ entrants: [e('a')] })).toBeNull();
    expect(versusLine({})).toBeNull();
  });
});
