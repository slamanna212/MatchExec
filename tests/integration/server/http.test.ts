// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { HttpError, apiNotFound, noStore, onError, jsonError, jsonOk } from '../../../src/server/http';
import { app } from '../../../src/server/app';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

function build() {
  const a = new Hono();
  a.onError(onError);
  a.notFound(apiNotFound);
  a.use('/api/*', noStore);
  a.get('/api/http', () => { throw new HttpError(418, 'teapot', { code: 'T' }); });
  a.get('/api/notfound', () => { throw HttpError.notFound('Match not found'); });
  a.get('/api/exc', () => { throw new HTTPException(403, { message: 'nope' }); });
  a.get('/api/boom', () => { throw new Error('secret internals'); });
  a.post('/api/json', async (c) => c.json(await c.req.json()));
  a.get('/api/helpers', (c) => jsonOk(c, { ok: true }, 201));
  a.get('/api/err', (c) => jsonError(c, 'bad', 400));
  a.get('/api/custom-cache', (c) => { c.header('Cache-Control', 'max-age=60'); return c.json({}); });
  return a;
}

describe('http error handling', () => {
  const a = build();

  it('HttpError -> { error } with its status and extras', async () => {
    const res = await a.request('/api/http');
    expect(res.status).toBe(418);
    expect(await res.json()).toEqual({ error: 'teapot', code: 'T' });
  });

  it('HttpError.notFound -> 404', async () => {
    const res = await a.request('/api/notfound');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Match not found' });
  });

  it('HTTPException keeps its status', async () => {
    const res = await a.request('/api/exc');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'nope' });
  });

  it('unknown errors -> 500 without leaking the message', async () => {
    const res = await a.request('/api/boom');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });

  it('malformed JSON bodies -> 400', async () => {
    const res = await a.request('/api/json', { method: 'POST', body: '{nope', headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' });
  });

  it('unknown /api paths -> JSON 404, other paths -> text 404', async () => {
    const api = await a.request('/api/missing');
    expect(api.status).toBe(404);
    expect(await api.json()).toEqual({ error: 'Not found' });
    expect((await a.request('/nope')).status).toBe(404);
  });

  it('response helpers produce the old apiOk/apiError bodies', async () => {
    const ok = await a.request('/api/helpers');
    expect(ok.status).toBe(201);
    expect(await ok.json()).toEqual({ ok: true });
    const err = await a.request('/api/err');
    expect(err.status).toBe(400);
    expect(await err.json()).toEqual({ error: 'bad' });
  });
});

describe('no-store middleware', () => {
  const a = build();
  it('adds Cache-Control: no-store to /api/* (including errors and 404s)', async () => {
    for (const p of ['/api/helpers', '/api/boom', '/api/missing']) {
      expect((await a.request(p)).headers.get('cache-control')).toBe('no-store');
    }
  });
  it('does not touch non-API paths', async () => {
    expect((await a.request('/page')).headers.get('cache-control')).toBeNull();
  });
  it('respects an endpoint that set its own Cache-Control', async () => {
    expect((await a.request('/api/custom-cache')).headers.get('cache-control')).toBe('max-age=60');
  });
  it('is applied by the real app', async () => {
    const res = await app.request('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
