/** FK-satisfying parents for queue rows: matches (+ one match_game and one scorecard submission). Use with setupPgTestFile(). */
import { getPgTestDb } from './pg-test-db';
import { createGame, createGameMode, createMatch, type GameFixture, type GameModeFixture } from './pg-fixtures';
import { matchGames, scorecardSubmissions } from '../../lib/db/schema';

export interface QueueFixtures {
  game: GameFixture;
  mode: GameModeFixture;
  matchIds: string[];
  /** match_games.id of the one game created on the first match. */
  matchGameId: string;
  /** scorecard_submissions.id (first match / its game). */
  submissionId: string;
}

/** Creates a game, a mode and one match per id (default `m`, `m1`, `m2`, `m9`) plus a match game and submission on the first. */
export async function seedQueueFixtures(matchIds: string[] = ['m', 'm1', 'm2', 'm9']): Promise<QueueFixtures> {
  const game = await createGame();
  const mode = await createGameMode(game.id);
  for (const id of matchIds) await createMatch(game.id, mode.id, { id });
  const db = getPgTestDb();
  const [mg] = await db.insert(matchGames).values({ id: 'g', match_id: matchIds[0] }).returning();
  const [sub] = await db.insert(scorecardSubmissions).values({
    id: 'sub', match_id: matchIds[0], match_game_id: mg.id, team_side: 'blue', screenshot_url: '/x.png',
  }).returning();
  return { game, mode, matchIds, matchGameId: mg.id, submissionId: sub.id };
}
