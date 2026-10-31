import { customType, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/**
 * Uploaded files (event images, scorecard screenshots, stat images) stored in Postgres so that
 * bot / stats-processor / web can run in separate pods without a shared disk (plan 7.4).
 * `path` is the public URL path (e.g. `/uploads/events/abc.png`) and is unique.
 */
export const blobs = pgTable('blobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),
  owner_type: text('owner_type'),
  owner_id: text('owner_id'),
  path: text('path').notNull().unique('blobs_path_unique'),
  filename: text('filename').notNull(),
  content_type: text('content_type').notNull(),
  size: integer('size').notNull(),
  data: bytea('data').notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('idx_blobs_owner').on(t.owner_type, t.owner_id),
  index('idx_blobs_kind').on(t.kind),
]);
