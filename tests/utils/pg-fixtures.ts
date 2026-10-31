/** Drizzle-based fixtures mirroring tests/utils/fixtures.ts (typed, no raw SQL). Use with setupPgTestFile(). */
import { randomBytes } from 'node:crypto';
import { getPgTestDb } from './pg-test-db';
import { games, gameModes, matches, tournaments } from '../../lib/db/schema';

export type GameFixture = typeof games.$inferSelect;
export type GameModeFixture = typeof gameModes.$inferSelect;
export type MatchFixture = typeof matches.$inferSelect;
export type TournamentFixture = typeof tournaments.$inferSelect;

const generateId = (prefix = ''): string => `${prefix}${randomBytes(8).toString('hex')}`;

export async function createGame(overrides: Partial<typeof games.$inferInsert> = {}): Promise<GameFixture> {
  const [row] = await getPgTestDb().insert(games).values({
    id: generateId('game_'), name: 'Test Game', genre: 'FPS', min_players: 2, max_players: 12, ...overrides,
  }).returning();
  return row;
}

export async function createGameMode(gameId: string, overrides: Partial<typeof gameModes.$inferInsert> = {}): Promise<GameModeFixture> {
  const [row] = await getPgTestDb().insert(gameModes).values({
    id: generateId('mode_'), game_id: gameId, name: 'Test Mode', description: 'Test mode for testing',
    team_size: 5, max_teams: 2, scoring_type: 'Normal', ...overrides,
  }).returning();
  return row;
}

export async function createMatch(gameId: string, modeId: string, overrides: Partial<typeof matches.$inferInsert> = {}): Promise<MatchFixture> {
  const now = new Date();
  const [row] = await getPgTestDb().insert(matches).values({
    id: generateId('match_'), game_id: gameId, mode_id: modeId, name: 'Test Match',
    start_date: now, start_time: now, status: 'created', match_format: 'competitive', rounds: 3, ...overrides,
  }).returning();
  return row;
}

export async function createTournament(gameId: string, overrides: Partial<typeof tournaments.$inferInsert> = {}): Promise<TournamentFixture> {
  const [row] = await getPgTestDb().insert(tournaments).values({
    id: generateId('tournament_'), name: 'Test Tournament', game_id: gameId, game_mode_id: 'test-mode',
    format: 'single-elimination', status: 'created', rounds_per_match: 3, ruleset: 'competitive', ...overrides,
  }).returning();
  return row;
}

export async function seedBasicTestData(): Promise<{ game: GameFixture; mode: GameModeFixture }> {
  const game = await createGame();
  const mode = await createGameMode(game.id);
  return { game, mode };
}
