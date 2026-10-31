/**
 * Welcome-flow redirect (native port of the logic in src/proxy.ts).
 * Only HTML navigation requests (non-/api, non-asset, Accept: text/html) are redirected.
 */
import type { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import { db } from '@lib/db';
import { appSettings } from '@lib/db/schema';
import { isSystemReady } from '@lib/db/system-status';
import { logger } from '@/lib/logger';

export const WELCOME_COOKIE = 'welcome_flow_completed';
export const WELCOME_PATH = '/welcome';

export interface WelcomeState { dbReady: boolean; completed: boolean }

/** Reads welcome status straight from the database (no self-fetch of /api/welcome-flow). */
export async function getWelcomeState(): Promise<WelcomeState> {
  try {
    if (!(await isSystemReady())) return { dbReady: false, completed: false };
    const rows = await db.select({ v: appSettings.setting_value }).from(appSettings).where(eq(appSettings.setting_key, 'welcome_flow_completed')).limit(1);
    return { dbReady: true, completed: rows[0]?.v === 'true' };
  } catch (error) {
    logger.error('Error checking welcome status:', error);
    return { dbReady: false, completed: false };
  }
}

const hasFileExtension = (p: string) => /\.[a-z0-9]{1,8}$/i.test(p.split('/').pop() ?? '');

export function isHtmlNavigation(method: string, pathname: string, accept: string | undefined): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (pathname.startsWith('/api/') || pathname === '/api') return false;
  if (hasFileExtension(pathname)) return false;
  return !!accept && accept.includes('text/html');
}

export const welcomeFlow: MiddlewareHandler = async (c, next) => {
  const { pathname } = new URL(c.req.url);
  if (!isHtmlNavigation(c.req.method, pathname, c.req.header('accept'))) return next();
  // /login must stay reachable (the old proxy looped between /login and /welcome when auth was enabled).
  if (pathname === '/login' || pathname.startsWith('/login/')) return next();

  const isWelcomePath = pathname === WELCOME_PATH || pathname.startsWith(`${WELCOME_PATH}/`);
  const cookie = getCookie(c, WELCOME_COOKIE);
  let isComplete: boolean;
  let shouldSetCookie = false;
  if (cookie === 'true' || cookie === 'false') {
    isComplete = cookie === 'true';
  } else {
    const state = await getWelcomeState();
    if (!state.dbReady) return next(); // DB still initialising
    isComplete = state.completed;
    shouldSetCookie = true;
  }

  if (shouldSetCookie) {
    setCookie(c, WELCOME_COOKIE, isComplete ? 'true' : 'false', { path: '/', httpOnly: true, sameSite: 'Lax', maxAge: 60 * 60 * 24 * 30 });
  }
  if (isComplete && isWelcomePath) return c.redirect(new URL('/', c.req.url).toString(), 307);
  if (!isComplete && !isWelcomePath) return c.redirect(new URL(WELCOME_PATH, c.req.url).toString(), 307);
  return next();
};
