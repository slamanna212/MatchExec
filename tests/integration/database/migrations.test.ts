import { describe, it, expect, afterAll } from 'vitest';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { Database } from '../../../lib/database/connection';
import { createMigrationRunner } from '../../../lib/database/migrations';

describe('Database Migrations', () => {
  const testDbPath = path.join(process.cwd(), 'app_data', 'data', 'migration-test.db');

  afterAll(() => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should run all migrations without error', async () => {
    // Clean up from any previous test run
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Ensure directory exists
    const dbDir = path.dirname(testDbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const db = await new Promise<sqlite3.Database>((resolve, reject) => {
      const instance = new sqlite3.Database(testDbPath, (err) => {
        if (err) reject(err);
        else resolve(instance);
      });
    });
    const migrationsDir = path.join(process.cwd(), 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    // Should have migration files
    expect(migrationFiles.length).toBeGreaterThan(0);

    // Run each migration
    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await new Promise<void>((resolve, reject) => {
        db.exec(sql, (err) => {
          if (err) reject(new Error(`Migration ${file} failed: ${err.message}`));
          else resolve();
        });
      });
    }

    // Verify key tables exist
    const tables = await new Promise<any[]>((resolve, reject) => {
      db.all(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });

    const tableNames = tables.map(t => t.name);

    // Core tables
    expect(tableNames).toContain('matches');
    expect(tableNames).toContain('match_participants');
    expect(tableNames).toContain('match_games');
    expect(tableNames).toContain('tournaments');
    expect(tableNames).toContain('tournament_participants');
    expect(tableNames).toContain('tournament_teams');
    expect(tableNames).toContain('tournament_team_members');
    expect(tableNames).toContain('tournament_matches');

    // Game data tables
    expect(tableNames).toContain('games');
    expect(tableNames).toContain('game_modes');
    expect(tableNames).toContain('game_maps');

    // Settings tables
    expect(tableNames).toContain('app_settings');
    expect(tableNames).toContain('scheduler_settings');
    expect(tableNames).toContain('ui_settings');
    expect(tableNames).toContain('announcement_role_settings');

    // Discord queue tables
    expect(tableNames).toContain('discord_announcement_queue');
    expect(tableNames).toContain('discord_voice_announcement_queue');
    expect(tableNames).toContain('discord_reminder_queue');
    expect(tableNames).toContain('discord_status_update_queue');
    expect(tableNames).toContain('discord_match_reminder_queue');
    expect(tableNames).toContain('discord_player_reminder_queue');
    expect(tableNames).toContain('discord_match_start_queue');
    expect(tableNames).toContain('discord_deletion_queue');
    expect(tableNames).toContain('discord_score_notification_queue');
    expect(tableNames).toContain('discord_map_code_queue');
    expect(tableNames).toContain('discord_match_winner_queue');

    // System tables
    expect(tableNames).toContain('migrations');
    expect(tableNames).toContain('data_versions');

    // Discord tables
    expect(tableNames).toContain('discord_settings');
    expect(tableNames).toContain('discord_channels');
    expect(tableNames).toContain('team_voice_channels');

    // Migration 007 tables
    expect(tableNames).toContain('auto_voice_channels');
    expect(tableNames).toContain('health_alerts_sent');

    // Migration 008 tables
    expect(tableNames).toContain('discord_match_edit_queue');
    expect(tableNames).toContain('tournament_round_byes');

    // Verify key columns from ALTER TABLE migrations (catches partial migration bugs)
    const discordSettingsCols = await new Promise<any[]>((resolve, reject) => {
      db.all('PRAGMA table_info(discord_settings)', (err, rows) => err ? reject(err) : resolve(rows));
    });
    const discordColNames = discordSettingsCols.map((c: any) => c.name);
    expect(discordColNames).toContain('voice_channel_cleanup_delay_minutes'); // migration 007
    expect(discordColNames).toContain('match_start_delay_seconds');           // migration 007

    const tournamentCols = await new Promise<any[]>((resolve, reject) => {
      db.all('PRAGMA table_info(tournaments)', (err, rows) => err ? reject(err) : resolve(rows));
    });
    const tournamentColNames = tournamentCols.map((c: any) => c.name);
    expect(tournamentColNames).toContain('game_mode_id');         // migration 007
    expect(tournamentColNames).toContain('allow_match_editing');  // migration 008

    const participantCols = await new Promise<any[]>((resolve, reject) => {
      db.all('PRAGMA table_info(match_participants)', (err, rows) => err ? reject(err) : resolve(rows));
    });
    const participantColNames = participantCols.map((c: any) => c.name);
    expect(participantColNames).toContain('avatar_url'); // migration 008

    // Close database
    await new Promise<void>((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  it('should be idempotent (running twice should not error)', async () => {
    const idempotencyDbPath = path.join(process.cwd(), 'app_data', 'data', 'idempotency-test.db');

    for (const p of [idempotencyDbPath, `${idempotencyDbPath}-wal`, `${idempotencyDbPath}-shm`]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    const db = new Database(idempotencyDbPath);
    await db.connect();

    try {
      const migrationsDir = path.join(process.cwd(), 'migrations');
      const runner = createMigrationRunner(db, migrationsDir, undefined);

      await runner.up(); // First pass: applies all migrations, records in tracking table
      await runner.up(); // Second pass: all already tracked — no SQL executed, no errors

      const tables = await db.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      );
      expect(tables.length).toBeGreaterThan(0);
    } finally {
      await db.close();
      for (const p of [idempotencyDbPath, `${idempotencyDbPath}-wal`, `${idempotencyDbPath}-shm`]) {
        if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch { } }
      }
    }
  });

  it('should record all migrations in tracking table when using MigrationRunner', async () => {
    const runnerDbPath = path.join(process.cwd(), 'app_data', 'data', 'migration-runner-test.db');

    // Clean up from any previous run (including WAL/SHM files)
    for (const filePath of [runnerDbPath, `${runnerDbPath}-wal`, `${runnerDbPath}-shm`]) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    const db = new Database(runnerDbPath);
    await db.connect();

    try {
      const migrationsDir = path.join(process.cwd(), 'migrations');
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

      const runner = createMigrationRunner(db, migrationsDir, undefined);
      await runner.up();

      // Verify all migrations are recorded (catches partial-application bugs)
      const migrationRecords = await db.all<{ filename: string }>('SELECT filename FROM migrations ORDER BY filename');
      const recordedMigrations = migrationRecords.map((r: any) => r.filename);
      for (const file of migrationFiles) {
        expect(recordedMigrations).toContain(file);
      }
    } finally {
      await db.close();
      for (const filePath of [runnerDbPath, `${runnerDbPath}-wal`, `${runnerDbPath}-shm`]) {
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch { }
        }
      }
    }
  });

  it('should create migrations tracking table', async () => {
    // Clean up
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Ensure directory exists
    const dbDir2 = path.dirname(testDbPath);
    if (!fs.existsSync(dbDir2)) {
      fs.mkdirSync(dbDir2, { recursive: true });
    }

    const db = await new Promise<sqlite3.Database>((resolve, reject) => {
      const instance = new sqlite3.Database(testDbPath, (err) => {
        if (err) reject(err);
        else resolve(instance);
      });
    });
    const migrationsDir = path.join(process.cwd(), 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    // Run migrations
    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await new Promise<void>((resolve, reject) => {
        db.exec(sql, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    // Check that migrations table exists
    const migrationsTable = await new Promise<any>((resolve, reject) => {
      db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'",
        (err, row) => err ? reject(err) : resolve(row)
      );
    });

    expect(migrationsTable).toBeDefined();
    expect(migrationsTable.name).toBe('migrations');

    // Close database
    await new Promise<void>((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
});
