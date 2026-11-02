/** Plan 5.6: MATCHEXEC_IMPORT_ALLOW_LOSSY=true skips orphans, nulls invalid JSON and reports every repair. */
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getPgTestDb, setupPgTestFile } from '../../utils/pg-test-db';
import { makeLegacyHome, runHomeImport, useLegacyHomes } from '../../utils/import-harness';
import * as s from '../../../lib/db/schema';
import { getSystemStatus } from '../../../lib/db/system-status';

setupPgTestFile();
useLegacyHomes();

describe('lossy mode', () => {
  it('imports a dirty database and reports every repair', async () => {
    const home = makeLegacyHome({ corrupt: ['danglingPlacement', 'orphanTeamMember', 'malformedJson', 'winnerDisagreement', 'assignmentDisagreement'] });
    const { report } = await runHomeImport(home, { allowLossy: true });
    const db = getPgTestDb();

    expect(report.lossy).toBe(true);
    expect(report.issues).toEqual([]);
    const lossy = report.repairs.filter((r) => !r.known).map((r) => `${r.rule}:${r.table}${r.column ? `.${r.column}` : ''}`).sort();
    expect(lossy).toEqual([
      'lossy_legacy_disagreement:match_games',
      'lossy_legacy_disagreement:match_participants',
      'lossy_null_column:games.scoring_config',
      'lossy_null_column:matches.maps',
      'lossy_skip_orphan:tournament_team_members.team_id',
      'lossy_skip_placement:match_game_placements.entity_id',
    ]);

    // invalid JSON became NULL, the rest of the row is intact
    const [game] = await db.select().from(s.games).where(eq(s.games.id, 'testgame'));
    expect(game.scoring_config).toBeNull();
    expect(game.name).toBe('Test Game');
    const [match] = await db.select().from(s.matches).where(eq(s.matches.id, home.scenario.matches.normal));
    expect(match.maps).toBeNull();
    // orphans were skipped, valid siblings kept (the 4 real team members)
    expect((await db.select().from(s.tournamentTeamMembers)).map((e) => e.id).sort()).toEqual(['ttm_tA', 'ttm_tB', 'ttm_tC', 'ttm_tD']);
    expect(await db.select().from(s.matchGamePlacements).where(eq(s.matchGamePlacements.id, 'pl_dangling'))).toHaveLength(0);
    // placements are authoritative over the disagreeing legacy columns
    const placements = await db.select().from(s.matchGamePlacements).where(eq(s.matchGamePlacements.match_game_id, 'game_normal_1'));
    expect(placements.find((p) => p.entity_id === 'team_normal_blue')?.is_winner).toBe(true);

    // the full repair list is stored for the UI / support
    const stored = (await getSystemStatus(db))?.report as { lossy: boolean; repairs: unknown[]; tables: Record<string, { skipped: number }> };
    expect(stored.lossy).toBe(true);
    expect(stored.repairs.length).toBeGreaterThanOrEqual(6);
    expect(stored.tables.tournament_team_members.skipped).toBe(1);
  });

  it('skips rows it cannot repair together with everything below them', async () => {
    // start_time is NOT NULL: the unparseable value cannot become NULL, so the match is skipped, and so are its participants and queue rows
    const home = makeLegacyHome({ corrupt: ['badTimestamp'] });
    const { report } = await runHomeImport(home, { allowLossy: true });
    const db = getPgTestDb();
    expect(await db.select().from(s.matches).where(eq(s.matches.id, home.scenario.matches.open))).toHaveLength(0);
    expect(await db.select().from(s.matchParticipants).where(eq(s.matchParticipants.id, 'p_open_u1'))).toHaveLength(0);
    expect(report.repairs.find((r) => r.rule === 'lossy_skip_row' && r.table === 'matches')?.id).toBe(home.scenario.matches.open);
    expect(report.repairs.some((r) => r.rule === 'lossy_skip_orphan' && r.table === 'match_participants')).toBe(true);
  });
});
