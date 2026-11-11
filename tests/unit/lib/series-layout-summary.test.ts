import { describe, expect, it } from 'vitest';
import { describeSeasonLayout } from '@/lib/series/layout-summary';
import type { RaceCalendarConfig, RoundRobinConfig } from '@/shared/series-types';

const RR: RoundRobinConfig = {
  double: true, divisions: 'none', start_date: '2030-01-01', match_days: [4, 2], time_slots: ['19:00', '20:00'], timezone: 'UTC', match: {},
};
const CAL: RaceCalendarConfig = { count: 6, start_date: '2030-01-05', interval_days: 14, time: '18:00', event_kind: 'match' };
const fmt = { date: (v: string) => `[${v.slice(0, 10)}]` };

describe('describeSeasonLayout', () => {
  it('lists planned schedules, match placeholders and playoffs in series order, with their stage', () => {
    const lines = describeSeasonLayout({
      stages: [{ id: 'reg', name: 'Regular season' }, { id: 'po', name: 'Playoffs' }],
      batches: [
        { kind: 'round_robin', status: 'planned', config: RR, position: 2, stage_id: 'reg' },
        { kind: 'race_calendar', status: 'generated', config: CAL, position: null, stage_id: null },
      ],
      events: [
        { status: 'planned', event_order: 3, stage_id: 'po', name: 'Playoffs', start_date: null, match_template: null,
          seeding_rule: { source: 'stage', stage_id: 'reg', top: 4, per_division: true, format: 'single-elimination', template: { name: 'Playoffs' } } },
        { status: 'planned', event_order: 1, stage_id: 'reg', name: 'Opener', start_date: '2029-12-28T19:00:00.000Z', seeding_rule: null, match_template: { name: 'Opener' } },
        { status: 'live', event_order: 4, stage_id: null, name: 'Played', start_date: null, seeding_rule: null, match_template: null },
      ],
    }, fmt);
    expect(lines).toEqual([
      'Regular season · Opener, [2029-12-28]',
      'Regular season · Double round robin: Tuesdays and Thursdays at 19:00 / 20:00 UTC, from [2030-01-01]',
      'Playoffs · Playoffs: top 4 of each division, single elimination',
    ]);
  });

  it('describes race calendars and is empty without placeholders', () => {
    expect(describeSeasonLayout({ stages: [], events: [], batches: [{ kind: 'race_calendar', status: 'planned', config: CAL, position: 1, stage_id: null }] }, fmt))
      .toEqual(['6 rounds, every 14 days at 18:00, from [2030-01-05]']);
    expect(describeSeasonLayout({ stages: [], events: [], batches: [] }, fmt)).toEqual([]);
  });
});
