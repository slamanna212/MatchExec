/** Plan 5.6: preflight failure (fail by default with an actionable message) and the documented known-repair rules. */
import fs from 'node:fs';
import { count } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getPgTestDb, setupPgTestFile } from '../../utils/pg-test-db';
import { filesStartingWith, makeLegacyHome, runHomeImport, useLegacyHomes } from '../../utils/import-harness';
import type { corruptions } from '../../utils/legacy-sqlite';
import * as s from '../../../lib/db/schema';
import { getSystemStatus } from '../../../lib/db/system-status';
import { PreflightError } from '../../../lib/import-sqlite';

setupPgTestFile();
useLegacyHomes();

async function targetIsEmpty(): Promise<boolean> {
  const db = getPgTestDb();
  for (const t of [s.matches, s.tournaments, s.series, s.games, s.matchGamePlacements, s.discordSettings]) {
    const [{ n }] = await db.select({ n: count() }).from(t);
    if (n > 0) return false;
  }
  return true;
}

const cases: Array<[keyof typeof corruptions, string, RegExp]> = [
  ['danglingPlacement', 'match_game_placements', /entity_id=p_nobody does not exist in match_participants/],
  ['orphanTeamMember', 'tournament_team_members', /team_id=tt_gone -> tournament_teams does not exist/],
  ['malformedJson', 'matches', /invalid JSON/],
  ['badBoolean', 'matches', /expected 0\/1 but found 7/],
  ['badTimestamp', 'matches', /unparseable timestamp "next tuesday"/],
  ['winnerDisagreement', 'match_games', /winner_id='team2' but placements say team1/],
  ['assignmentDisagreement', 'match_participants', /team_assignment='red' but team_id -> blue team/],
];

describe('preflight', () => {
  it.each(cases)('%s fails the import with an actionable message and changes nothing', async (corruption, table, detail) => {
    const home = makeLegacyHome({ corrupt: [corruption] });
    const before = fs.readFileSync(home.dbPath);

    const err = await runHomeImport(home).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PreflightError);
    const message = (err as PreflightError).message;
    expect(message).toContain('Nothing was imported and the original file is untouched');
    expect(message).toContain(table);
    expect(message).toMatch(detail);
    expect(message).toContain('MATCHEXEC_IMPORT_ALLOW_LOSSY=true');

    // Postgres untouched, legacy file untouched (same bytes, not renamed), safety copy exists
    expect(await targetIsEmpty()).toBe(true);
    expect(fs.readFileSync(home.dbPath).equals(before)).toBe(true);
    expect(filesStartingWith(home.backupDir, 'pre-postgres-')).toHaveLength(1);

    // the loading screen can show what went wrong
    const status = await getSystemStatus(getPgTestDb());
    expect(status?.phase).toBe('error');
    expect(status?.imported_from_sqlite).toBe(false);
    const report = status?.report as { error: string; issues: Array<{ table: string }>; issuesTotal: number };
    expect(report.error).toContain('cannot be imported as-is');
    expect(report.issues.some((i) => i.table === table)).toBe(true);
    expect(report.issuesTotal).toBeGreaterThan(0);
  });

  it('lists every problem at once, grouped by table and kind', async () => {
    const home = makeLegacyHome({ corrupt: ['danglingPlacement', 'malformedJson', 'badBoolean', 'orphanTeamMember'] });
    const err = (await runHomeImport(home).catch((e: unknown) => e)) as PreflightError;
    expect(err).toBeInstanceOf(PreflightError);
    expect(err.report.issues.map((i) => `${i.table}:${i.kind}`).sort()).toEqual([
      'games:invalid_json', 'match_game_placements:relationship', 'matches:invalid_boolean', 'matches:invalid_json', 'tournament_team_members:orphan',
    ]);
    expect(err.message).toContain('5 problem(s) found');
  });

  it('repairs the documented leftover patterns without lossy mode (known rules)', async () => {
    // rows of a deleted match: the old delete routes left match_games behind; a queue row of a deleted match; stale per-match state
    const home = makeLegacyHome({ corrupt: ['leftoverGame', 'leftoverSeriesEvent'] });
    const { report } = await runHomeImport(home);
    expect(report.issues).toEqual([]);
    const rules = report.repairs.map((r) => `${r.rule}:${r.table}`);
    expect(rules).toContain('orphan_row_dropped:match_games');
    expect(rules).toContain('orphan_row_dropped:series_events');
    expect(report.repairs.every((r) => r.known)).toBe(true);
    expect(report.tables.match_games.skipped).toBe(1);
  });
});
