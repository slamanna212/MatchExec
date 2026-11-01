/**
 * HTTP primitives for the Hono server: HttpError, the shared onError handler and small response helpers.
 * The JSON error shape matches the old Next routes (`apiError`): `{ error: string }` with a status code.
 */
import type { Context, ErrorHandler, MiddlewareHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { logger } from '@/lib/logger';

export class HttpError extends Error {
  readonly status: ContentfulStatusCode;
  /** Optional extra fields merged into the JSON body next to `error`. */
  readonly extra?: Record<string, unknown>;

  constructor(status: ContentfulStatusCode, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.extra = extra;
  }

  static badRequest(message: string, extra?: Record<string, unknown>): HttpError { return new HttpError(400, message, extra); }
  static unauthorized(message = 'Unauthorized'): HttpError { return new HttpError(401, message); }
  static forbidden(message = 'Forbidden'): HttpError { return new HttpError(403, message); }
  static notFound(message = 'Not found'): HttpError { return new HttpError(404, message); }
  static conflict(message: string, extra?: Record<string, unknown>): HttpError { return new HttpError(409, message, extra); }
  static tooManyRequests(message: string): HttpError { return new HttpError(429, message); }
}

/** `{ error: message }` with a status (same body as the old `apiError`). */
export function jsonError(c: Context, message: string, status: ContentfulStatusCode = 500, extra?: Record<string, unknown>): Response {
  return c.json({ error: message, ...extra }, status);
}

/** `c.json(data, status)` mirror of the old `apiOk`. */
export function jsonOk<T>(c: Context, data: T, status: ContentfulStatusCode = 200): Response {
  return c.json(data, status);
}

export const onError: ErrorHandler = (err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.message, ...err.extra }, err.status);
  }
  if (err instanceof HTTPException) {
    // Thrown by Hono helpers/middleware; keep its status, normalise the body.
    return c.json({ error: err.message || 'Request failed' }, err.status as ContentfulStatusCode);
  }
  // Malformed JSON bodies surface as SyntaxError-like failures from c.req.json().
  if (err instanceof SyntaxError) {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  logger.error(`Unhandled error on ${c.req.method} ${c.req.path}:`, err);
  return c.json({ error: 'Internal server error' }, 500);
};

export const apiNotFound: NotFoundHandler = (c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ error: 'Not found' }, 404);
  return c.text('Not found', 404);
};

/** API responses must never be cached (polling relies on fresh data). Endpoints may override by setting the header themselves. */
export const noStore: MiddlewareHandler = async (c, next) => {
  await next();
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
};
