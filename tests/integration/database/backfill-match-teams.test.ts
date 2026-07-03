import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Database } from '../../../lib/database/connection';

/**
 * Dedicated test for migrations/021_backfill_match_teams.sql — specifically
 * the "orphaned mode_id" case: a match whose mode_id no longer resolves to a
 * game_modes row (e.g. the mode was renamed/removed in a later data
 * re-seed). The backfill must infer the real scoring_type from the match's
 * own match_games data rather than defaulting everything to 'Normal', which
 * would both fabricate Blue/Red match_teams for an FFA/Position match and
 * permanently lose its real result data (the FFA/Position placement backfill
 * sections only run for matches classified as FFA/Position).
 */
describe('Migration 021 — match_teams backfill', () => {
  const testDbPath = path.join(process.cwd(), 'app_data', 'data', 'backfill-match-teams-test.db');

  afterAll(() => {
    for (const p of [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`]) {
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch { /* ignore */ }
      }
    }
  });

  async function freshMigratedDb(): Promise<Database> {
    for (const p of [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    const dbDir = path.dirname(testDbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    const db = new Database(testDbPath);
    await db.connect();

    const migrationsDir = path.join(process.cwd(), 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    // Run everything up to (but not including) 021 — we drive 021 manually per test.
    for (const file of migrationFiles) {
      if (file >= '021') break;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await db.exec(sql);
    }
    return db;
  }

  async function run021(db: Database): Promise<void> {
    const sql = fs.readFileSync(path.join(process.cwd(), 'migrations', '021_backfill_match_teams.sql'), 'utf-8');
    await db.exec(sql);
  }

  it('classifies an orphaned-mode FFA match as FFA (not Normal) and migrates its real result', async () => {
    const db = await freshMigratedDb();

    await db.run(`INSERT INTO games (id, name) VALUES ('game1', 'Game One')`);
    // Note: no game_modes row for 'ffa-mode' — simulates a mode removed/renamed
    // in a later re-seed after this match was played.
    await db.run(`
      INSERT INTO matches (id, name, game_id, mode_id, status, start_date, start_time, created_at, updated_at)
      VALUES ('match1', 'Orphaned FFA Match', 'game1', 'ffa-mode', 'complete', '2026-01-01', '12:00', datetime('now'), datetime('now'))
    `);
    await db.run(`
      INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username, joined_at)
      VALUES ('p1', 'match1', 'u1', 'd1', 'Alice', datetime('now')),
             ('p2', 'match1', 'u2', 'd2', 'Bob', datetime('now'))
    `);
    await db.run(`
      INSERT INTO match_games (id, match_id, round, status, is_ffa_mode, participant_winner_id)
      VALUES ('mg1', 'match1', 1, 'completed', 1, 'p1')
    `);

    await run021(db);

    const teams = await db.all<{ id: string; team_name: string; is_reserve: number }>(
      `SELECT id, team_name, is_reserve FROM match_teams WHERE match_id = 'match1' ORDER BY team_order`
    );
    // Must be per-participant teams (FFA), not fabricated Blue/Red.
    expect(teams.map(t => t.team_name).sort()).toEqual(['Alice', 'Bob']);
    expect(teams.some(t => t.team_name === 'Blue' || t.team_name === 'Red')).toBe(false);

    const participants = await db.all<{ id: string; team_id: string | null }>(
      `SELECT id, team_id FROM match_participants WHERE match_id = 'match1'`
    );
    for (const p of participants) {
      expect(p.team_id).toBe(`mt_ffa_${p.id}`);
    }

    // The real FFA result must have migrated into match_game_placements.
    const placements = await db.all<{ entity_type: string; entity_id: string; is_winner: number }>(
      `SELECT entity_type, entity_id, is_winner FROM match_game_placements WHERE match_game_id = 'mg1'`
    );
    expect(placements).toHaveLength(1);
    expect(placements[0]).toMatchObject({ entity_type: 'participant', entity_id: 'p1', is_winner: 1 });

    await db.close();
  });

  it('classifies an orphaned-mode Position match as Position and migrates position_results', async () => {
    const db = await freshMigratedDb();

    await db.run(`INSERT INTO games (id, name) VALUES ('game1', 'Game One')`);
    await db.run(`
      INSERT INTO matches (id, name, game_id, mode_id, status, start_date, start_time, created_at, updated_at)
      VALUES ('match2', 'Orphaned Position Match', 'game1', 'pos-mode', 'complete', '2026-01-01', '12:00', datetime('now'), datetime('now'))
    `);
    await db.run(`
      INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username, joined_at)
      VALUES ('p1', 'match2', 'u1', 'd1', 'Alice', datetime('now')),
             ('p2', 'match2', 'u2', 'd2', 'Bob', datetime('now'))
    `);
    await db.run(`
      INSERT INTO match_games (id, match_id, round, status, position_results, points_awarded)
      VALUES ('mg2', 'match2', 1, 'completed', '{"p1":1,"p2":2}', '{"p1":25,"p2":18}')
    `);

    await run021(db);

    const teams = await db.all<{ team_name: string }>(
      `SELECT team_name FROM match_teams WHERE match_id = 'match2' ORDER BY team_order`
    );
    expect(teams.map(t => t.team_name).sort()).toEqual(['Alice', 'Bob']);

    const placements = await db.all<{ entity_id: string; position: number; points_awarded: number }>(
      `SELECT entity_id, position, points_awarded FROM match_game_placements WHERE match_game_id = 'mg2' ORDER BY position`
    );
    expect(placements).toHaveLength(2);
    expect(placements[0]).toMatchObject({ entity_id: 'p1', position: 1, points_awarded: 25 });
    expect(placements[1]).toMatchObject({ entity_id: 'p2', position: 2, points_awarded: 18 });

    await db.close();
  });

  it('is idempotent — re-running 021 does not duplicate rows', async () => {
    const db = await freshMigratedDb();

    await db.run(`INSERT INTO games (id, name) VALUES ('game1', 'Game One')`);
    await db.run(`
      INSERT INTO matches (id, name, game_id, mode_id, status, start_date, start_time, created_at, updated_at)
      VALUES ('match3', 'Repeat Match', 'game1', 'ffa-mode', 'complete', '2026-01-01', '12:00', datetime('now'), datetime('now'))
    `);
    await db.run(`
      INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username, joined_at)
      VALUES ('p1', 'match3', 'u1', 'd1', 'Alice', datetime('now'))
    `);
    await db.run(`
      INSERT INTO match_games (id, match_id, round, status, is_ffa_mode, participant_winner_id)
      VALUES ('mg3', 'match3', 1, 'completed', 1, 'p1')
    `);

    await run021(db);
    await run021(db);

    const teams = await db.all(`SELECT id FROM match_teams WHERE match_id = 'match3'`);
    expect(teams).toHaveLength(1);
    const placements = await db.all(`SELECT id FROM match_game_placements WHERE match_game_id = 'mg3'`);
    expect(placements).toHaveLength(1);

    await db.close();
  });
});
