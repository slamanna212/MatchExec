import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Database } from '../../../lib/database/connection';
import { createMigrationRunner } from '../../../lib/database/migrations';

describe('Database Migrations', () => {
  const testDbPath = path.join(process.cwd(), 'app_data', 'data', 'migration-test.db');

  afterAll(() => {
    // Clean up test database and WAL/SHM files
    for (const p of [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`]) {
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch { }
      }
    }
  });

  it('should run all migrations without error', async () => {
    // Clean up from any previous test run
    for (const p of [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    // Ensure directory exists
    const dbDir = path.dirname(testDbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const db = new Database(testDbPath);
    await db.connect();

    try {
      const migrationsDir = path.join(process.cwd(), 'migrations');
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

      // Should have migration files
      expect(migrationFiles.length).toBeGreaterThan(0);

      // Run each migration
      for (const file of migrationFiles) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        await db.exec(sql);
      }

      // Verify key tables exist
      const tables = await db.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      );

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
      const discordSettingsCols = await db.all<{ name: string }>('PRAGMA table_info(discord_settings)');
      const discordColNames = discordSettingsCols.map((c: any) => c.name);
      expect(discordColNames).toContain('voice_channel_cleanup_delay_minutes'); // migration 007
      expect(discordColNames).toContain('match_start_delay_seconds');           // migration 007

      const tournamentCols = await db.all<{ name: string }>('PRAGMA table_info(tournaments)');
      const tournamentColNames = tournamentCols.map((c: any) => c.name);
      expect(tournamentColNames).toContain('game_mode_id');         // migration 007
      expect(tournamentColNames).toContain('allow_match_editing');  // migration 008

      const participantCols = await db.all<{ name: string }>('PRAGMA table_info(match_participants)');
      const participantColNames = participantCols.map((c: any) => c.name);
      expect(participantColNames).toContain('avatar_url'); // migration 008
    } finally {
      await db.close();
    }
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

  it('should preserve data through discord_bot_requests table recreation in migration 007', async () => {
    const migration007DbPath = path.join(process.cwd(), 'app_data', 'data', 'migration-007-test.db');

    for (const p of [migration007DbPath, `${migration007DbPath}-wal`, `${migration007DbPath}-shm`]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    const db = new Database(migration007DbPath);
    await db.connect();

    try {
      const migrationsDir = path.join(process.cwd(), 'migrations');
      const allFiles = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

      // Run only migrations before 007
      for (const file of allFiles.filter(f => f < '007')) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        await db.exec(sql);
      }

      // Discover actual column names — prefer legacy 'request_type'/'request_data' (NOT NULL in pre-007
      // schema) over the newer 'type'/'data' aliases which are nullable
      const colInfo = await db.all<{ name: string }>('PRAGMA table_info(discord_bot_requests)');
      const colNames = colInfo.map((c: any) => c.name);
      const typeCol = colNames.includes('request_type') ? 'request_type' : 'type';
      const dataCol = colNames.includes('request_data') ? 'request_data' : 'data';

      // Insert a row with known data before the migration runs
      await db.run(
        `INSERT INTO discord_bot_requests (id, ${typeCol}, ${dataCol}, status) VALUES (?, ?, ?, ?)`,
        ['data-migrate-test', 'match_update', '{"matchId":"m1"}', 'pending']
      );

      // Run migration 007 — it recreates discord_bot_requests via CREATE/INSERT/DROP/RENAME
      const sql007 = fs.readFileSync(path.join(migrationsDir, '007_v0_6.sql'), 'utf-8');
      await db.exec(sql007);

      // Verify the row survived with its data in the canonical column names
      const row = await db.get<{ id: string; type: string; data: string; status: string }>(
        `SELECT * FROM discord_bot_requests WHERE id = ?`,
        ['data-migrate-test']
      );
      expect(row).toBeDefined();
      expect(row!.type).toBe('match_update');
      expect(row!.data).toBe('{"matchId":"m1"}');
      expect(row!.status).toBe('pending');
    } finally {
      await db.close();
      for (const p of [migration007DbPath, `${migration007DbPath}-wal`, `${migration007DbPath}-shm`]) {
        if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch { } }
      }
    }
  });

  describe('transaction rollback on migration failure', () => {
    const workerId = process.env.VITEST_POOL_ID || '0';
    const rollbackDbPath = path.join(process.cwd(), 'app_data', 'data', `migration-rollback-${workerId}.db`);
    const tempMigrationsDir = path.join(process.cwd(), 'app_data', 'data', `temp-migrations-${workerId}`);
    let rollbackDb: Database;

    beforeAll(async () => {
      for (const p of [rollbackDbPath, `${rollbackDbPath}-wal`, `${rollbackDbPath}-shm`]) {
        if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch { } }
      }
      if (fs.existsSync(tempMigrationsDir)) fs.rmSync(tempMigrationsDir, { recursive: true, force: true });

      fs.mkdirSync(tempMigrationsDir, { recursive: true });

      // 001 is valid — creates a table that should be committed
      fs.writeFileSync(
        path.join(tempMigrationsDir, '001_valid.sql'),
        'CREATE TABLE rollback_test_valid (id INTEGER PRIMARY KEY);'
      );

      // 002 is invalid — creates a table then hits bad SQL; everything should roll back
      fs.writeFileSync(
        path.join(tempMigrationsDir, '002_invalid.sql'),
        'CREATE TABLE rollback_test_partial (id INTEGER PRIMARY KEY);\nTHIS IS NOT VALID SQL;'
      );

      rollbackDb = new Database(rollbackDbPath);
      await rollbackDb.connect();

      const runner = createMigrationRunner(rollbackDb, tempMigrationsDir, undefined);
      // 002 throws — swallow so beforeAll completes and assertions can run
      await runner.up().catch(() => {});
    });

    afterAll(async () => {
      await rollbackDb.close();
      for (const p of [rollbackDbPath, `${rollbackDbPath}-wal`, `${rollbackDbPath}-shm`]) {
        if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch { } }
      }
      if (fs.existsSync(tempMigrationsDir)) fs.rmSync(tempMigrationsDir, { recursive: true, force: true });
    });

    it('should commit the successful migration', async () => {
      const tables = await rollbackDb.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table'"
      );
      expect(tables.map(t => t.name)).toContain('rollback_test_valid');
    });

    it('should roll back the failed migration leaving no partial changes', async () => {
      const tables = await rollbackDb.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table'"
      );
      expect(tables.map(t => t.name)).not.toContain('rollback_test_partial');
    });

    it('should not record a failed migration in the tracking table', async () => {
      const records = await rollbackDb.all<{ filename: string }>('SELECT filename FROM migrations');
      const filenames = records.map(r => r.filename);
      expect(filenames).toContain('001_valid.sql');
      expect(filenames).not.toContain('002_invalid.sql');
    });
  });

  it('should create migrations tracking table', async () => {
    // Clean up
    for (const p of [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    // Ensure directory exists
    const dbDir2 = path.dirname(testDbPath);
    if (!fs.existsSync(dbDir2)) {
      fs.mkdirSync(dbDir2, { recursive: true });
    }

    const db = new Database(testDbPath);
    await db.connect();

    try {
      const migrationsDir = path.join(process.cwd(), 'migrations');
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

      // Run migrations
      for (const file of migrationFiles) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        await db.exec(sql);
      }

      // Check that migrations table exists
      const migrationsTable = await db.get<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'"
      );

      expect(migrationsTable).toBeDefined();
      expect(migrationsTable!.name).toBe('migrations');
    } finally {
      await db.close();
    }
  });
});
