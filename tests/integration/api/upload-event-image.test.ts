import { describe, it, expect, vi, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

import { POST, DELETE } from '@/app/api/upload/event-image/route';

// PNG magic bytes — valid image signature
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// JPEG magic bytes
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

function bufToArrayBuffer(buf: Buffer): ArrayBuffer {
  // Node.js Buffers use pool allocators — .buffer may be a larger shared pool.
  // Copy into a fresh ArrayBuffer so the slice starts at offset 0.
  const ab = new ArrayBuffer(buf.length);
  new Uint8Array(ab).set(buf);
  return ab;
}

function makeRequest(image: { type: string; size: number; name: string; arrayBuffer: () => Promise<ArrayBuffer> } | null): any {
  return {
    formData: async () => ({
      get: (key: string) => (key === 'image' ? image : null),
    }),
  };
}

// Collect uploaded filenames for cleanup
const uploadedFiles: string[] = [];
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'events');

afterEach(() => {
  for (const filename of uploadedFiles) {
    if (!filename) continue;
    const p = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  uploadedFiles.length = 0;
});

describe('POST /api/upload/event-image', () => {
  it('returns 400 when no image is provided', async () => {
    const req = makeRequest(null);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no image/i);
  });

  it('returns 400 for invalid MIME type', async () => {
    const req = makeRequest({ type: 'application/pdf', size: 100, name: 'doc.pdf', arrayBuffer: async () => new ArrayBuffer(0) });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid file type/i);
  });

  it('returns 400 when file exceeds 5 MB', async () => {
    const req = makeRequest({
      type: 'image/png',
      size: 6 * 1024 * 1024,
      name: 'big.png',
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/too large/i);
  });

  it('returns 400 when MIME type is image/* but magic bytes do not match', async () => {
    const badContent = Buffer.from('not a real image');
    const req = makeRequest({
      type: 'image/png',
      size: badContent.length,
      name: 'fake.png',
      arrayBuffer: async () => bufToArrayBuffer(badContent),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid image/i);
  });

  it('returns 200 and a URL for a valid PNG', async () => {
    const content = Buffer.concat([PNG_MAGIC, Buffer.alloc(20)]);
    const req = makeRequest({
      type: 'image/png',
      size: content.length,
      name: 'photo.png',
      arrayBuffer: async () => bufToArrayBuffer(content),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.imageUrl).toMatch(/^\/uploads\/events\//);
    expect(body.filename).toBeTruthy();
    uploadedFiles.push(body.filename);
  });

  it('returns 200 and a URL for a valid JPEG', async () => {
    const content = Buffer.concat([JPEG_MAGIC, Buffer.alloc(20)]);
    const req = makeRequest({
      type: 'image/jpeg',
      size: content.length,
      name: 'photo.jpg',
      arrayBuffer: async () => bufToArrayBuffer(content),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    uploadedFiles.push(body.filename);
  });

  it('sanitizes path-traversal filenames', async () => {
    const content = Buffer.concat([PNG_MAGIC, Buffer.alloc(20)]);
    const req = makeRequest({
      type: 'image/png',
      size: content.length,
      name: '../../etc/passwd.png',
      arrayBuffer: async () => bufToArrayBuffer(content),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Path traversal chars replaced — filename should not contain '..'
    expect(body.filename).not.toContain('..');
    uploadedFiles.push(body.filename);
  });

  it('generated filename is unique across two uploads of the same file', async () => {
    const content = Buffer.concat([PNG_MAGIC, Buffer.alloc(20)]);
    const makeReq = () => makeRequest({
      type: 'image/png',
      size: content.length,
      name: 'same.png',
      arrayBuffer: async () => bufToArrayBuffer(content),
    });

    const [res1, res2] = await Promise.all([POST(makeReq()), POST(makeReq())]);
    const [b1, b2] = await Promise.all([res1.json(), res2.json()]);
    uploadedFiles.push(b1.filename, b2.filename);
    expect(b1.filename).not.toBe(b2.filename);
  });
});

describe('DELETE /api/upload/event-image', () => {
  it('returns 400 when imageUrl query param is missing', async () => {
    const req = { url: 'http://localhost:3000/api/upload/event-image' } as any;
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when imageUrl is not under /uploads/events/', async () => {
    const req = { url: 'http://localhost:3000/api/upload/event-image?imageUrl=/other/path/file.png' } as any;
    const res = await DELETE(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid image/i);
  });

  it('returns 200 even when the file does not exist (idempotent)', async () => {
    const req = { url: 'http://localhost:3000/api/upload/event-image?imageUrl=/uploads/events/nonexistent.png' } as any;
    const res = await DELETE(req);
    expect(res.status).toBe(200);
  });
});
