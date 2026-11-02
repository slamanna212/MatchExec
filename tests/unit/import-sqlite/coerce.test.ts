import { describe, expect, it } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { CoerceIssue, coerceValue, defaultFor, isEmptyLegacy, parseBoolean, parseInteger, parseJson, parseTimestamp } from '../../../lib/import-sqlite/coerce';
import { announcementsFromLegacy, DEFAULT_ANNOUNCEMENTS } from '../../../lib/import-sqlite/legacy-values';
import { games, matches, matchGames, series, seriesEvents, gameModes, matchGamePlacements } from '../../../lib/db/schema';

const NOW = new Date('2026-01-01T00:00:00Z');

describe('parseTimestamp', () => {
  it('reads naive SQLite timestamps as UTC', () => {
    expect(parseTimestamp('2026-03-01 18:00:00').toISOString()).toBe('2026-03-01T18:00:00.000Z');
    expect(parseTimestamp('2026-03-01T18:00:00').toISOString()).toBe('2026-03-01T18:00:00.000Z');
    expect(parseTimestamp('2026-03-01 18:00').toISOString()).toBe('2026-03-01T18:00:00.000Z');
    expect(parseTimestamp('2026-03-01 18:00:00.250').toISOString()).toBe('2026-03-01T18:00:00.250Z');
  });
  it('keeps explicit zones and date-only values', () => {
    expect(parseTimestamp('2026-03-02T18:00:00.000Z').toISOString()).toBe('2026-03-02T18:00:00.000Z');
    expect(parseTimestamp('2026-03-02T20:00:00+02:00').toISOString()).toBe('2026-03-02T18:00:00.000Z');
    expect(parseTimestamp('2026-03-02').toISOString()).toBe('2026-03-02T00:00:00.000Z');
  });
  it('accepts epoch seconds / milliseconds and rejects nonsense', () => {
    expect(parseTimestamp(1772388000).toISOString()).toBe('2026-03-01T18:00:00.000Z');
    expect(parseTimestamp(1772388000000).toISOString()).toBe('2026-03-01T18:00:00.000Z');
    for (const bad of ['next tuesday', '2026-13-45 99:99:99', '', 12]) {
      expect(() => parseTimestamp(bad as string)).toThrow(CoerceIssue);
    }
  });
});

describe('parseBoolean / parseInteger / parseJson', () => {
  it('only accepts 0/1 style booleans', () => {
    expect([1, '1', true, 'true', 'TRUE'].map(parseBoolean)).toEqual([true, true, true, true, true]);
    expect([0, '0', false, 'false'].map(parseBoolean)).toEqual([false, false, false, false]);
    for (const bad of [2, -1, 'yes', 'blue', 7n]) expect(() => parseBoolean(bad)).toThrow(/expected 0\/1/);
  });
  it('requires integral values in int4 range', () => {
    expect(parseInteger(5)).toBe(5);
    expect(parseInteger('42')).toBe(42);
    expect(parseInteger(3.0)).toBe(3);
    for (const bad of [1.5, 'abc', 3_000_000_000, '', null as never]) expect(() => parseInteger(bad)).toThrow(CoerceIssue);
  });
  it('parses JSON text, treating empty / "null" as NULL', () => {
    expect(parseJson('{"a":[1,2]}')).toEqual({ a: [1, 2] });
    expect(parseJson('')).toBeNull();
    expect(parseJson(' null ')).toBeNull();
    expect(() => parseJson('{oops')).toThrow(/invalid JSON/);
  });
});

describe('column-type driven coercion', () => {
  const cols = getTableColumns(matches);
  it('uses the Drizzle column type', () => {
    expect(coerceValue(cols.stats_enabled, 1)).toBe(true);
    expect(coerceValue(cols.start_time, '2026-03-01 18:00:00')).toEqual(new Date('2026-03-01T18:00:00Z'));
    expect(coerceValue(cols.map_codes, '{"a":"b"}')).toEqual({ a: 'b' });
    expect(coerceValue(cols.rounds, '3')).toBe(3);
    expect(coerceValue(getTableColumns(series).scoring_config, '{"x":1}')).toEqual({ x: 1 });
    expect(coerceValue(getTableColumns(seriesEvents).points_multiplier, 1.5)).toBe(1.5);
    expect(coerceValue(getTableColumns(games).release_date, '2020-05-06 00:00:00')).toBe('2020-05-06');
    expect(coerceValue(cols.name, 42)).toBe('42');
  });
  it('validates enum text columns', () => {
    expect(coerceValue(cols.status, 'complete')).toBe('complete');
    expect(() => coerceValue(cols.status, 'finished')).toThrow(/is not one of/);
    expect(() => coerceValue(getTableColumns(matchGamePlacements).entity_type, 'player')).toThrow(CoerceIssue);
  });
  it('treats empty strings as NULL except in text columns', () => {
    expect(isEmptyLegacy(cols.rounds, '')).toBe(true);
    expect(isEmptyLegacy(cols.start_time, '')).toBe(true);
    expect(isEmptyLegacy(cols.description, '')).toBe(false);
    expect(isEmptyLegacy(cols.description, null)).toBe(true);
  });
  it('replaces NULL in NOT NULL columns with the column default', () => {
    expect(defaultFor(cols.status, NOW)).toBe('created');
    expect(defaultFor(cols.player_notifications, NOW)).toBe(true);
    expect(defaultFor(cols.created_at, NOW)).toBe(NOW);
    expect(defaultFor(cols.team_count, NOW)).toBe(2);
    expect(defaultFor(getTableColumns(matchGames).notes, NOW)).toBe('');
    expect(defaultFor(getTableColumns(gameModes).team_size, NOW)).toBe(1);
    expect(defaultFor(cols.name, NOW)).toBeUndefined();
  });
});

describe('announcementsFromLegacy (misdeclared BOOLEAN column)', () => {
  it('maps 0 / NULL / empty to NULL and 1 to the default timings', () => {
    for (const none of [null, undefined, 0, '0', '', false, 'null']) expect(announcementsFromLegacy(none as never)).toBeNull();
    for (const on of [1, '1', true]) expect(announcementsFromLegacy(on as never)).toEqual(DEFAULT_ANNOUNCEMENTS);
  });
  it('keeps real JSON arrays and rejects other JSON', () => {
    expect(announcementsFromLegacy('[{"id":"a","value":2,"unit":"hours"}]')).toEqual([{ id: 'a', value: 2, unit: 'hours' }]);
    expect(announcementsFromLegacy('[]')).toEqual([]);
    expect(() => announcementsFromLegacy('{"a":1}')).toThrow(CoerceIssue);
    expect(() => announcementsFromLegacy('[oops')).toThrow(/invalid JSON/);
  });
  it('returns a fresh copy of the defaults', () => {
    const a = announcementsFromLegacy(1)!;
    a.push({ id: 'x', value: 1, unit: 'days' });
    expect(DEFAULT_ANNOUNCEMENTS).toHaveLength(2);
  });
});
