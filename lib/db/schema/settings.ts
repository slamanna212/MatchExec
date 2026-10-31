// Initially generated from the SQLite baseline (Stage 0.5); now maintained by hand.
import { pgTable, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const appSettings = pgTable('app_settings', {
  setting_key: text('setting_key').primaryKey(),
  setting_value: text('setting_value').notNull(),
  data_type: text('data_type').notNull().default("string"),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index('idx_app_settings_data_type').on(t.data_type),
]);

export const schedulerSettings = pgTable('scheduler_settings', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  match_cleanup_cron: text('match_cleanup_cron').notNull().default("0 2 * * *"),
  match_check_cron: text('match_check_cron').notNull().default("*/5 * * * *"),
  reminder_check_cron: text('reminder_check_cron').notNull().default("*/5 * * * *"),
  cleanup_check_cron: text('cleanup_check_cron').notNull().default("0 3 * * *"),
  channel_refresh_cron: text('channel_refresh_cron').notNull().default("0 */6 * * *"),
  queue_processing_cron: text('queue_processing_cron').notNull().default("*/30 * * * * *"),
  cleanup_retention_days: integer('cleanup_retention_days').notNull().default(30),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const uiSettings = pgTable('ui_settings', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  theme: text('theme').notNull().default("dark"),
  language: text('language').notNull().default("en"),
  timezone: text('timezone').notNull().default("UTC"),
  date_format: text('date_format').notNull().default("YYYY-MM-DD"),
  time_format: text('time_format').notNull().default("24h"),
  auto_refresh_interval_seconds: integer('auto_refresh_interval_seconds').notNull().default(30),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
});
