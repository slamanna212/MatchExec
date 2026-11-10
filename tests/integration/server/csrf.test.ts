// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { csrfGuard } from '../../../src/server/middleware/csrf';
import { setupPgTestFile } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';

setupPgTestFile({ seed: true });

function makeApp() {
  const app = new Hono();
  app.use('*', csrfGuard);
  app.get('/x', (c) => c.json({ ok: true }));
  app.post('/x', (c) => c.json({ ok: true }));
  app.delete('/x', (c) => c.json({ ok: true }));
  return app;
}

const post = (headers: Record<string, string>, method = 'POST') =>
  makeApp().request('http://matchexec.local:3000/x', { method, headers: { host: 'matchexec.local:3000', ...headers } });

afterEach(() => { delete process.env.TRUST_PROXY; });

describe('csrfGuard', () => {
  it('never blocks safe methods', async () => {
    const res = await makeApp().request('http://matchexec.local:3000/x', { headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' } });
    expect(res.status).toBe(200);
  });

  it('uses Sec-Fetch-Site when the browser sends it', async () => {
    expect((await post({ 'sec-fetch-site': 'same-origin' })).status).toBe(200);
    expect((await post({ 'sec-fetch-site': 'none' })).status).toBe(200);
    expect((await post({ 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    // Same site, different port (another app on the same host) is still blocked
    expect((await post({ 'sec-fetch-site': 'same-site' })).status).toBe(403);
    expect((await post({ 'sec-fetch-site': 'cross-site' }, 'DELETE')).status).toBe(403);
  });

  it('falls back to comparing Origin with Host', async () => {
    expect((await post({ origin: 'http://matchexec.local:3000' })).status).toBe(200);
    expect((await post({ origin: 'http://matchexec.local:4000' })).status).toBe(403);
    expect((await post({ origin: 'https://evil.example' })).status).toBe(403);
    expect((await post({ origin: 'null' })).status).toBe(403);
    expect((await post({ origin: 'not a url' })).status).toBe(403);
  });

  it('accepts X-Forwarded-Host only behind a trusted proxy', async () => {
    const headers = { origin: 'https://matchexec.example.com', 'x-forwarded-host': 'matchexec.example.com' };
    expect((await post(headers)).status).toBe(403);
    process.env.TRUST_PROXY = 'true';
    expect((await post(headers)).status).toBe(200);
  });

  it('lets non-browser clients (no Origin, no Sec-Fetch-Site) through', async () => {
    expect((await post({})).status).toBe(200);
  });

  it('is mounted on the real app for /api writes', async () => {
    const blocked = await appRequest('/api/settings/log-level', {
      method: 'PUT', json: { level: 'info' }, headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(blocked.status).toBe(403);
    expect(blocked.data).toEqual({ error: 'Cross-site request blocked' });
  });
});
