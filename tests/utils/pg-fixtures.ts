/** Drizzle-based fixtures mirroring tests/utils/fixtures.ts (typed, no raw SQL). Use with setupPgTestFile(). */
import { randomBytes } from 'node:crypto';
import { getPgTestDb } from './pg-test-db';
import { count, eq } from 'drizzle-orm';
import { discordChannels, discordSettings, games, gameModes, matchGames, matchParticipants, matches, tournaments } from '../../lib/db/schema';

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

type MatchOverrides = Omit<Partial<typeof matches.$inferInsert>, 'start_date' | 'start_time'> & {
  /** Date, or an ISO / date-only string (parsed with `new Date`). */
  start_date?: Date | string;
  start_time?: Date | string;
};
const toDate = (v: Date | string): Date => (v instanceof Date ? v : new Date(v));

export async function createMatch(gameId: string, modeId: string, overrides: MatchOverrides = {}): Promise<MatchFixture> {
  const now = new Date();
  const { start_date, start_time, ...rest } = overrides;
  const [row] = await getPgTestDb().insert(matches).values({
    id: generateId('match_'), game_id: gameId, mode_id: modeId, name: 'Test Match',
    start_date: start_date ? toDate(start_date) : now, start_time: start_time ? toDate(start_time) : now,
    status: 'created', match_format: 'competitive', rounds: 3, ...rest,
  }).returning();
  return row;
}

export type ParticipantFixture = typeof matchParticipants.$inferSelect;

export async function createMatchParticipant(matchId: string, discordUserId: string, username = 'TestUser', overrides: Partial<typeof matchParticipants.$inferInsert> = {}): Promise<ParticipantFixture> {
  const [row] = await getPgTestDb().insert(matchParticipants).values({
    id: generateId('participant_'), match_id: matchId, user_id: generateId('user_'), discord_user_id: discordUserId, username, ...overrides,
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

/** discord_settings row (id 1 style singleton; guild_id/bot_token required). */
export async function createDiscordSettings(overrides: Partial<typeof discordSettings.$inferInsert> = {}): Promise<typeof discordSettings.$inferSelect> {
  const [row] = await getPgTestDb().insert(discordSettings).values({ guild_id: 'guild-1', bot_token: 'tok', ...overrides }).returning();
  return row;
}

/** discord_channels row; the parent discord_settings row for `guild_id` must exist (FK). */
export async function createDiscordChannel(overrides: Partial<typeof discordChannels.$inferInsert> = {}): Promise<typeof discordChannels.$inferSelect> {
  const [row] = await getPgTestDb().insert(discordChannels).values({
    id: generateId('ch_'), guild_id: 'guild-1', discord_channel_id: generateId('dc_'), name: 'channel', type: 0, channel_type: 'text', ...overrides,
  }).returning();
  return row;
}

/** match_games row; `round` defaults to the next free round of the match. Idempotent on `id`. */
export async function createMatchGame(matchId: string, overrides: Partial<typeof matchGames.$inferInsert> = {}): Promise<typeof matchGames.$inferSelect> {
  const db = getPgTestDb();
  const id = overrides.id ?? generateId('mg_');
  const [existing] = await db.select().from(matchGames).where(eq(matchGames.id, id));
  if (existing) return existing;
  const [{ n }] = await db.select({ n: count() }).from(matchGames).where(eq(matchGames.match_id, matchId));
  const [row] = await db.insert(matchGames).values({ round: n + 1, ...overrides, id, match_id: matchId }).returning();
  return row;
}
