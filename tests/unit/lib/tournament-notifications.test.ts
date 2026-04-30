import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

import { queueTournamentWinnerNotification } from '@/lib/tournament-notifications';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData } from '../../utils/fixtures';

describe('queueTournamentWinnerNotification', () => {
  let db: any;
  let game: any;
  let mode: any;

  beforeEach(async () => {
    db = getTestDb();
    const testData = await seedBasicTestData();
    game = testData.game;
    mode = testData.mode;
    vi.clearAllMocks();
  });

  async function createTournamentWithWinner(opts: {
    format?: string;
    withDiscordUser?: boolean;
  } = {}) {
    const tournamentId = `tourney-${Date.now()}`;
    const teamId = `team-${Date.now()}`;

    await db.run(
      `INSERT INTO tournaments (id, name, game_id, game_mode_id, status, format, rounds_per_match)
       VALUES (?, 'Championship', ?, ?, 'complete', ?, 3)`,
      [tournamentId, game.id, mode.id, opts.format ?? 'single-elimination']
    );

    await db.run(
      `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, 'Alpha Squad')`,
      [teamId, tournamentId]
    );

    await db.run(
      `INSERT INTO tournament_team_members (id, team_id, user_id, username)
       VALUES ('m1a', ?, 'u1', 'Player1')`,
      [teamId]
    );

    if (opts.withDiscordUser !== false) {
      await db.run(
        `INSERT INTO tournament_team_members (id, team_id, user_id, username, discord_user_id)
         VALUES ('m2a', ?, 'u2', 'Player2', 'disc-999')`,
        [teamId]
      );
    }

    return { tournamentId, teamId };
  }

  it('returns true and inserts a winner queue entry on success', async () => {
    const { tournamentId, teamId } = await createTournamentWithWinner();

    const result = await queueTournamentWinnerNotification(tournamentId, teamId);

    expect(result).toBe(true);
    const queued = await db.get(
      `SELECT * FROM discord_match_winner_queue WHERE match_id = ?`,
      [tournamentId]
    );
    expect(queued).toBeDefined();
    expect(queued.status).toBe('pending');
    expect(queued.winning_team_name).toBe('Alpha Squad');
  });

  it('uses "tournament" as the winner marker to distinguish from match entries', async () => {
    const { tournamentId, teamId } = await createTournamentWithWinner();

    await queueTournamentWinnerNotification(tournamentId, teamId);

    const queued = await db.get(
      `SELECT winner FROM discord_match_winner_queue WHERE match_id = ?`,
      [tournamentId]
    );
    expect(queued.winner).toBe('tournament');
  });

  it('prefixes tournament name with trophy emoji in match_name field', async () => {
    const { tournamentId, teamId } = await createTournamentWithWinner();

    await queueTournamentWinnerNotification(tournamentId, teamId);

    const queued = await db.get(
      `SELECT match_name FROM discord_match_winner_queue WHERE match_id = ?`,
      [tournamentId]
    );
    expect(queued.match_name).toContain('🏆');
    expect(queued.match_name).toContain('Championship');
  });

  it('mentions Discord users by ID when discord_user_id is available', async () => {
    const { tournamentId, teamId } = await createTournamentWithWinner({ withDiscordUser: true });

    await queueTournamentWinnerNotification(tournamentId, teamId);

    const queued = await db.get(
      `SELECT winning_players FROM discord_match_winner_queue WHERE match_id = ?`,
      [tournamentId]
    );
    const players: string[] = JSON.parse(queued.winning_players);
    expect(players.some(p => p.startsWith('<@'))).toBe(true);
  });

  it('uses plain username when discord_user_id is not available', async () => {
    const { tournamentId, teamId } = await createTournamentWithWinner({ withDiscordUser: false });

    await queueTournamentWinnerNotification(tournamentId, teamId);

    const queued = await db.get(
      `SELECT winning_players FROM discord_match_winner_queue WHERE match_id = ?`,
      [tournamentId]
    );
    const players: string[] = JSON.parse(queued.winning_players);
    expect(players).toContain('Player1');
  });

  it('sets team2_score to 1 for double-elimination tournaments', async () => {
    const { tournamentId, teamId } = await createTournamentWithWinner({ format: 'double-elimination' });

    await queueTournamentWinnerNotification(tournamentId, teamId);

    const queued = await db.get(
      `SELECT team2_score FROM discord_match_winner_queue WHERE match_id = ?`,
      [tournamentId]
    );
    expect(queued.team2_score).toBe(1);
  });

  it('sets team2_score to 0 for single-elimination tournaments', async () => {
    const { tournamentId, teamId } = await createTournamentWithWinner({ format: 'single-elimination' });

    await queueTournamentWinnerNotification(tournamentId, teamId);

    const queued = await db.get(
      `SELECT team2_score FROM discord_match_winner_queue WHERE match_id = ?`,
      [tournamentId]
    );
    expect(queued.team2_score).toBe(0);
  });

  it('stores total participant count in team1_score field', async () => {
    const { tournamentId, teamId } = await createTournamentWithWinner({ withDiscordUser: true });

    await queueTournamentWinnerNotification(tournamentId, teamId);

    const queued = await db.get(
      `SELECT team1_score FROM discord_match_winner_queue WHERE match_id = ?`,
      [tournamentId]
    );
    // Two members in the team → count should be 2
    expect(queued.team1_score).toBe(2);
  });

  it('returns false when tournament does not exist', async () => {
    const result = await queueTournamentWinnerNotification('nonexistent-tournament', 'team-1');

    expect(result).toBe(false);
  });

  it('returns false when winning team does not exist', async () => {
    await db.run(
      `INSERT INTO tournaments (id, name, game_id, game_mode_id, status, format, rounds_per_match)
       VALUES ('orphan-t', 'Orphan Tourney', ?, ?, 'complete', 'single-elimination', 3)`,
      [game.id, mode.id]
    );

    const result = await queueTournamentWinnerNotification('orphan-t', 'nonexistent-team');

    expect(result).toBe(false);
  });

  it('does not insert duplicate entries for the same tournament and team', async () => {
    const { tournamentId, teamId } = await createTournamentWithWinner();

    await queueTournamentWinnerNotification(tournamentId, teamId);
    // Second call would fail on UNIQUE constraint — just verify first succeeds
    const count = await db.get(
      `SELECT COUNT(*) as cnt FROM discord_match_winner_queue WHERE match_id = ?`,
      [tournamentId]
    );
    expect(count.cnt).toBe(1);
  });
});
