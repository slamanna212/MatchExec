/** Web server entrypoint. Migrations are run by the migrate service; here we only wait for the schema. */
import { serve } from '@hono/node-server';
import { waitForSchema } from '@lib/db/migrate';
import { closeDb } from '@lib/db';
import { logger } from '@/lib/logger';
import { startWorkerControl, type WorkerControl } from '@lib/maintenance';
import { app } from './app';
import { isDegraded } from './middleware/degraded';
import { inflightRequests } from './middleware/maintenance';

export function resolvePort(env: Record<string, string | undefined> = process.env): number {
  const n = Number.parseInt(env.PORT ?? '', 10);
  if (Number.isFinite(n) && n > 0) return n;
  return env.NODE_ENV === 'production' ? 3000 : 3001;
}

/** Interface the server binds to. Deliberately NOT `HOSTNAME` (Kubernetes sets that to the pod name). */
export function resolveBindHost(env: Record<string, string | undefined> = process.env): string {
  return env.BIND_HOST?.trim() || '0.0.0.0';
}

async function main(): Promise<void> {
  // Degraded mode (set by the s6 web service after a failed migration): serve only the SPA, /api/health and
  // /api/db-status so the loading screen can show the error stored in system_status. See middleware/degraded.ts.
  const degraded = isDegraded();
  let control: WorkerControl | null = null;
  if (degraded) {
    logger.error('[server] starting in DEGRADED mode: the database migration failed; only the loading screen is served');
  } else {
    await waitForSchema();
    // Restore coordination: heartbeat into control.workers; idle (for the restore) when no request is in flight
    control = startWorkerControl({
      service: 'web',
      busy: inflightRequests,
      log: (message, error) => logger.debug(`[worker-control] ${message}`, error),
    });
  }
  const port = resolvePort();
  const server = serve({ fetch: app.fetch, port, hostname: resolveBindHost() }, (info) => {
    logger.info(`MatchExec server listening on ${resolveBindHost()}:${info.port}`);
  });
  const shutdown = () => {
    server.close(() => { void (control?.stop() ?? Promise.resolve()).then(() => closeDb()).finally(() => process.exit(0)); });
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
