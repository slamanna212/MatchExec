/**
 * CSV import of series entrants and rosters. One row per player: `team` (team series), `player`, `discord_id`, `role`,
 * `tag`, `division`, `seed`, `color`. Rows with the same team name form one entrant. A team that already exists keeps its
 * fields and gets the new players; players already on that roster are skipped. Every player needs a Discord id.
 *
 * `previewEntrantImport` is read-only and reports what would happen; `importEntrants` re-checks under the series row lock
 * and applies everything in one transaction, or nothing when an error remains.
 */
import { eq } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { seriesEntrants } from '../../../lib/db/schema';
import { parseCsv } from '../../../shared/csv';
import { isDiscordId } from '../../../shared/discord-ids';
import type {
  EntrantImportEntrantPreview, EntrantImportIssue, EntrantImportPreview, EntrantImportResult, SeriesEntrantType, SeriesMemberRole,
} from '../../../shared/series-types';
import { logger } from '../logger';
import { insertEntrantMember, listEntrants, lockEntrantsEditable, newEntrantId } from './entrants';
import { SeriesError, getSeriesById } from './series';

export const ENTRANT_IMPORT_MAX_ROWS = 1000;
export const ENTRANT_IMPORT_MAX_CHARS = 1_000_000;

type Column = 'team' | 'player' | 'discord_id' | 'role' | 'tag' | 'division' | 'seed' | 'color';

/** Accepted header spellings (normalised: lower case, spaces / dashes as underscores). */
const HEADER_ALIASES: Record<Column, string[]> = {
  team: ['team', 'team_name', 'entrant'],
  player: ['player', 'player_name', 'username', 'display_name'],
  discord_id: ['discord_id', 'discordid', 'discord_user_id', 'discord'],
  role: ['role'],
  tag: ['tag', 'team_tag'],
  division: ['division', 'group'],
  seed: ['seed'],
  color: ['color', 'colour'],
};

const ROLES: readonly SeriesMemberRole[] = ['captain', 'player', 'sub'];
const MAX_NAME = 100;
const MAX_TAG = 12;
const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const normaliseHeader = (h: string): string => h.trim().toLowerCase().replace(/[\s-]+/g, '_');

export interface PlannedMember { line: number; username: string; discord_user_id: string; role: SeriesMemberRole }
export interface PlannedEntrant {
  name: string;
  line: number;
  tag: string | null;
  division: string | null;
  seed: number | null;
  color: string | null;
  members: PlannedMember[];
}

export interface EntrantImportPlan {
  entrants: PlannedEntrant[];
  issues: EntrantImportIssue[];
}

interface ImportRow { name: string; username: string; discordId: string; role: SeriesMemberRole; tag: string | null; color: string | null; seed: number | null; division: string | null }

/** Maps header cells to columns. Returns the column index, or an error message when a required column is missing. */
function mapHeaders(headers: string[], team: boolean, issues: EntrantImportIssue[]): Map<Column, number> | string {
  const index = new Map<Column, number>();
  const unknown: string[] = [];
  headers.forEach((raw, i) => {
    const h = normaliseHeader(raw);
    if (h === '') return;
    const col = (Object.keys(HEADER_ALIASES) as Column[]).find((c) => HEADER_ALIASES[c].includes(h));
    if (!col) unknown.push(raw);
    else if (index.has(col)) issues.push({ line: null, level: 'warning', message: `Column "${raw}" appears twice; the first one is used` });
    else index.set(col, i);
  });
  const required: Column[] = team ? ['team', 'player', 'discord_id'] : ['player', 'discord_id'];
  const missing = required.filter((c) => !index.has(c));
  if (missing.length > 0) return `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`;
  if (unknown.length > 0) issues.push({ line: null, level: 'warning', message: `Ignored column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}` });
  if (!team) {
    const ignored = (['team', 'role', 'tag'] as const).filter((c) => index.has(c));
    if (ignored.length > 0) issues.push({ line: null, level: 'warning', message: `Solo series: ${ignored.join(', ')} ignored` });
  }
  return index;
}

const optional = (v: string): string | null => (v === '' ? null : v);

function lengthError(label: string, value: string | null, max: number, required = false): string | null {
  if (value === null || value === '') return required ? `${label} is missing` : null;
  return value.length > max ? `${label} is longer than ${max} characters` : null;
}

function discordIdRowError(id: string): string | null {
  if (id === '') return 'Discord ID is missing';
  return isDiscordId(id) ? null : `"${id}" is not a Discord ID (17-20 digits)`;
}

function parseRole(raw: string): SeriesMemberRole | string {
  if (raw === '') return 'player';
  const r = raw.toLowerCase() as SeriesMemberRole;
  return ROLES.includes(r) ? r : `Role must be captain, player or sub (got "${raw}")`;
}

function parseSeed(raw: string): number | null | string {
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 9999 ? n : `Seed must be a whole number from 1 to 9999 (got "${raw}")`;
}

/** Reads and validates one row's values; returns the row or the list of problems. */
function readRow(get: (c: Column) => string, team: boolean): ImportRow | string[] {
  const username = get('player');
  const discordId = get('discord_id');
  const name = team ? get('team') : username;
  const role = team ? parseRole(get('role')) : 'player';
  const seed = parseSeed(get('seed'));
  const tag = team ? optional(get('tag')) : null;
  const color = optional(get('color'));
  const division = optional(get('division'));
  const problems = [
    lengthError('Player name', username, MAX_NAME, true),
    discordIdRowError(discordId),
    team ? lengthError('Team name', name, MAX_NAME, true) : null,
    ROLES.includes(role as SeriesMemberRole) ? null : role,
    lengthError('Tag', tag, MAX_TAG),
    color !== null && !COLOR_RE.test(color) ? `Color must look like #ff8800 (got "${color}")` : null,
    typeof seed === 'string' ? seed : null,
    lengthError('Division', division, MAX_NAME),
  ].filter((p): p is string => p !== null);
  if (problems.length > 0) return problems;
  return { name, username, discordId, role: role as SeriesMemberRole, tag, color, seed: seed as number | null, division };
}

/** Fills the entrant fields a team's later rows give; a conflicting value keeps the first one and warns. */
function mergeEntrantFields(entrant: PlannedEntrant, row: ImportRow, warn: (message: string) => void): void {
  for (const key of ['tag', 'division', 'seed', 'color'] as const) {
    const value = row[key];
    if (value === null) continue;
    if (entrant[key] === null) (entrant as unknown as Record<string, unknown>)[key] = value;
    else if (entrant[key] !== value) warn(`${key} "${value}" differs from "${entrant[key]}" given earlier for ${entrant.name}; the first value is used`);
  }
}

/**
 * Parses and validates the file on its own (no database): headers, required values, formats, duplicates within the file,
 * captains and roster size. Groups the rows into entrants in file order.
 */
export function planEntrantImport(csv: string, series: { entrant_type: SeriesEntrantType; roster_max: number | null }): EntrantImportPlan {
  const fail = (message: string): EntrantImportPlan => ({ entrants: [], issues: [{ line: null, level: 'error', message }] });
  if (csv.length > ENTRANT_IMPORT_MAX_CHARS) return fail('The file is too large (at most 1 MB)');
  const parsed = parseCsv(csv);
  if (!parsed || parsed.rows.length === 0) return fail('The file has no data rows');
  if (parsed.rows.length > ENTRANT_IMPORT_MAX_ROWS) return fail(`The file has ${parsed.rows.length} rows; at most ${ENTRANT_IMPORT_MAX_ROWS} can be imported at once`);

  const team = series.entrant_type === 'team';
  const issues: EntrantImportIssue[] = [];
  const index = mapHeaders(parsed.headers, team, issues);
  if (typeof index === 'string') return fail(index);

  const entrants = new Map<string, PlannedEntrant>();
  const seenIds = new Map<string, number>();
  const limit = team ? series.roster_max : 1;

  for (const { line, cells } of parsed.rows) {
    const err = (message: string) => issues.push({ line, level: 'error', message });
    const get = (c: Column): string => {
      const i = index.get(c);
      return i === undefined ? '' : cells[i].trim();
    };
    const discordId = get('discord_id');
    const firstUse = isDiscordId(discordId) ? seenIds.get(discordId) : undefined;
    if (isDiscordId(discordId) && firstUse === undefined) seenIds.set(discordId, line);
    const row = readRow(get, team);
    if (Array.isArray(row)) { row.forEach(err); }
    if (firstUse !== undefined) err(`Discord ID ${discordId} is already used on line ${firstUse}`);
    if (Array.isArray(row) || firstUse !== undefined) continue;

    const known = entrants.get(row.name);
    if (known && !team) { err(`Another player in the file is already named "${row.name}" (line ${known.line}); solo entrants need unique names`); continue; }
    if (row.role === 'captain' && known?.members.some((m) => m.role === 'captain')) { err(`${row.name} already has a captain in this file`); continue; }
    if (limit !== null && known && known.members.length >= limit) { err(`${row.name} would have more than ${limit} players`); continue; }

    const entrant = known ?? { name: row.name, line, tag: row.tag, division: row.division, seed: row.seed, color: row.color, members: [] };
    if (known) mergeEntrantFields(known, row, (message) => issues.push({ line, level: 'warning', message }));
    else entrants.set(row.name, entrant);
    entrant.members.push({ line, username: row.username, discord_user_id: row.discordId, role: row.role });
  }

  return { entrants: [...entrants.values()], issues };
}

const hasErrors = (issues: EntrantImportIssue[]): boolean => issues.some((i) => i.level === 'error');

/**
 * The plan checked against the series as it is now: existing entrants (merge), players already on a roster (same entrant:
 * skipped; another entrant: error), roster limits including the current roster, withdrawn entrants. Read-only.
 * Throws `SeriesError` 404 for an unknown series.
 */
export async function previewEntrantImport(ex: Executor, seriesId: string, csv: string): Promise<EntrantImportPreview> {
  const series = await getSeriesById(ex, seriesId);
  if (!series) throw new SeriesError('Series not found', 404);
  if (series.status === 'complete' || series.status === 'cancelled') {
    return { entrants: [], issues: [{ line: null, level: 'error', message: `Cannot import into a ${series.status} series` }], ok: false };
  }
  const entrantType = series.entrant_type;
  const plan = planEntrantImport(csv, { entrant_type: entrantType, roster_max: series.roster_max });
  const issues = [...plan.issues];

  const existing = await listEntrants(ex, seriesId);
  const byName = new Map(existing.map((e) => [e.name, e]));
  const rosterOf = new Map<string, { entrantId: string; name: string }>();
  for (const e of existing) {
    for (const m of e.members) {
      rosterOf.set(m.user_id, { entrantId: e.id, name: e.name });
      if (m.discord_user_id) rosterOf.set(m.discord_user_id, { entrantId: e.id, name: e.name });
    }
  }
  const limit = entrantType === 'team' ? series.roster_max : 1;

  const entrants: EntrantImportEntrantPreview[] = plan.entrants.map((p) => {
    const current = byName.get(p.name);
    if (current?.status === 'withdrawn') {
      issues.push({ line: p.line, level: 'error', message: `${p.name} has withdrawn from this series; reinstate it before adding players` });
    }
    let count = current?.members.length ?? 0;
    const currentCaptain = current?.members.find((m) => m.role === 'captain');
    const members = p.members.map((m) => {
      const clash = rosterOf.get(m.discord_user_id);
      if (clash && current && clash.entrantId === current.id) return { ...m, action: 'existing' as const };
      if (clash) {
        issues.push({ line: m.line, level: 'error', message: `${m.username} is already on the roster of "${clash.name}" in this series` });
      } else if (limit !== null && count >= limit) {
        issues.push({
          line: m.line, level: 'error',
          message: entrantType === 'solo' ? `${p.name} already exists in this series with another player` : `${p.name} would have more than ${limit} players`,
        });
      } else {
        count++;
        if (m.role === 'captain' && currentCaptain) {
          issues.push({ line: m.line, level: 'warning', message: `${m.username} replaces ${currentCaptain.username} as captain of ${p.name}` });
        }
      }
      return { ...m, action: 'new' as const };
    });
    if (current && entrantType === 'team' && (p.tag !== null || p.division !== null || p.seed !== null || p.color !== null)
      && (p.tag !== current.tag || p.division !== current.division || p.seed !== current.seed || p.color !== current.color)) {
      issues.push({ line: p.line, level: 'warning', message: `${p.name} already exists; its tag, division, seed and color are kept` });
    }
    return current
      ? { name: p.name, existing: true, tag: current.tag, division: current.division, seed: current.seed, color: current.color, members }
      : { name: p.name, existing: false, tag: p.tag, division: p.division, seed: p.seed, color: p.color, members };
  });

  const sorted = issues.slice().sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return { entrants, issues: sorted, ok: !hasErrors(sorted) };
}

export type EntrantImportOutcome =
  | { ok: true; result: EntrantImportResult; preview: EntrantImportPreview }
  | { ok: false; preview: EntrantImportPreview };

/**
 * Applies the import in one transaction under the series row lock. The preview is recomputed inside the lock; when it has
 * any error nothing is written and the preview is returned. Throws `SeriesError` 404 / 409 like the other entrant mutations.
 */
export async function importEntrants(ex: Executor, seriesId: string, csv: string): Promise<EntrantImportOutcome> {
  return ex.transaction(async (tx) => {
    const series = await lockEntrantsEditable(tx, seriesId);
    const preview = await previewEntrantImport(tx, seriesId, csv);
    if (!preview.ok) return { ok: false, preview };

    const ids = new Map((await tx.select({ id: seriesEntrants.id, name: seriesEntrants.name }).from(seriesEntrants)
      .where(eq(seriesEntrants.series_id, seriesId))).map((r) => [r.name, r.id]));
    const result: EntrantImportResult = { created: 0, updated: 0, members_added: 0, members_skipped: 0 };
    for (const e of preview.entrants) {
      let entrantId = ids.get(e.name);
      if (!entrantId) {
        entrantId = newEntrantId();
        await tx.insert(seriesEntrants).values({
          id: entrantId, series_id: seriesId, name: e.name, tag: e.tag, division: e.division, seed: e.seed, color: e.color, status: 'active',
        });
        result.created++;
      } else if (e.members.some((m) => m.action === 'new')) result.updated++;
      for (const m of e.members) {
        if (m.action === 'existing') { result.members_skipped++; continue; }
        await insertEntrantMember(tx, series, entrantId, { user_id: m.discord_user_id, discord_user_id: m.discord_user_id, username: m.username, role: m.role });
        result.members_added++;
      }
    }
    logger.debug(`Series ${seriesId}: imported ${result.created} new entrants, ${result.members_added} players`);
    return { ok: true, result, preview };
  });
}
