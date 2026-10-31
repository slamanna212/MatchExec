import { boolean, check, integer, pgSchema, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Control-plane tables used by backup/restore (plan 6.4). They live in a separate `control` schema that
 * is EXCLUDED from dumps (`pg_dump --schema=public`), so a restore never overwrites them.
 */
export const controlSchema = pgSchema('control');

/** Single row (id = 1). `state` = 'normal' | 'maintenance' | 'restoring'. */
export const controlMaintenance = controlSchema.table('maintenance', {
  id: integer('id').primaryKey().default(1),
  state: text('state', { enum: ['normal', 'maintenance', 'restoring'] }).notNull().default('normal'),
  reason: text('reason'),
  started_at: timestamp('started_at', { withTimezone: true, mode: 'date' }),
}, (t) => [
  check('maintenance_singleton_check', sql`${t.id} = 1`),
]);

/** One row per running worker process; workers heartbeat and acknowledge a pause request. */
export const controlWorkers = controlSchema.table('workers', {
  worker_id: text('worker_id').primaryKey(),
  service: text('service').notNull(),
  pid: integer('pid'),
  heartbeat_at: timestamp('heartbeat_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  paused_ack: boolean('paused_ack').notNull().default(false),
  started_at: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});
