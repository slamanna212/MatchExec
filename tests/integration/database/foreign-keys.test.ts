/**
 * FK Constraint Tests
 *
 * SQLite foreign key enforcement is OFF by default (PRAGMA foreign_keys=OFF).
 * These tests document the current FK state and verify constraint correctness.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData } from '../../utils/fixtures';

describe('Database Foreign Keys', () => {
  let db: any;

  beforeEach(async () => {
    db = getTestDb();
    await seedBasicTestData();
  });

  // ─── FK=OFF (current mode) ─────────────────────────────────────────────────

  describe('With PRAGMA foreign_keys=OFF (current default)', () => {
    it('FK enforcement is disabled by default', async () => {
      const row = await db.get('PRAGMA foreign_keys') as { foreign_keys: number } | null;
      expect(row!.foreign_keys).toBe(0);
    });

    it('inserts a match referencing a valid game and mode without error', async () => {
      const { game, mode } = await seedBasicTestData();
      await expect(
        db.run(
          `INSERT INTO matches (id, game_id, mode_id, name, start_date, start_time, status, match_format, rounds, player_notifications)
           VALUES ('fk-off-match', ?, ?, 'FK Test', '2025-01-01', '18:00', 'created', 'competitive', 3, 1)`,
          [game.id, mode.id]
        )
      ).resolves.not.toThrow();
    });

    it('inserts a match with a nonexistent game_id without error (FK not enforced)', async () => {
      await expect(
        db.run(
          `INSERT INTO matches (id, game_id, mode_id, name, start_date, start_time, status, match_format, rounds, player_notifications)
           VALUES ('fk-off-invalid', 'nonexistent-game', 'nonexistent-mode', 'Bad Refs', '2025-01-01', '18:00', 'created', 'competitive', 3, 1)`
        )
      ).resolves.not.toThrow();
    });

    it('inserts a match participant with a nonexistent match_id without error', async () => {
      await expect(
        db.run(
          `INSERT INTO match_participants (id, match_id, user_id, username)
           VALUES ('fk-off-part', 'nonexistent-match', 'u1', 'Ghost')`
        )
      ).resolves.not.toThrow();
    });

    it('inserts a game_mode with a nonexistent game_id without error', async () => {
      await expect(
        db.run(
          `INSERT INTO game_modes (id, game_id, name, description)
           VALUES ('orphan-mode', 'nonexistent-game', 'Orphan Mode', 'desc')`
        )
      ).resolves.not.toThrow();
    });
  });

  // ─── FK=ON (documenting constraint state) ─────────────────────────────────

  describe('With PRAGMA foreign_keys=ON — valid FK inserts', () => {
    beforeEach(async () => {
      await db.run('PRAGMA foreign_keys=ON');
    });

    afterEach(async () => {
      await db.run('PRAGMA foreign_keys=OFF');
    });

    it('foreign_keys=ON can be enabled', async () => {
      const row = await db.get('PRAGMA foreign_keys') as { foreign_keys: number } | null;
      expect(row!.foreign_keys).toBe(1);
    });

    it('inserts a valid game_mode that references an existing game', async () => {
      const { game } = await seedBasicTestData();
      await expect(
        db.run(
          `INSERT INTO game_modes (id, game_id, name, description) VALUES (?, ?, 'Valid Mode', 'desc')`,
          [`valid-mode-${Date.now()}`, game.id]
        )
      ).resolves.not.toThrow();
    });

    it('inserts a valid match_participant that references an existing match', async () => {
      const { game, mode } = await seedBasicTestData();
      await db.run(
        `INSERT INTO matches (id, game_id, mode_id, name, start_date, start_time, status, match_format, rounds, player_notifications)
         VALUES ('fk-on-match', ?, ?, 'FK On Match', '2025-01-01', '18:00', 'created', 'competitive', 3, 1)`,
        [game.id, mode.id]
      );
      await expect(
        db.run(
          `INSERT INTO match_participants (id, match_id, user_id, username)
           VALUES ('fk-on-part', 'fk-on-match', 'u1', 'Player1')`
        )
      ).resolves.not.toThrow();
    });
  });

  describe('With PRAGMA foreign_keys=ON — invalid FK violations', () => {
    beforeEach(async () => {
      await db.run('PRAGMA foreign_keys=ON');
    });

    afterEach(async () => {
      await db.run('PRAGMA foreign_keys=OFF');
    });

    it('rejects a game_mode insert referencing a nonexistent game', async () => {
      await expect(
        db.run(
          `INSERT INTO game_modes (id, game_id, name, description) VALUES ('bad-mode', 'no-such-game', 'Bad', 'desc')`
        )
      ).rejects.toThrow();
    });

    it('rejects a match_participant insert referencing a nonexistent match', async () => {
      await expect(
        db.run(
          `INSERT INTO match_participants (id, match_id, user_id, username)
           VALUES ('bad-part', 'no-such-match', 'u1', 'Ghost')`
        )
      ).rejects.toThrow();
    });

    it('match insert succeeds with FK=ON after fixing malformed game_maps FK', async () => {
      const { game, mode } = await seedBasicTestData();
      await expect(
        db.run(
          `INSERT INTO matches (id, game_id, mode_id, name, start_date, start_time, status, match_format, rounds, player_notifications)
           VALUES ('fix-match', ?, ?, 'Fix Match', '2025-01-01', '18:00', 'created', 'competitive', 3, 1)`,
          [game.id, mode.id]
        )
      ).resolves.not.toThrow();
    });
  });
});
