/**
 * Opt-in admin authentication as Hono middleware (native port of src/lib/auth.ts `authGate`).
 * Enabled only when ADMIN_PASSWORD is set. Same exemptions, HMAC-signed session cookie and
 * `x-internal-token` header for bot/scheduler calls.
 */
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { sanitizeNext } from '@/lib/auth-shared';

export const SESSION_COOKIE = 'matchexec_session';
export const INTERNAL_TOKEN_HEADER = 'x-internal-token';

/** Paths reachable without a session (exact match or prefix + '/'). */
export const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/status',
  '/api/health',
  '/api/db-status',
  '/api/welcome-flow',
];

const encoder = new TextEncoder();

export function isAuthEnabled(): boolean {
  return !!process.env.ADMIN_PASSWORD;
}

export function getSessionMaxAgeSeconds(): number {
  const days = Number(process.env.AUTH_SESSION_DAYS);
  return (Number.isFinite(days) && days > 0 ? days : 7) * 24 * 60 * 60;
}

const toHex = (buf: ArrayBuffer): string => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(input)));
}

async function getSecret(): Promise<string> {
  return process.env.AUTH_SECRET || (await sha256Hex(process.env.ADMIN_PASSWORD ?? ''));
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
}

/** Constant-time string comparison (length is not hidden, content is). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/** Compare passwords without leaking length: hash both first. */
export async function verifyPassword(candidate: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const [a, b] = await Promise.all([sha256Hex(candidate), sha256Hex(expected)]);
  return timingSafeEqualStr(a, b);
}

/** Create a signed session token: `<issuedAtMs>.<expiresAtMs>.<signature>`. */
export async function createSessionToken(now = Date.now(), maxAgeSeconds = getSessionMaxAgeSeconds()): Promise<string> {
  const payload = `${now}.${now + maxAgeSeconds * 1000}`;
  return `${payload}.${await hmacHex(await getSecret(), payload)}`;
}

export async function verifySessionToken(token: string | undefined | null, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [iat, exp, sig] = parts;
  if (!/^\d+$/.test(iat) || !/^\d+$/.test(exp)) return false;
  const expected = await hmacHex(await getSecret(), `${iat}.${exp}`);
  if (!timingSafeEqualStr(sig, expected)) return false;
  return Number(exp) > now && Number(iat) <= now + 60_000;
}

/** Token for internal process-to-web calls. INTERNAL_API_TOKEN, else derived from the secret. */
export async function getInternalToken(): Promise<string> {
  return process.env.INTERNAL_API_TOKEN || (await sha256Hex(`${await getSecret()}:internal`));
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isSecureRequest(c: Context): boolean {
  const proto = c.req.header('x-forwarded-proto');
  return proto ? proto.split(',')[0].trim() === 'https' : new URL(c.req.url).protocol === 'https:';
}

export async function isRequestAuthenticated(c: Context): Promise<boolean> {
  if (await verifySessionToken(getCookie(c, SESSION_COOKIE))) return true;
  const internal = c.req.header(INTERNAL_TOKEN_HEADER);
  return !!internal && timingSafeEqualStr(internal, await getInternalToken());
}

/** Gate for every request: 401 JSON for /api/*, redirect to /login?next=... for pages. */
export const authGate: MiddlewareHandler = async (c, next) => {
  if (!isAuthEnabled()) return next();
  const { pathname, search } = new URL(c.req.url);
  if (isPublicPath(pathname)) return next();
  if (await isRequestAuthenticated(c)) return next();
  if (pathname.startsWith('/api/')) return c.json({ error: 'Unauthorized' }, 401);
  const url = new URL('/login', c.req.url);
  url.searchParams.set('next', sanitizeNext(pathname + search));
  return c.redirect(url.toString(), 302);
};
