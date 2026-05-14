import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

// restartProcesses fires child_process calls in background — mock it so tests
// don't try to exec pm2/pkill in the test environment.
vi.mock('child_process', () => ({ execFile: vi.fn() }));

import { POST as backup } from '@/app/api/settings/backup/route';
import { POST as restore } from '@/app/api/settings/restore/route';

function makeRestoreRequest(file: File | null, password?: string): Request {
  const fd = new FormData();
  if (file) fd.append('file', file);
  if (password) fd.append('password', password);

  return new Request('http://localhost:3000/api/settings/restore', {
    method: 'POST',
    body: fd,
    headers: { 'x-forwarded-for': '127.0.0.1' },
  }) as unknown as Request;
}

function makeBackupRequest(password?: string): Request {
  const body = password ? { password } : {};
  return new Request('http://localhost:3000/api/settings/backup', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '127.0.0.1',
    },
  }) as unknown as Request;
}

describe('POST /api/settings/restore — validation', () => {
  it('returns 400 when no file is provided', async () => {
    const req = makeRestoreRequest(null);
    const res = await restore(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no file/i);
  });

  it('returns 400 for non-SQLite content', async () => {
    const bad = new Blob([Buffer.from('not a real sqlite file')], { type: 'application/octet-stream' });
    const file = new File([bad], 'backup.db');
    const req = makeRestoreRequest(file);
    const res = await restore(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid|sqlite/i);
  });

  it('returns 400 when file size exceeds 100 MB limit', async () => {
    // Build a request where formData() returns a file reporting size > 100 MB
    const fakeFile = { size: 101 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) };
    const fakeFormData = new Map([['file', fakeFile]]);
    const req = {
      formData: async () => ({ get: (k: string) => fakeFormData.get(k) ?? null }),
      headers: { get: () => '127.0.0.1' },
    } as unknown as Request;

    const res = await restore(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/too large/i);
  });

  it('returns 400 for encrypted backup uploaded without password', async () => {
    // Encrypted backup starts with MAGIC "MEXECBAK"
    const MAGIC = Buffer.from('MEXECBAK');
    const fakeEncrypted = Buffer.concat([MAGIC, Buffer.alloc(100)]);
    const file = new File([fakeEncrypted], 'backup.db.enc');
    const req = makeRestoreRequest(file);
    const res = await restore(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/password/i);
  });

  it('returns 400 for encrypted backup with wrong password', async () => {
    // Build a valid-looking encrypted envelope but with wrong ciphertext
    const MAGIC = Buffer.from('MEXECBAK');
    const salt = Buffer.alloc(32, 0x01);
    const iv = Buffer.alloc(12, 0x02);
    const authTag = Buffer.alloc(16, 0x03);
    const ciphertext = Buffer.alloc(64, 0x04);
    const fakeEncrypted = Buffer.concat([MAGIC, salt, iv, authTag, ciphertext]);
    const file = new File([fakeEncrypted], 'backup.db.enc');
    const req = makeRestoreRequest(file, 'wrong-password');
    const res = await restore(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/decryption failed|wrong password/i);
  });
});

describe('POST /api/settings/backup', () => {
  const savedDbPath = process.env.DATABASE_PATH;

  beforeEach(() => {
    delete process.env.DATABASE_PATH;
  });

  afterEach(() => {
    if (savedDbPath !== undefined) {
      process.env.DATABASE_PATH = savedDbPath;
    } else {
      delete process.env.DATABASE_PATH;
    }
  });

  it('returns 500 when database file does not exist', async () => {
    process.env.DATABASE_PATH = '/tmp/nonexistent-matchexec-test.db';
    const req = makeBackupRequest();
    const res = await backup(req as any);
    expect(res.status).toBe(500);
  });
});
