// Initially generated from the SQLite baseline (Stage 0.5); now maintained by hand.
import { pgTable, text, integer, timestamp, jsonb, index, uniqueIndex, unique, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { matchGames, matches } from './matches';
import { scorecardSubmissions } from './stats';

export const discordAnnouncementQueue = pgTable('discord_announcement_queue', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  announcement_type: text('announcement_type'),
  announcement_data: jsonb('announcement_data').$type<Record<string, unknown>>(),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default("pending"),
  attempts: integer('attempts').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  processed_at: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  posted_at: timestamp('posted_at', { withTimezone: true, mode: 'date' }),
  last_error: text('last_error'),
  scheduled_for: timestamp('scheduled_for', { withTimezone: true, mode: 'date' }),
  max_attempts: integer('max_attempts').notNull().default(5),
  claimed_at: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  claimed_by: text('claimed_by'),
  next_attempt_at: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
  external_message_id: text('external_message_id'),
}, (t) => [
  index('idx_discord_announcement_queue_scheduled').on(t.scheduled_for),
  index('idx_discord_announcement_queue_status').on(t.status),
  check('discord_announcement_queue_status_check', sql`${t.status} IN ('pending', 'processing', 'completed', 'failed')`),
]);

export const discordBotRequests = pgTable('discord_bot_requests', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>(),
  result: jsonb('result').$type<Record<string, unknown>>(),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default("pending"),
  attempts: integer('attempts').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  processed_at: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
  max_attempts: integer('max_attempts').notNull().default(5),
  claimed_at: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  claimed_by: text('claimed_by'),
  last_error: text('last_error'),
  next_attempt_at: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
}, (t) => [
  index('idx_discord_bot_requests_status').on(t.status),
  check('discord_bot_requests_status_check', sql`${t.status} IN ('pending', 'processing', 'completed', 'failed')`),
]);

export const discordDeletionQueue = pgTable('discord_deletion_queue', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull(),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default("pending"),
  attempts: integer('attempts').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  processed_at: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  max_attempts: integer('max_attempts').notNull().default(5),
  claimed_at: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  claimed_by: text('claimed_by'),
  last_error: text('last_error'),
  next_attempt_at: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
}, (t) => [
  index('idx_discord_deletion_queue_status').on(t.status),
  check('discord_deletion_queue_status_check', sql`${t.status} IN ('pending', 'processing', 'completed', 'failed')`),
]);

export const discordHealthAlertQueue = pgTable('discord_health_alert_queue', {
  id: text('id').primaryKey(),
  severity: text('severity').notNull().default("critical"),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default("pending"),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  posted_at: timestamp('posted_at', { withTimezone: true, mode: 'date' }),
  last_error: text('last_error'),
  attempts: integer('attempts').notNull().default(0),
  max_attempts: integer('max_attempts').notNull().default(5),
  claimed_at: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  claimed_by: text('claimed_by'),
  next_attempt_at: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
  external_message_id: text('external_message_id'),
  processed_at: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
}, (t) => [
  index('idx_discord_health_alert_queue_status').on(t.status),
  check('discord_health_alert_queue_status_check', sql`${t.status} IN ('pending', 'processing', 'completed', 'failed')`),
]);

export const discordMapCodeQueue = pgTable('discord_map_code_queue', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  user_id: text('user_id'),
  map_name: text('map_name'),
  map_code: text('map_code'),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default("pending"),
  attempts: integer('attempts').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  processed_at: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  max_attempts: integer('max_attempts').notNull().default(5),
  claimed_at: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  claimed_by: text('claimed_by'),
  last_error: text('last_error'),
  next_attempt_at: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
}, (t) => [
  index('idx_discord_map_code_queue_status').on(t.status),
  check('discord_map_code_queue_status_check', sql`${t.status} IN ('pending', 'processing', 'completed', 'failed')`),
]);

export const discordMatchEditQueue = pgTable('discord_match_edit_queue', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default("pending"),
  attempts: integer('attempts').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  processed_at: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  last_error: text('last_error'),
  max_attempts: integer('max_attempts').notNull().default(5),
  claimed_at: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  claimed_by: text('claimed_by'),
  next_attempt_at: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
}, (t) => [
  index('idx_discord_match_edit_queue_match_id').on(t.match_id),
  check('discord_match_edit_queue_status_check', sql`${t.status} IN ('pending', 'processing', 'completed', 'failed')`),
]);

export const discordMatchReminderQueue = pgTable('discord_match_reminder_queue', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  reminder_type: text('reminder_type').notNull(),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default("pending"),
  attempts: integer('attempts').notNull().default(0),
  scheduled_for: timestamp('scheduled_for', { withTimezone: true, mode: 'date' }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  processed_at: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  max_attempts: integer('max_attempts').notNull().default(5),
  claimed_at: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  claimed_by: text('claimed_by'),
  last_error: text('last_error'),
  next_attempt_at: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
  external_message_id: text('external_message_id'),
}, (t) => [
  index('idx_discord_match_reminder_queue_scheduled').on(t.scheduled_for),
  index('idx_discord_match_reminder_queue_status').on(t.status),
  check('discord_match_reminder_queue_status_check', sql`${t.status} IN ('pending', 'processing', 'completed', 'failed')`),
]);

export const discordMatchStartQueue = pgTable('discord_match_start_queue', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default("pending"),
  attempts: integer('attempts').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  processed_at: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  max_attempts: integer('max_attempts').notNull().default(5),
  claimed_at: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  claimed_by: text('claimed_by'),
  last_error: text('last_error'),
  next_attempt_at: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
  external_message_id: text('external_message_id'),
}, (t) => [
  index('idx_discord_match_start_queue_status').on(t.status),
  check('discord_match_start_queue_status_check', sql`${t.status} IN ('pending', 'processing', 'completed', 'failed')`),
]);

export const discordMatchWinnerQueue = pgTable('discord_match_winner_queue', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  match_name: text('match_name'),
  game_id: text('game_id'),
  winner: text('winner'),
  winning_team_name: text('winning_team_name'),
  winning_players: jsonb('winning_players').$type<string[]>(),
  team1_score: integer('team1_score'),
  team2_score: integer('team2_score'),
  total_maps: integer('total_maps'),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default("pending"),
  attempts: integer('attempts').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  processed_at: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  sent_at: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
  last_error: text('last_error'),
  max_attempts: integer('max_attempts').notNull().default(5),
  claimed_at: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  claimed_by: text('claimed_by'),
  next_attempt_at: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
  external_message_id: text('external_message_id'),
}, (t) => [
  index('idx_discord_match_winner_queue_status').on(t.status),
  check('discord_match_winner_queue_status_check', sql`${t.status} IN ('pending', 'processing', 'completed', 'failed')`),
]);

export const discordPlayerReminderQueue = pgTable('discord_player_reminder_queue', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  user_id: text('user_id').notNull(),
  reminder_type: text('reminder_type').notNull(),
  reminder_time: timestamp('reminder_time', { withTimezone: true, mode: 'date' }),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default("pending"),
  attempts: integer('attempts').notNull().default(0),
  scheduled_for: timestamp('scheduled_for', { withTimezone: true, mode: 'date' }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  processed_at: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  sent_at: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
  last_error: text('last_error'),
  max_attempts: integer('max_attempts').notNull().default(5),
  claimed_at: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  claimed_by: text('claimed_by'),
  next_attempt_at: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
  external_message_id: text('external_message_id'),
}, (t) => [
  index('idx_discord_player_reminder_queue_scheduled').on(t.scheduled_for),
  index('idx_discord_player_reminder_queue_status').on(t.status),
  check('discord_player_reminder_queue_status_check', sql`${t.status} IN ('pending', 'processing', 'completed', 'failed')`),
]);

export const discordReminderQueue = pgTable('discord_reminder_queue', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  reminder_type: text('reminder_type').notNull(),
  minutes_before: integer('minutes_before').notNull(),
  reminder_time: timestamp('reminder_time', { withTimezone: true, mode: 'date' }),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default("pending"),
  attempts: integer('attempts').notNull().default(0),
  scheduled_for: timestamp('scheduled_for', { withTimezone: true, mode: 'date' }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  processed_at: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  sent_at: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
  last_error: text('last_error'),
  max_attempts: integer('max_attempts').notNull().default(5),
  claimed_at: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  claimed_by: text('claimed_by'),
  next_attempt_at: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
  external_message_id: text('external_message_id'),
}, (t) => [
  uniqueIndex('idx_discord_reminder_queue_unique_match_reminder').on(t.match_id, t.reminder_type).where(sql`${t.status} NOT IN ('failed')`),
  index('idx_discord_reminder_queue_scheduled').on(t.scheduled_for),
  index('idx_discord_reminder_queue_status').on(t.status),
  check('discord_reminder_queue_status_check', sql`${t.status} IN ('pending', 'processing', 'completed', 'failed')`),
]);

export const discordScoreNotificationQueue = pgTable('discord_score_notification_queue', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  game_id: text('game_id').notNull().references(() => matchGames.id, { onDelete: 'cascade' }),
  map_id: text('map_id'),
  game_number: integer('game_number'),
  winner: text('winner'),
  winning_team_name: text('winning_team_name'),
  winning_players: jsonb('winning_players').$type<string[]>(),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default("pending"),
  attempts: integer('attempts').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  processed_at: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  sent_at: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
  last_error: text('last_error'),
  max_attempts: integer('max_attempts').notNull().default(5),
  claimed_at: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  claimed_by: text('claimed_by'),
  next_attempt_at: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
  external_message_id: text('external_message_id'),
}, (t) => [
  index('idx_discord_score_notification_queue_status').on(t.status),
  check('discord_score_notification_queue_status_check', sql`${t.status} IN ('pending', 'processing', 'completed', 'failed')`),
]);

export const discordScorecardPromptQueue = pgTable('discord_scorecard_prompt_queue', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  match_game_id: text('match_game_id').notNull().references(() => matchGames.id, { onDelete: 'cascade' }),
  map_name: text('map_name'),
  status: text('status', { enum: ['pending', 'processing', 'sent', 'failed'] }).notNull().default("pending"),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
  attempts: integer('attempts').notNull().default(0),
  max_attempts: integer('max_attempts').notNull().default(5),
  claimed_at: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  claimed_by: text('claimed_by'),
  last_error: text('last_error'),
  next_attempt_at: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
  external_message_id: text('external_message_id'),
  processed_at: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
}, (t) => [
  index('idx_discord_scorecard_prompt_queue_status').on(t.status),
  check('discord_scorecard_prompt_queue_status_check', sql`${t.status} IN ('pending', 'processing', 'sent', 'failed')`),
]);

export const discordStatsReportQueue = pgTable('discord_stats_report_queue', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default("pending"),
  last_error: text('last_error'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  processed_at: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  attempts: integer('attempts').notNull().default(0),
  max_attempts: integer('max_attempts').notNull().default(5),
  claimed_at: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  claimed_by: text('claimed_by'),
  next_attempt_at: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
}, (t) => [
  unique('discord_stats_report_queue_match_id_unique').on(t.match_id),
  check('discord_stats_report_queue_status_check', sql`${t.status} IN ('pending', 'processing', 'completed', 'failed')`),
]);

export const discordStatusUpdateQueue = pgTable('discord_status_update_queue', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  new_status: text('new_status'),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default("pending"),
  attempts: integer('attempts').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  processed_at: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  last_error: text('last_error'),
  max_attempts: integer('max_attempts').notNull().default(5),
  claimed_at: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  claimed_by: text('claimed_by'),
  next_attempt_at: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
}, (t) => [
  index('idx_discord_status_update_queue_status').on(t.status),
  check('discord_status_update_queue_status_check', sql`${t.status} IN ('pending', 'processing', 'completed', 'failed')`),
]);

export const discordVoiceAnnouncementQueue = pgTable('discord_voice_announcement_queue', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  announcement_type: text('announcement_type').notNull(),
  blue_team_voice_channel: text('blue_team_voice_channel'),
  red_team_voice_channel: text('red_team_voice_channel'),
  first_team: text('first_team'),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default("pending"),
  attempts: integer('attempts').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  processed_at: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
  completed_at: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  last_error: text('last_error'),
  timeout_at: timestamp('timeout_at', { withTimezone: true, mode: 'date' }),
  first_attempted_at: timestamp('first_attempted_at', { withTimezone: true, mode: 'date' }),
  max_attempts: integer('max_attempts').notNull().default(5),
  claimed_at: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  claimed_by: text('claimed_by'),
  next_attempt_at: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
}, (t) => [
  check('discord_voice_announcement_queue_status_check', sql`${t.status} IN ('pending', 'processing', 'completed', 'failed')`),
]);

export const discordWinnerVoteQueue = pgTable('discord_winner_vote_queue', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  match_game_id: text('match_game_id').notNull().references(() => matchGames.id, { onDelete: 'cascade' }),
  map_name: text('map_name'),
  status: text('status', { enum: ['pending', 'processing', 'sent', 'failed'] }).notNull().default("pending"),
  attempts: integer('attempts').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
  max_attempts: integer('max_attempts').notNull().default(5),
  claimed_at: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  claimed_by: text('claimed_by'),
  last_error: text('last_error'),
  next_attempt_at: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
  external_message_id: text('external_message_id'),
  processed_at: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
}, (t) => [
  index('idx_winner_vote_queue_status').on(t.status, t.created_at),
  check('discord_winner_vote_queue_status_check', sql`${t.status} IN ('pending', 'processing', 'sent', 'failed')`),
]);

export const statsImageQueue = pgTable('stats_image_queue', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default("pending"),
  last_error: text('last_error'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
  attempts: integer('attempts').notNull().default(0),
  max_attempts: integer('max_attempts').notNull().default(5),
  claimed_at: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  claimed_by: text('claimed_by'),
  next_attempt_at: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
  processed_at: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
}, (t) => [
  index('idx_stats_image_queue_status').on(t.status),
  check('stats_image_queue_status_check', sql`${t.status} IN ('pending', 'processing', 'completed', 'failed')`),
]);

export const statsProcessingQueue = pgTable('stats_processing_queue', {
  id: text('id').primaryKey(),
  submission_id: text('submission_id').notNull().references(() => scorecardSubmissions.id, { onDelete: 'cascade' }),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  match_game_id: text('match_game_id').notNull().references(() => matchGames.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default("pending"),
  last_error: text('last_error'),
  attempts: integer('attempts').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
  max_attempts: integer('max_attempts').notNull().default(5),
  claimed_at: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  claimed_by: text('claimed_by'),
  next_attempt_at: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
  processed_at: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
}, (t) => [
  index('idx_stats_processing_queue_status').on(t.status),
  check('stats_processing_queue_status_check', sql`${t.status} IN ('pending', 'processing', 'completed', 'failed')`),
]);
