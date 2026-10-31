// Initially generated from the SQLite baseline (Stage 0.5); now maintained by hand.
import { pgTable, text, integer, doublePrecision, boolean, timestamp, jsonb, index, uniqueIndex, unique, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { games } from './games';
import { matches } from './matches';
import { tournaments } from './tournaments';

export const series = pgTable('series', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status', { enum: ['created', 'active', 'complete', 'cancelled'] }).notNull().default("created"),
  scoring_config: jsonb('scoring_config').$type<Record<string, unknown>>(),
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
  check('series_status_check', sql`${t.status} IN ('created', 'active', 'complete', 'cancelled')`),
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
}, (t) => [
  uniqueIndex('idx_series_events_unique_tournament').on(t.series_id, t.tournament_id).where(sql`${t.tournament_id} IS NOT NULL`),
  uniqueIndex('idx_series_events_unique_match').on(t.series_id, t.match_id).where(sql`${t.match_id} IS NOT NULL`),
  index('idx_series_events_tournament').on(t.tournament_id),
  index('idx_series_events_match').on(t.match_id),
  index('idx_series_events_series').on(t.series_id),
  unique('series_events_series_id_event_order_unique').on(t.series_id, t.event_order),
  check('series_events_event_type_check', sql`${t.event_type} IN ('match', 'tournament')`),
  check('series_events_event_type_target_check', sql`(${t.event_type} = 'match' AND ${t.match_id} IS NOT NULL AND ${t.tournament_id} IS NULL) OR (${t.event_type} = 'tournament' AND ${t.tournament_id} IS NOT NULL AND ${t.match_id} IS NULL)`),
]);
