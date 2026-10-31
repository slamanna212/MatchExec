// Initially generated from the SQLite baseline (Stage 0.5); now maintained by hand.
import { pgTable, text, integer, boolean, timestamp, index, unique, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { games } from './games';
import { matchGames, matchParticipants, matches } from './matches';

export const announcementRoleSettings = pgTable('announcement_role_settings', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  game_id: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  role_id: text('role_id').notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('idx_announcement_role_settings_game_id').on(t.game_id),
  unique('announcement_role_settings_game_id_role_id_unique').on(t.game_id, t.role_id),
]);

export const autoVoiceChannels = pgTable('auto_voice_channels', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull(),
  channel_id: text('channel_id').notNull(),
  team_name: text('team_name').notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('idx_auto_voice_channels_channel_id').on(t.channel_id),
  index('idx_auto_voice_channels_match_id').on(t.match_id),
]);

export const discordChannels = pgTable('discord_channels', {
  id: text('id').primaryKey(),
  guild_id: text('guild_id').notNull().references(() => discordSettings.guild_id, { onDelete: 'cascade' }),
  discord_channel_id: text('discord_channel_id').notNull(),
  name: text('name').notNull(),
  channel_name: text('channel_name'),
  type: integer('type').notNull(),
  channel_type: text('channel_type'),
  parent_id: text('parent_id'),
  send_announcements: boolean('send_announcements').notNull().default(true),
  send_reminders: boolean('send_reminders').notNull().default(true),
  send_match_start: boolean('send_match_start').notNull().default(true),
  send_signup_updates: boolean('send_signup_updates').notNull().default(true),
  last_name_refresh: timestamp('last_name_refresh', { withTimezone: true, mode: 'date' }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
  send_health_alerts: boolean('send_health_alerts').notNull().default(false),
}, (t) => [
  index('idx_discord_channels_guild_id').on(t.guild_id),
]);

export const discordEvents = pgTable('discord_events', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull(),
  event_id: text('event_id').notNull(),
  guild_id: text('guild_id').notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('idx_discord_events_match_id').on(t.match_id),
]);

export const discordMatchMessages = pgTable('discord_match_messages', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull(),
  message_id: text('message_id').notNull(),
  channel_id: text('channel_id').notNull(),
  thread_id: text('thread_id'),
  discord_event_id: text('discord_event_id'),
  message_type: text('message_type').notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('idx_discord_match_messages_match_id').on(t.match_id),
]);

export const discordSettings = pgTable('discord_settings', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  guild_id: text('guild_id').notNull(),
  bot_token: text('bot_token').notNull(),
  application_id: text('application_id'),
  command_prefix: text('command_prefix').notNull().default("!"),
  announcements_channel_id: text('announcements_channel_id'),
  results_channel_id: text('results_channel_id'),
  voice_channel_category_id: text('voice_channel_category_id'),
  announcement_role_id: text('announcement_role_id'),
  mention_everyone: boolean('mention_everyone').notNull().default(false),
  event_duration_minutes: integer('event_duration_minutes').notNull().default(45),
  match_reminder_minutes: integer('match_reminder_minutes').notNull().default(10),
  player_reminder_minutes: integer('player_reminder_minutes').notNull().default(120),
  announcer_voice: text('announcer_voice'),
  voice_announcements_enabled: boolean('voice_announcements_enabled').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
  voice_channel_cleanup_delay_minutes: integer('voice_channel_cleanup_delay_minutes').notNull().default(10),
  match_start_delay_seconds: integer('match_start_delay_seconds').notNull().default(5),
  winner_vote_enabled: boolean('winner_vote_enabled').notNull().default(true),
  signup_dm_enabled: boolean('signup_dm_enabled').notNull().default(true),
  commander_dm_enabled: boolean('commander_dm_enabled').notNull().default(true),
}, (t) => [
  unique('discord_settings_guild_id_unique').on(t.guild_id),
]);

export const discordWinnerVoteMessages = pgTable('discord_winner_vote_messages', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  match_game_id: text('match_game_id').notNull().references(() => matchGames.id, { onDelete: 'cascade' }),
  discord_user_id: text('discord_user_id').notNull(),
  discord_message_id: text('discord_message_id').notNull(),
  participant_id: text('participant_id').references(() => matchParticipants.id, { onDelete: 'set null' }),
  team_side: text('team_side', { enum: ['blue', 'red'] }),
  voted_for: text('voted_for', { enum: ['blue', 'red'] }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('idx_winner_vote_messages_msg').on(t.discord_message_id),
  index('idx_winner_vote_messages_game').on(t.match_game_id),
  check('discord_winner_vote_messages_team_side_check', sql`${t.team_side} IN ('blue', 'red')`),
  check('discord_winner_vote_messages_voted_for_check', sql`${t.voted_for} IN ('blue', 'red')`),
]);

export const teamVoiceChannels = pgTable('team_voice_channels', {
  id: text('id').primaryKey(),
  match_id: text('match_id').notNull(),
  team_name: text('team_name').notNull(),
  channel_id: text('channel_id').notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('idx_team_voice_channels_match_id').on(t.match_id),
  unique('team_voice_channels_match_id_team_name_unique').on(t.match_id, t.team_name),
]);
