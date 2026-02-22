import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

describe('Database Schema Validation', () => {
  const testDbPath = path.join(process.cwd(), 'app_data', 'data', 'schema-test.db');
  let db: sqlite3.Database;

  beforeAll(async () => {
    // Clean up
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Create and migrate database
    db = new sqlite3.Database(testDbPath);
    const migrationsDir = path.join(process.cwd(), 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await new Promise<void>((resolve, reject) => {
        db.exec(sql, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  });

  afterAll(async () => {
    // Close and clean up
    await new Promise<void>((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
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

  // Helper functions
  async function getTableColumns(tableName: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async function getTableForeignKeys(tableName: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      db.all(`PRAGMA foreign_key_list(${tableName})`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async function getTableIndexes(tableName: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM sqlite_master WHERE type='index' AND tbl_name=?`,
        [tableName],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }
});
