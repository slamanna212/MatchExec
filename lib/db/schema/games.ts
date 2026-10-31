// Initially generated from the SQLite baseline (Stage 0.5); now maintained by hand.
import { pgTable, text, integer, boolean, timestamp, date, jsonb, index, primaryKey, foreignKey } from 'drizzle-orm/pg-core';
import type { PositionScoringConfig } from './types';

export const dataVersions = pgTable('data_versions', {
  game_id: text('game_id').primaryKey().references(() => games.id, { onDelete: 'cascade' }),
  data_version: text('data_version').notNull(),
  seeded_at: timestamp('seeded_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const gameMaps = pgTable('game_maps', {
  id: text('id').notNull(),
  game_id: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  mode_id: text('mode_id'),
  image_url: text('image_url'),
  location: text('location'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
  tournament_enabled: boolean('tournament_enabled').notNull().default(true),
}, (t) => [
  primaryKey({ columns: [t.id, t.game_id] }),
  index('idx_game_maps_mode_id').on(t.mode_id, t.game_id),
  index('idx_game_maps_game_id').on(t.game_id),
  foreignKey({ columns: [t.mode_id, t.game_id], foreignColumns: [gameModes.id, gameModes.game_id], name: 'game_maps_mode_fk' }),
]);

export const gameModes = pgTable('game_modes', {
  id: text('id').notNull(),
  game_id: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  team_size: integer('team_size').default(1),
  max_teams: integer('max_teams').notNull().default(2),
  scoring_type: text('scoring_type').notNull().default("Normal"),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
  max_players: integer('max_players'),
  setup_components: jsonb('setup_components').$type<string[]>(),
}, (t) => [
  primaryKey({ columns: [t.id, t.game_id] }),
  index('idx_game_modes_game_id').on(t.game_id),
]);

export const gameStatDefinitions = pgTable('game_stat_definitions', {
  id: text('id').notNull(),
  game_id: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  display_name: text('display_name').notNull(),
  stat_type: text('stat_type').notNull().default("number"),
  category: text('category'),
  sort_order: integer('sort_order').notNull().default(0),
  is_primary: boolean('is_primary').notNull().default(false),
  format: text('format'),
  chart_type: text('chart_type').notNull().default("bar"),
}, (t) => [
  primaryKey({ columns: [t.id, t.game_id] }),
]);

export const games = pgTable('games', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  genre: text('genre'),
  developer: text('developer'),
  release_date: date('release_date', { mode: 'string' }),
  version: text('version'),
  description: text('description'),
  min_players: integer('min_players'),
  max_players: integer('max_players'),
  max_signups: integer('max_signups'),
  icon_url: text('icon_url'),
  cover_url: text('cover_url'),
  color: text('color'),
  supports_all_modes: boolean('supports_all_modes').notNull().default(false),
  map_codes_supported: boolean('map_codes_supported').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
  scoring_config: jsonb('scoring_config').$type<PositionScoringConfig>(),
  ai_screenshot_notes: text('ai_screenshot_notes'),
}, (t) => [
  index('idx_games_name').on(t.name),
]);

export const voiceDataVersions = pgTable('voice_data_versions', {
  voice_type: text('voice_type').primaryKey(),
  data_version: text('data_version').notNull(),
  seeded_at: timestamp('seeded_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const voices = pgTable('voices', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});
