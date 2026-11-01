// @vitest-environment node
/** Tournament winner announcements (queue rows in the Postgres harness). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createGame, createGameMode, createTournament } from '../../utils/pg-fixtures';
import { discordMatchWinnerQueue, tournamentTeamMembers, tournamentTeams } from '../../../lib/db/schema';
import { db } from '../../../lib/db';
import { queueTournamentWinnerNotification } from '@/lib/tournaments';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));

setupPgTestFile();
const pg = () => getPgTestDb();

let gameId: string;
let modeId: string;
let seq = 0;
beforeEach(async () => {
  gameId = (await createGame()).id;
  modeId = (await createGameMode(gameId)).id;
});

async function winnerSetup(opts: { format?: 'single-elimination' | 'double-elimination'; discord?: boolean; members?: number } = {}) {
  const tournament = await createTournament(gameId, { id: `tourney-${++seq}`, name: 'Championship', game_mode_id: modeId, status: 'complete', format: opts.format ?? 'single-elimination' });
  const teamId = `team-${seq}`;
  await pg().insert(tournamentTeams).values({ id: teamId, tournament_id: tournament.id, team_name: 'Alpha Squad' });
  const n = opts.members ?? 2;
  for (let i = 0; i < n; i++) {
    const hasDiscord = opts.discord !== false && i === n - 1;
    await pg().insert(tournamentTeamMembers).values({
      id: `m${seq}-${i}`, team_id: teamId, user_id: `u${seq}-${i}`, username: `Player${i + 1}`, discord_user_id: opts.discord === true || hasDiscord ? `disc-${seq}-${i}` : null,
      joined_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
    });
  }
  return { tournament, teamId };
}
const queued = async (tournamentId: string) => pg().select().from(discordMatchWinnerQueue).where(eq(discordMatchWinnerQueue.match_id, tournamentId));

describe('queueTournamentWinnerNotification', () => {
  it('inserts a pending winner queue entry and returns true', async () => {
    const { tournament, teamId } = await winnerSetup();
    expect(await queueTournamentWinnerNotification(db, tournament.id, teamId)).toBe(true);
    const [row] = await queued(tournament.id);
    expect(row).toMatchObject({ status: 'pending', winning_team_name: 'Alpha Squad', match_id: tournament.id, total_maps: 1, game_id: gameId });
  });

  it('uses "tournament" as the winner marker and prefixes the name with a trophy', async () => {
    const { tournament, teamId } = await winnerSetup();
    await queueTournamentWinnerNotification(db, tournament.id, teamId);
    const [row] = await queued(tournament.id);
    expect(row.winner).toBe('tournament');
    expect(row.match_name).toContain('🏆');
    expect(row.match_name).toContain('Championship');
  });

  it('mentions Discord users by id and falls back to the username', async () => {
    const withDiscord = await winnerSetup({ discord: true });
    await queueTournamentWinnerNotification(db, withDiscord.tournament.id, withDiscord.teamId);
    const players = (await queued(withDiscord.tournament.id))[0].winning_players as string[];
    expect(players.every((p) => p.startsWith('<@'))).toBe(true);
    expect(players).toHaveLength(2);

    const plain = await winnerSetup({ discord: false });
    await queueTournamentWinnerNotification(db, plain.tournament.id, plain.teamId);
    expect((await queued(plain.tournament.id))[0].winning_players).toEqual(['Player1', 'Player2']);

    const mixed = await winnerSetup({ members: 4 });
    await queueTournamentWinnerNotification(db, mixed.tournament.id, mixed.teamId);
    const mixedPlayers = (await queued(mixed.tournament.id))[0].winning_players as string[];
    expect(mixedPlayers).toHaveLength(4);
    expect(mixedPlayers.filter((p) => p.startsWith('<@'))).toHaveLength(1);
  });

  it('stores an empty list for a team without members', async () => {
    const t = await createTournament(gameId, { id: 'empty-t', game_mode_id: modeId });
    await pg().insert(tournamentTeams).values({ id: 'empty-team', tournament_id: t.id, team_name: 'Empty Team' });
    await queueTournamentWinnerNotification(db, t.id, 'empty-team');
    expect((await queued(t.id))[0].winning_players).toEqual([]);
  });

  it('team2_score is 1 for double elimination, 0 for single elimination', async () => {
    const de = await winnerSetup({ format: 'double-elimination' });
    await queueTournamentWinnerNotification(db, de.tournament.id, de.teamId);
    expect((await queued(de.tournament.id))[0].team2_score).toBe(1);
    const se = await winnerSetup({ format: 'single-elimination' });
    await queueTournamentWinnerNotification(db, se.tournament.id, se.teamId);
    expect((await queued(se.tournament.id))[0].team2_score).toBe(0);
  });

  it('team1_score is the number of distinct players on all teams, not just the winner', async () => {
    const { tournament, teamId } = await winnerSetup({ members: 2 });
    await pg().insert(tournamentTeams).values({ id: 'loser-team', tournament_id: tournament.id, team_name: 'Losers' });
    for (let i = 0; i < 3; i++) await pg().insert(tournamentTeamMembers).values({ id: `lm${i}`, team_id: 'loser-team', user_id: `lu${i}`, username: `Loser${i}` });
    // the same user on two teams counts once
    await pg().insert(tournamentTeams).values({ id: 'ghost-team', tournament_id: tournament.id, team_name: 'Ghost' });
    await pg().insert(tournamentTeamMembers).values({ id: 'dup', team_id: 'ghost-team', user_id: 'lu0', username: 'Loser0' });
    await queueTournamentWinnerNotification(db, tournament.id, teamId);
    expect((await queued(tournament.id))[0].team1_score).toBe(5);
  });

  it('accepts an override (ties, solo cumulative winners) instead of a winning team', async () => {
    const t = await createTournament(gameId, { id: 'cum', game_mode_id: modeId, format: 'cumulative-points', status: 'complete' });
    expect(await queueTournamentWinnerNotification(db, t.id, 'player-key', { winningTeamName: 'Tie: A, B', winningPlayers: ['<@1>', 'B'] })).toBe(true);
    expect((await queued(t.id))[0]).toMatchObject({ winning_team_name: 'Tie: A, B', winning_players: ['<@1>', 'B'], winner: 'tournament' });
  });

  it('returns false (and queues nothing) for a missing tournament or winning team', async () => {
    expect(await queueTournamentWinnerNotification(db, 'ghost-tournament', 'any-team')).toBe(false);
    const t = await createTournament(gameId, { id: 'orphan-t', game_mode_id: modeId });
    expect(await queueTournamentWinnerNotification(db, t.id, 'nonexistent-team')).toBe(false);
    expect(await pg().select().from(discordMatchWinnerQueue)).toHaveLength(0);
  });

  it('has no built-in dedup (two calls queue two rows with distinct ids) and rolls back with the caller\'s transaction', async () => {
    const { tournament, teamId } = await winnerSetup();
    await queueTournamentWinnerNotification(db, tournament.id, teamId);
    await queueTournamentWinnerNotification(db, tournament.id, teamId);
    const rows = await queued(tournament.id);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).not.toBe(rows[1].id);

    await expect(db.transaction(async (tx) => {
      await queueTournamentWinnerNotification(tx, tournament.id, teamId);
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(await queued(tournament.id)).toHaveLength(2);
  });
});
