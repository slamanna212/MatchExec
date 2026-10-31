/** Web server entrypoint. Migrations are run by the migrate service; here we only wait for the schema. */
import { serve } from '@hono/node-server';
import { waitForSchema } from '@lib/db/migrate';
import { closeDb } from '@lib/db';
import { logger } from '@/lib/logger';
import { app } from './app';

export function resolvePort(env: Record<string, string | undefined> = process.env): number {
  const n = Number.parseInt(env.PORT ?? '', 10);
  if (Number.isFinite(n) && n > 0) return n;
  return env.NODE_ENV === 'production' ? 3000 : 3001;
}

async function main(): Promise<void> {
  await waitForSchema();
  const port = resolvePort();
  const server = serve({ fetch: app.fetch, port, hostname: process.env.HOSTNAME || '0.0.0.0' }, (info) => {
    logger.info(`MatchExec server listening on port ${info.port}`);
  });
  const shutdown = () => {
    server.close(() => { void closeDb().finally(() => process.exit(0)); });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (!process.env.VITEST) {
  main().catch((err) => {
    logger.critical('[server] failed to start:', err);
    process.exit(1);
  });
}
