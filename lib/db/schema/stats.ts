// Initially generated from the SQLite baseline (Stage 0.5); now maintained by hand.
import { pgTable, text, integer, doublePrecision, boolean, timestamp, jsonb, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { matchGames, matchParticipants, matchTeams, matches } from './matches';

export const scorecardDmMessages = pgTable('scorecard_dm_messages', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  match_game_id: text('match_game_id').notNull().references(() => matchGames.id, { onDelete: 'cascade' }),
  discord_user_id: text('discord_user_id').notNull(),
  discord_message_id: text('discord_message_id').notNull(),
  participant_id: text('participant_id').references(() => matchParticipants.id, { onDelete: 'set null' }),
  team_side: text('team_side', { enum: ['blue', 'red'] }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('idx_scorecard_dm_messages_discord').on(t.discord_user_id, t.discord_message_id),
  check('scorecard_dm_messages_team_side_check', sql`${t.team_side} IN ('blue', 'red')`),
]);

export const scorecardPlayerStats = pgTable('scorecard_player_stats', {
  id: text('id').primaryKey(),
  submission_id: text('submission_id').notNull().references(() => scorecardSubmissions.id, { onDelete: 'cascade' }),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  match_game_id: text('match_game_id').notNull().references(() => matchGames.id, { onDelete: 'cascade' }),
  participant_id: text('participant_id').references(() => matchParticipants.id, { onDelete: 'set null' }),
  extracted_player_name: text('extracted_player_name').notNull(),
  extracted_hero: text('extracted_hero'),
  team_side: text('team_side', { enum: ['blue', 'red'] }),
  stats_json: jsonb('stats_json').$type<Record<string, unknown>>().notNull().default({}),
  assignment_status: text('assignment_status', { enum: ['unassigned', 'assigned', 'confirmed'] }).notNull().default("unassigned"),
  confidence_score: doublePrecision('confidence_score'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
  team_id: text('team_id').references(() => matchTeams.id, { onDelete: 'set null' }),
}, (t) => [
  index('idx_scorecard_player_stats_team_id').on(t.team_id),
  index('idx_scorecard_player_stats_participant').on(t.participant_id),
  index('idx_scorecard_player_stats_match').on(t.match_id),
  index('idx_scorecard_player_stats_submission').on(t.submission_id),
  check('scorecard_player_stats_team_side_check', sql`${t.team_side} IN ('blue', 'red')`),
  check('scorecard_player_stats_assignment_status_check', sql`${t.assignment_status} IN ('unassigned', 'assigned', 'confirmed')`),
]);

export const scorecardSubmissions = pgTable('scorecard_submissions', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  match_game_id: text('match_game_id').notNull().references(() => matchGames.id, { onDelete: 'cascade' }),
  submitted_by_participant_id: text('submitted_by_participant_id').references(() => matchParticipants.id, { onDelete: 'set null' }),
  submitted_by_discord_user_id: text('submitted_by_discord_user_id'),
  team_side: text('team_side', { enum: ['blue', 'red'] }).notNull(),
  screenshot_url: text('screenshot_url').notNull(),
  discord_message_id: text('discord_message_id'),
  ai_raw_response: text('ai_raw_response'),
  ai_extraction_status: text('ai_extraction_status', { enum: ['pending', 'processing', 'completed', 'failed', 'retrying'] }).notNull().default("pending"),
  ai_error_message: text('ai_error_message'),
  review_status: text('review_status', { enum: ['pending', 'approved', 'rejected', 'auto_approved'] }).notNull().default("pending"),
  reviewed_at: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
  ai_processing_log: jsonb('ai_processing_log').$type<Array<{ message: string; ts: string }>>(),
  suggested_positions: jsonb('suggested_positions').$type<Record<string, unknown>>(),
}, (t) => [
  index('idx_scorecard_submissions_match_game').on(t.match_game_id),
  index('idx_scorecard_submissions_match').on(t.match_id),
  check('scorecard_submissions_team_side_check', sql`${t.team_side} IN ('blue', 'red')`),
  check('scorecard_submissions_ai_extraction_status_check', sql`${t.ai_extraction_status} IN ('pending', 'processing', 'completed', 'failed', 'retrying')`),
  check('scorecard_submissions_review_status_check', sql`${t.review_status} IN ('pending', 'approved', 'rejected', 'auto_approved')`),
]);

export const statsSettings = pgTable('stats_settings', {
  id: integer('id').primaryKey().default(1),
  enabled: boolean('enabled').notNull().default(false),
  ai_provider: text('ai_provider').notNull().default("anthropic"),
  ai_api_key: text('ai_api_key'),
  ai_model: text('ai_model').notNull().default("sonnet"),
  ai_providers_config: jsonb('ai_providers_config').$type<Array<Record<string, unknown>>>(),
  google_api_key: text('google_api_key'),
  openrouter_api_key: text('openrouter_api_key'),
  both_sides_required: boolean('both_sides_required').notNull().default(false),
  auto_advance_on_match: boolean('auto_advance_on_match').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
  stats_report_dm_enabled: boolean('stats_report_dm_enabled').notNull().default(false),
}, (t) => [
  check('stats_settings_singleton_check', sql`${t.id} = 1`),
]);
