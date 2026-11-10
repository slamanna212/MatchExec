/** `/api/auth/*`: login, logout, logout-all, status (opt-in admin password; see middleware/auth.ts). */
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import {
  SESSION_COOKIE, bumpSessionEpoch, createSessionToken, getSessionMaxAgeSeconds, isAuthEnabled, isSecureRequest, verifyPassword, verifySessionToken,
} from '../middleware/auth';
import { checkRateLimit, clientKey } from '../middleware/rate-limit';
import { jsonError } from '../http';

export const auth = new Hono()
  .post('/login', async (c) => {
    if (!isAuthEnabled()) return c.json({ success: true, enabled: false });

    checkRateLimit(clientKey(c, 'login'), 10, 60_000);

    let password: unknown;
    try {
      ({ password } = await c.req.json());
    } catch {
      return jsonError(c, 'Invalid request body', 400);
    }
    if (typeof password !== 'string' || !(await verifyPassword(password))) {
      return jsonError(c, 'Invalid password', 401);
    }

    setCookie(c, SESSION_COOKIE, await createSessionToken(), {
      path: '/', httpOnly: true, sameSite: 'Lax', secure: isSecureRequest(c), maxAge: getSessionMaxAgeSeconds(),
    });
    return c.json({ success: true });
  })
  .post('/logout', (c) => {
    setCookie(c, SESSION_COOKIE, '', { path: '/', httpOnly: true, sameSite: 'Lax', secure: isSecureRequest(c), maxAge: 0 });
    return c.json({ success: true });
  })
  // Revokes every session (all browsers and devices) and signs the caller back in with a fresh cookie. Not a public path:
  // it needs a valid session (the auth gate runs first).
  .post('/logout-all', async (c) => {
    if (!isAuthEnabled()) return c.json({ success: true, enabled: false });
    await bumpSessionEpoch();
    setCookie(c, SESSION_COOKIE, await createSessionToken(), {
      path: '/', httpOnly: true, sameSite: 'Lax', secure: isSecureRequest(c), maxAge: getSessionMaxAgeSeconds(),
    });
    return c.json({ success: true });
  })
  .get('/status', async (c) => {
    const enabled = isAuthEnabled();
    const authenticated = !enabled || (await verifySessionToken(getCookie(c, SESSION_COOKIE)));
    return c.json({ enabled, authenticated });
  });

