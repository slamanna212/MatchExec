import { describe, expect, it } from 'vitest';
import {
  EMPTY_LAYOUT, addItem, addStage, describeDraftItem, draftSections, isLayoutEmpty, itemStage, layoutProblems, layoutTemplate, layoutTemplatesFor,
  moveItem, moveItemToStage, removeStage, replaceItem, summarizeLayout, toLayoutInput,
} from '@/components/series/series-layout';
import type { DraftLayout } from '@/components/series/series-layout';
import {
  closePayload, defaultDivisionNames, divisionPayload, existingDivisions, snakeSplit, unassignedToDivision,
} from '@/components/series/series-close';
import { buildSchedule, mergeRows, plannedWork } from '@/components/series/series-schedule-helpers';
import { buildSetupChecklist } from '@/components/series/series-overview-data';
import type { SeriesEventView } from '@/components/series/series-shared';
import type { RoundRobinConfig, SeriesBatchDto, SeriesEntrantDto } from '@/shared/series-types';

const RR: RoundRobinConfig = {
  double: false, divisions: 'none', start_date: '2030-01-01', match_days: [2], time_slots: ['19:00'], timezone: 'UTC', match: {},
};
const match = (name: string, stage: string | null = null) => ({ type: 'match' as const, input: { stage_id: stage, match: { name, start_date: '2030-01-08T19:00:00.000Z' } } });
const playoff = (sourceStage: string | null) => ({
  type: 'playoff' as const,
  input: {
    role: 'stage_playoff' as const, stage_id: null,
    seeding_rule: { source: sourceStage ? 'stage' as const : 'season' as const, stage_id: sourceStage, top: 4, format: 'single-elimination' as const, template: { name: 'Playoffs' } },
  },
});

function withTwoStages(): DraftLayout {
  return addStage(addStage(EMPTY_LAYOUT, 'Regular'), 'Playoffs', false);
}

describe('draft layout model', () => {
  it('adds stages and items and groups them into sections (unstaged last)', () => {
    let layout = withTwoStages();
    const [reg] = layout.stages;
    layout = addItem(layout, { type: 'batch', kind: 'round_robin', config: { ...RR, stage_id: reg.key } });
    layout = addItem(layout, match('Showcase'));
    const sections = draftSections(layout);
    expect(sections.map((s) => [s.stage?.name ?? 'Unstaged', s.items.length])).toEqual([['Regular', 1], ['Playoffs', 0], ['Unstaged', 1]]);
    expect(isLayoutEmpty(layout)).toBe(false);
    expect(isLayoutEmpty(EMPTY_LAYOUT)).toBe(true);
    expect(draftSections(EMPTY_LAYOUT)).toEqual([{ stage: null, items: [] }]);
  });

  it('moves items within their stage only, and between stages', () => {
    let layout = withTwoStages();
    const [reg, po] = layout.stages;
    layout = addItem(layout, match('A', reg.key));
    layout = addItem(layout, match('B', po.key));
    layout = addItem(layout, match('C', reg.key));
    const [a, , c] = layout.items;
    layout = moveItem(layout, c.key, -1);
    expect(layout.items.map((i) => (i.type === 'match' ? i.input.match.name : ''))).toEqual(['C', 'B', 'A']);
    expect(moveItem(layout, layout.items[0].key, -1)).toBe(layout); // already first in its stage
    layout = moveItemToStage(layout, a.key, po.key);
    expect(itemStage(layout.items.find((i) => i.key === a.key)!)).toBe(po.key);
  });

  it('removing a stage unstages its items and turns playoffs that read it into season playoffs', () => {
    let layout = withTwoStages();
    const [reg] = layout.stages;
    layout = addItem(layout, { type: 'batch', kind: 'round_robin', config: { ...RR, stage_id: reg.key } });
    layout = addItem(layout, playoff(reg.key));
    layout = removeStage(layout, reg.key);
    expect(layout.stages.map((s) => s.name)).toEqual(['Playoffs']);
    expect(itemStage(layout.items[0])).toBeNull();
    const po = layout.items[1];
    expect(po.type === 'playoff' && po.input.seeding_rule).toMatchObject({ source: 'season', stage_id: null });
    expect(po.type === 'playoff' && po.input.role).toBe('season_playoff');
  });

  it('replaces an item in place, keeping its key', () => {
    let layout = addItem(EMPTY_LAYOUT, match('Old'));
    const key = layout.items[0].key;
    layout = replaceItem(layout, key, match('New'));
    expect(layout.items).toHaveLength(1);
    expect(layout.items[0]).toMatchObject({ key, input: { match: { name: 'New' } } });
  });

  it('flags generators and playoff formats that do not fit the scoring type', () => {
    const rr = addItem(EMPTY_LAYOUT, { type: 'batch', kind: 'round_robin', config: RR });
    expect(layoutProblems(rr, 'Normal')).toEqual([]);
    expect(layoutProblems(rr, 'Position')[0]).toMatch(/race calendar instead/);
    expect(layoutProblems(addItem(EMPTY_LAYOUT, playoff(null)), 'FFA')[0]).toMatch(/cumulative points/);
    expect(layoutProblems(addItem(EMPTY_LAYOUT, playoff('gone')), 'Normal')[0]).toMatch(/no longer exists/);
  });

  it('builds the request layout without client keys on items', () => {
    let layout = addStage(EMPTY_LAYOUT, 'Regular');
    const reg = layout.stages[0].key;
    layout = addItem(layout, match('Opener', reg));
    layout = addItem(layout, { type: 'batch', kind: 'round_robin', config: { ...RR, stage_id: reg } });
    expect(toLayoutInput(layout)).toEqual({
      stages: [{ key: reg, name: 'Regular', counts_toward_season: true }],
      items: [
        { type: 'match', stage_id: reg, match: { name: 'Opener', start_date: '2030-01-08T19:00:00.000Z' } },
        { type: 'batch', kind: 'round_robin', config: { ...RR, stage_id: reg } },
      ],
    });
    expect(summarizeLayout(layout)).toBe('1 generated schedule, 1 match placeholder');
    expect(describeDraftItem(layout.items[1])).toMatch(/^Round robin · Tue 19:00 · from 2030-01-01$/);
  });

  it('offers templates per scoring type, valid for that type', () => {
    expect(layoutTemplatesFor('Normal').map((t) => t.id)).toEqual(['league_playoffs', 'league']);
    expect(layoutTemplatesFor('Position').map((t) => t.id)).toEqual(['race_season', 'race_season_finale']);
    const tpl = { game_id: 'g1', maps: [], rounds: null, rules: null };
    const league = layoutTemplate('league_playoffs', { startDate: '2030-02-04', template: tpl });
    expect(league.stages.map((s) => [s.name, s.counts_toward_season])).toEqual([['Regular season', true], ['Playoffs', false]]);
    expect(layoutProblems(league, 'Normal')).toEqual([]);
    const po = league.items[1];
    expect(po.type === 'playoff' && po.input.seeding_rule).toMatchObject({ source: 'stage', stage_id: league.stages[0].key, top: 4 });
    const finale = layoutTemplate('race_season_finale', { startDate: '2030-02-04', template: tpl });
    expect(layoutProblems(finale, 'Position')).toEqual([]);
    expect(layoutProblems(layoutTemplate('race_season', { template: tpl }), 'FFA')).toEqual([]);
  });
});

const entrant = (id: string, seed: number | null, division: string | null = null, status: SeriesEntrantDto['status'] = 'active'): SeriesEntrantDto => ({
  id, series_id: 's', name: id.toUpperCase(), tag: null, color: null, logo_url: null, division, seed, status, source_entrant_id: null,
  created_at: '', updated_at: '', members: [],
});

describe('close dialog helpers', () => {
  const entrants = [entrant('a', 1), entrant('b', 2), entrant('c', 3), entrant('d', 4), entrant('p', null, null, 'pending')];

  it('snake-splits approved entrants by seed', () => {
    expect(snakeSplit(entrants, ['East', 'West'])).toEqual({ a: 'East', b: 'West', c: 'West', d: 'East' });
    expect(defaultDivisionNames(3)).toEqual(['Division A', 'Division B', 'Division C']);
  });

  it('starts from the divisions already set and reports entrants without one', () => {
    expect(existingDivisions([entrant('a', 1, 'West'), entrant('b', 2, 'East'), entrant('c', 3, 'West')])).toEqual(['East', 'West']);
    expect(unassignedToDivision(entrants, ['East', 'West'], { a: 'East', b: 'West' }).map((e) => e.id)).toEqual(['c', 'd']);
    expect(unassignedToDivision(entrants, [], {})).toEqual([]);
  });

  it('sends every approved entrant, clearing divisions when there is only one', () => {
    expect(divisionPayload(entrants, [], { a: 'East' })).toEqual({ a: null, b: null, c: null, d: null });
    expect(divisionPayload(entrants, ['East', 'West'], { a: 'East', b: 'Gone' })).toEqual({ a: 'East', b: null, c: null, d: null });
  });

  it('builds the close body: round robins get a division mode, matches their entrants', () => {
    const batches = [
      { id: 'rr', kind: 'round_robin', status: 'planned' } as SeriesBatchDto,
      { id: 'cal', kind: 'race_calendar', status: 'planned' } as SeriesBatchDto,
    ];
    const body = closePayload({
      entrants, divisionNames: ['East', 'West'], divisionOf: snakeSplit(entrants, ['East', 'West']), batches, batchModes: {}, matches: { m1: ['a', 'b'] },
    });
    expect(body).toEqual({
      divisions: { a: 'East', b: 'West', c: 'West', d: 'East' },
      batches: { rr: { divisions: 'within' } },
      matches: { m1: ['a', 'b'] },
    });
    expect(closePayload({ entrants, divisionNames: [], divisionOf: {}, batches, batchModes: { rr: 'within' }, matches: {} }).batches)
      .toEqual({ rr: { divisions: 'none' } });
  });
});

const ev = (over: Partial<SeriesEventView>): SeriesEventView => ({
  id: 'e', series_id: 's', stage_id: null, event_type: 'match', match_id: null, tournament_id: null, event_order: 1, event_date: null,
  points_multiplier: 1, role: 'regular', week: null, counts_for_standings: true, batch_id: null, status: 'live', entrant_ids: null,
  seeding_rule: null, name: 'E', target_status: 'created', start_date: null, game_id: null, game_name: null, game_icon: null, game_color: null, ...over,
});
const batch = (over: Partial<SeriesBatchDto>): SeriesBatchDto => ({
  id: 'b', series_id: 's', stage_id: null, kind: 'round_robin', status: 'planned', config: RR, position: 2, created_at: '', event_count: 0, ...over,
});

describe('schedule helpers for placeholders', () => {
  it('puts planned schedules into their stage section and orders rows by slot', () => {
    const events = [ev({ id: 'opener', event_order: 1 }), ev({ id: 'final', event_order: 3, status: 'planned', seeding_rule: null, match_template: null })];
    const sections = buildSchedule([], events, [batch({ id: 'rr', position: 2 }), batch({ id: 'done', status: 'generated', position: null })]);
    expect(sections).toHaveLength(1);
    expect(sections[0].batches.map((b) => b.id)).toEqual(['rr']);
    expect(mergeRows(sections[0].events, sections[0].batches).map((r) => (r.kind === 'batch' ? r.batch.id : r.event.id))).toEqual(['opener', 'rr', 'final']);
  });

  it('lists the work the close dialog handles', () => {
    const events = [
      ev({ id: 'm', status: 'planned', match_template: { name: 'Opener', start_date: '2030-01-01T00:00:00Z' } }),
      ev({ id: 'po', status: 'planned', seeding_rule: { source: 'season', top: 2, format: 'single-elimination', template: { name: 'F' } } }),
      ev({ id: 'live' }),
    ];
    const work = plannedWork(events, [batch({ id: 'rr' }), batch({ id: 'old', status: 'generated' })]);
    expect(work.matches.map((e) => e.id)).toEqual(['m']);
    expect(work.batches.map((b) => b.id)).toEqual(['rr']);
  });

  it('counts placeholders as a planned schedule in the draft checklist', () => {
    const data = { entrants: [], stages: [], standings: null, channels: null };
    const series = { id: 's', announcements: true, discord_config: null, entrant_type: 'team' as const };
    const items = buildSetupChecklist(series, [ev({ status: 'planned', match_template: { name: 'Opener' } })], data, [batch({})]);
    const schedule = items.find((i) => i.key === 'events');
    expect(schedule).toMatchObject({ state: 'done' });
    expect(schedule?.description).toBe('1 schedule generated at registration close, 1 match placeholder.');
    expect(buildSetupChecklist(series, [], data, []).find((i) => i.key === 'events')?.state).toBe('todo');
  });
});
