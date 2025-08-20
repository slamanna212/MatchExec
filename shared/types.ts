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
  created_at: Date;
  updated_at: Date;
}

// Database row types (includes fields not in the base interface)
export interface MatchDbRow extends Match {
  maps?: string; // JSON string in database
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
}

export interface GameDbRow {
  id: string;
  name: string;
  max_signups?: number;
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
  winner_id?: string;
  map_id?: string;
  mode_id?: string;
  score_data?: string; // JSON string containing MatchScore
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
  assets: {
    iconUrl: string;
  };
}

export interface ModeDataJson {
  id: string;
  name: string;
  description: string;
}

export interface MapDataJson {
  id: string;
  name: string;
  mode: string;
  imageUrl?: string;
}

// Scoring system types
export type MatchFormat = 'casual' | 'competitive';
export type ScoringType = 'rounds' | 'objective' | 'points' | 'deathmatch' | 'vehicle' | 'custom';
export type ScoringTiming = 'realtime' | 'endgame';

export interface FormatVariant {
  description: string;
  [key: string]: unknown; // Format-specific properties
}

export interface FormatVariants {
  casual: FormatVariant;
  competitive?: FormatVariant;
}

export interface ModeDataJsonWithScoring extends ModeDataJson {
  scoringType: ScoringType;
  scoringTiming: ScoringTiming;
  formatVariants: FormatVariants;
}

// Base scoring interface
export interface BaseScore {
  matchId: string;
  gameId: string;
  format: MatchFormat;
  scoringType: ScoringType;
  winner: 'team1' | 'team2' | 'draw';
  completedAt: Date;
}

// Round-based scoring (Valorant, Control, Domination)
export interface RoundScore {
  round: number;
  winner: 'team1' | 'team2';
  team1Score?: number;
  team2Score?: number;
  metadata?: Record<string, unknown>;
}

export interface RoundsScore extends BaseScore {
  scoringType: 'rounds';
  currentRound: number;
  maxRounds: number;
  rounds: RoundScore[];
  team1Rounds: number;
  team2Rounds: number;
}

// Objective-based scoring (Escort, Push, Hybrid)
export interface ObjectiveScore extends BaseScore {
  scoringType: 'objective';
  team1Distance: number;
  team2Distance: number;
  team1Time?: number;
  team2Time?: number;
  checkpointsReached: {
    team1: number;
    team2: number;
  };
}

// Points-based scoring (Flashpoint, Clash, Escalation)
export interface PointsScore extends BaseScore {
  scoringType: 'points';
  team1Points: number;
  team2Points: number;
  targetPoints: number;
  pointsHistory: Array<{
    timestamp: Date;
    team: 'team1' | 'team2';
    points: number;
    reason?: string;
  }>;
}

// Deathmatch scoring (Doom Match, Conquest, Valorant DM)
export interface DeathmatchScore extends BaseScore {
  scoringType: 'deathmatch';
  team1Eliminations: number;
  team2Eliminations: number;
  targetEliminations: number;
  timeLimit?: number;
  mvpPlayer?: string;
}

// Vehicle escort scoring (Convoy, Convergence)
export interface VehicleScore extends BaseScore {
  scoringType: 'vehicle';
  team1Progress: number;
  team2Progress: number;
  team1Time?: number;
  team2Time?: number;
  checkpointsReached: {
    team1: number;
    team2: number;
  };
  vehicleSpeed?: number;
}

// Custom scoring for Workshop modes
export interface CustomScore extends BaseScore {
  scoringType: 'custom';
  customData: Record<string, unknown>;
}

// Union type for all score types
export type MatchScore = RoundsScore | ObjectiveScore | PointsScore | DeathmatchScore | VehicleScore | CustomScore;

// Format-specific score variants
export type CasualScore = MatchScore & { format: 'casual' };
export type CompetitiveScore = MatchScore & { format: 'competitive' };

// Score configuration based on match format and mode
export interface ScoringConfig {
  format: MatchFormat;
  scoringType: ScoringType;
  scoringTiming: ScoringTiming;
  formatVariant: FormatVariant;
  validation: {
    minRounds?: number;
    maxRounds?: number;
    targetPoints?: number;
    targetEliminations?: number;
    timeLimit?: number;
  };
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
  status: 'pending' | 'sent' | 'failed' | 'processed' | 'posted' | 'scheduled';
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
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}