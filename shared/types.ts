// Game-related types
export interface Game {
  id: string;
  name: string;
  genre: string;
  developer: string;
  release_date: string;
  version: string;
  description: string;
  min_players: number;
  max_players: number;
  icon_url: string;
  created_at: Date;
  updated_at: Date;
}

export interface GameMode {
  id: string;
  game_id: string;
  name: string;
  description: string;
  scoring_type: 'Normal' | 'FFA';
  created_at: Date;
  updated_at: Date;
}

export interface GameMap {
  id: string;
  game_id: string;
  name: string;
  mode_id?: string;
  image_url?: string;
  created_at: Date;
  updated_at: Date;
}

// Match-related types
export interface Match {
  id: string;
  name: string;
  description?: string;
  game_id: string;
  guild_id: string;
  channel_id: string;
  max_participants: number;
  match_format: MatchFormat;
  status: 'created' | 'gather' | 'assign' | 'battle' | 'complete' | 'cancelled';
  start_date?: Date;
  end_date?: Date;
  tournament_id?: string;
  bracket_type?: 'winners' | 'losers' | 'final';
  bracket_round?: number;
  red_team_id?: string;
  blue_team_id?: string;
  created_at: Date;
  updated_at: Date;
}

// Tournament-related types
export interface Tournament {
  id: string;
  name: string;
  description?: string;
  format: 'single-elimination' | 'double-elimination';
  status: 'created' | 'gather' | 'assign' | 'battle' | 'complete' | 'cancelled';
  game_id: string;
  rounds_per_match: number;
  max_participants?: number;
  start_date?: Date;
  start_time?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface TournamentTeam {
  id: string;
  tournament_id: string;
  team_name: string;
  created_at: Date;
}

export interface TournamentTeamMember {
  id: string;
  team_id: string;
  user_id: string;
  username: string;
  joined_at: Date;
}

// Database row types (includes fields not in the base interface)
export interface MatchDbRow extends Match {
  maps?: string; // JSON string in database
  map_codes?: string; // JSON string storing map codes
  map_id?: string; // Single map ID for tournament matches
  event_image_url?: string;
  rules?: string;
  rounds?: number;
  livestream_link?: string;
  player_notifications?: number; // SQLite stores booleans as integers
  announcement_voice_channel?: string;
}

export interface ParticipantDbRow {
  id: string;
  match_id: string;
  user_id: string;
  discord_user_id: string;
  username: string;
  joined_at: Date;
  signup_data?: string; // JSON string
  team_assignment?: 'reserve' | 'blue' | 'red';
  receives_map_codes?: number; // SQLite stores booleans as integers
}

export interface GameDbRow {
  id: string;
  name: string;
  max_signups?: number;
  map_codes_supported?: number; // SQLite stores booleans as integers
  [key: string]: unknown;
}

export interface DiscordSettingsDbRow {
  application_id?: string;
  bot_token?: string;
  guild_id?: string;
  announcement_role_id?: string;
  mention_everyone?: number; // SQLite stores booleans as integers
  event_duration_minutes?: number;
  match_reminder_minutes?: number;
  player_reminder_minutes?: number;
  announcer_voice?: string;
  voice_announcements_enabled?: number; // SQLite stores booleans as integers
  [key: string]: unknown;
}

export interface DiscordChannel {
  id: string;
  discord_channel_id: string;
  channel_name?: string;
  channel_type: 'text' | 'voice';
  send_announcements: boolean;
  send_reminders: boolean;
  send_match_start: boolean;
  send_signup_updates: boolean;
  last_name_refresh?: string;
  created_at: string;
  updated_at: string;
}

export interface DiscordSettings {
  bot_token: string;
  guild_id: string;
  announcement_role_id?: string;
  mention_everyone?: boolean;
  event_duration_minutes?: number;
  match_reminder_minutes?: number;
  player_reminder_minutes?: number;
  announcer_voice?: string;
  voice_announcements_enabled?: boolean;
}

// Match progress constants
export const MATCH_FLOW_STEPS = {
  created: { name: 'Creation', progress: 20 },
  gather: { name: 'Gather', progress: 40 },
  assign: { name: 'Assign', progress: 60 },
  battle: { name: 'Battle', progress: 80 },
  complete: { name: 'Complete', progress: 100 },
  cancelled: { name: 'Cancelled', progress: 0 }
} as const;

// Tournament progress constants
export const TOURNAMENT_FLOW_STEPS = {
  created: { name: 'Setup', progress: 20 },
  gather: { name: 'Signups', progress: 40 },
  assign: { name: 'Bracket', progress: 60 },
  battle: { name: 'Matches', progress: 80 },
  complete: { name: 'Complete', progress: 100 },
  cancelled: { name: 'Cancelled', progress: 0 }
} as const;

// Tournament format types
export type TournamentFormat = 'single-elimination' | 'double-elimination';

// Tournament status types  
export type TournamentStatus = 'created' | 'gather' | 'assign' | 'battle' | 'complete' | 'cancelled';

export interface MatchParticipant {
  id: string;
  match_id: string;
  user_id: string;
  username: string;
  joined_at: Date | string;
  signup_data?: Record<string, unknown>;
}

export interface MatchGame {
  id: string;
  match_id: string;
  round: number;
  participant1_id: string;
  participant2_id: string;
  winner_id?: string; // 'team1', 'team2', or null
  participant_winner_id?: string; // For FFA modes: specific participant ID
  is_ffa_mode: boolean; // True if this is a Free-For-All mode
  map_id?: string;
  mode_id?: string;
  status: 'pending' | 'ongoing' | 'completed';
  scheduled_at?: Date;
  completed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

// Data seeding types
export interface DataVersion {
  game_id: string;
  data_version: string;
  seeded_at: Date;
}

// JSON file format types (for seeding)
export interface GameDataJson {
  id: string;
  name: string;
  genre: string;
  developer: string;
  releaseDate: string;
  version: string;
  dataVersion: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  mapCodesSupported?: boolean;
  assets: {
    iconUrl: string;
  };
}

export interface ModeDataJson {
  id: string;
  name: string;
  description: string;
  scoringType?: 'Normal' | 'FFA';
}

export interface MapDataJson {
  id: string;
  name: string;
  mode: string;
  imageUrl?: string;
}

// Simplified scoring system - only track match format and winner
export type MatchFormat = 'casual' | 'competitive';

// Simple match result
export interface MatchResult {
  matchId: string;
  gameId: string; // match_games.id
  winner: 'team1' | 'team2';
  participantWinnerId?: string; // For FFA modes
  isFfaMode?: boolean;
  completedAt: Date;
}

// Map codes type
export interface MapCodes {
  [mapId: string]: string; // mapId -> code (up to 24 characters)
}

// Signup field types
export interface SignupField {
  id: string;
  label: string;
  type: string;
}

export interface SignupConfig {
  fields: SignupField[];
}

// Reminder types
export interface ReminderData {
  id: string;
  match_id: string;
  reminder_time: string;
  status: 'pending' | 'sent' | 'failed' | 'processed' | 'completed' | 'scheduled';
  error_message?: string;
  created_at: string;
  sent_at?: string;
  processed_at?: string;
  type: 'discord_general' | 'discord_match' | 'discord_player' | 'timed_announcement';
  description?: string;
}

// Scheduler settings types
export interface SchedulerSettings {
  id: number;
  match_check_cron: string;
  cleanup_check_cron: string;
  channel_refresh_cron: string;
  created_at: Date;
  updated_at: Date;
}