import { describe, it, expect } from 'vitest';
import { apiError, apiOk } from '../../../src/lib/api-response';

describe('apiError', () => {
  it('returns 500 by default', async () => {
    const res = apiError('something went wrong');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'something went wrong' });
  });

  it('returns custom status code', async () => {
    const res = apiError('not found', 404);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not found');
  });

  it('returns 400 for bad request', async () => {
    const res = apiError('invalid input', 400);
    expect(res.status).toBe(400);
  });

  it('returns 429 for rate limit', async () => {
    const res = apiError('too many requests', 429);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('too many requests');
  });

  it('sets Content-Type to application/json', () => {
    const res = apiError('err');
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('body has only the error field', async () => {
    const res = apiError('oops');
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['error']);
  });

  it('handles empty string message', async () => {
    const res = apiError('');
    const body = await res.json();
    expect(body.error).toBe('');
  });
});

describe('apiOk', () => {
  it('returns 200 by default', async () => {
    const res = apiOk({ id: 1 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ id: 1 });
  });

  it('returns custom status code', async () => {
    const res = apiOk({ created: true }, 201);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.created).toBe(true);
  });

  it('sets Content-Type to application/json', () => {
    const res = apiOk({});
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('works with null data', async () => {
    const res = apiOk(null);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeNull();
  });

  it('works with array data', async () => {
    const res = apiOk([1, 2, 3]);
    const body = await res.json();
    expect(body).toEqual([1, 2, 3]);
  });

  it('works with string data', async () => {
    const res = apiOk('ok');
    const body = await res.json();
    expect(body).toBe('ok');
  });

  it('preserves nested object structure', async () => {
    const data = { match: { id: 5, status: 'battle' }, teams: ['alpha', 'beta'] };
    const res = apiOk(data);
    const body = await res.json();
    expect(body).toEqual(data);
  });
});
