/** Commander winner votes (`discord_winner_vote_messages`): DM prompts, reaction votes and submitting the consensus. */
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db, type Executor } from '../../../lib/db';
import { discordWinnerVoteMessages, matchGames, matchParticipants, matchTeams, matches } from '../../../lib/db/schema';
import { logger } from '../logger';
import { countStatDefinitions } from '../games';
import { hasSubmissionForGame } from '../stats/scorecards';
import { lockMatch } from './teams';
import { AfterCommit } from './effects';
import { saveMatchResult, GameAlreadyScoredError } from './results';

export type VoteRow = typeof discordWinnerVoteMessages.$inferSelect;
export type TeamSide = 'blue' | 'red';

/** Commanders (with a Discord account) and the side they command: blue (team_order 0), red (1) or null. */
export async function listVoteCommanders(ex: Executor, matchId: string): Promise<Array<{ id: string; discord_user_id: string; team_side: TeamSide | null }>> {
  const rows = await ex
    .select({ id: matchParticipants.id, discord_user_id: matchParticipants.discord_user_id, team_order: matchTeams.team_order, is_reserve: matchTeams.is_reserve })
    .from(matchParticipants).leftJoin(matchTeams, eq(matchTeams.id, matchParticipants.team_id))
    .where(and(eq(matchParticipants.match_id, matchId), eq(matchParticipants.receives_map_codes, true), sql`${matchParticipants.discord_user_id} IS NOT NULL`))
    .orderBy(asc(matchParticipants.username), asc(matchParticipants.id));
  return rows.map((r) => ({
    id: r.id,
    discord_user_id: r.discord_user_id as string,
    team_side: r.is_reserve ? null : r.team_order === 0 ? 'blue' : r.team_order === 1 ? 'red' : null,
  }));
}

export async function recordVotePrompt(
  ex: Executor,
  input: { matchId: string; matchGameId: string; discordUserId: string; discordMessageId: string; participantId: string; teamSide: TeamSide | null },
): Promise<void> {
  await ex.insert(discordWinnerVoteMessages).values({
    id: crypto.randomUUID(), match_id: input.matchId, match_game_id: input.matchGameId, discord_user_id: input.discordUserId,
    discord_message_id: input.discordMessageId, participant_id: input.participantId, team_side: input.teamSide,
  });
}

export async function findVoteByMessage(ex: Executor, messageId: string, discordUserId: string): Promise<VoteRow | undefined> {
  const [row] = await ex.select().from(discordWinnerVoteMessages)
    .where(and(eq(discordWinnerVoteMessages.discord_message_id, messageId), eq(discordWinnerVoteMessages.discord_user_id, discordUserId))).limit(1);
  return row;
}

/** Record a commander's vote. Atomic: only the first vote of a prompt counts. Returns whether this call recorded it. */
export async function castVote(ex: Executor, voteId: string, votedFor: TeamSide): Promise<boolean> {
  const rows = await ex.update(discordWinnerVoteMessages).set({ voted_for: votedFor })
    .where(and(eq(discordWinnerVoteMessages.id, voteId), isNull(discordWinnerVoteMessages.voted_for)))
    .returning({ id: discordWinnerVoteMessages.id });
  return rows.length > 0;
}

export async function listVotesForGame(ex: Executor, matchGameId: string): Promise<VoteRow[]> {
  return ex.select().from(discordWinnerVoteMessages).where(eq(discordWinnerVoteMessages.match_game_id, matchGameId)).orderBy(asc(discordWinnerVoteMessages.created_at), asc(discordWinnerVoteMessages.id));
}

/** True when the match requires a scorecard for this game and none has been submitted yet. */
export async function isScorecardRequiredButMissing(ex: Executor, matchId: string, matchGameId: string): Promise<boolean> {
  const [match] = await ex.select({ stats_enabled: matches.stats_enabled, game_id: matches.game_id }).from(matches).where(eq(matches.id, matchId));
  if (!match?.stats_enabled || (await countStatDefinitions(ex, match.game_id)) === 0) return false;
  return !(await hasSubmissionForGame(ex, matchGameId));
}

/**
 * Score a game from commander consensus. A vote only ever records a FIRST result: it never overrides a map an admin
 * already scored and never scores a match that has left battle. The status check and the save share one transaction
 * under the match row lock, which also closes the race with a web submission. Returns whether a result was saved.
 */
export async function submitVoteWinner(matchId: string, matchGameId: string, winner: TeamSide): Promise<boolean> {
  const after = new AfterCommit();
  try {
    const saved = await db.transaction(async (tx) => {
      const match = await lockMatch(tx, matchId);
      const [game] = await tx.select({ status: matchGames.status }).from(matchGames).where(and(eq(matchGames.id, matchGameId), eq(matchGames.match_id, matchId)));
      if (match?.status !== 'battle' || !game || game.status === 'completed') {
        logger.info(`Winner vote for game ${matchGameId} ignored: game already scored or match not in battle`);
        return false;
      }
      await saveMatchResult(tx, matchGameId, { matchId, gameId: matchGameId, winner: winner === 'blue' ? 'team1' : 'team2', completedAt: new Date() }, after);
      return true;
    });
    await after.run(); // activity-feed writes, after the commit
    return saved;
  } catch (error) {
    if (error instanceof GameAlreadyScoredError) {
      logger.info(`Winner vote for game ${matchGameId} ignored: game was scored concurrently`);
      return false;
    }
    throw error;
  }
}
