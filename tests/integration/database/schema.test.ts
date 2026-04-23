import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Database } from '../../../lib/database/connection';

describe('Database Schema Validation', () => {
  const testDbPath = path.join(process.cwd(), 'app_data', 'data', 'schema-test.db');
  let db: Database;

  beforeAll(async () => {
    // Clean up
    for (const p of [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    // Ensure directory exists
    const dbDir = path.dirname(testDbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Create and migrate database
    db = new Database(testDbPath);
    await db.connect();

    const migrationsDir = path.join(process.cwd(), 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await db.exec(sql);
    }
  });

  afterAll(async () => {
    await db.close();

    for (const p of [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`]) {
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch { }
      }
    }
  });

  describe('Matches Table', () => {
    it('should have required columns', async () => {
      const columns = await getTableColumns('matches');
      const columnNames = columns.map(c => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('game_id');
      expect(columnNames).toContain('mode_id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('match_format');
      expect(columnNames).toContain('rounds');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
      expect(columnNames).toContain('start_date');
      expect(columnNames).toContain('start_time');
    });

    it('should have foreign key to games table', async () => {
      const foreignKeys = await getTableForeignKeys('matches');
      const gamesFk = foreignKeys.find(fk => fk.table === 'games');

      expect(gamesFk).toBeDefined();
      expect(gamesFk?.from).toBe('game_id');
    });

    it('should have foreign key constraint with composite key', async () => {
      const foreignKeys = await getTableForeignKeys('matches');
      const gameModeFk = foreignKeys.find(fk => fk.table === 'game_modes');

      expect(gameModeFk).toBeDefined();
      // game_modes has a composite primary key (id, game_id)
    });
  });

  describe('Match Participants Table', () => {
    it('should have required columns', async () => {
      const columns = await getTableColumns('match_participants');
      const columnNames = columns.map(c => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('match_id');
      expect(columnNames).toContain('user_id');
      expect(columnNames).toContain('discord_user_id');
      expect(columnNames).toContain('username');
      expect(columnNames).toContain('team');
      expect(columnNames).toContain('joined_at');
    });

    it('should have foreign key to matches table', async () => {
      const foreignKeys = await getTableForeignKeys('match_participants');
      const matchesFk = foreignKeys.find(fk => fk.table === 'matches');

      expect(matchesFk).toBeDefined();
      expect(matchesFk?.from).toBe('match_id');
    });
  });

  describe('Tournaments Table', () => {
    it('should have required columns', async () => {
      const columns = await getTableColumns('tournaments');
      const columnNames = columns.map(c => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('game_id');
      expect(columnNames).toContain('format');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('rounds_per_match');
      expect(columnNames).toContain('ruleset');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('allow_match_editing');
    });

    it('should have foreign key to games table', async () => {
      const foreignKeys = await getTableForeignKeys('tournaments');
      const gamesFk = foreignKeys.find(fk => fk.table === 'games');

      expect(gamesFk).toBeDefined();
      expect(gamesFk?.from).toBe('game_id');
    });
  });

  describe('Games Table', () => {
    it('should have required columns', async () => {
      const columns = await getTableColumns('games');
      const columnNames = columns.map(c => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('genre');
      expect(columnNames).toContain('icon_url');
      expect(columnNames).toContain('version');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });

    it('should have index on name', async () => {
      const indexes = await getTableIndexes('games');
      const nameIndex = indexes.find(idx =>
        idx.name === 'idx_games_name'
      );

      expect(nameIndex).toBeDefined();
    });
  });

  describe('Game Modes Table', () => {
    it('should have required columns', async () => {
      const columns = await getTableColumns('game_modes');
      const columnNames = columns.map(c => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('game_id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('description');
      expect(columnNames).toContain('team_size');
      expect(columnNames).toContain('scoring_type');
      expect(columnNames).toContain('created_at');
    });

    it('should have foreign key to games table', async () => {
      const foreignKeys = await getTableForeignKeys('game_modes');
      const gamesFk = foreignKeys.find(fk => fk.table === 'games');

      expect(gamesFk).toBeDefined();
      expect(gamesFk?.from).toBe('game_id');
    });
  });

  describe('Game Maps Table', () => {
    it('should have required columns', async () => {
      const columns = await getTableColumns('game_maps');
      const columnNames = columns.map(c => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('game_id');
      expect(columnNames).toContain('mode_id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('image_url');
      expect(columnNames).toContain('tournament_enabled');
      expect(columnNames).toContain('created_at');
    });

    it('should have foreign key to game_modes table with composite key', async () => {
      const foreignKeys = await getTableForeignKeys('game_maps');
      const modesFk = foreignKeys.find(fk => fk.table === 'game_modes');

      expect(modesFk).toBeDefined();
      // game_modes has a composite primary key (id, game_id)
    });
  });

  describe('Discord Queue Tables', () => {
    const queueTables = [
      'discord_announcement_queue',
      'discord_voice_announcement_queue',
      'discord_reminder_queue',
      'discord_status_update_queue',
      'discord_match_reminder_queue',
      'discord_player_reminder_queue',
      'discord_match_start_queue',
      'discord_deletion_queue',
      'discord_score_notification_queue',
      'discord_map_code_queue',
      'discord_match_winner_queue',
    ];

    queueTables.forEach(tableName => {
      it(`${tableName} should have required columns`, async () => {
        const columns = await getTableColumns(tableName);
        const columnNames = columns.map(c => c.name);

        expect(columnNames).toContain('id');
        expect(columnNames).toContain('status');
        expect(columnNames).toContain('created_at');
      });
    });
  });

  describe('Settings Tables', () => {
    it('app_settings table should have required columns', async () => {
      const columns = await getTableColumns('app_settings');
      const columnNames = columns.map(c => c.name);

      expect(columnNames).toContain('setting_key');
      expect(columnNames).toContain('setting_value');
      expect(columnNames).toContain('data_type');
      expect(columnNames).toContain('metadata');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });

    it('scheduler_settings table should have required columns', async () => {
      const columns = await getTableColumns('scheduler_settings');
      const columnNames = columns.map(c => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('match_cleanup_cron');
      expect(columnNames).toContain('match_check_cron');
      expect(columnNames).toContain('reminder_check_cron');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });

    it('ui_settings table should have required columns', async () => {
      const columns = await getTableColumns('ui_settings');
      const columnNames = columns.map(c => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('theme');
      expect(columnNames).toContain('language');
      expect(columnNames).toContain('timezone');
      expect(columnNames).toContain('date_format');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });
  });

  describe('Performance Indexes (Migration 013)', () => {
    const expectedIndexes = [
      { name: 'idx_matches_status_updated', table: 'matches' },
      { name: 'idx_match_participants_match_id', table: 'match_participants' },
      { name: 'idx_match_participants_user_id', table: 'match_participants' },
      { name: 'idx_match_games_match_id', table: 'match_games' },
      { name: 'idx_tournament_matches_tournament_id', table: 'tournament_matches' },
      { name: 'idx_tournament_participants_tournament_id', table: 'tournament_participants' },
      { name: 'idx_matches_tournament_id', table: 'matches' },
      { name: 'idx_discord_announcement_queue_status', table: 'discord_announcement_queue' },
    ];

    expectedIndexes.forEach(({ name, table }) => {
      it(`should have index ${name} on ${table}`, async () => {
        const index = await db.get<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type='index' AND name=?`,
          [name]
        );
        expect(index).toBeDefined();
        expect(index!.name).toBe(name);
      });
    });
  });

  describe('Database Triggers', () => {
    it('should have all expected triggers', async () => {
      const triggers = await db.all<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name`
      );
      const triggerNames = triggers.map(t => t.name);

      expect(triggerNames).toContain('sync_match_voice_alternation_timestamps'); // migration 004
      expect(triggerNames).toContain('update_stats_settings_ts');                // migration 012
      expect(triggerNames).toContain('update_scorecard_submissions_ts');         // migration 012
      expect(triggerNames).toContain('update_scorecard_player_stats_ts');        // migration 012
      expect(triggerNames).toContain('update_match_player_stats_ts');            // migration 012
    });

    it('should fire update_stats_settings_ts trigger on UPDATE', async () => {
      // Set updated_at to a sentinel so we can detect when the trigger overwrites it
      await db.run(`UPDATE stats_settings SET updated_at = '2000-01-01 00:00:00' WHERE id = 1`);

      // Update a different column — trigger should set updated_at = CURRENT_TIMESTAMP
      await db.run(`UPDATE stats_settings SET ai_model = 'opus' WHERE id = 1`);

      const row = await db.get<{ updated_at: string }>(`SELECT updated_at FROM stats_settings WHERE id = 1`);
      expect(row).toBeDefined();
      expect(row!.updated_at).not.toBe('2000-01-01 00:00:00');
    });

    it('should fire sync_match_voice_alternation_timestamps trigger on UPDATE', async () => {
      // Insert a test row (FK to matches is off, so match_id doesn't need to exist)
      await db.run(
        `INSERT INTO match_voice_alternation (match_id, current_team) VALUES (?, ?)`,
        ['trigger-test-match', 'blue']
      );

      // Update updated_at to a known value — trigger should copy it to last_updated_at
      await db.run(
        `UPDATE match_voice_alternation SET updated_at = '2025-06-15 12:00:00' WHERE match_id = ?`,
        ['trigger-test-match']
      );

      const row = await db.get<{ last_updated_at: string }>(
        `SELECT last_updated_at FROM match_voice_alternation WHERE match_id = ?`,
        ['trigger-test-match']
      );
      expect(row).toBeDefined();
      expect(row!.last_updated_at).toBe('2025-06-15 12:00:00');

      await db.run(`DELETE FROM match_voice_alternation WHERE match_id = ?`, ['trigger-test-match']);
    });
  });

  describe('CHECK Constraints', () => {
    it('should reject invalid status on discord_bot_requests', async () => {
      await expect(
        db.run(
          `INSERT INTO discord_bot_requests (id, type, status) VALUES (?, ?, ?)`,
          ['ck-test-1', 'test_type', 'invalid_status']
        )
      ).rejects.toThrow();
    });

    it('should reject invalid team_side on scorecard_submissions', async () => {
      await expect(
        db.run(
          `INSERT INTO scorecard_submissions (id, match_id, match_game_id, team_side, screenshot_url) VALUES (?, ?, ?, ?, ?)`,
          ['ck-test-2', 'match-x', 'game-x', 'invalid_team', 'https://example.com/img.png']
        )
      ).rejects.toThrow();
    });

    it('should reject invalid ai_extraction_status on scorecard_submissions', async () => {
      await expect(
        db.run(
          `INSERT INTO scorecard_submissions (id, match_id, match_game_id, team_side, screenshot_url, ai_extraction_status) VALUES (?, ?, ?, ?, ?, ?)`,
          ['ck-test-3', 'match-x', 'game-x', 'blue', 'https://example.com/img.png', 'invalid_status']
        )
      ).rejects.toThrow();
    });
  });

  // Helper functions
  async function getTableColumns(tableName: string): Promise<any[]> {
    return db.all(`PRAGMA table_info(${tableName})`);
  }

  async function getTableForeignKeys(tableName: string): Promise<any[]> {
    return db.all(`PRAGMA foreign_key_list(${tableName})`);
  }

  async function getTableIndexes(tableName: string): Promise<any[]> {
    return db.all(
      `SELECT * FROM sqlite_master WHERE type='index' AND tbl_name=?`,
      [tableName]
    );
  }
});
