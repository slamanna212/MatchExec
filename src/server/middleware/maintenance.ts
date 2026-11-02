/**
 * Web side of the restore coordination (plan 6.4).
 *
 *  - counts requests in flight (the web process reports itself "idle" to the restore only when this is 0),
 *  - while a restore is draining (`maintenance`) rejects every write with 503,
 *  - while it is swapping data (`restoring`) rejects every API/upload request except health and status with 503, so nothing
 *    reads a half-swapped database. The SPA's static files are always served so the page can show a message.
 */
import type { Context, MiddlewareHandler } from 'hono';
import { getLocalState } from '@lib/maintenance';

let inflight = 0;
const releasers = new WeakMap<Request, () => void>();

export function inflightRequests(): number {
  return inflight;
}

/** Release the current request from the in-flight count (the restore request itself must not wait for itself). */
export function releaseInflight(c: Context): void {
  releasers.get(c.req.raw)?.();
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALWAYS_ALLOWED = ['/api/health', '/api/db-status', '/api/settings/restore/status'];

function allowedDuringRestore(path: string): boolean {
  if (ALWAYS_ALLOWED.some((p) => path === p || path.startsWith(`${p}/`))) return true;
  return !(path.startsWith('/api/') || path.startsWith('/uploads/'));
}

export const maintenanceGate: MiddlewareHandler = async (c, next) => {
  const state = getLocalState();
  if (state !== 'normal') {
    const path = c.req.path;
    const blocked = state === 'restoring' ? !allowedDuringRestore(path) : (!SAFE_METHODS.has(c.req.method) && path.startsWith('/api/') && !ALWAYS_ALLOWED.includes(path));
    if (blocked) {
      c.header('Retry-After', '5');
      return c.json({ error: 'MatchExec is restoring a backup. Please try again in a moment.', maintenance: true }, 503);
    }
  }
  inflight++;
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    inflight--;
  };
  releasers.set(c.req.raw, release);
  try {
    return await next();
  } finally {
    release();
  }
};
