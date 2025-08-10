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
  [key: string]: unknown;
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
  joined_at: Date;
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

// Scheduler settings types
export interface SchedulerSettings {
  id: number;
  match_check_cron: string;
  reminder_check_cron: string;
  cleanup_check_cron: string;
  report_generation_cron: string;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}