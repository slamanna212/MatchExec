// Initially generated from the SQLite baseline (Stage 0.5); now maintained by hand.
import { pgTable, text, integer, doublePrecision, boolean, timestamp, jsonb, index, uniqueIndex, unique, check, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { games } from './games';
import { matches } from './matches';
import { tournaments } from './tournaments';
import type {
  SeriesDiscordConfig, SeriesMatchDefaults, SeriesScoringConfig, SeriesSeedingRule,
} from '../../../shared/series-types';

export const series = pgTable('series', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status', { enum: ['created', 'registration', 'active', 'complete', 'cancelled'] }).notNull().default("created"),
  entrant_type: text('entrant_type', { enum: ['solo', 'team'] }).notNull().default("solo"),
  roster_min: integer('roster_min'),
  roster_max: integer('roster_max'),
  scoring_type: text('scoring_type', { enum: ['Normal', 'FFA', 'Position'] }),
  game_ids: jsonb('game_ids').$type<string[]>().notNull().default([]),
  game_mode_id: text('game_mode_id'),
  match_defaults: jsonb('match_defaults').$type<SeriesMatchDefaults>(),
  discord_config: jsonb('discord_config').$type<SeriesDiscordConfig>(),
  previous_series_id: text('previous_series_id').references((): AnyPgColumn => series.id, { onDelete: 'set null' }),
  scoring_config: jsonb('scoring_config').$type<SeriesScoringConfig>(),
  start_date: timestamp('start_date', { withTimezone: true, mode: 'date' }),
  end_date: timestamp('end_date', { withTimezone: true, mode: 'date' }),
  event_image_url: text('event_image_url'),
  game_id: text('game_id').references(() => games.id, { onDelete: 'set null' }),
  guild_id: text('guild_id'),
  channel_id: text('channel_id'),
  announcements: boolean('announcements').notNull().default(true),
  player_notifications: boolean('player_notifications').notNull().default(true),
  livestream_link: text('livestream_link'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index('idx_series_status').on(t.status),
  index('idx_series_game_id').on(t.game_id),
  index('idx_series_previous').on(t.previous_series_id).where(sql`${t.previous_series_id} IS NOT NULL`),
  check('series_status_check', sql`${t.status} IN ('created', 'registration', 'active', 'complete', 'cancelled')`),
  check('series_entrant_type_check', sql`${t.entrant_type} IN ('solo', 'team')`),
  check('series_scoring_type_check', sql`${t.scoring_type} IS NULL OR ${t.scoring_type} IN ('Normal', 'FFA', 'Position')`),
]);

export const seriesEntrants = pgTable('series_entrants', {
  id: text('id').primaryKey(),
  series_id: text('series_id').notNull().references(() => series.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tag: text('tag'),
  color: text('color'),
  logo_url: text('logo_url'),
  division: text('division'),
  seed: integer('seed'),
  status: text('status', { enum: ['pending', 'active', 'withdrawn'] }).notNull().default("active"),
  /** The entrant this one was copied from (previous season); no FK so the source series can be deleted. */
  source_entrant_id: text('source_entrant_id'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique('series_entrants_series_id_name_unique').on(t.series_id, t.name),
  check('series_entrants_status_check', sql`${t.status} IN ('pending', 'active', 'withdrawn')`),
]);

export const seriesEntrantMembers = pgTable('series_entrant_members', {
  id: text('id').primaryKey(),
  entrant_id: text('entrant_id').notNull().references(() => seriesEntrants.id, { onDelete: 'cascade' }),
  /** Denormalised from the entrant so "one current roster per player per series" can be a unique index. */
  series_id: text('series_id').notNull().references(() => series.id, { onDelete: 'cascade' }),
  user_id: text('user_id').notNull(),
  discord_user_id: text('discord_user_id'),
  username: text('username').notNull(),
  /** Discord avatar URL captured when the player was added; kept fresh by the scheduler's avatar job. */
  avatar_url: text('avatar_url'),
  role: text('role', { enum: ['captain', 'player', 'sub'] }).notNull().default("player"),
  joined_at: timestamp('joined_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  left_at: timestamp('left_at', { withTimezone: true, mode: 'date' }),
}, (t) => [
  uniqueIndex('idx_series_entrant_members_current').on(t.series_id, t.user_id).where(sql`${t.left_at} IS NULL`),
  index('idx_series_entrant_members_entrant').on(t.entrant_id),
  index('idx_series_entrant_members_discord').on(t.discord_user_id),
  check('series_entrant_members_role_check', sql`${t.role} IN ('captain', 'player', 'sub')`),
]);

export const seriesStages = pgTable('series_stages', {
  id: text('id').primaryKey(),
  series_id: text('series_id').notNull().references(() => series.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  stage_order: integer('stage_order').notNull(),
  status: text('status', { enum: ['upcoming', 'active', 'complete'] }).notNull().default("upcoming"),
  counts_toward_season: boolean('counts_toward_season').notNull().default(true),
  scoring_config: jsonb('scoring_config').$type<SeriesScoringConfig>(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique('series_stages_series_id_stage_order_unique').on(t.series_id, t.stage_order),
  check('series_stages_status_check', sql`${t.status} IN ('upcoming', 'active', 'complete')`),
]);

export const seriesEventBatches = pgTable('series_event_batches', {
  id: text('id').primaryKey(),
  series_id: text('series_id').notNull().references(() => series.id, { onDelete: 'cascade' }),
  stage_id: text('stage_id').references(() => seriesStages.id, { onDelete: 'set null' }),
  kind: text('kind', { enum: ['round_robin', 'race_calendar'] }).notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('idx_series_event_batches_series').on(t.series_id),
  index('idx_series_event_batches_stage').on(t.stage_id).where(sql`${t.stage_id} IS NOT NULL`),
  check('series_event_batches_kind_check', sql`${t.kind} IN ('round_robin', 'race_calendar')`),
]);

export const seriesEvents = pgTable('series_events', {
  id: text('id').primaryKey(),
  series_id: text('series_id').notNull().references(() => series.id, { onDelete: 'cascade' }),
  event_type: text('event_type', { enum: ['match', 'tournament'] }).notNull(),
  match_id: text('match_id').references(() => matches.id, { onDelete: 'cascade' }),
  tournament_id: text('tournament_id').references(() => tournaments.id, { onDelete: 'cascade' }),
  event_order: integer('event_order').notNull(),
  event_date: timestamp('event_date', { withTimezone: true, mode: 'date' }),
  points_multiplier: doublePrecision('points_multiplier').notNull().default(1.0),
  stage_id: text('stage_id').references(() => seriesStages.id, { onDelete: 'set null' }),
  role: text('role', { enum: ['regular', 'stage_playoff', 'season_playoff', 'exhibition'] }).notNull().default("regular"),
  week: integer('week'),
  counts_for_standings: boolean('counts_for_standings').notNull().default(true),
  batch_id: text('batch_id').references(() => seriesEventBatches.id, { onDelete: 'set null' }),
  status: text('status', { enum: ['planned', 'live'] }).notNull().default("live"),
  entrant_ids: jsonb('entrant_ids').$type<string[]>(),
  seeding_rule: jsonb('seeding_rule').$type<SeriesSeedingRule>(),
}, (t) => [
  uniqueIndex('idx_series_events_unique_tournament').on(t.series_id, t.tournament_id).where(sql`${t.tournament_id} IS NOT NULL`),
  uniqueIndex('idx_series_events_unique_match').on(t.series_id, t.match_id).where(sql`${t.match_id} IS NOT NULL`),
  index('idx_series_events_tournament').on(t.tournament_id),
  index('idx_series_events_match').on(t.match_id),
  index('idx_series_events_batch').on(t.batch_id).where(sql`${t.batch_id} IS NOT NULL`),
  unique('series_events_series_id_event_order_unique').on(t.series_id, t.event_order),
  check('series_events_event_type_check', sql`${t.event_type} IN ('match', 'tournament')`),
  index('idx_series_events_stage').on(t.stage_id),
  check('series_events_role_check', sql`${t.role} IN ('regular', 'stage_playoff', 'season_playoff', 'exhibition')`),
  check('series_events_status_check', sql`${t.status} IN ('planned', 'live')`),
  check('series_events_event_type_target_check', sql`(${t.status} = 'planned' AND ${t.match_id} IS NULL AND ${t.tournament_id} IS NULL) OR (${t.status} = 'live' AND ((${t.event_type} = 'match' AND ${t.match_id} IS NOT NULL AND ${t.tournament_id} IS NULL) OR (${t.event_type} = 'tournament' AND ${t.tournament_id} IS NOT NULL AND ${t.match_id} IS NULL)))`),
]);
