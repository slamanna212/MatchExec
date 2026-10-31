// Initially generated from the SQLite baseline (Stage 0.5); now maintained by hand.
import { pgTable, text, integer, boolean, timestamp, jsonb, index, unique, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { games } from './games';
import { matches } from './matches';
import type { PositionScoringConfig, AnnouncementConfig } from './types';

export const tournamentMatches = pgTable('tournament_matches', {
  match_id: text('match_id').primaryKey().references(() => matches.id, { onDelete: 'cascade' }),
  tournament_id: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  round: integer('round').notNull(),
  bracket_type: text('bracket_type', { enum: ['winners', 'losers', 'final'] }).notNull(),
  team1_id: text('team1_id').references(() => tournamentTeams.id, { onDelete: 'set null' }),
  team2_id: text('team2_id').references(() => tournamentTeams.id, { onDelete: 'set null' }),
  match_order: integer('match_order').notNull(),
  parent_match1_id: text('parent_match1_id').references(() => matches.id, { onDelete: 'set null' }),
  parent_match2_id: text('parent_match2_id').references(() => matches.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('idx_tournament_matches_team2_id').on(t.team2_id),
  index('idx_tournament_matches_team1_id').on(t.team1_id),
  index('idx_tournament_matches_bracket_type').on(t.bracket_type),
  index('idx_tournament_matches_round').on(t.round),
  index('idx_tournament_matches_tournament_id').on(t.tournament_id),
  check('tournament_matches_bracket_type_check', sql`${t.bracket_type} IN ('winners', 'losers', 'final')`),
]);

export const tournamentParticipants = pgTable('tournament_participants', {
  id: text('id').primaryKey(),
  tournament_id: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  user_id: text('user_id').notNull(),
  discord_user_id: text('discord_user_id').notNull(),
  username: text('username').notNull(),
  joined_at: timestamp('joined_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  signup_data: jsonb('signup_data').$type<Record<string, unknown>>(),
  team_assignment: text('team_assignment').references(() => tournamentTeams.id, { onDelete: 'set null' }),
}, (t) => [
  index('idx_tournament_participants_team_assignment').on(t.team_assignment),
  index('idx_tournament_participants_user_id').on(t.user_id),
  index('idx_tournament_participants_tournament_id').on(t.tournament_id),
  unique('tournament_participants_tournament_id_user_id_unique').on(t.tournament_id, t.user_id),
]);

export const tournamentRoundByes = pgTable('tournament_round_byes', {
  id: text('id').primaryKey(),
  tournament_id: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  round: integer('round').notNull(),
  bracket_type: text('bracket_type').notNull(),
  team_id: text('team_id').notNull().references(() => tournamentTeams.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  unique('tournament_round_byes_tournament_id_round_bracket_type_team_id_unique').on(t.tournament_id, t.round, t.bracket_type, t.team_id),
]);

export const tournamentTeamMembers = pgTable('tournament_team_members', {
  id: text('id').primaryKey(),
  team_id: text('team_id').notNull().references(() => tournamentTeams.id, { onDelete: 'cascade' }),
  user_id: text('user_id').notNull(),
  discord_user_id: text('discord_user_id'),
  username: text('username').notNull(),
  joined_at: timestamp('joined_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  is_captain: boolean('is_captain').notNull().default(false),
}, (t) => [
  index('idx_tournament_team_members_user_id').on(t.user_id),
  index('idx_tournament_team_members_team_id').on(t.team_id),
  unique('tournament_team_members_team_id_user_id_unique').on(t.team_id, t.user_id),
]);

export const tournamentTeams = pgTable('tournament_teams', {
  id: text('id').primaryKey(),
  tournament_id: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  team_name: text('team_name').notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('idx_tournament_teams_tournament_id').on(t.tournament_id),
]);

export const tournaments = pgTable('tournaments', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  format: text('format', { enum: ['single-elimination', 'double-elimination', 'cumulative-points'] }).notNull(),
  status: text('status', { enum: ['created', 'gather', 'assign', 'battle', 'complete', 'cancelled'] }).notNull().default("created"),
  game_id: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  rounds_per_match: integer('rounds_per_match').notNull(),
  ruleset: text('ruleset', { enum: ['casual', 'competitive'] }).notNull().default("casual"),
  max_participants: integer('max_participants'),
  start_date: timestamp('start_date', { withTimezone: true, mode: 'date' }),
  start_time: timestamp('start_time', { withTimezone: true, mode: 'date' }),
  event_image_url: text('event_image_url'),
  signup_config_id: text('signup_config_id'),
  allow_player_team_selection: boolean('allow_player_team_selection').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
  allow_match_editing: boolean('allow_match_editing').notNull().default(true),
  stats_enabled: boolean('stats_enabled').notNull().default(false),
  game_mode_id: text('game_mode_id'),
  announcements: jsonb('announcements').$type<AnnouncementConfig>(),
  player_notifications: boolean('player_notifications').notNull().default(true),
  livestream_link: text('livestream_link'),
  position_scoring_override: jsonb('position_scoring_override').$type<PositionScoringConfig>(),
}, (t) => [
  index('idx_tournaments_game_mode_id').on(t.game_mode_id),
  index('idx_tournaments_start_time').on(t.start_time),
  index('idx_tournaments_status').on(t.status),
  index('idx_tournaments_game_id').on(t.game_id),
  check('tournaments_format_check', sql`${t.format} IN ('single-elimination', 'double-elimination', 'cumulative-points')`),
  check('tournaments_status_check', sql`${t.status} IN ('created', 'gather', 'assign', 'battle', 'complete', 'cancelled')`),
  check('tournaments_ruleset_check', sql`${t.ruleset} IN ('casual', 'competitive')`),
]);
