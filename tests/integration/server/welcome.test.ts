// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { app } from '../../../src/server/app';
import { isHtmlNavigation } from '../../../src/server/middleware/welcome';
import { appSettings } from '../../../lib/db/schema';
import { markSystemReady } from '../../../lib/db/system-status';
import { seedDatabase } from '../../../lib/db/seed';
import { getPgTestDb, setupPgTestFile } from '../../utils/pg-test-db';

setupPgTestFile();
const html = { accept: 'text/html' };

describe('isHtmlNavigation', () => {
  it('only matches GET html navigations to non-api, non-asset paths', () => {
    expect(isHtmlNavigation('GET', '/matches', 'text/html,*/*')).toBe(true);
    expect(isHtmlNavigation('GET', '/api/x', 'text/html')).toBe(false);
    expect(isHtmlNavigation('GET', '/logo.png', 'text/html')).toBe(false);
    expect(isHtmlNavigation('GET', '/matches', 'application/json')).toBe(false);
    expect(isHtmlNavigation('POST', '/matches', 'text/html')).toBe(false);
  });
});

describe('welcome-flow middleware', () => {
  it('passes through while the system is not ready', async () => {
    const res = await app.request('/matches', { headers: html });
    expect(res.status).not.toBe(307);
  });

  it('redirects to /welcome when setup is incomplete and sets the cookie', async () => {
    await seedDatabase(getPgTestDb());
    await markSystemReady();
    const res = await app.request('/matches', { headers: html });
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/welcome');
    expect(res.headers.get('set-cookie')).toContain('welcome_flow_completed=false');
  });

  it('never redirects API calls, assets or /login', async () => {
    expect((await app.request('/api/health', { headers: html })).status).toBe(200);
    expect((await app.request('/favicon.ico', { headers: html })).status).toBe(404);
    expect((await app.request('/login', { headers: html })).status).toBe(404);
  });

  it('redirects /welcome to / once complete, and honours the cookie', async () => {
    await seedDatabase(getPgTestDb());
    await markSystemReady();
    await getPgTestDb().update(appSettings).set({ setting_value: 'true' }).where(eq(appSettings.setting_key, 'welcome_flow_completed'));
    const done = await app.request('/welcome', { headers: html });
    expect(done.status).toBe(307);
    expect(new URL(done.headers.get('location')!).pathname).toBe('/');
    const viaCookie = await app.request('/matches', { headers: { ...html, cookie: 'welcome_flow_completed=false' } });
    expect(new URL(viaCookie.headers.get('location')!).pathname).toBe('/welcome');
    expect((await app.request('/welcome', { headers: { ...html, cookie: 'welcome_flow_completed=false' } })).status).toBe(404);
  });
});
