import type {
  CreateSeriesPlannedEventInput, CreateSeriesPlannedMatchInput, RaceCalendarConfig, RoundRobinConfig, SeriesBatchKind, SeriesLayoutInput,
  SeriesScoringType, SeriesStageDto,
} from '@/shared/series-types';
import {
  browserTimeZone, buildRaceCalendarConfig, buildRoundRobinConfig, defaultRaceCalendarForm, defaultRoundRobinForm, describeScheduleConfig,
} from './series-fixtures';
import type { MatchTemplateState } from './series-fixtures';
import type { SeriesEventView } from './series-shared';

/**
 * Pure model of the season layout the create flow builds before the series exists (its Schedule step): stages and
 * placeholders keyed by client keys, sent as `layout` with POST /api/series (the server maps the stage keys).
 */

export interface DraftStage {
  key: string;
  name: string;
  counts_toward_season: boolean;
}

export type DraftItem =
  | { key: string; type: 'batch'; kind: SeriesBatchKind; config: RoundRobinConfig | RaceCalendarConfig }
  | { key: string; type: 'match'; input: CreateSeriesPlannedMatchInput }
  | { key: string; type: 'playoff'; input: CreateSeriesPlannedEventInput };

/** A draft item before it got its key. */
export type NewDraftItem =
  | { type: 'batch'; kind: SeriesBatchKind; config: RoundRobinConfig | RaceCalendarConfig }
  | { type: 'match'; input: CreateSeriesPlannedMatchInput }
  | { type: 'playoff'; input: CreateSeriesPlannedEventInput };

export interface DraftLayout {
  stages: DraftStage[];
  items: DraftItem[];
}

export const EMPTY_LAYOUT: DraftLayout = { stages: [], items: [] };

let seq = 0;
export function newKey(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

/** The stage key an item sits in (null = unstaged). */
export function itemStage(item: DraftItem | NewDraftItem): string | null {
  return (item.type === 'batch' ? item.config.stage_id : item.input.stage_id) ?? null;
}

function withStage<T extends DraftItem | NewDraftItem>(item: T, stageKey: string | null): T {
  if (item.type === 'batch') return { ...item, config: { ...item.config, stage_id: stageKey } };
  return { ...item, input: { ...item.input, stage_id: stageKey } } as T;
}

export function isLayoutEmpty(layout: DraftLayout | null | undefined): boolean {
  return !layout || (layout.stages.length === 0 && layout.items.length === 0);
}

// ─── stages ──────────────────────────────────────────────────────────────────

export function addStage(layout: DraftLayout, name: string, countsTowardSeason = true): DraftLayout {
  return { ...layout, stages: [...layout.stages, { key: newKey('stage'), name: name.trim(), counts_toward_season: countsTowardSeason }] };
}

export function updateStage(layout: DraftLayout, key: string, patch: Partial<Omit<DraftStage, 'key'>>): DraftLayout {
  return { ...layout, stages: layout.stages.map((s) => (s.key === key ? { ...s, ...patch, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}) } : s)) };
}

export function moveStage(layout: DraftLayout, key: string, delta: -1 | 1): DraftLayout {
  const i = layout.stages.findIndex((s) => s.key === key);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= layout.stages.length) return layout;
  const stages = [...layout.stages];
  [stages[i], stages[j]] = [stages[j], stages[i]];
  return { ...layout, stages };
}

/** Removes a stage: its items become unstaged, and playoffs that read it read the whole season instead. */
export function removeStage(layout: DraftLayout, key: string): DraftLayout {
  const items = layout.items.map((item) => {
    let next = itemStage(item) === key ? withStage(item, null) : item;
    if (next.type === 'playoff' && next.input.seeding_rule.source === 'stage' && next.input.seeding_rule.stage_id === key) {
      next = { ...next, input: { ...next.input, role: 'season_playoff', seeding_rule: { ...next.input.seeding_rule, source: 'season', stage_id: null } } };
    }
    return next;
  });
  return { stages: layout.stages.filter((s) => s.key !== key), items };
}

// ─── items ───────────────────────────────────────────────────────────────────

export function addItem(layout: DraftLayout, item: NewDraftItem): DraftLayout {
  return { ...layout, items: [...layout.items, { ...item, key: newKey(item.type) } as DraftItem] };
}

export function replaceItem(layout: DraftLayout, key: string, item: NewDraftItem): DraftLayout {
  return { ...layout, items: layout.items.map((it) => (it.key === key ? ({ ...item, key } as DraftItem) : it)) };
}

export function removeItem(layout: DraftLayout, key: string): DraftLayout {
  return { ...layout, items: layout.items.filter((it) => it.key !== key) };
}

export function moveItemToStage(layout: DraftLayout, key: string, stageKey: string | null): DraftLayout {
  return { ...layout, items: layout.items.map((it) => (it.key === key ? withStage(it, stageKey) : it)) };
}

/** Swaps an item with its neighbour inside the same stage (the order is the series order). */
export function moveItem(layout: DraftLayout, key: string, delta: -1 | 1): DraftLayout {
  const index = layout.items.findIndex((it) => it.key === key);
  if (index < 0) return layout;
  const stage = itemStage(layout.items[index]);
  const sameStage = layout.items.map((it, i) => ({ it, i })).filter(({ it }) => itemStage(it) === stage);
  const pos = sameStage.findIndex(({ i }) => i === index);
  const neighbour = sameStage[pos + delta];
  if (!neighbour) return layout;
  const items = [...layout.items];
  [items[index], items[neighbour.i]] = [items[neighbour.i], items[index]];
  return { ...layout, items };
}

// ─── sections / views ────────────────────────────────────────────────────────

export interface DraftSection {
  stage: DraftStage | null;
  items: DraftItem[];
}

/** Stages in order with their items; an "Unstaged" section when items have no (known) stage, or when there are no stages. */
export function draftSections(layout: DraftLayout): DraftSection[] {
  const known = new Set(layout.stages.map((s) => s.key));
  const sections: DraftSection[] = layout.stages.map((stage) => ({ stage, items: layout.items.filter((it) => itemStage(it) === stage.key) }));
  const unstaged = layout.items.filter((it) => { const k = itemStage(it); return !k || !known.has(k); });
  if (unstaged.length > 0 || layout.stages.length === 0) sections.push({ stage: null, items: unstaged });
  return sections;
}

/** Draft stages shaped like stored ones, for the shared modals (stage selects use id / name). */
export function draftStagesAsDtos(layout: DraftLayout): SeriesStageDto[] {
  const now = new Date(0).toISOString();
  return layout.stages.map((s, i) => ({
    id: s.key, series_id: 'draft', name: s.name, stage_order: i + 1, status: 'upcoming', counts_toward_season: s.counts_toward_season,
    scoring_config: null, created_at: now, updated_at: now,
  }));
}

interface GameLookup {
  games: Array<{ id: string; name: string; icon_url?: string | null; color?: string | null }>;
}

/** A match / playoff draft item as an event view, so it renders with the same row as saved events. */
export function draftEventView(item: Extract<DraftItem, { type: 'match' | 'playoff' }>, order: number, catalog: GameLookup, seriesGameId: string | null): SeriesEventView {
  const isMatch = item.type === 'match';
  const input = item.input;
  const gameId = (isMatch ? item.input.match.game_id : item.input.seeding_rule.template.game_id) ?? seriesGameId;
  const game = catalog.games.find((g) => g.id === gameId);
  const role = input.role ?? 'regular';
  return {
    id: item.key, series_id: 'draft', stage_id: input.stage_id ?? null, event_type: isMatch ? 'match' : 'tournament',
    match_id: null, tournament_id: null, event_order: order, event_date: null, points_multiplier: input.points_multiplier ?? 1, role,
    week: input.week ?? null, counts_for_standings: input.counts_for_standings ?? role === 'regular', batch_id: null, status: 'planned',
    entrant_ids: null, seeding_rule: isMatch ? null : item.input.seeding_rule, match_template: isMatch ? item.input.match : null,
    name: isMatch ? item.input.match.name : item.input.seeding_rule.template.name,
    target_status: null, start_date: isMatch ? item.input.match.start_date : (item.input.seeding_rule.template.start_time ?? null),
    game_id: gameId ?? null, game_name: game?.name ?? null, game_icon: game?.icon_url ?? null, game_color: game?.color ?? null,
  };
}

/** One line per item for the Review step. */
export function describeDraftItem(item: DraftItem): string {
  if (item.type === 'batch') return describeScheduleConfig(item.kind, item.config);
  if (item.type === 'match') return `${item.input.match.name} (entrants assigned at registration close)`;
  const rule = item.input.seeding_rule;
  return `${rule.template.name}: top ${rule.top}${rule.per_division ? ' per division' : ''}, ${rule.format.replace(/-/g, ' ')}`;
}

// ─── validation / payload ────────────────────────────────────────────────────

/** Problems that would make the server refuse the layout (or generate nothing useful) for this scoring type. */
export function layoutProblems(layout: DraftLayout, scoringType: SeriesScoringType | null): string[] {
  const problems: string[] = [];
  const known = new Set(layout.stages.map((s) => s.key));
  for (const item of layout.items) {
    if (item.type === 'batch' && item.kind === 'round_robin' && scoringType && scoringType !== 'Normal') {
      problems.push('Round robins pair two entrants per match, so they need a Team vs Team series. Use a race calendar instead.');
    }
    if (item.type === 'batch' && item.kind === 'race_calendar' && scoringType === 'Normal') {
      problems.push('A race calendar puts every entrant in one match, which a Team vs Team series cannot score. Use a round robin instead.');
    }
    if (item.type === 'playoff') {
      const rule = item.input.seeding_rule;
      if (rule.source === 'stage' && (!rule.stage_id || !known.has(rule.stage_id))) problems.push(`"${rule.template.name}" reads a stage that no longer exists`);
      const bracket = rule.format !== 'cumulative-points';
      if (scoringType === 'Normal' && !bracket) problems.push(`"${rule.template.name}" needs a bracket format in a Team vs Team series`);
      if (scoringType && scoringType !== 'Normal' && bracket) problems.push(`"${rule.template.name}" must use the cumulative points format in this series`);
    }
  }
  return [...new Set(problems)];
}

export function toLayoutInput(layout: DraftLayout): SeriesLayoutInput {
  return {
    stages: layout.stages.map((s) => ({ key: s.key, name: s.name, counts_toward_season: s.counts_toward_season })),
    items: layout.items.map((item) => {
      if (item.type === 'batch') return { type: 'batch', kind: item.kind, config: item.config };
      if (item.type === 'match') return { type: 'match', ...item.input };
      return { type: 'playoff', ...item.input };
    }),
  };
}

/** Counts for summaries ("1 round robin, 2 match placeholders, 1 playoff"). */
export function summarizeLayout(layout: DraftLayout): string {
  const n = (type: DraftItem['type']) => layout.items.filter((i) => i.type === type).length;
  const parts: string[] = [];
  const schedules = n('batch');
  if (schedules) parts.push(`${schedules} generated ${schedules === 1 ? 'schedule' : 'schedules'}`);
  if (n('match')) parts.push(`${n('match')} match ${n('match') === 1 ? 'placeholder' : 'placeholders'}`);
  if (n('playoff')) parts.push(`${n('playoff')} ${n('playoff') === 1 ? 'playoff' : 'playoffs'}`);
  return parts.join(', ') || 'Nothing planned yet';
}

// ─── templates ───────────────────────────────────────────────────────────────

export type LayoutTemplateId = 'league_playoffs' | 'league' | 'race_season' | 'race_season_finale';

export interface LayoutTemplateOption {
  id: LayoutTemplateId;
  label: string;
  description: string;
}

/** Starting points offered for an empty layout, by scoring type. */
export function layoutTemplatesFor(scoringType: SeriesScoringType | null): LayoutTemplateOption[] {
  if (scoringType === 'Normal') {
    return [
      { id: 'league_playoffs', label: 'League + playoffs', description: 'A round robin regular season, then a top 4 bracket.' },
      { id: 'league', label: 'League only', description: 'A round robin; the table decides the champion.' },
    ];
  }
  return [
    { id: 'race_season', label: 'Race season', description: 'A calendar of 8 weekly rounds; points decide the champion.' },
    { id: 'race_season_finale', label: 'Season + finale', description: 'A calendar of rounds, then a finale for the top 8.' },
  ];
}

/** Next Monday as YYYY-MM-DD (local). */
function nextMonday(from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A starting layout. `startDate` defaults to next Monday; `template` is the series' match defaults. */
export function layoutTemplate(id: LayoutTemplateId, opts: { startDate?: string | null; template: MatchTemplateState }): DraftLayout {
  const start = opts.startDate || nextMonday();
  const tz = browserTimeZone();
  let layout = EMPTY_LAYOUT;
  if (id === 'league_playoffs' || id === 'league') {
    layout = addStage(layout, 'Regular season');
    const reg = layout.stages[0].key;
    const rr = buildRoundRobinConfig(defaultRoundRobinForm({ stage_id: reg, start_date: start, match_days: [2], timezone: tz, template: opts.template }));
    layout = addItem(layout, { type: 'batch', kind: 'round_robin', config: { ...rr, entrant_ids: null } });
    if (id === 'league_playoffs') {
      layout = addStage(layout, 'Playoffs', false);
      const po = layout.stages[1].key;
      layout = addItem(layout, {
        type: 'playoff',
        input: {
          stage_id: po, role: 'stage_playoff', counts_for_standings: false, points_multiplier: 1,
          seeding_rule: { source: 'stage', stage_id: reg, top: 4, format: 'single-elimination', template: { name: 'Playoffs', ...(opts.template.game_id ? { game_id: opts.template.game_id } : {}) }, auto_seed: true },
        },
      });
    }
    return layout;
  }
  const calendar = buildRaceCalendarConfig(defaultRaceCalendarForm({ start_date: start, timezone: tz, template: opts.template }));
  if (id === 'race_season') return addItem(layout, { type: 'batch', kind: 'race_calendar', config: { ...calendar, entrant_ids: null } });
  layout = addStage(layout, 'Season');
  layout = addStage(layout, 'Finale', false);
  const [season, finale] = layout.stages.map((s) => s.key);
  layout = addItem(layout, { type: 'batch', kind: 'race_calendar', config: { ...calendar, stage_id: season, entrant_ids: null } });
  return addItem(layout, {
    type: 'playoff',
    input: {
      stage_id: finale, role: 'stage_playoff', counts_for_standings: false, points_multiplier: 1,
      seeding_rule: { source: 'stage', stage_id: season, top: 8, format: 'cumulative-points', template: { name: 'Finale', ...(opts.template.game_id ? { game_id: opts.template.game_id } : {}) }, auto_seed: true },
    },
  });
}
