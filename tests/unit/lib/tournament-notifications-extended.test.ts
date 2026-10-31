import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createTournament } from '../../utils/fixtures';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('@/lib/database-init', () => ({
  getDbInstance: vi.fn(async () => {
    const { getTestDb: db } = await import('../../utils/test-db');
    return db();
  }),
}));

import { queueTournamentWinnerNotification } from '@/lib/tournament-notifications';

describe('queueTournamentWinnerNotification — Extended', () => {
  let game: { id: string };

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    vi.clearAllMocks();
  });

  async function setupTournamentWithTeam(opts: {
    format?: 'single-elimination' | 'double-elimination';
    memberCount?: number;
    useDiscordIds?: boolean;
  } = {}) {
    const db = getTestDb();
    const tournament = await createTournament(game.id, { format: opts.format ?? 'single-elimination' });
    const teamId = `team-ext-${Math.random().toString(36).substring(2, 11)}`;

    await db.run(
      `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, 'Ext Team')`,
      [teamId, tournament.id]
    );

    const count = opts.memberCount ?? 1;
    const uid = Math.random().toString(36).substring(2, 9);
    for (let i = 0; i < count; i++) {
      const discordId = opts.useDiscordIds !== false ? `disc-${uid}-${i}` : null;
      await db.run(
        `INSERT INTO tournament_team_members (id, team_id, user_id, username, discord_user_id)
         VALUES (?, ?, ?, ?, ?)`,
        [`m-ext-${uid}-${i}`, teamId, `u-${uid}-${i}`, `ExtPlayer${i}`, discordId]
      );
    }

    return { tournament, teamId, db };
  }

  describe('queue row field verification', () => {
    it('sets total_maps to 1', async () => {
      const { tournament, teamId, db } = await setupTournamentWithTeam();
      await queueTournamentWinnerNotification(tournament.id, teamId);

      const row = await db.get<{ total_maps: number }>(
        `SELECT total_maps FROM discord_match_winner_queue WHERE match_id = ?`,
        [tournament.id]
      );
      expect(row?.total_maps).toBe(1);
    });

    it('stores the correct game_id', async () => {
      const { tournament, teamId, db } = await setupTournamentWithTeam();
      await queueTournamentWinnerNotification(tournament.id, teamId);

      const row = await db.get<{ game_id: string }>(
        `SELECT game_id FROM discord_match_winner_queue WHERE match_id = ?`,
        [tournament.id]
      );
      expect(row?.game_id).toBe(game.id);
    });

    it('stores tournament ID in match_id field', async () => {
      const { tournament, teamId, db } = await setupTournamentWithTeam();
      await queueTournamentWinnerNotification(tournament.id, teamId);

      const row = await db.get<{ match_id: string }>(
        `SELECT match_id FROM discord_match_winner_queue WHERE match_id = ?`,
        [tournament.id]
      );
      expect(row?.match_id).toBe(tournament.id);
    });

    it('generates a unique queue ID each call', async () => {
      const { tournament: t1, teamId: team1 } = await setupTournamentWithTeam();
      const { tournament: t2, teamId: team2 } = await setupTournamentWithTeam();

      await queueTournamentWinnerNotification(t1.id, team1);
      await queueTournamentWinnerNotification(t2.id, team2);

      const db = getTestDb();
      const rows = await db.all<{ id: string }>(
        `SELECT id FROM discord_match_winner_queue WHERE match_id IN (?, ?)`,
        [t1.id, t2.id]
      );
      expect(rows).toHaveLength(2);
      expect((rows[0] as { id: string }).id).not.toBe((rows[1] as { id: string }).id);
    });
  });

  describe('winning_players serialization', () => {
    it('includes all team members in winning_players array', async () => {
      const { tournament, teamId, db } = await setupTournamentWithTeam({ memberCount: 4, useDiscordIds: false });
      await queueTournamentWinnerNotification(tournament.id, teamId);

      const row = await db.get<{ winning_players: string }>(
        `SELECT winning_players FROM discord_match_winner_queue WHERE match_id = ?`,
        [tournament.id]
      );
      const players: string[] = JSON.parse(row!.winning_players);
      expect(players).toHaveLength(4);
    });

    it('formats discord users as <@discordId> mentions', async () => {
      const { tournament, teamId, db } = await setupTournamentWithTeam({ memberCount: 2, useDiscordIds: true });
      await queueTournamentWinnerNotification(tournament.id, teamId);

      const row = await db.get<{ winning_players: string }>(
        `SELECT winning_players FROM discord_match_winner_queue WHERE match_id = ?`,
        [tournament.id]
      );
      const players: string[] = JSON.parse(row!.winning_players);
      expect(players.every(p => p.startsWith('<@'))).toBe(true);
    });

    it('stores empty array when team has no members', async () => {
      const db = getTestDb();
      const tournament = await createTournament(game.id);
      const teamId = `team-empty-${Date.now()}`;
      await db.run(
        `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, 'Empty Team')`,
        [teamId, tournament.id]
      );

      await queueTournamentWinnerNotification(tournament.id, teamId);

      const row = await db.get<{ winning_players: string }>(
        `SELECT winning_players FROM discord_match_winner_queue WHERE match_id = ?`,
        [tournament.id]
      );
      const players: string[] = JSON.parse(row!.winning_players);
      expect(players).toHaveLength(0);
    });
  });

  describe('team1_score participant counting', () => {
    it('counts participants from all teams in tournament, not just winner', async () => {
      const db = getTestDb();
      const tournament = await createTournament(game.id);
      const winTeamId = `t-win-${Date.now()}`;
      const loseTeamId = `t-lose-${Date.now()}`;

      await db.run(
        `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, 'Winners')`,
        [winTeamId, tournament.id]
      );
      await db.run(
        `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, 'Losers')`,
        [loseTeamId, tournament.id]
      );

      // 2 members on winner team, 3 on loser team = 5 total
      for (let i = 0; i < 2; i++) {
        await db.run(
          `INSERT INTO tournament_team_members (id, team_id, user_id, username)
           VALUES (?, ?, ?, ?)`,
          [`mw-${i}-${Date.now()}`, winTeamId, `wu${i}`, `Winner${i}`]
        );
      }
      for (let i = 0; i < 3; i++) {
        await db.run(
          `INSERT INTO tournament_team_members (id, team_id, user_id, username)
           VALUES (?, ?, ?, ?)`,
          [`ml-${i}-${Date.now()}`, loseTeamId, `lu${i}`, `Loser${i}`]
        );
      }

      await queueTournamentWinnerNotification(tournament.id, winTeamId);

      const row = await db.get<{ team1_score: number }>(
        `SELECT team1_score FROM discord_match_winner_queue WHERE match_id = ?`,
        [tournament.id]
      );
      expect(row?.team1_score).toBe(5);
    });
  });

  describe('error cases', () => {
    it('returns false for nonexistent tournament', async () => {
      const result = await queueTournamentWinnerNotification('ghost-tournament-id', 'any-team-id');
      expect(result).toBe(false);
    });

    it('returns false for nonexistent winner team when tournament exists', async () => {
      const tournament = await createTournament(game.id);
      const result = await queueTournamentWinnerNotification(tournament.id, 'nonexistent-team');
      expect(result).toBe(false);
    });

    it('calling twice inserts two queue rows (no built-in dedup)', async () => {
      const db = getTestDb();
      const { tournament, teamId } = await setupTournamentWithTeam();

      await queueTournamentWinnerNotification(tournament.id, teamId);
      await queueTournamentWinnerNotification(tournament.id, teamId);

      const rows = await db.all(
        `SELECT id FROM discord_match_winner_queue WHERE match_id = ?`,
        [tournament.id]
      );
      expect(rows.length).toBe(2);
    });
  });
});
