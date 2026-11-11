/**
 * Plain-text summary of a series' planned season (the registration post shows it so players know what they sign up
 * for): planned round robins / race calendars, match placeholders and playoffs, in series order, labelled by stage. Pure.
 */
import type { RaceCalendarConfig, RoundRobinConfig, SeriesBatchDto, SeriesEventDto, SeriesStageDto } from '../../../shared/series-types';

const DAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

export interface LayoutSummaryInput {
  batches: readonly Pick<SeriesBatchDto, 'kind' | 'status' | 'config' | 'position' | 'stage_id'>[];
  events: readonly Pick<SeriesEventDto, 'status' | 'event_order' | 'stage_id' | 'name' | 'start_date' | 'seeding_rule' | 'match_template'>[];
  stages: readonly Pick<SeriesStageDto, 'id' | 'name'>[];
}

export interface LayoutSummaryFormat {
  /** A calendar date (YYYY-MM-DD of the config, or an ISO instant), e.g. a Discord timestamp. */
  date: (value: string) => string;
}

const listDays = (days: readonly number[]): string => {
  const names = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAY_NAMES[d]);
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
};

function batchLine(kind: 'round_robin' | 'race_calendar', config: RoundRobinConfig | RaceCalendarConfig, fmt: LayoutSummaryFormat): string {
  if (kind === 'round_robin') {
    const c = config as RoundRobinConfig;
    const tz = c.timezone ? ` ${c.timezone}` : '';
    return `${c.double ? 'Double round robin' : 'Round robin'}: ${listDays(c.match_days)} at ${c.time_slots.join(' / ')}${tz}, from ${fmt.date(c.start_date)}`;
  }
  const c = config as RaceCalendarConfig;
  const every = c.interval_days === 7 ? 'weekly' : `every ${c.interval_days} days`;
  return `${c.count} ${c.count === 1 ? 'round' : 'rounds'}, ${every} at ${c.time}${c.timezone ? ` ${c.timezone}` : ''}, from ${fmt.date(c.start_date)}`;
}

/** One line per placeholder ("Regular season · Round robin: Tuesdays at 19:00 UTC, from ..."); empty when nothing is planned. */
export function describeSeasonLayout(input: LayoutSummaryInput, fmt: LayoutSummaryFormat): string[] {
  const stageName = new Map(input.stages.map((s) => [s.id, s.name]));
  const prefix = (stageId: string | null) => (stageId && stageName.has(stageId) ? `${stageName.get(stageId)} · ` : '');
  const lines: Array<{ order: number; text: string }> = [];
  for (const b of input.batches) {
    if (b.status !== 'planned') continue;
    lines.push({ order: b.position ?? Number.MAX_SAFE_INTEGER, text: prefix(b.stage_id) + batchLine(b.kind, b.config, fmt) });
  }
  for (const e of input.events) {
    if (e.status !== 'planned') continue;
    if (e.match_template) {
      const when = e.start_date ? `, ${fmt.date(e.start_date)}` : '';
      lines.push({ order: e.event_order, text: `${prefix(e.stage_id)}${e.name ?? 'Match'}${when}` });
    } else if (e.seeding_rule) {
      const r = e.seeding_rule;
      const format = r.format === 'cumulative-points' ? 'points final' : r.format.replace(/-/g, ' ');
      lines.push({ order: e.event_order, text: `${prefix(e.stage_id)}${e.name ?? 'Playoffs'}: top ${r.top}${r.per_division ? ' of each division' : ''}, ${format}` });
    }
  }
  return lines.sort((a, b) => a.order - b.order).map((l) => l.text);
}
