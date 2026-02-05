import { getTestDb } from './test-db';
import { randomBytes } from 'crypto';

// Helper to generate unique IDs
function generateId(prefix = ''): string {
  return `${prefix}${randomBytes(8).toString('hex')}`;
}

export interface MatchFixture {
  id: string;
  game_id: string;
  mode_id: string;
  name: string;
  start_date: string;
  start_time: string;
  status: string;
  match_format: string;
  created_at: string;
}

export interface TournamentFixture {
  id: string;
  name: string;
  game_id: string;
  format: 'single-elimination' | 'double-elimination';
  status: string;
}

export interface GameFixture {
  id: string;
  name: string;
}

export interface GameModeFixture {
  id: string;
  game_id: string;
  name: string;
}

// Default test data
const defaults = {
  game: {
    name: 'Test Game',
    genre: 'FPS',
    min_players: 2,
    max_players: 12,
  },
  gameMode: {
    name: 'Test Mode',
    description: 'Test mode for testing',
    team_size: 5,
    max_teams: 2,
  },
  match: {
    name: 'Test Match',
    start_date: new Date().toISOString().split('T')[0],
    start_time: new Date().toISOString(),
    status: 'created',
    match_format: 'competitive',
    rounds: 3,
  },
  tournament: {
    name: 'Test Tournament',
    format: 'single-elimination' as const,
    status: 'created',
    rounds_per_match: 3,
    game_mode_id: 'test-mode',
    ruleset: 'competitive',
  },
};

export async function createGame(overrides: Partial<typeof defaults.game & { icon_url?: string }> = {}): Promise<GameFixture> {
  const db = getTestDb();
  const data = { ...defaults.game, ...overrides };
  const id = generateId('game_');

  await db.run(
    `INSERT INTO games (id, name, genre, min_players, max_players, icon_url) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, data.name, data.genre, data.min_players, data.max_players, (overrides as any).icon_url || null]
  );
  return { id, name: data.name } as GameFixture;
}

export async function createGameMode(gameId: string, overrides: Partial<typeof defaults.gameMode> = {}): Promise<GameModeFixture> {
  const db = getTestDb();
  const data = { ...defaults.gameMode, ...overrides };
  const id = generateId('mode_');

  await db.run(
    `INSERT INTO game_modes (id, game_id, name, description, team_size, max_teams) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, gameId, data.name, data.description, data.team_size, data.max_teams]
  );
  return { id, game_id: gameId, name: data.name } as GameModeFixture;
}

export async function createMatch(gameId: string, modeId: string, overrides: Partial<typeof defaults.match & { maps?: string; player_notifications?: number }> = {}): Promise<MatchFixture> {
  const db = getTestDb();
  const data = { ...defaults.match, ...overrides };
  const id = generateId('match_');

  await db.run(
    `INSERT INTO matches (id, game_id, mode_id, name, start_date, start_time, status, match_format, rounds, maps, player_notifications, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [id, gameId, modeId, data.name, data.start_date, data.start_time, data.status, data.match_format, data.rounds, overrides.maps || null, overrides.player_notifications ?? 1]
  );
  const row = await db.get<MatchFixture>(`SELECT * FROM matches WHERE id = ?`, [id]);
  return row as MatchFixture;
}

export async function createMatchParticipant(matchId: string, discordUserId: string, username = 'TestUser', team: string | null = null): Promise<{ id: string; match_id: string; discord_user_id: string; username: string; team: string | null }> {
  const db = getTestDb();
  const id = generateId('participant_');

  await db.run(
    `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username, team) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, matchId, generateId('user_'), discordUserId, username, team]
  );
  return { id, match_id: matchId, discord_user_id: discordUserId, username, team };
}

export async function createTournament(gameId: string, overrides: Partial<Omit<typeof defaults.tournament, 'format'> & { format?: 'single-elimination' | 'double-elimination'; game_mode_id?: string }> = {}): Promise<TournamentFixture> {
  const db = getTestDb();
  const data = { ...defaults.tournament, ...overrides };
  const id = generateId('tournament_');

  await db.run(
    `INSERT INTO tournaments (id, name, game_id, game_mode_id, format, status, rounds_per_match, ruleset, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [id, data.name, gameId, overrides.game_mode_id || data.game_mode_id, data.format, data.status, data.rounds_per_match, data.ruleset]
  );
  return { id, game_id: gameId, name: data.name, format: data.format, status: data.status } as TournamentFixture;
}

// Queue fixtures for contract testing
export async function createQueueEntry(queueTable: string, data: Record<string, unknown>): Promise<Record<string, unknown> & { id: number }> {
  const db = getTestDb();
  const columns = Object.keys(data).join(', ');
  const placeholders = Object.keys(data).map(() => '?').join(', ');
  const values = Object.values(data);

  const result = await db.run(
    `INSERT INTO ${queueTable} (${columns}) VALUES (${placeholders})`,
    values
  );
  return { id: result.lastID!, ...data };
}

// Helper to seed common test data
export async function seedBasicTestData(): Promise<{ game: GameFixture; mode: GameModeFixture }> {
  const game = await createGame();
  const mode = await createGameMode(game.id);
  return { game, mode };
}
