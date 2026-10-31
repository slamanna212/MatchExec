// Initially generated from the SQLite baseline (Stage 0.5); now maintained by hand.
import { pgTable, text, integer, boolean, timestamp, jsonb, index, unique, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { matches } from './matches';
import { tournaments } from './tournaments';

export const activityFeed = pgTable('activity_feed', {
  id: text('id').primaryKey(),
  event_type: text('event_type').notNull(),
  priority: integer('priority').notNull().default(3),
  title: text('title').notNull(),
  description: text('description'),
  match_id: text('match_id').references(() => matches.id, { onDelete: 'set null' }),
  tournament_id: text('tournament_id').references(() => tournaments.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('idx_activity_feed_tournament_id').on(t.tournament_id),
  index('idx_activity_feed_match_id').on(t.match_id),
  index('idx_activity_feed_priority').on(t.priority),
  index('idx_activity_feed_created_at').on(t.created_at.desc()),
]);

export const healthAlertsSent = pgTable('health_alerts_sent', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  alert_type: text('alert_type').notNull(),
  last_sent_at: timestamp('last_sent_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('idx_health_alerts_sent_alert_type').on(t.alert_type),
  unique('health_alerts_sent_alert_type_unique').on(t.alert_type),
]);

/**
 * Single-row readiness/progress record. Replaces `.db-status.json` so it works across pods.
 * Always row id = 1 (enforced by the check constraint); upsert with `lib/db/system-status.ts`.
 */
export const systemStatus = pgTable('system_status', {
  id: integer('id').primaryKey().default(1),
  phase: text('phase', { enum: ['starting', 'migrating', 'seeding', 'importing', 'ready', 'error'] }).notNull().default('starting'),
  message: text('message').notNull().default(''),
  progress: integer('progress').notNull().default(0),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  imported_from_sqlite: boolean('imported_from_sqlite').notNull().default(false),
  /** Room for the SQLite importer's error / repair report (Stage 5). */
  report: jsonb('report').$type<Record<string, unknown>>(),
}, (t) => [
  check('system_status_singleton_check', sql`${t.id} = 1`),
]);
