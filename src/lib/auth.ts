/**
 * Opt-in admin authentication. Enabled only when ADMIN_PASSWORD is set.
 * Uses Web Crypto only so it runs in both the Next proxy/middleware and route handlers.
 * Do not import the logger or database here.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sanitizeNext } from './auth-shared';

export { sanitizeNext };

export const SESSION_COOKIE = 'matchexec_session';
export const INTERNAL_TOKEN_HEADER = 'x-internal-token';

/** Paths reachable without a session (exact match or prefix + '/'). */
const PUBLIC_PATHS = [
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

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(input)));
}

async function getSecret(): Promise<string> {
  return process.env.AUTH_SECRET || (await sha256Hex(process.env.ADMIN_PASSWORD ?? ''));
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
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
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

export function isSecureRequest(request: NextRequest): boolean {
  const proto = request.headers.get('x-forwarded-proto');
  return proto ? proto.split(',')[0].trim() === 'https' : request.nextUrl.protocol === 'https:';
}

export async function isRequestAuthenticated(request: NextRequest): Promise<boolean> {
  if (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return true;
  const internal = request.headers.get(INTERNAL_TOKEN_HEADER);
  if (internal && timingSafeEqualStr(internal, await getInternalToken())) return true;
  return false;
}

/**
 * Gate for the proxy/middleware. Returns a response to short-circuit
 * (401 / redirect), or null to let the request continue.
 */
export async function authGate(request: NextRequest): Promise<NextResponse | null> {
  if (!isAuthEnabled()) return null;
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return null;
  if (await isRequestAuthenticated(request)) return null;

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL('/login', request.url);
  url.searchParams.set('next', sanitizeNext(pathname + search));
  return NextResponse.redirect(url);
}
