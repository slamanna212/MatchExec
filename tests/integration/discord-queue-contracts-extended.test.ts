/**
 * L1 — Discord Queue Contracts Extended
 *
 * Extends queue-contracts.test.ts coverage to include queue tables added
 * in later migrations: discord_match_edit_queue, discord_scorecard_prompt_queue,
 * discord_health_alert_queue, discord_winner_vote_queue.
 *
 * Also documents INSERT constraints and expected column shapes so that
 * consumer code can rely on the contract.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb } from '../utils/test-db';
import { createMatch, seedBasicTestData } from '../utils/fixtures';

describe('Discord Queue Contracts — extended (L1)', () => {
  let gameId: string;
  let modeId: string;
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    const seed = await seedBasicTestData();
    gameId = seed.game.id;
    modeId = seed.mode.id;
    db = getTestDb();
  });

  // ─── discord_match_edit_queue ─────────────────────────────────────────────

  describe('discord_match_edit_queue', () => {
    it('has expected columns', async () => {
      const match = await createMatch(gameId, modeId);
      const id = `edit-q-${Date.now()}`;
      await db.run(
        `INSERT INTO discord_match_edit_queue (id, match_id) VALUES (?, ?)`,
        [id, match.id]
      );

      const row = await db.get(
        `SELECT * FROM discord_match_edit_queue WHERE id = ?`,
        [id]
      ) as Record<string, unknown> | null;

      expect(row).toBeDefined();
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('match_id');
      expect(row).toHaveProperty('status');
      expect(row).toHaveProperty('retry_count');
      expect(row).toHaveProperty('created_at');
      expect(row).toHaveProperty('processed_at');
      expect(row).toHaveProperty('error_message');
      expect(row!.status).toBe('pending');
      expect(row!.retry_count).toBe(0);
    });

    it('status CHECK constraint rejects invalid values', async () => {
      const match = await createMatch(gameId, modeId);
      await expect(
        db.run(
          `INSERT INTO discord_match_edit_queue (id, match_id, status) VALUES (?, ?, ?)`,
          [`edit-bad-${Date.now()}`, match.id, 'invalid_status']
        )
      ).rejects.toThrow();
    });

    it('accepts all valid status values', async () => {
      const match = await createMatch(gameId, modeId);
      for (const status of ['pending', 'processing', 'completed', 'failed']) {
        const id = `edit-status-${status}-${Date.now()}`;
        await expect(
          db.run(
            `INSERT INTO discord_match_edit_queue (id, match_id, status) VALUES (?, ?, ?)`,
            [id, match.id, status]
          )
        ).resolves.not.toThrow();
      }
    });
  });

  // ─── discord_scorecard_prompt_queue ──────────────────────────────────────

  describe('discord_scorecard_prompt_queue', () => {
    it('has expected columns', async () => {
      const match = await createMatch(gameId, modeId);
      const id = `sc-prompt-${Date.now()}`;
      const gameEntryId = `mg-${Date.now()}`;

      await db.run(
        `INSERT INTO discord_scorecard_prompt_queue (id, match_id, match_game_id, map_name)
         VALUES (?, ?, ?, ?)`,
        [id, match.id, gameEntryId, 'Test Map']
      );

      const row = await db.get(
        `SELECT * FROM discord_scorecard_prompt_queue WHERE id = ?`,
        [id]
      ) as Record<string, unknown> | null;

      expect(row).toBeDefined();
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('match_id');
      expect(row).toHaveProperty('match_game_id');
      expect(row).toHaveProperty('map_name');
      expect(row).toHaveProperty('status');
      expect(row).toHaveProperty('created_at');
      expect(row).toHaveProperty('updated_at');
      expect(row!.status).toBe('pending');
      expect(row!.map_name).toBe('Test Map');
    });

    it('status CHECK constraint rejects invalid values', async () => {
      const match = await createMatch(gameId, modeId);
      await expect(
        db.run(
          `INSERT INTO discord_scorecard_prompt_queue (id, match_id, match_game_id, status)
           VALUES (?, ?, ?, ?)`,
          [`sc-bad-${Date.now()}`, match.id, `mg-${Date.now()}`, 'bad']
        )
      ).rejects.toThrow();
    });

    it('accepts status values: pending, sent, failed', async () => {
      const match = await createMatch(gameId, modeId);
      for (const status of ['pending', 'sent', 'failed']) {
        await expect(
          db.run(
            `INSERT INTO discord_scorecard_prompt_queue (id, match_id, match_game_id, status)
             VALUES (?, ?, ?, ?)`,
            [`sc-${status}-${Date.now()}`, match.id, `mg-${Date.now()}`, status]
          )
        ).resolves.not.toThrow();
      }
    });
  });

  // ─── discord_health_alert_queue ──────────────────────────────────────────

  describe('discord_health_alert_queue', () => {
    it('has expected columns', async () => {
      const id = `health-${Date.now()}`;
      await db.run(
        `INSERT INTO discord_health_alert_queue (id, severity, title, description)
         VALUES (?, ?, ?, ?)`,
        [id, 'critical', 'DB Connection Lost', 'Unable to reach database']
      );

      const row = await db.get(
        `SELECT * FROM discord_health_alert_queue WHERE id = ?`,
        [id]
      ) as Record<string, unknown> | null;

      expect(row).toBeDefined();
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('severity');
      expect(row).toHaveProperty('title');
      expect(row).toHaveProperty('description');
      expect(row).toHaveProperty('status');
      expect(row).toHaveProperty('created_at');
      expect(row).toHaveProperty('posted_at');
      expect(row).toHaveProperty('error_message');
      expect(row!.status).toBe('pending');
      expect(row!.severity).toBe('critical');
      expect(row!.title).toBe('DB Connection Lost');
    });

    it('can hold warning severity alerts', async () => {
      const id = `health-warn-${Date.now()}`;
      await expect(
        db.run(
          `INSERT INTO discord_health_alert_queue (id, severity, title) VALUES (?, ?, ?)`,
          [id, 'warning', 'High Latency']
        )
      ).resolves.not.toThrow();
    });

    it('does not require a match_id (system-level alerts)', async () => {
      const id = `health-sys-${Date.now()}`;
      await expect(
        db.run(
          `INSERT INTO discord_health_alert_queue (id, title) VALUES (?, ?)`,
          [id, 'System Alert']
        )
      ).resolves.not.toThrow();
    });
  });

  // ─── discord_winner_vote_queue ────────────────────────────────────────────

  describe('discord_winner_vote_queue', () => {
    it('has expected columns', async () => {
      const match = await createMatch(gameId, modeId);
      const id = `vote-${Date.now()}`;
      const gameEntryId = `mg-vote-${Date.now()}`;

      await db.run(
        `INSERT INTO discord_winner_vote_queue (id, match_id, match_game_id, map_name)
         VALUES (?, ?, ?, ?)`,
        [id, match.id, gameEntryId, 'Eichenwalde']
      );

      const row = await db.get(
        `SELECT * FROM discord_winner_vote_queue WHERE id = ?`,
        [id]
      ) as Record<string, unknown> | null;

      expect(row).toBeDefined();
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('match_id');
      expect(row).toHaveProperty('match_game_id');
      expect(row).toHaveProperty('map_name');
      expect(row).toHaveProperty('status');
      expect(row).toHaveProperty('retry_count');
      expect(row).toHaveProperty('created_at');
      expect(row).toHaveProperty('updated_at');
      expect(row!.status).toBe('pending');
      expect(row!.retry_count).toBe(0);
      expect(row!.map_name).toBe('Eichenwalde');
    });

    it('status CHECK constraint rejects invalid values', async () => {
      const match = await createMatch(gameId, modeId);
      await expect(
        db.run(
          `INSERT INTO discord_winner_vote_queue (id, match_id, match_game_id, status)
           VALUES (?, ?, ?, ?)`,
          [`vote-bad-${Date.now()}`, match.id, `mg-${Date.now()}`, 'wrong']
        )
      ).rejects.toThrow();
    });

    it('accepts status values: pending, processing, sent, failed', async () => {
      const match = await createMatch(gameId, modeId);
      for (const status of ['pending', 'processing', 'sent', 'failed']) {
        await expect(
          db.run(
            `INSERT INTO discord_winner_vote_queue (id, match_id, match_game_id, status)
             VALUES (?, ?, ?, ?)`,
            [`vote-${status}-${Date.now()}`, match.id, `mg-${Date.now()}`, status]
          )
        ).resolves.not.toThrow();
      }
    });
  });

  // ─── Cross-table: all queue tables have status=pending as default ─────────

  describe('all extended queue tables default status=pending', () => {
    it('discord_match_edit_queue defaults to pending', async () => {
      const match = await createMatch(gameId, modeId);
      const id = `default-${Date.now()}`;
      await db.run(
        `INSERT INTO discord_match_edit_queue (id, match_id) VALUES (?, ?)`,
        [id, match.id]
      );
      const row = await db.get(
        `SELECT status FROM discord_match_edit_queue WHERE id = ?`,
        [id]
      ) as { status: string } | null;
      expect(row?.status).toBe('pending');
    });

    it('discord_scorecard_prompt_queue defaults to pending', async () => {
      const match = await createMatch(gameId, modeId);
      const id = `sc-default-${Date.now()}`;
      await db.run(
        `INSERT INTO discord_scorecard_prompt_queue (id, match_id, match_game_id) VALUES (?, ?, ?)`,
        [id, match.id, `mg-${Date.now()}`]
      );
      const row = await db.get(
        `SELECT status FROM discord_scorecard_prompt_queue WHERE id = ?`,
        [id]
      ) as { status: string } | null;
      expect(row?.status).toBe('pending');
    });

    it('discord_health_alert_queue defaults to pending', async () => {
      const id = `ha-default-${Date.now()}`;
      await db.run(
        `INSERT INTO discord_health_alert_queue (id, title) VALUES (?, ?)`,
        [id, 'Alert']
      );
      const row = await db.get(
        `SELECT status FROM discord_health_alert_queue WHERE id = ?`,
        [id]
      ) as { status: string } | null;
      expect(row?.status).toBe('pending');
    });

    it('discord_winner_vote_queue defaults to pending', async () => {
      const match = await createMatch(gameId, modeId);
      const id = `wv-default-${Date.now()}`;
      await db.run(
        `INSERT INTO discord_winner_vote_queue (id, match_id, match_game_id) VALUES (?, ?, ?)`,
        [id, match.id, `mg-${Date.now()}`]
      );
      const row = await db.get(
        `SELECT status FROM discord_winner_vote_queue WHERE id = ?`,
        [id]
      ) as { status: string } | null;
      expect(row?.status).toBe('pending');
    });
  });
});
