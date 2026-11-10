/**
 * Cross-site request forgery guard for `/api/*`.
 *
 * Authentication is opt-in, so on a default install any web page the admin opens could otherwise POST to the LAN
 * address of MatchExec (a `text/plain` "simple" request needs no CORS preflight, and the routes parse the body as JSON
 * whatever its content type). With auth on, the `SameSite=Lax` cookie only stops other *sites*: another app on the same
 * host but a different port is same-site and would still get the cookie.
 *
 * Rule for state-changing methods (everything except GET/HEAD/OPTIONS):
 *  - `Sec-Fetch-Site` present (every current browser): only `same-origin` (or `none`, a user-initiated request) passes.
 *  - otherwise, `Origin` present (older browsers): its host must equal the request host (or `X-Forwarded-Host` behind a
 *    trusted proxy, see `TRUST_PROXY`).
 *  - neither header: not a browser (the bot / scheduler with `x-internal-token`, curl, scripts) -> allowed; browsers
 *    always send one of them on a cross-origin write.
 */
import type { Context, MiddlewareHandler } from 'hono';
import { trustedProxyHops } from './rate-limit';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function allowedHosts(c: Context): Set<string> {
  const hosts = new Set<string>();
  const host = c.req.header('host');
  if (host) hosts.add(host.toLowerCase());
  try {
    hosts.add(new URL(c.req.url).host.toLowerCase());
  } catch { /* ignore */ }
  if (trustedProxyHops() > 0) {
    const forwarded = c.req.header('x-forwarded-host');
    if (forwarded) for (const h of forwarded.split(',')) hosts.add(h.trim().toLowerCase());
  }
  return hosts;
}

/** True when the request may change state (see the module comment). Exported for tests. */
export function isSameOriginRequest(c: Context): boolean {
  if (SAFE_METHODS.has(c.req.method)) return true;

  const site = c.req.header('sec-fetch-site');
  if (site) return site === 'same-origin' || site === 'none';

  const origin = c.req.header('origin');
  if (!origin) return true;
  if (origin === 'null') return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  return allowedHosts(c).has(originHost);
}

export const csrfGuard: MiddlewareHandler = async (c, next) => {
  if (!isSameOriginRequest(c)) return c.json({ error: 'Cross-site request blocked' }, 403);
  return next();
};
