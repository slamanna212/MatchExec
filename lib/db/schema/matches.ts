// Initially generated from the SQLite baseline (Stage 0.5); now maintained by hand.
import { pgTable, text, integer, boolean, timestamp, jsonb, index, unique, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { games } from './games';
import { tournamentTeams, tournaments } from './tournaments';
import type { PositionScoringConfig, AnnouncementConfig } from './types';

export const matchGamePlacements = pgTable('match_game_placements', {
  id: text('id').primaryKey(),
  match_game_id: text('match_game_id').notNull().references(() => matchGames.id, { onDelete: 'cascade' }),
  entity_type: text('entity_type', { enum: ['team', 'participant'] }).notNull(),
  entity_id: text('entity_id').notNull(),
  position: integer('position'),
  score: integer('score'),
  points_awarded: integer('points_awarded'),
  is_winner: boolean('is_winner').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('idx_placements_entity').on(t.entity_type, t.entity_id),
  index('idx_placements_match_game').on(t.match_game_id),
  unique('match_game_placements_match_game_id_entity_type_entity_id_unique').on(t.match_game_id, t.entity_type, t.entity_id),
  check('match_game_placements_entity_type_check', sql`${t.entity_type} IN ('team', 'participant')`),
]);

export const matchGames = pgTable('match_games', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  round: integer('round').notNull().default(1),
  map_id: text('map_id'),
  status: text('status', { enum: ['pending', 'ongoing', 'completed'] }).notNull().default("pending"),
  started_at: timestamp('started_at', { withTimezone: true, mode: 'date' }),
  completed_at: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  notes: text('notes').notNull().default(""),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
  discord_notified: boolean('discord_notified').notNull().default(false),
}, (t) => [
  index('idx_match_games_match_id').on(t.match_id),
  unique('match_games_match_id_round_unique').on(t.match_id, t.round),
  check('match_games_status_check', sql`${t.status} IN ('pending', 'ongoing', 'completed')`),
]);

export const matchParticipants = pgTable('match_participants', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  user_id: text('user_id').notNull(),
  discord_user_id: text('discord_user_id'),
  username: text('username').notNull(),
  signup_data: jsonb('signup_data').$type<Record<string, unknown>>(),
  joined_at: timestamp('joined_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  receives_map_codes: boolean('receives_map_codes').notNull().default(false),
  avatar_url: text('avatar_url'),
  last_avatar_check: timestamp('last_avatar_check', { withTimezone: true, mode: 'date' }),
  failed_avatar_checks: integer('failed_avatar_checks').notNull().default(0),
  team_id: text('team_id').references(() => matchTeams.id, { onDelete: 'set null' }),
  grid_position: integer('grid_position'),
  qualifying_time_ms: integer('qualifying_time_ms'),
}, (t) => [
  index('idx_match_participants_team_id').on(t.team_id),
  index('idx_match_participants_user_id').on(t.user_id),
  index('idx_match_participants_match_id').on(t.match_id),
  unique('match_participants_match_id_user_id_unique').on(t.match_id, t.user_id),
]);

export const matchPlayerStats = pgTable('match_player_stats', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  participant_id: text('participant_id').notNull().references(() => matchParticipants.id, { onDelete: 'cascade' }),
  total_stats_json: jsonb('total_stats_json').$type<Record<string, unknown>>().notNull().default({}),
  maps_played: integer('maps_played').notNull().default(0),
  stat_image_url: text('stat_image_url'),
  stat_image_sent: boolean('stat_image_sent').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
  stats_dm_sent: boolean('stats_dm_sent').notNull().default(false),
}, (t) => [
  index('idx_match_player_stats_match').on(t.match_id),
  unique('match_player_stats_match_id_participant_id_unique').on(t.match_id, t.participant_id),
]);

export const matchTeams = pgTable('match_teams', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  team_name: text('team_name').notNull(),
  team_color: text('team_color'),
  team_order: integer('team_order').notNull(),
  voice_channel_id: text('voice_channel_id'),
  is_reserve: boolean('is_reserve').notNull().default(false),
}, (t) => [
  index('idx_match_teams_match').on(t.match_id),
  unique('match_teams_match_id_team_order_unique').on(t.match_id, t.team_order),
]);

export const matchVoiceAlternation = pgTable('match_voice_alternation', {
  match_id: text('match_id').primaryKey().references(() => matches.id, { onDelete: 'cascade' }),
  current_team: text('current_team').notNull(),
  last_first_team: text('last_first_team'),
  last_updated_at: timestamp('last_updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index('idx_match_voice_alternation_last_team').on(t.last_first_team),
]);

export const matches = pgTable('matches', {
  id: text('id').primaryKey(),
  game_id: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  mode_id: text('mode_id'),
  name: text('name').notNull(),
  description: text('description'),
  start_date: timestamp('start_date', { withTimezone: true, mode: 'date' }).notNull(),
  start_time: timestamp('start_time', { withTimezone: true, mode: 'date' }).notNull(),
  end_time: timestamp('end_time', { withTimezone: true, mode: 'date' }),
  status: text('status', { enum: ['created', 'gather', 'assign', 'battle', 'complete', 'cancelled'] }).notNull().default("created"),
  max_participants: integer('max_participants'),
  current_participants: integer('current_participants').notNull().default(0),
  winner_team: text('winner_team'),
  map_codes: jsonb('map_codes').$type<Record<string, string>>(),
  guild_id: text('guild_id'),
  channel_id: text('channel_id'),
  match_format: text('match_format').notNull().default("casual"),
  maps: jsonb('maps').$type<unknown[]>(),
  rules: text('rules'),
  rounds: integer('rounds'),
  livestream_link: text('livestream_link'),
  event_image_url: text('event_image_url'),
  player_notifications: boolean('player_notifications').notNull().default(true),
  announcements: jsonb('announcements').$type<AnnouncementConfig>(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
  tournament_id: text('tournament_id').references(() => tournaments.id, { onDelete: 'cascade' }),
  bracket_type: text('bracket_type', { enum: ['winners', 'losers', 'final'] }),
  bracket_round: integer('bracket_round'),
  red_team_id: text('red_team_id').references(() => tournamentTeams.id, { onDelete: 'set null' }),
  blue_team_id: text('blue_team_id').references(() => tournamentTeams.id, { onDelete: 'set null' }),
  tournament_round: integer('tournament_round'),
  tournament_bracket_type: text('tournament_bracket_type'),
  team1_name: text('team1_name'),
  team2_name: text('team2_name'),
  map_id: text('map_id'),
  stats_enabled: boolean('stats_enabled').notNull().default(false),
  team_count: integer('team_count').notNull().default(2),
  position_scoring_override: jsonb('position_scoring_override').$type<PositionScoringConfig>(),
}, (t) => [
  index('idx_matches_status_updated').on(t.status, t.updated_at.desc()),
  index('idx_matches_map_id').on(t.map_id),
  index('idx_matches_winner_team').on(t.winner_team),
  index('idx_matches_tournament_bracket_type').on(t.tournament_bracket_type),
  index('idx_matches_tournament_round').on(t.tournament_round),
  index('idx_matches_blue_team_id').on(t.blue_team_id),
  index('idx_matches_red_team_id').on(t.red_team_id),
  index('idx_matches_bracket_type').on(t.bracket_type),
  index('idx_matches_tournament_id').on(t.tournament_id),
  index('idx_matches_start_time').on(t.start_time),
  index('idx_matches_status').on(t.status),
  index('idx_matches_game_id').on(t.game_id),
  check('matches_status_check', sql`${t.status} IN ('created', 'gather', 'assign', 'battle', 'complete', 'cancelled')`),
  check('matches_bracket_type_check', sql`${t.bracket_type} IN ('winners', 'losers', 'final')`),
]);
