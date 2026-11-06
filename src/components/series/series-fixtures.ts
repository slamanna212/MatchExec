import type {
  GeneratedFixture, GeneratorCommitInput, RaceCalendarConfig, RoundRobinConfig, SeriesEntrantDto, SeriesMatchTemplate,
  SeriesSeedingRule, SeriesTournamentTemplate, TournamentBracketFormat,
} from '@/shared/series-types';

/**
 * Pure logic of the generator modals (round robin, race calendar): form state -> config, the editable preview rows and the
 * commit payload. Times are wall-clock in the config's timezone, converted with Intl (no date library).
 */

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** The browser's IANA timezone (generators default to it). */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function timeZoneOptions(current?: string): string[] {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    zones = [];
  }
  const set = new Set(zones);
  set.add('UTC');
  set.add(browserTimeZone());
  if (current) set.add(current);
  return [...set].sort();
}

function validZone(tz: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

function zonedFields(date: Date, tz: string): { y: number; m: number; d: number; h: number; mi: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: validZone(tz), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute') };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO instant -> wall-clock `{date: 'YYYY-MM-DD', time: 'HH:MM'}` in the timezone. */
export function isoToZoned(iso: string, tz: string): { date: string; time: string } {
  const f = zonedFields(new Date(iso), tz);
  return { date: `${f.y}-${pad(f.m)}-${pad(f.d)}`, time: `${pad(f.h)}:${pad(f.mi)}` };
}

/** Wall-clock date + time in the timezone -> ISO instant (null when either part is not valid). */
export function zonedToIso(date: string, time: string, tz: string): string | null {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wanted = Date.UTC(y, m - 1, d, h, mi);
  let guess = wanted;
  for (let i = 0; i < 3; i += 1) {
    const f = zonedFields(new Date(guess), tz);
    guess += wanted - Date.UTC(f.y, f.m - 1, f.d, f.h, f.mi);
  }
  const out = new Date(guess);
  return Number.isNaN(out.getTime()) ? null : out.toISOString();
}

// ─── editable preview rows ───────────────────────────────────────────────────

export interface EditableFixture extends GeneratedFixture {
  /** Stable client key so rows keep their identity while others are removed or edited. */
  key: string;
}

export function toEditable(fixtures: readonly GeneratedFixture[]): EditableFixture[] {
  return fixtures.map((f, i) => ({ ...f, entrant_ids: [...f.entrant_ids], key: `fx-${i}` }));
}

export function stripKeys(fixtures: readonly EditableFixture[]): GeneratedFixture[] {
  return fixtures.map(({ key: _key, ...f }) => ({ ...f, entrant_ids: [...f.entrant_ids] }));
}

export function updateFixture(list: readonly EditableFixture[], key: string, patch: Partial<GeneratedFixture>): EditableFixture[] {
  return list.map((f) => (f.key === key ? { ...f, ...patch } : f));
}

export function removeFixture(list: readonly EditableFixture[], key: string): EditableFixture[] {
  return list.filter((f) => f.key !== key);
}

/** Swaps home and away of a two-entrant fixture (the fixture name is rebuilt from `names` when it follows the "A vs B" pattern). */
export function swapHomeAway(list: readonly EditableFixture[], key: string, names?: ReadonlyMap<string, string>): EditableFixture[] {
  return list.map((f) => {
    if (f.key !== key || f.entrant_ids.length !== 2) return f;
    const [home, away] = f.entrant_ids;
    const homeName = names?.get(home);
    const awayName = names?.get(away);
    const wasDefault = homeName && awayName && f.name === `${homeName} vs ${awayName}`;
    return { ...f, entrant_ids: [away, home], name: wasDefault ? `${awayName} vs ${homeName}` : f.name };
  });
}

/** Moves a fixture to another date / time (wall-clock in `tz`). Invalid input leaves the fixture unchanged. */
export function setFixtureTime(list: readonly EditableFixture[], key: string, date: string, time: string, tz: string): EditableFixture[] {
  const iso = zonedToIso(date, time, tz);
  if (!iso) return [...list];
  return updateFixture(list, key, { start: iso });
}

export interface FixtureWeekGroup {
  week: number;
  fixtures: EditableFixture[];
  /** Entrants without a fixture this week (from the preview's `byes`). */
  byes: string[];
}

/** Fixtures grouped by week ascending, each group sorted by start time. */
export function groupFixturesByWeek(
  list: readonly EditableFixture[], byes: ReadonlyArray<{ week: number; entrant_ids: string[] }> = [],
): FixtureWeekGroup[] {
  const weeks = new Map<number, EditableFixture[]>();
  for (const f of list) weeks.set(f.week, [...(weeks.get(f.week) ?? []), f]);
  return [...weeks.keys()].sort((a, b) => a - b).map((week) => ({
    week,
    fixtures: (weeks.get(week) ?? []).sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.key.localeCompare(b.key, undefined, { numeric: true })),
    byes: byes.filter((b) => b.week === week).flatMap((b) => b.entrant_ids),
  }));
}

/** Commit body: the config plus the (edited) preview fixtures verbatim, in start order. */
export function buildCommitPayload<C>(config: C, fixtures: readonly EditableFixture[]): GeneratorCommitInput<C> {
  const sorted = stripKeys(fixtures).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return { config, fixtures: sorted };
}

export function fixtureLabel(f: GeneratedFixture, names: ReadonlyMap<string, string>): string {
  if (f.entrant_ids.length === 2) return f.entrant_ids.map((id) => names.get(id) ?? id).join(' vs ');
  return f.name;
}

// ─── match template (shared by the match modal and both generators) ─────────

export interface MatchTemplateState {
  game_id: string | null;
  maps: string[];
  rounds: number | null;
  rules: 'casual' | 'competitive' | null;
}

export function matchTemplatePayload(t: MatchTemplateState): Omit<SeriesMatchTemplate, 'start_date' | 'name'> {
  return {
    ...(t.game_id ? { game_id: t.game_id } : {}),
    ...(t.maps.length > 0 ? { maps: t.maps } : {}),
    ...(t.rounds !== null ? { rounds: t.rounds } : {}),
    ...(t.rules ? { rules: t.rules } : {}),
  };
}

// ─── round robin ─────────────────────────────────────────────────────────────

export interface RoundRobinFormState {
  stage_id: string | null;
  all_entrants: boolean;
  entrant_ids: string[];
  double: boolean;
  divisions: RoundRobinConfig['divisions'];
  start_date: string | null;
  match_days: number[];
  time_slots: string[];
  timezone: string;
  concurrent_matches: number;
  max_per_entrant_per_week: number;
  skip_dates: string[];
  points_multiplier: number;
  name_template: string;
  template: MatchTemplateState;
}

export function defaultRoundRobinForm(overrides: Partial<RoundRobinFormState> = {}): RoundRobinFormState {
  return {
    stage_id: null,
    all_entrants: true,
    entrant_ids: [],
    double: false,
    divisions: 'none',
    start_date: null,
    match_days: [],
    time_slots: ['19:00'],
    timezone: browserTimeZone(),
    concurrent_matches: 1,
    max_per_entrant_per_week: 1,
    skip_dates: [],
    points_multiplier: 1,
    name_template: '{home} vs {away}',
    template: { game_id: null, maps: [], rounds: null, rules: null },
    ...overrides,
  };
}

const sortedUnique = <T extends string | number>(list: readonly T[]): T[] => [...new Set(list)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

export function validateRoundRobinForm(form: RoundRobinFormState, activeEntrantCount: number): string | null {
  const count = form.all_entrants ? activeEntrantCount : form.entrant_ids.length;
  if (count < 2) return 'Pick at least two entrants';
  if (!form.start_date || !DATE_RE.test(form.start_date)) return 'Pick the first possible match day';
  if (form.match_days.length === 0) return 'Pick at least one match day';
  if (form.time_slots.length === 0) return 'Add at least one time slot';
  if (form.time_slots.some((t) => !TIME_RE.test(t))) return 'Time slots must look like 19:30';
  if (form.skip_dates.some((d) => !DATE_RE.test(d))) return 'Skipped dates must look like 2026-12-25';
  return null;
}

export function buildRoundRobinConfig(form: RoundRobinFormState): RoundRobinConfig {
  return {
    stage_id: form.stage_id,
    entrant_ids: form.all_entrants ? null : form.entrant_ids,
    double: form.double,
    divisions: form.divisions,
    start_date: form.start_date ?? '',
    match_days: sortedUnique(form.match_days),
    time_slots: sortedUnique(form.time_slots),
    timezone: form.timezone,
    concurrent_matches: form.concurrent_matches,
    max_per_entrant_per_week: form.max_per_entrant_per_week,
    ...(form.skip_dates.length > 0 ? { skip_dates: sortedUnique(form.skip_dates) } : {}),
    points_multiplier: form.points_multiplier,
    match: { ...matchTemplatePayload(form.template), name_template: form.name_template.trim() || '{home} vs {away}' },
  };
}

// ─── race calendar ───────────────────────────────────────────────────────────

export interface RaceCalendarFormState {
  stage_id: string | null;
  all_entrants: boolean;
  entrant_ids: string[];
  count: number;
  start_date: string | null;
  interval_days: number;
  time: string;
  timezone: string;
  name_template: string;
  points_multiplier: number;
  event_kind: 'match' | 'tournament';
  template: MatchTemplateState;
  tournament_format: TournamentBracketFormat;
}

export function defaultRaceCalendarForm(overrides: Partial<RaceCalendarFormState> = {}): RaceCalendarFormState {
  return {
    stage_id: null,
    all_entrants: true,
    entrant_ids: [],
    count: 8,
    start_date: null,
    interval_days: 7,
    time: '19:00',
    timezone: browserTimeZone(),
    name_template: 'Round {n}',
    points_multiplier: 1,
    event_kind: 'match',
    template: { game_id: null, maps: [], rounds: null, rules: null },
    tournament_format: 'cumulative-points',
    ...overrides,
  };
}

export function validateRaceCalendarForm(form: RaceCalendarFormState, activeEntrantCount: number): string | null {
  const count = form.all_entrants ? activeEntrantCount : form.entrant_ids.length;
  if (count < 1) return 'Pick at least one entrant';
  if (!Number.isInteger(form.count) || form.count < 1 || form.count > 100) return 'Number of events must be between 1 and 100';
  if (!form.start_date || !DATE_RE.test(form.start_date)) return 'Pick the date of the first event';
  if (!Number.isInteger(form.interval_days) || form.interval_days < 1) return 'Days between events must be 1 or more';
  if (!TIME_RE.test(form.time)) return 'Time must look like 19:30';
  return null;
}

export function buildRaceCalendarConfig(form: RaceCalendarFormState): RaceCalendarConfig {
  const base = matchTemplatePayload(form.template);
  const config: RaceCalendarConfig = {
    stage_id: form.stage_id,
    entrant_ids: form.all_entrants ? null : form.entrant_ids,
    count: form.count,
    start_date: form.start_date ?? '',
    interval_days: form.interval_days,
    time: form.time,
    timezone: form.timezone,
    name_template: form.name_template.trim() || 'Round {n}',
    points_multiplier: form.points_multiplier,
    event_kind: form.event_kind,
  };
  if (form.event_kind === 'match') {
    config.match = base;
  } else {
    const { game_id, rounds, rules } = base;
    const tournament: NonNullable<RaceCalendarConfig['tournament']> = { format: form.tournament_format };
    if (game_id) tournament.game_id = game_id;
    if (rounds !== undefined) tournament.rounds_per_match = rounds;
    if (rules) tournament.ruleset = rules;
    config.tournament = tournament;
  }
  return config;
}

// ─── playoff placeholder ─────────────────────────────────────────────────────

export interface PlannedFormState {
  name: string;
  source: SeriesSeedingRule['source'];
  stage_id: string | null;
  top: number;
  per_division: boolean;
  format: TournamentBracketFormat;
  game_id: string | null;
  rounds_per_match: number | null;
  ruleset: 'casual' | 'competitive' | null;
  start_time: string | null;
}

export function validatePlannedForm(form: PlannedFormState): string | null {
  if (!form.name.trim()) return 'Give the playoff a name';
  if (form.source === 'stage' && !form.stage_id) return 'Pick the stage the qualifiers come from';
  if (!Number.isInteger(form.top) || form.top < 2) return 'At least two entrants must qualify';
  return null;
}

export function buildSeedingRule(form: PlannedFormState): SeriesSeedingRule {
  const template: SeriesTournamentTemplate = { name: form.name.trim() };
  if (form.game_id) template.game_id = form.game_id;
  if (form.rounds_per_match !== null) template.rounds_per_match = form.rounds_per_match;
  if (form.ruleset) template.ruleset = form.ruleset;
  if (form.start_time) template.start_time = form.start_time;
  return {
    source: form.source,
    ...(form.source === 'stage' ? { stage_id: form.stage_id } : {}),
    top: form.top,
    per_division: form.per_division,
    format: form.format,
    template,
  };
}

// ─── entrants ────────────────────────────────────────────────────────────────

/** Entrants that can be scheduled (active), seed first then name. */
export function schedulableEntrants(entrants: readonly SeriesEntrantDto[]): SeriesEntrantDto[] {
  return entrants
    .filter((e) => e.status === 'active')
    .sort((a, b) => (a.seed ?? Number.POSITIVE_INFINITY) - (b.seed ?? Number.POSITIVE_INFINITY) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/** Entrant id -> name lookup for fixture labels. */
export function entrantNameMap(entrants: readonly SeriesEntrantDto[]): Map<string, string> {
  return new Map(entrants.map((e) => [e.id, e.name]));
}

/** Min / max entrants of a single match: Normal is team vs team (2..16); FFA / Position take any number. */
export function matchEntrantBounds(scoringType: string | null | undefined): { min: number; max: number | null } {
  return scoringType === 'Normal' ? { min: 2, max: 16 } : { min: 1, max: null };
}
