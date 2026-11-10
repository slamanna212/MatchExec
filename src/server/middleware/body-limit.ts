/**
 * Request body size limits for `/api/*`, enforced while the body streams in (Hono `bodyLimit`), so an oversized or
 * never-ending upload is cut off instead of being buffered in full by `c.req.formData()` / `c.req.json()`.
 *
 * Upload routes get their own file limit plus room for the multipart envelope; the routes keep their own, more precise
 * checks and error messages for files just over the limit. Everything else (JSON) gets `DEFAULT_LIMIT`.
 */
import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';

const MB = 1024 * 1024;
/** Headroom on top of an upload route's file limit for the multipart envelope and the other form fields. */
const MULTIPART_SLACK = 2 * MB;
export const DEFAULT_LIMIT = 2 * MB;

/** Same knob as the restore route (`MATCHEXEC_RESTORE_MAX_MB`, default 100). */
const restoreMaxBytes = (): number => (Number.parseInt(process.env.MATCHEXEC_RESTORE_MAX_MB ?? '', 10) || 100) * MB;

const RULES: Array<{ pattern: RegExp; max: () => number }> = [
  { pattern: /^\/api\/upload\/event-image$/, max: () => 5 * MB + MULTIPART_SLACK },
  { pattern: /^\/api\/matches\/[^/]+\/scorecard\/?$/, max: () => 10 * MB + MULTIPART_SLACK },
  { pattern: /^\/api\/debug\/scoring-ai-test$/, max: () => 10 * MB + MULTIPART_SLACK },
  { pattern: /^\/api\/settings\/restore\/?$/, max: () => restoreMaxBytes() + MULTIPART_SLACK },
];

export function bodyLimitFor(path: string): number {
  return RULES.find((r) => r.pattern.test(path))?.max() ?? DEFAULT_LIMIT;
}

const limiters = new Map<number, MiddlewareHandler>();
function limiter(maxSize: number): MiddlewareHandler {
  let handler = limiters.get(maxSize);
  if (!handler) {
    handler = bodyLimit({
      maxSize,
      onError: (c) => c.json({ error: `Request body too large (max ${Math.round(maxSize / MB)} MB)` }, 413),
    });
    limiters.set(maxSize, handler);
  }
  return handler;
}

export const requestBodyLimit: MiddlewareHandler = async (c, next) => {
  const method = c.req.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  return limiter(bodyLimitFor(c.req.path))(c, next);
};
