/**
 * TRANSITIONAL: legacy-harness suites (tournaments, series, stats) used to import the Next route handlers of the matches
 * domain. Those routes are Hono routes now, so these shims forward a `Request` into the real app. Remove together with
 * the legacy SQLite harness once the tournaments / series / stats suites are ported.
 */
import { app } from '../../src/server/app';

export const forwardToApp = (request: Request, _context?: unknown): Promise<Response> => Promise.resolve(app.request(request));
