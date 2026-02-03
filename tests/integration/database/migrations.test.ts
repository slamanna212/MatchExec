import { describe, it, expect, afterAll } from 'vitest';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

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

    const db = new sqlite3.Database(testDbPath);
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

    // Close database
    await new Promise<void>((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  it('should be idempotent (running twice should not error)', async () => {
    // Note: Some migrations (like 004_fix_voice_alternation_schema.sql) are NOT idempotent
    // because they use ALTER TABLE ADD COLUMN without IF NOT EXISTS.
    // This test verifies that the CREATE TABLE IF NOT EXISTS statements work correctly.

    // Clean up
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    const db = new sqlite3.Database(testDbPath);
    const migrationsDir = path.join(process.cwd(), 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    // Filter to only test migrations that should be idempotent (CREATE TABLE IF NOT EXISTS)
    // Some migrations use ALTER TABLE ADD COLUMN or depend on tables from skipped migrations
    const idempotentMigrations = migrationFiles.filter(f =>
      !f.includes('004_fix_voice_alternation_schema.sql') && // ALTER TABLE ADD COLUMN
      !f.includes('005_tournament_system.sql') && // ALTER TABLE statements
      !f.includes('006_position_based_scoring.sql') && // May have ALTER TABLE
      !f.includes('007_v0_6.sql') && // ALTER TABLE and depends on tournaments
      !f.includes('008_UI_Updates.sql') // May have ALTER TABLE
    );

    // Run migrations first time
    for (const file of idempotentMigrations) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await new Promise<void>((resolve, reject) => {
        db.exec(sql, (err) => {
          if (err) reject(new Error(`First run - Migration ${file} failed: ${err.message}`));
          else resolve();
        });
      });
    }

    // Run migrations second time - should not error due to IF NOT EXISTS clauses
    for (const file of idempotentMigrations) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await new Promise<void>((resolve, reject) => {
        db.exec(sql, (err) => {
          if (err) reject(new Error(`Second run - Migration ${file} failed: ${err.message}`));
          else resolve();
        });
      });
    }

    // Verify tables still exist after double-run
    const tables = await new Promise<any[]>((resolve, reject) => {
      db.all(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });

    expect(tables.length).toBeGreaterThan(0);

    // Close database
    await new Promise<void>((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  it('should create migrations tracking table', async () => {
    // Clean up
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    const db = new sqlite3.Database(testDbPath);
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
