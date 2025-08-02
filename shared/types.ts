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

// Tournament-related types
export interface Tournament {
  id: string;
  name: string;
  description?: string;
  game_id: string;
  guild_id: string;
  channel_id: string;
  max_participants: number;
  status: 'created' | 'registration' | 'ongoing' | 'completed' | 'cancelled';
  start_date?: Date;
  end_date?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface TournamentParticipant {
  id: string;
  tournament_id: string;
  user_id: string;
  username: string;
  joined_at: Date;
}

export interface TournamentMatch {
  id: string;
  tournament_id: string;
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