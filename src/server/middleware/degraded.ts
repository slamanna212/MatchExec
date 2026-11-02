/**
 * Degraded mode (plan 7.2): the all-in-one container's migrate service failed (for example the SQLite import preflight).
 * Instead of starting nothing, the s6 web service starts with `MATCHEXEC_DEGRADED=true` and serves only the SPA files plus
 * `/api/health` (503) and `/api/db-status` (which reports the error stored in `system_status`, shown by the loading
 * screen). Every other API call and `/uploads` answer 503. The next container start retries the migration.
 */
import type { MiddlewareHandler } from 'hono';

export function isDegraded(env: Record<string, string | undefined> = process.env): boolean {
  return env.MATCHEXEC_DEGRADED === 'true';
}

const ALLOWED = ['/api/health', '/api/db-status'];

export const degradedGate: MiddlewareHandler = async (c, next) => {
  if (!isDegraded()) return next();
  const path = c.req.path;
  const apiOrUpload = path === '/api' || path.startsWith('/api/') || path.startsWith('/uploads/');
  if (!apiOrUpload || ALLOWED.some((p) => path === p || path.startsWith(`${p}/`))) return next();
  c.header('Retry-After', '30');
  return c.json({ error: 'MatchExec could not finish preparing its database. See the web page or the container log for details.', degraded: true }, 503);
};
