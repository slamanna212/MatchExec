/**
 * `/api/welcome-flow` and `/api/welcome-flow/screen`.
 * GET is public (the loading screen and redirects need it before login); the writes need a session when auth is enabled
 * (see PUBLIC_READ_PATHS in middleware/auth.ts) and become no-ops once the flow has been completed (a repeated or late
 * request cannot rewrite how setup was done).
 */
import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { logger } from '@/lib/logger';
import { updateAppSetting } from '@/lib/settings';
import { completeWelcomeFlow, EMPTY_WELCOME_METADATA, getWelcomeFlowState, isWelcomeFlowCompleted, SETUP_TYPES } from '@/lib/welcome-flow';
import { jsonError } from '../http';
import { WELCOME_COOKIE } from '../middleware/welcome';

const TOTAL_SCREENS = 3;

export const welcomeFlow = new Hono()
  .get('/', async (c) => {
    try {
      return c.json(await getWelcomeFlowState());
    } catch (error) {
      logger.error('Error checking welcome flow status:', error);
      return c.json({ isFirstRun: true, completed: false, dbReady: false, metadata: EMPTY_WELCOME_METADATA });
    }
  })
  .put('/', async (c) => {
    try {
      const { setupType } = await c.req.json();
      if (!SETUP_TYPES.includes(setupType)) {
        return jsonError(c, `setupType must be one of: ${SETUP_TYPES.join(', ')}`, 400);
      }
      const alreadyCompleted = await isWelcomeFlowCompleted();
      if (!alreadyCompleted && !(await completeWelcomeFlow(setupType))) {
        logger.error('Failed to update welcome flow - row not found');
        return jsonError(c, 'Failed to update welcome flow - row not found', 500);
      }
      setCookie(c, WELCOME_COOKIE, 'true', { path: '/', httpOnly: true, sameSite: 'Lax', maxAge: 60 * 60 * 24 * 30 });
      return c.json({ success: true });
    } catch (error) {
      logger.error('Error completing welcome flow:', error);
      return jsonError(c, 'Failed to complete welcome flow');
    }
  })
  .put('/screen', async (c) => {
    try {
      const { screen } = (await c.req.json().catch(() => ({}))) as { screen?: unknown };
      const n = typeof screen === 'string' ? Number(screen) : screen;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > TOTAL_SCREENS) {
        return jsonError(c, `screen must be an integer from 1 to ${TOTAL_SCREENS}`, 400);
      }
      if (await isWelcomeFlowCompleted()) return c.json({ success: true });
      const metadata = { total_screens: TOTAL_SCREENS, last_accessed: new Date().toISOString() };
      await updateAppSetting('welcome_flow_current_screen', String(n), undefined, metadata);
      return c.json({ success: true });
    } catch (error) {
      logger.error('Error updating welcome flow screen:', error);
      return jsonError(c, 'Failed to update screen');
    }
  });
