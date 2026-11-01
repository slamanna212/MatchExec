// @vitest-environment node
/** `/api/upload/event-image` and `GET /uploads/*` on Postgres blobs (ported from upload-event-image.test.ts + new serving tests). */
import { describe, expect, it, vi } from 'vitest';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { JPEG_BYTES, PNG_BYTES } from '../../utils/pg-stats-fixtures';
import { blobs } from '../../../lib/db/schema';
import { putBlob } from '../../../lib/storage';
import { db } from '../../../lib/db';
import { app } from '../../../src/server/app';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

setupPgTestFile();
const pg = () => getPgTestDb();

function uploadImage(file: { bytes: Uint8Array; type: string; name: string } | null) {
  const form = new FormData();
  if (file) form.append('image', new Blob([file.bytes as BlobPart], { type: file.type }), file.name);
  return appRequest('/api/upload/event-image', { method: 'POST', body: form });
}

describe('POST /api/upload/event-image', () => {
  it('returns 400 when no image is provided', async () => {
    const res = await uploadImage(null);
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/no image/i);
  });

  it('returns 400 for an invalid MIME type', async () => {
    const res = await uploadImage({ bytes: new Uint8Array(100), type: 'application/pdf', name: 'doc.pdf' });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/invalid file type/i);
  });

  it('returns 400 when the file exceeds 5 MB', async () => {
    const big = new Uint8Array(6 * 1024 * 1024);
    big.set(PNG_BYTES.subarray(0, 8));
    const res = await uploadImage({ bytes: big, type: 'image/png', name: 'big.png' });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/too large/i);
    expect(await pg().select().from(blobs)).toHaveLength(0);
  });

  it('returns 400 when the MIME type says image but the magic bytes do not match', async () => {
    const res = await uploadImage({ bytes: new TextEncoder().encode('not a real image'), type: 'image/png', name: 'fake.png' });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/invalid image/i);
  });

  it('stores a valid PNG as a blob and returns its URL', async () => {
    const res = await uploadImage({ bytes: PNG_BYTES, type: 'image/png', name: 'photo.png' });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.imageUrl).toMatch(/^\/uploads\/events\/\d+_[0-9a-f]{32}_photo\.png$/);
    expect(res.data.imageUrl).toBe(`/uploads/events/${res.data.filename}`);
    const [blob] = await pg().select().from(blobs);
    expect(blob).toMatchObject({ path: res.data.imageUrl, kind: 'event-image', content_type: 'image/png', size: PNG_BYTES.length, owner_type: null });
  });

  it('accepts a valid JPEG', async () => {
    const res = await uploadImage({ bytes: JPEG_BYTES, type: 'image/jpeg', name: 'photo.jpg' });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  it('sanitizes path-traversal file names', async () => {
    const res = await uploadImage({ bytes: PNG_BYTES, type: 'image/png', name: '../../etc/passwd.png' });
    expect(res.status).toBe(200);
    expect(res.data.filename).not.toContain('..');
    expect(res.data.filename).not.toContain('/');
    expect(res.data.imageUrl.startsWith('/uploads/events/')).toBe(true);
  });

  it('generates a unique file name for two uploads of the same file', async () => {
    const make = () => uploadImage({ bytes: PNG_BYTES, type: 'image/png', name: 'same.png' });
    const [a, b] = await Promise.all([make(), make()]);
    expect(a.data.filename).not.toBe(b.data.filename);
    expect(await pg().select().from(blobs)).toHaveLength(2);
  });
});

describe('DELETE /api/upload/event-image', () => {
  it('returns 400 when imageUrl is missing', async () => {
    expect((await appRequest('/api/upload/event-image', { method: 'DELETE' })).status).toBe(400);
  });

  it('returns 400 when imageUrl is not under /uploads/events/', async () => {
    const res = await appRequest('/api/upload/event-image?imageUrl=/other/path/file.png', { method: 'DELETE' });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/invalid image/i);
    const traversal = await appRequest(`/api/upload/event-image?imageUrl=${encodeURIComponent('/uploads/events/../scorecards/x.png')}`, { method: 'DELETE' });
    expect(traversal.status).toBe(400);
  });

  it('is idempotent: 200 even when the file does not exist', async () => {
    const res = await appRequest('/api/upload/event-image?imageUrl=/uploads/events/nonexistent.png', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  it('removes the stored blob but only event images', async () => {
    const up = await uploadImage({ bytes: PNG_BYTES, type: 'image/png', name: 'a.png' });
    await putBlob(db, { path: '/uploads/scorecards/m/keep.png', kind: 'scorecard', contentType: 'image/png', data: PNG_BYTES });
    expect((await appRequest(`/api/upload/event-image?imageUrl=${encodeURIComponent(up.data.imageUrl)}`, { method: 'DELETE' })).status).toBe(200);
    expect((await pg().select().from(blobs)).map((b) => b.path)).toEqual(['/uploads/scorecards/m/keep.png']);
    await appRequest(`/api/upload/event-image?imageUrl=${encodeURIComponent('/uploads/scorecards/m/keep.png')}`, { method: 'DELETE' });
    expect(await pg().select().from(blobs)).toHaveLength(1);
  });
});

describe('GET /uploads/*', () => {
  it('serves stored bytes with the stored content type, an immutable cache header and an ETag', async () => {
    await putBlob(db, { path: '/uploads/events/pic.png', kind: 'event-image', contentType: 'image/png', data: PNG_BYTES });
    const res = await app.request('/uploads/events/pic.png');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-length')).toBe(String(PNG_BYTES.length));
    expect(res.headers.get('etag')).toMatch(/^"[0-9a-f]+-[0-9a-f]+"$/);
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG_BYTES)).toBe(true);
  });

  it('serves the same URL shapes the old route did (nested scorecard and stat image paths)', async () => {
    await putBlob(db, { path: '/uploads/scorecards/match_1/1_ab.jpg', kind: 'scorecard', contentType: 'image/jpeg', data: JPEG_BYTES });
    await putBlob(db, { path: '/uploads/stats/match_1/team.png', kind: 'stat-image', contentType: 'image/png', data: PNG_BYTES });
    expect((await app.request('/uploads/scorecards/match_1/1_ab.jpg')).headers.get('content-type')).toBe('image/jpeg');
    expect((await app.request('/uploads/stats/match_1/team.png')).status).toBe(200);
  });

  it('answers 304 for a matching If-None-Match and a new ETag after the file is rewritten', async () => {
    await putBlob(db, { path: '/uploads/stats/m/team.png', kind: 'stat-image', contentType: 'image/png', data: PNG_BYTES });
    const first = await app.request('/uploads/stats/m/team.png');
    const etag = first.headers.get('etag')!;
    const cached = await app.request('/uploads/stats/m/team.png', { headers: { 'if-none-match': etag } });
    expect(cached.status).toBe(304);
    expect(cached.headers.get('etag')).toBe(etag);
    expect(await cached.text()).toBe('');

    await new Promise((r) => setTimeout(r, 5));
    await putBlob(db, { path: '/uploads/stats/m/team.png', kind: 'stat-image', contentType: 'image/png', data: Buffer.concat([PNG_BYTES, Buffer.alloc(8)]) });
    const fresh = await app.request('/uploads/stats/m/team.png', { headers: { 'if-none-match': etag } });
    expect(fresh.status).toBe(200);
    expect(fresh.headers.get('etag')).not.toBe(etag);
  });

  it('returns 404 for unknown files', async () => {
    expect((await app.request('/uploads/events/missing.png')).status).toBe(404);
  });

  it('refuses path traversal (encoded or not) and directory-like paths', async () => {
    await putBlob(db, { path: '/uploads/events/pic.png', kind: 'event-image', contentType: 'image/png', data: PNG_BYTES });
    expect((await app.request('/uploads/events/%2e%2e/%2e%2e/etc/passwd')).status).toBe(404); // the URL parser resolves it outside /uploads
    expect((await app.request('/uploads/events/..%2fevents%2fpic.png')).status).toBe(404);
    expect((await app.request('/uploads/')).status).toBe(404);
    expect((await app.request('/uploads/events/%E0%A4%A')).status).toBe(404); // malformed escape
  });

  it('is reachable without a session when admin auth is on (like the old image-extension matcher exclusion)', async () => {
    await putBlob(db, { path: '/uploads/events/pic.png', kind: 'event-image', contentType: 'image/png', data: PNG_BYTES });
    process.env.ADMIN_PASSWORD = 'secret';
    try {
      expect((await app.request('/uploads/events/pic.png')).status).toBe(200);
      expect((await app.request('/api/feed')).status).toBe(401);
    } finally {
      delete process.env.ADMIN_PASSWORD;
    }
  });
});
