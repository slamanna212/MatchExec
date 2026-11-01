/** Discord notifications caused by tournament state changes (queue rows written in the caller's transaction). */
import { eq } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { tournaments } from '../../../lib/db/schema';
import { logger } from '../logger';
import { enqueueMatchWinner } from '../discord-queues';
import { bestEffort } from '../matches/effects';
import { countTeamMemberUsers, getTeamName, listTeamMemberNames } from './teams';

/** Display name + mentions of a tournament winner announced without a single winning team (ties, solo cumulative winners). */
export interface WinnerOverride {
  winningTeamName: string;
  winningPlayers: string[];
}

/** `<@id>` for players with a Discord id, otherwise the username. */
export function playerLabel(p: { username: string; discord_user_id?: string | null }): string {
  return p.discord_user_id ? `<@${p.discord_user_id}>` : p.username;
}

/**
 * Queue the winner announcement. It reuses the match winner queue: the tournament id goes in `match_id` and the
 * `winner = 'tournament'` marker identifies it; team1_score = total players, team2_score = 1 for double elimination,
 * total_maps = 1. Returns false when the tournament / winning team doesn't exist (nothing queued).
 */
export async function queueTournamentWinnerNotification(
  ex: Executor,
  tournamentId: string,
  winnerId: string,
  override?: WinnerOverride,
): Promise<boolean> {
  const [tournament] = await ex.select({ name: tournaments.name, game_id: tournaments.game_id, format: tournaments.format })
    .from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!tournament) {
    logger.error('Tournament not found for winner notification:', tournamentId);
    return false;
  }

  let winningTeamName: string;
  let winningPlayers: string[];
  if (override) {
    winningTeamName = override.winningTeamName;
    winningPlayers = override.winningPlayers;
  } else {
    const teamName = await getTeamName(ex, winnerId);
    if (!teamName) {
      logger.error('Winning team not found:', winnerId);
      return false;
    }
    winningTeamName = teamName;
    winningPlayers = (await listTeamMemberNames(ex, winnerId)).map(playerLabel);
  }

  const total = await countTeamMemberUsers(ex, tournamentId);
  // A failed notification must not roll the tournament completion back: run it in a savepoint.
  const queued = await bestEffort(ex, 'Error queuing tournament winner notification', async (sp) => {
    await enqueueMatchWinner(sp, {
      matchId: tournamentId,
      matchName: `🏆 ${tournament.name}`,
      gameId: tournament.game_id,
      winner: 'tournament',
      winningTeamName,
      winningPlayers,
      team1Score: total,
      team2Score: tournament.format === 'double-elimination' ? 1 : 0,
      totalMaps: 1,
    });
    return true;
  }, false);
  if (queued) logger.debug('Tournament winner notification queued for tournament:', tournamentId);
  return queued;
}
