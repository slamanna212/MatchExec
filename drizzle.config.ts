import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema/index.ts',
  out: './drizzle',
  // Keep the migrations table in `public` so it travels with `pg_dump --schema=public` dumps.
  migrations: { table: '__drizzle_migrations', schema: 'public' },
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://matchexec:matchexec@127.0.0.1:5432/matchexec',
  },
});
