/** Drizzle fixtures for the stats / scorecard domain (matches, maps, participants, submissions, extracted rows). */
import { getPgTestDb } from './pg-test-db';
import { createGame, createGameMode, createMatch, type GameFixture, type GameModeFixture, type MatchFixture } from './pg-fixtures';
import { matchGames, matchParticipants, scorecardPlayerStats, scorecardSubmissions } from '../../lib/db/schema';

export interface StatsFixture {
  game: GameFixture;
  mode: GameModeFixture;
  match: MatchFixture;
  /** The first (ongoing) map of `match`. */
  matchGameId: string;
}

let seq = 0;
const next = () => ++seq;

/** A game + mode + match (status `battle`) with one ongoing map. */
export async function seedStatsMatch(matchOverrides: Parameters<typeof createMatch>[2] = {}): Promise<StatsFixture> {
  const game = await createGame();
  const mode = await createGameMode(game.id);
  const match = await createMatch(game.id, mode.id, { status: 'battle', ...matchOverrides });
  const matchGameId = `${match.id}_game_1`;
  await getPgTestDb().insert(matchGames).values({ id: matchGameId, match_id: match.id, round: 1, status: 'ongoing' });
  return { game, mode, match, matchGameId };
}

export async function addMatchGame(matchId: string, round: number, status: 'pending' | 'ongoing' | 'completed' = 'pending'): Promise<string> {
  const id = `${matchId}_game_${round}`;
  await getPgTestDb().insert(matchGames).values({ id, match_id: matchId, round, status });
  return id;
}

export async function addParticipant(matchId: string, overrides: Partial<typeof matchParticipants.$inferInsert> = {}) {
  const n = next();
  const [row] = await getPgTestDb().insert(matchParticipants).values({
    id: `part-${n}`, match_id: matchId, user_id: `user-${n}`, discord_user_id: `discord-${n}`, username: `Player${n}`, ...overrides,
  }).returning();
  return row;
}

export async function addSubmission(
  matchId: string, matchGameId: string, overrides: Partial<typeof scorecardSubmissions.$inferInsert> = {},
) {
  const n = next();
  const [row] = await getPgTestDb().insert(scorecardSubmissions).values({
    id: `sub-${n}`, match_id: matchId, match_game_id: matchGameId, team_side: 'blue', screenshot_url: `/uploads/scorecards/${matchId}/s${n}.png`,
    ...overrides,
  }).returning();
  return row;
}

export async function addPlayerStat(
  submissionId: string, matchId: string, matchGameId: string, overrides: Partial<typeof scorecardPlayerStats.$inferInsert> = {},
) {
  const n = next();
  const [row] = await getPgTestDb().insert(scorecardPlayerStats).values({
    id: `ps-${n}`, submission_id: submissionId, match_id: matchId, match_game_id: matchGameId, extracted_player_name: `Extracted${n}`,
    stats_json: {}, ...overrides,
  }).returning();
  return row;
}

/** Minimal valid PNG signature plus padding (passes the magic-byte check). */
export const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);
export const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(24)]);
