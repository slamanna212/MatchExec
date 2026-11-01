// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { getTableName, sql, eq } from 'drizzle-orm';
import * as schema from '../../../lib/db/schema';
import { getPgTestDb, setupPgTestFile, resetPgTestDb } from '../../utils/pg-test-db';
import { createGame, createGameMode, createMatch, createTournament, seedBasicTestData } from '../../utils/pg-fixtures';

setupPgTestFile();

const rows = async <T>(q: ReturnType<typeof sql>): Promise<T[]> =>
  ((await getPgTestDb().execute(q)) as unknown as { rows: T[] }).rows;

describe('Drizzle schema vs database', () => {
  it('every declared table (62) exists, with every declared column', async () => {
    const declared = (Object.values(schema) as unknown[]).filter((v): v is PgTable => v instanceof PgTable);
    expect(declared).toHaveLength(62);
    const cols = await rows<{ s: string; t: string; c: string }>(sql`SELECT table_schema AS s, table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema IN ('public','control')`);
    const present = new Set(cols.map((r) => `${r.s}.${r.t}.${r.c}`));
    for (const table of declared) {
      const cfg = getTableConfig(table);
      for (const col of cfg.columns) {
        expect(present, `${getTableName(table)}.${col.name}`).toContain(`${cfg.schema ?? 'public'}.${cfg.name}.${col.name}`);
      }
    }
  });

  it('retired legacy columns are absent', async () => {
    const r = await rows<{ c: string }>(sql`SELECT table_name || '.' || column_name AS c FROM information_schema.columns WHERE table_schema = 'public'
      AND ((table_name = 'matches' AND column_name IN ('blue_team_voice_channel','red_team_voice_channel'))
        OR (table_name = 'match_games' AND column_name IN ('winner_id','participant_winner_id','team_a','team_b','is_ffa_mode','score_a','score_b','position_results','points_awarded'))
        OR (table_name = 'match_participants' AND column_name IN ('team','team_assignment')))`);
    expect(r).toEqual([]);
  });

  it('enforces foreign keys with cascade (unlike the old SQLite schema)', async () => {
    const db = getPgTestDb();
    const { game, mode } = await seedBasicTestData();
    const match = await createMatch(game.id, mode.id);
    const tournament = await createTournament(game.id);
    expect(match.status).toBe('created');
    expect(tournament.format).toBe('single-elimination');
    await expect(db.insert(schema.matches).values({ id: 'orphan', game_id: 'nope', name: 'x', start_date: new Date(), start_time: new Date() })).rejects.toThrow();
    await db.delete(schema.games).where(eq(schema.games.id, game.id));
    expect(await db.select().from(schema.matches)).toHaveLength(0);
    expect(await db.select().from(schema.gameModes)).toHaveLength(0);
  });

  it('check constraints reject invalid enum values', async () => {
    const game = await createGame();
    await expect(createTournament(game.id, { format: 'round-robin' as never })).rejects.toThrow();
  });
});

describe('fixtures + reset', () => {
  it('fixtures return typed rows and reset truncates between tests', async () => {
    const g = await createGame();
    const m = await createGameMode(g.id, { scoring_type: 'FFA' });
    expect(m.scoring_type).toBe('FFA');
    await resetPgTestDb();
    expect(await getPgTestDb().select().from(schema.games)).toHaveLength(0);
  });

  it('starts clean after the previous test (afterEach reset)', async () => {
    expect(await getPgTestDb().select().from(schema.games)).toHaveLength(0);
  });
});

describe('constraints (ported from SQLite schema/foreign-key suites)', () => {
  it('rejects FK violations: game_mode -> game, match_participant -> match, match -> game', async () => {
    const db = getPgTestDb();
    await expect(db.insert(schema.gameModes).values({ id: 'm1', game_id: 'nope', name: 'x', description: 'd', scoring_type: 'Normal' } as never)).rejects.toThrow();
    await expect(db.insert(schema.matchParticipants).values({ id: 'p1', match_id: 'nope', user_id: 'u', username: 'x' } as never)).rejects.toThrow();
    const { game, mode } = await seedBasicTestData();
    const match = await createMatch(game.id, mode.id);
    await db.insert(schema.matchParticipants).values({ id: 'p2', match_id: match.id, user_id: 'u', username: 'x' } as never);
    expect(await db.select().from(schema.matchParticipants)).toHaveLength(1);
  });

  it('check constraints reject invalid scorecard / queue statuses', async () => {
    const db = getPgTestDb();
    const { game, mode } = await seedBasicTestData();
    const match = await createMatch(game.id, mode.id);
    await expect(db.insert(schema.scorecardSubmissions).values({ match_id: match.id, team_side: 'green', source: 'web' } as never)).rejects.toThrow();
    await expect(db.insert(schema.discordBotRequests).values({ request_type: 'x', status: 'bogus' } as never)).rejects.toThrow();
  });
});
