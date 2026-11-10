/**
 * Opt-in admin authentication as Hono middleware (native port of src/lib/auth.ts `authGate`).
 * Enabled only when ADMIN_PASSWORD is set. Same exemptions, HMAC-signed session cookie and
 * `x-internal-token` header for bot/scheduler calls.
 */
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq, sql } from 'drizzle-orm';
import { sanitizeNext } from '@/lib/auth-shared';
import { db } from '../../../lib/db';
import { appSettings } from '../../../lib/db/schema';

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
];

/** Paths readable without a session (GET/HEAD only): the welcome flow state. Writing it needs a session like everything else. */
export const PUBLIC_READ_PATHS = ['/api/welcome-flow'];

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

// ─── Session revocation ───────────────────────────────────────────────────────
//
// Every token is signed together with the current session epoch (`app_settings.auth_session_epoch`). "Log out everywhere"
// bumps the epoch, so every token issued before stops verifying. Epoch 0 (never bumped) signs exactly like the original
// `<iat>.<exp>` format, so existing sessions survive the upgrade. When AUTH_SECRET is set (so the signing key does not change
// with the password), a fingerprint of ADMIN_PASSWORD is signed too: changing the password logs every session out.

export const SESSION_EPOCH_KEY = 'auth_session_epoch';
const EPOCH_CACHE_MS = 5_000;
let epochCache: { value: number; at: number } | null = null;

/** Current session epoch (cached for a few seconds; the last known value, else 0, when the database is unreachable). */
export async function getSessionEpoch(now = Date.now()): Promise<number> {
  if (epochCache && now - epochCache.at < EPOCH_CACHE_MS) return epochCache.value;
  try {
    const [row] = await db.select({ v: appSettings.setting_value }).from(appSettings).where(eq(appSettings.setting_key, SESSION_EPOCH_KEY)).limit(1);
    const n = Number.parseInt(row?.v ?? '0', 10);
    epochCache = { value: Number.isFinite(n) && n > 0 ? n : 0, at: now };
  } catch {
    epochCache = { value: epochCache?.value ?? 0, at: now };
  }
  return epochCache.value;
}

/** Invalidate every session issued so far. Returns the new epoch. */
export async function bumpSessionEpoch(): Promise<number> {
  const [row] = await db
    .insert(appSettings)
    .values({ setting_key: SESSION_EPOCH_KEY, setting_value: '1', data_type: 'number' })
    .onConflictDoUpdate({
      target: appSettings.setting_key,
      set: { setting_value: sql`((coalesce(nullif(${appSettings.setting_value}, ''), '0'))::int + 1)::text`, updated_at: new Date() },
    })
    .returning({ v: appSettings.setting_value });
  const value = Number.parseInt(row.v, 10);
  epochCache = { value, at: Date.now() };
  return value;
}

/** Tests: forget the cached epoch. */
export function resetSessionEpochCache(): void {
  epochCache = null;
}

async function signedPayload(iat: string, exp: string, epoch: number): Promise<string> {
  let payload = `${iat}.${exp}`;
  if (epoch > 0) payload = `e${epoch}:${payload}`;
  if (process.env.AUTH_SECRET) payload = `p${(await sha256Hex(process.env.ADMIN_PASSWORD ?? '')).slice(0, 16)}:${payload}`;
  return payload;
}

/** Create a signed session token: `<issuedAtMs>.<expiresAtMs>.<signature>`. */
export async function createSessionToken(now = Date.now(), maxAgeSeconds = getSessionMaxAgeSeconds()): Promise<string> {
  const iat = String(now);
  const exp = String(now + maxAgeSeconds * 1000);
  const sig = await hmacHex(await getSecret(), await signedPayload(iat, exp, await getSessionEpoch()));
  return `${iat}.${exp}.${sig}`;
}

export async function verifySessionToken(token: string | undefined | null, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [iat, exp, sig] = parts;
  if (!/^\d+$/.test(iat) || !/^\d+$/.test(exp)) return false;
  const expected = await hmacHex(await getSecret(), await signedPayload(iat, exp, await getSessionEpoch()));
  if (!timingSafeEqualStr(sig, expected)) return false;
  return Number(exp) > now && Number(iat) <= now + 60_000;
}

/** Token for internal process-to-web calls. INTERNAL_API_TOKEN, else derived from the secret. */
export async function getInternalToken(): Promise<string> {
  return process.env.INTERNAL_API_TOKEN || (await sha256Hex(`${await getSecret()}:internal`));
}

const matchesPath = (pathname: string, p: string): boolean => pathname === p || pathname.startsWith(`${p}/`);

/** Reachable without a session. `PUBLIC_READ_PATHS` only for GET/HEAD (the method defaults to GET). */
export function isPublicPath(pathname: string, method = 'GET'): boolean {
  if (PUBLIC_PATHS.some((p) => matchesPath(pathname, p))) return true;
  return (method === 'GET' || method === 'HEAD') && PUBLIC_READ_PATHS.some((p) => matchesPath(pathname, p));
}

/**
 * Static files the login page (and the browser chrome) need before there is a session: the Vite bundle under
 * `/static/`, the web manifest, and image files by extension (the old Next matcher excluded the same set). Never under `/api/`.
 */
export const STATIC_ASSET_PREFIX = '/static/';
const STATIC_ASSET_FILE = /\.(?:svg|png|ico|webp|jpe?g|gif)$/i;
export function isStaticAssetPath(pathname: string): boolean {
  if (pathname.startsWith('/api/')) return false;
  return pathname.startsWith(STATIC_ASSET_PREFIX) || pathname === '/manifest.json' || STATIC_ASSET_FILE.test(pathname);
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
  if (isPublicPath(pathname, c.req.method) || isStaticAssetPath(pathname)) return next();
  if (await isRequestAuthenticated(c)) return next();
  if (pathname.startsWith('/api/')) return c.json({ error: 'Unauthorized' }, 401);
  const url = new URL('/login', c.req.url);
  url.searchParams.set('next', sanitizeNext(pathname + search));
  return c.redirect(url.toString(), 302);
};
