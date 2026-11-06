import type { SeedPreviewResponse, SeriesEventDto, SeriesEventRole, SeriesStageDto, SeriesStatus } from '@/shared/series-types';
import type { SeriesEventView } from './series-shared';
import { isEventFinished } from './series-shared';

/** Pure logic behind the Schedule tab: grouping events into stage / week sections, reordering and series-status rules. */

export const UNSTAGED_KEY = '__unstaged';

export interface ScheduleWeekGroup {
  /** null = events without a week. */
  week: number | null;
  events: SeriesEventView[];
}

export interface ScheduleSection {
  key: string;
  /** null = the "Unstaged" group. */
  stage: SeriesStageDto | null;
  /** All events of the section in event order. */
  events: SeriesEventView[];
  /** Same events grouped by week (a single group without week header when no event has a week). */
  weeks: ScheduleWeekGroup[];
  showWeekHeaders: boolean;
}

export const byEventOrder = (a: SeriesEventView, b: SeriesEventView): number => a.event_order - b.event_order || a.id.localeCompare(b.id);

/** Groups events by week ascending (events without a week last). Events keep their event order inside a week. */
export function groupEventsByWeek(events: readonly SeriesEventView[]): { groups: ScheduleWeekGroup[]; showHeaders: boolean } {
  const sorted = [...events].sort(byEventOrder);
  if (!sorted.some((e) => e.week !== null)) return { groups: [{ week: null, events: sorted }], showHeaders: false };
  const byWeek = new Map<number | null, SeriesEventView[]>();
  for (const e of sorted) byWeek.set(e.week, [...(byWeek.get(e.week) ?? []), e]);
  const weeks = [...byWeek.keys()].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  });
  return { groups: weeks.map((week) => ({ week, events: byWeek.get(week) ?? [] })), showHeaders: true };
}

/**
 * Stages in order, each with its events. Events without a (known) stage go to the "Unstaged" section, which is hidden
 * when empty as soon as the series has stages (a series without stages shows it as its only section).
 */
export function buildSchedule(stages: readonly SeriesStageDto[], events: readonly SeriesEventView[]): ScheduleSection[] {
  const orderedStages = [...stages].sort((a, b) => a.stage_order - b.stage_order);
  const known = new Set(orderedStages.map((s) => s.id));
  const section = (key: string, stage: SeriesStageDto | null, list: SeriesEventView[]): ScheduleSection => {
    const { groups, showHeaders } = groupEventsByWeek(list);
    return { key, stage, events: [...list].sort(byEventOrder), weeks: groups, showWeekHeaders: showHeaders };
  };
  const sections = orderedStages.map((st) => section(st.id, st, events.filter((e) => e.stage_id === st.id)));
  const unstaged = events.filter((e) => !e.stage_id || !known.has(e.stage_id));
  if (unstaged.length > 0 || orderedStages.length === 0) sections.push(section(UNSTAGED_KEY, null, unstaged));
  return sections;
}

/**
 * Patch that moves an event one place up (-1) or down (+1) within the given list (the events of its section). The server
 * swaps places with the event that holds the target order, so the patch is the neighbour's order. Null at the ends.
 */
export function eventMovePatch(sectionEvents: readonly SeriesEventView[], eventId: string, delta: -1 | 1): { event_order: number } | null {
  const sorted = [...sectionEvents].sort(byEventOrder);
  const index = sorted.findIndex((e) => e.id === eventId);
  const neighbour = sorted[index + delta];
  if (index < 0 || !neighbour) return null;
  return { event_order: neighbour.event_order };
}

/** Patch that moves a stage one place up or down (the server moves it there and renumbers the rest). */
export function stageMovePatch(stages: readonly SeriesStageDto[], stageId: string, delta: -1 | 1): { stage_order: number } | null {
  const sorted = [...stages].sort((a, b) => a.stage_order - b.stage_order);
  const index = sorted.findIndex((s) => s.id === stageId);
  const neighbour = sorted[index + delta];
  if (index < 0 || !neighbour) return null;
  return { stage_order: neighbour.stage_order };
}

export type SeriesEditLevel = 'none' | 'placement' | 'full';

/**
 * What can still be edited: a finished series is read-only; stage / week / date placement can change while it runs;
 * multiplier, order, role and "counts" only before it starts (the server answers 409 otherwise).
 */
export function editLevel(status: SeriesStatus): SeriesEditLevel {
  if (status === 'complete' || status === 'cancelled') return 'none';
  return status === 'created' || status === 'registration' ? 'full' : 'placement';
}

export const STRUCTURE_LOCKED_HINT = 'Order, multiplier and role are locked once the series starts';

/** Counting default per role (regular events count, everything else does not). */
export function defaultCounts(role: SeriesEventRole): boolean {
  return role === 'regular';
}

/** Short "A vs B" line for a two-entrant match; null otherwise. */
export function versusLine(event: Pick<SeriesEventDto, 'entrants'>): { a: NonNullable<SeriesEventDto['entrants']>[number]; b: NonNullable<SeriesEventDto['entrants']>[number] } | null {
  const e = event.entrants;
  return e && e.length === 2 ? { a: e[0], b: e[1] } : null;
}

/** Planned events whose source stage is complete (or, for a season rule, whose stages are all complete) can be seeded. */
export function isSeedable(event: SeriesEventView, stages: readonly SeriesStageDto[]): boolean {
  if (event.status !== 'planned' || !event.seeding_rule) return false;
  const rule = event.seeding_rule;
  if (rule.source === 'stage') return stages.find((s) => s.id === rule.stage_id)?.status === 'complete';
  return stages.length > 0 && stages.every((s) => s.status === 'complete' || s.id === event.stage_id);
}

/** Live events that have not finished, soonest first (undated events by order). */
export function upcomingEvents(events: readonly SeriesEventView[], limit = 5): SeriesEventView[] {
  return events
    .filter((e) => e.status === 'live' && !isEventFinished(e.target_status))
    .sort((a, b) => {
      const ta = a.start_date ? Date.parse(a.start_date) : Number.POSITIVE_INFINITY;
      const tb = b.start_date ? Date.parse(b.start_date) : Number.POSITIVE_INFINITY;
      return ta - tb || byEventOrder(a, b);
    })
    .slice(0, limit);
}

/** Finished live events, most recent first. */
export function recentResults(events: readonly SeriesEventView[], limit = 3): SeriesEventView[] {
  return events
    .filter((e) => e.status === 'live' && e.target_status === 'complete')
    .sort((a, b) => (b.start_date ? Date.parse(b.start_date) : 0) - (a.start_date ? Date.parse(a.start_date) : 0) || byEventOrder(b, a))
    .slice(0, limit);
}

/** Events that still have unplayed fixtures of the same batch (for the batch actions' confirm text). */
export function unplayedInBatch(events: readonly SeriesEventView[], batchId: string): number {
  return events.filter((e) => e.batch_id === batchId && e.status === 'live' && ['created', 'gather', 'assign'].includes(e.target_status ?? '')).length;
}

/** Entrant ids to send as the manual seed order: only when it differs from the preview's order. */
export function seedOverride(original: readonly SeedPreviewResponse['qualifiers'][number][], order: readonly string[]): string[] | undefined {
  const same = original.length === order.length && original.every((q, i) => q.entrant_id === order[i]);
  return same ? undefined : [...order];
}
