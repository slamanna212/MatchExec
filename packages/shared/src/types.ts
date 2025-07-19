import { z } from 'zod';

// Game Types
export const GameSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  isActive: z.boolean(),
});

export type Game = z.infer<typeof GameSchema>;

// Player Types
export const PlayerSchema = z.object({
  id: z.string(),
  gameId: z.string(),
  username: z.string(),
  displayName: z.string().optional(),
  userId: z.string().optional(),
  isActive: z.boolean(),
});

export type Player = z.infer<typeof PlayerSchema>;

// Match Types
export const MatchSchema = z.object({
  id: z.string(),
  gameId: z.string(),
  mapId: z.string().optional(),
  gameModeId: z.string().optional(),
  matchCode: z.string().optional(),
  startTime: z.date(),
  endTime: z.date().optional(),
  status: z.enum(['pending', 'active', 'completed', 'cancelled']),
  metadata: z.string().optional(),
});

export type Match = z.infer<typeof MatchSchema>;

// Statistics Types
export interface OverwatchPlayerStats {
  eliminations: number;
  deaths: number;
  assists: number;
  damage: number;
  healing: number;
  timePlayed: number;
  heroSpecific?: Record<string, number>;
}

export interface MarvelRivalsPlayerStats {
  eliminations: number;
  deaths: number;
  assists: number;
  damage: number;
  healing: number;
  timePlayed: number;
  objectives?: number;
  heroSpecific?: Record<string, number>;
}

// Job Queue Types
export const JobTypeSchema = z.enum([
  'statistics_update',
  'embed_update',
  'ocr_process',
  'match_import',
  'player_sync',
]);

export type JobType = z.infer<typeof JobTypeSchema>;

export const JobStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);

export type JobStatus = z.infer<typeof JobStatusSchema>;

export interface JobPayload {
  type: JobType;
  data: Record<string, any>;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Environment Configuration
export interface EnvironmentConfig {
  DATABASE_URL: string;
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  DISCORD_BOT_TOKEN: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_GUILD_ID?: string;
  SESSION_SECRET: string;
  LOG_LEVEL: 'error' | 'warn' | 'info' | 'debug';
  LOG_FILE_PATH: string;
} 