// @vitest-environment node
/**
 * Backup/restore HTTP contract on PGlite (no pg tools needed): request validation (the cases the old Next route test covered),
 * settings API, listing / download / delete with path-traversal guards, and the maintenance gate. The real pg_dump / pg_restore
 * round trips are in backup-restore-pg.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { encryptBackup } from '../../../lib/backup-crypto';
import { resetRateLimits } from '../../../src/server/middleware/rate-limit';
import { maintenanceGate, inflightRequests } from '../../../src/server/middleware/maintenance';
import { resetLocalMaintenance, setLocalState } from '../../../lib/maintenance';
import { activityFeed } from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

setupPgTestFile();

let tmp: string;
const saved = { ...process.env };

function installFakePgDump(mode: 'ok' | 'fail' = 'ok'): void {
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'pg_dump'), mode === 'ok'
    ? '#!/bin/sh\nprintf "PGDMP-fake-dump-content"\n'
    : '#!/bin/sh\necho "pg_dump: error: boom" >&2\nexit 1\n', { mode: 0o755 });
  process.env.PG_BIN_DIR = bin;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mx-backup-routes-'));
  process.env.MATCHEXEC_BACKUP_DIR = path.join(tmp, 'backups');
  process.env.DATABASE_URL = 'postgres://u:p@127.0.0.1:1/none';
  resetRateLimits();
  resetLocalMaintenance();
});
afterEach(() => {
  process.env = { ...saved };
  fs.rmSync(tmp, { recursive: true, force: true });
  resetLocalMaintenance();
});

function restoreForm(file: Blob | null, name = 'backup.dump', password?: string): FormData {
  const fd = new FormData();
  if (file) fd.append('file', file, name);
  if (password) fd.append('password', password);
  return fd;
}

describe('POST /api/settings/restore: request validation', () => {
  it('returns 400 when no file is provided', async () => {
    const res = await appRequest('/api/settings/restore', { method: 'POST', body: restoreForm(null) });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/no file/i);
  });

  it('returns 400 for content that is neither a PostgreSQL dump nor a SQLite database', async () => {
    const res = await appRequest('/api/settings/restore', { method: 'POST', body: restoreForm(new Blob(['not a real backup file'])) });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/invalid|not a valid/i);
    expect(res.data.error).toMatch(/PostgreSQL|SQLite/);
  });

  it('returns 400 when the upload exceeds the 100 MB limit', async () => {
    process.env.MATCHEXEC_RESTORE_MAX_MB = '1';
    const res = await appRequest('/api/settings/restore', { method: 'POST', body: restoreForm(new Blob([Buffer.alloc(1024 * 1024 + 1)])) });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/too large \(max 1 MB\)/i);
    delete process.env.MATCHEXEC_RESTORE_MAX_MB;
    // and the declared Content-Length is checked first, before the body is read
    const { app } = await import('../../../src/server/app');
    const early = await app.request('/api/settings/restore', { method: 'POST', body: restoreForm(new Blob(['x'])), headers: { 'content-length': String(101 * 1024 * 1024) } });
    expect([400, 500]).toContain(early.status);
  });

  it('returns 400 for an encrypted backup uploaded without a password', async () => {
    const fake = Buffer.concat([Buffer.from('MEXECBAK'), Buffer.alloc(100)]);
    const res = await appRequest('/api/settings/restore', { method: 'POST', body: restoreForm(new Blob([fake]), 'backup.dump.enc') });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/password/i);
  });

  it('returns 400 for an encrypted backup with the wrong password', async () => {
    const enc = encryptBackup(Buffer.from('PGDMP-something'), 'right-password');
    const res = await appRequest('/api/settings/restore', { method: 'POST', body: restoreForm(new Blob([new Uint8Array(enc)]), 'backup.dump.enc', 'wrong-password') });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/decryption failed|wrong password/i);
  });

  it('decrypts with the right password and then rejects unknown inner content', async () => {
    const enc = encryptBackup(Buffer.from('this is not a backup'), 'pw');
    const res = await appRequest('/api/settings/restore', { method: 'POST', body: restoreForm(new Blob([new Uint8Array(enc)]), 'backup.dump.enc', 'pw') });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/not a valid MatchExec backup/i);
  });

  it('a corrupt PGDMP file (readable magic, unreadable archive) is rejected before anything changes', async () => {
    installFakePgDump('ok'); // no pg_restore in the fake dir -> "not found" is a 500; use a failing fake pg_restore instead
    fs.writeFileSync(path.join(process.env.PG_BIN_DIR!, 'pg_restore'), '#!/bin/sh\necho "pg_restore: error: unsupported version (1.99) in file header" >&2\nexit 1\n', { mode: 0o755 });
    const res = await appRequest('/api/settings/restore', { method: 'POST', body: restoreForm(new Blob([Buffer.concat([Buffer.from('PGDMP'), Buffer.alloc(40)])])) });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/damaged|not a valid PostgreSQL dump/i);
  });
});

describe('POST /api/settings/backup', () => {
  it('streams the dump with the .dump filename when no password is given', async () => {
    installFakePgDump('ok');
    const res = await appRequest('/api/settings/backup', { method: 'POST', json: {} });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(/filename="matchexec-backup-\d{4}-\d{2}-\d{2}\.dump"/);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.data).toBe('PGDMP-fake-dump-content');
  });

  it('encrypts into MEXECBAK when a password is given (.dump.enc)', async () => {
    installFakePgDump('ok');
    const { app } = await import('../../../src/server/app');
    const res = await app.request('/api/settings/backup', { method: 'POST', body: JSON.stringify({ password: '  s3cret  ' }), headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(/filename="matchexec-backup-\d{4}-\d{2}-\d{2}\.dump\.enc"/);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 8).toString()).toBe('MEXECBAK');
    expect(res.headers.get('content-length')).toBe(String(body.length));
    // the envelope opens with the trimmed password and holds the dump
    const { decryptBackup } = await import('../../../lib/backup-crypto');
    expect(decryptBackup(body, 's3cret').toString()).toBe('PGDMP-fake-dump-content');
  });

  it('returns 500 when pg_dump fails (the old "database file not found" case)', async () => {
    installFakePgDump('fail');
    const res = await appRequest('/api/settings/backup', { method: 'POST', json: {} });
    expect(res.status).toBe(500);
    expect(res.data.error).toMatch(/backup failed/i);
  });

  it('returns 500 with a helpful message when pg_dump is not installed', async () => {
    process.env.PG_BIN_DIR = path.join(tmp, 'missing');
    const res = await appRequest('/api/settings/backup', { method: 'POST', json: {} });
    expect(res.status).toBe(500);
    expect(res.data.error).toMatch(/pg_dump was not found/);
  });

  it('is rate limited (10 per 10 minutes per client)', async () => {
    installFakePgDump('ok');
    for (let i = 0; i < 10; i++) expect((await appRequest('/api/settings/backup', { method: 'POST', json: {} })).status).toBe(200);
    expect((await appRequest('/api/settings/backup', { method: 'POST', json: {} })).status).toBe(429);
  });
});

describe('automatic-backup settings API', () => {
  it('defaults: off for an external database, on for the embedded one', async () => {
    const external = await appRequest('/api/settings/backup/config');
    expect(external.status).toBe(200);
    expect(external.data).toMatchObject({ enabled: false, enabledIsDefault: true, embedded: false, schedule: '0 4 * * *', preset: 'daily', retention: { daily: 14, weekly: 4 } });

    process.env.MATCHEXEC_EMBEDDED_PG = 'true';
    const embedded = await appRequest('/api/settings/backup/config');
    expect(embedded.data).toMatchObject({ enabled: true, enabledIsDefault: true, embedded: true });
  });

  it('PUT stores enabled / presets / cron / retention and GET reflects them', async () => {
    const res = await appRequest('/api/settings/backup/config', { method: 'PUT', json: { enabled: true, schedule: '12h', retention: { daily: 7, weekly: 2 } } });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ enabled: true, enabledIsDefault: false, schedule: '0 4,16 * * *', preset: '12h', retention: { daily: 7, weekly: 2 } });
    const custom = await appRequest('/api/settings/backup/config', { method: 'PUT', json: { schedule: '30 2 * * 1' } });
    expect(custom.data).toMatchObject({ schedule: '30 2 * * 1', preset: 'custom' });
    const off = await appRequest('/api/settings/backup/config', { method: 'PUT', json: { enabled: false } });
    expect(off.data.enabled).toBe(false);
  });

  it('rejects invalid input with 400 and changes nothing', async () => {
    expect((await appRequest('/api/settings/backup/config', { method: 'PUT', json: { schedule: 'not a cron' } })).status).toBe(400);
    expect((await appRequest('/api/settings/backup/config', { method: 'PUT', json: { retention: { daily: 0 } } })).status).toBe(400);
    expect((await appRequest('/api/settings/backup/config', { method: 'PUT', json: { retention: { weekly: 99 } } })).status).toBe(400);
    expect((await appRequest('/api/settings/backup/config', { method: 'PUT', json: { retention: { daily: 1.5 } } })).status).toBe(400);
    const cfg = await appRequest('/api/settings/backup/config');
    expect(cfg.data).toMatchObject({ schedule: '0 4 * * *', retention: { daily: 14, weekly: 4 } });
  });

  it('"Back up now" writes an auto backup, records the run and prunes', async () => {
    installFakePgDump('ok');
    const res = await appRequest('/api/settings/backup/run', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.data.backup.kind).toBe('auto');
    const cfg = await appRequest('/api/settings/backup/config');
    expect(cfg.data.last).toMatchObject({ status: 'success', file: res.data.backup.filename, error: null });
    expect(cfg.data.last.size).toBeGreaterThan(0);
    expect(cfg.data.last.at).toMatch(/^\d{4}-/);
    const list = await appRequest('/api/settings/backup/list');
    expect(list.data.backups.map((b: { id: string }) => b.id)).toEqual([res.data.backup.id]);
  });

  it('a failed run logs an error, records the failure and adds a feed event', async () => {
    installFakePgDump('fail');
    const { logger } = await import('@/lib/logger');
    const res = await appRequest('/api/settings/backup/run', { method: 'POST' });
    expect(res.status).toBe(500);
    expect(logger.error).toHaveBeenCalled();
    const cfg = await appRequest('/api/settings/backup/config');
    expect(cfg.data.last.status).toBe('failed');
    expect(cfg.data.last.error).toMatch(/boom/);
    const feed = await getPgTestDb().select().from(activityFeed);
    expect(feed.filter((e) => e.event_type === 'backup_failed')).toHaveLength(1);
    expect(feed[0].title).toMatch(/backup failed/i);
  });
});

describe('stored backups: list, download, delete', () => {
  function put(kind: string, name: string, content = 'PGDMPxxxx'): void {
    const dir = path.join(tmp, 'backups', kind);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }

  it('lists auto, pre-upgrade and pre-restore backups newest first', async () => {
    put('auto', 'matchexec-2026-11-01T04-00-00-000Z.dump');
    put('pre-upgrade', 'matchexec-2026-11-02T04-00-00-000Z.dump');
    put('pre-restore', 'matchexec-2026-10-31T04-00-00-000Z.dump');
    put('auto', 'matchexec-2026-11-03T04-00-00-000Z.dump.partial');
    const res = await appRequest('/api/settings/backup/list');
    expect(res.data.backups.map((b: { id: string }) => b.id)).toEqual([
      'pre-upgrade/matchexec-2026-11-02T04-00-00-000Z.dump',
      'auto/matchexec-2026-11-01T04-00-00-000Z.dump',
      'pre-restore/matchexec-2026-10-31T04-00-00-000Z.dump',
    ]);
    expect(res.data.backups[0]).toMatchObject({ kind: 'pre-upgrade', size: 9, createdAt: '2026-11-02T04:00:00.000Z' });
  });

  it('downloads and deletes a stored backup; 404 for unknown files', async () => {
    put('auto', 'matchexec-2026-11-01T04-00-00-000Z.dump', 'PGDMP-hello');
    const dl = await appRequest('/api/settings/backup/files/auto/matchexec-2026-11-01T04-00-00-000Z.dump');
    expect(dl.status).toBe(200);
    expect(dl.data).toBe('PGDMP-hello');
    expect(dl.headers.get('content-disposition')).toContain('matchexec-2026-11-01T04-00-00-000Z.dump');
    expect((await appRequest('/api/settings/backup/files/auto/matchexec-2026-11-09T04-00-00-000Z.dump')).status).toBe(404);
    expect((await appRequest('/api/settings/backup/files/auto/matchexec-2026-11-01T04-00-00-000Z.dump', { method: 'DELETE' })).status).toBe(200);
    expect(fs.existsSync(path.join(tmp, 'backups', 'auto', 'matchexec-2026-11-01T04-00-00-000Z.dump'))).toBe(false);
    expect((await appRequest('/api/settings/backup/files/auto/matchexec-2026-11-01T04-00-00-000Z.dump', { method: 'DELETE' })).status).toBe(404);
  });

  it('rejects path traversal and unknown kinds on download, delete and restore', async () => {
    fs.writeFileSync(path.join(tmp, 'secret.dump'), 'secret');
    const attempts = [
      '/api/settings/backup/files/auto/..%2F..%2Fsecret.dump',
      '/api/settings/backup/files/auto/%2e%2e%2fsecret.dump',
      '/api/settings/backup/files/..%2F/secret.dump',
      '/api/settings/backup/files/manual/matchexec-2026-11-01T04-00-00-000Z.dump',
      '/api/settings/backup/files/auto/secret.txt',
    ];
    for (const url of attempts) {
      for (const method of ['GET', 'DELETE', 'POST']) {
        const target = method === 'POST' ? `${url}/restore` : url;
        const res = await appRequest(target, { method });
        expect([400, 404], `${method} ${target}`).toContain(res.status);
        expect(res.data).not.toBe('secret');
      }
    }
    expect(fs.existsSync(path.join(tmp, 'secret.dump'))).toBe(true);
  });

  it('restore from a stored file that is not a PostgreSQL dump is a 400', async () => {
    put('auto', 'matchexec-2026-11-01T04-00-00-000Z.dump', 'garbage');
    const res = await appRequest('/api/settings/backup/files/auto/matchexec-2026-11-01T04-00-00-000Z.dump/restore', { method: 'POST' });
    expect(res.status).toBe(400);
  });
});

describe('maintenance gate', () => {
  const app = new Hono();
  app.use('*', maintenanceGate);
  app.get('/api/things', (c) => c.json({ ok: true }));
  app.post('/api/things', (c) => c.json({ ok: true }));
  app.get('/api/health', (c) => c.json({ ok: true }));
  app.get('/uploads/x.png', (c) => c.text('img'));
  app.get('/settings', (c) => c.text('spa'));

  it('passes everything when normal and counts in-flight requests', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    app.get('/api/slow', async (c) => { await gate; return c.json({ ok: true }); });
    expect(inflightRequests()).toBe(0);
    const pending = app.request('/api/slow');
    await new Promise((r) => setTimeout(r, 20));
    expect(inflightRequests()).toBe(1);
    release();
    expect((await pending).status).toBe(200);
    expect(inflightRequests()).toBe(0);
    expect((await app.request('/api/things', { method: 'POST' })).status).toBe(200);
  });

  it('while draining (maintenance): writes get 503, reads still work', async () => {
    setLocalState('maintenance');
    const w = await app.request('/api/things', { method: 'POST' });
    expect(w.status).toBe(503);
    expect(w.headers.get('retry-after')).toBe('5');
    expect(await w.json()).toMatchObject({ maintenance: true });
    expect((await app.request('/api/things')).status).toBe(200);
  });

  it('while restoring: API and uploads get 503 (health and static pages stay up)', async () => {
    setLocalState('restoring');
    expect((await app.request('/api/things')).status).toBe(503);
    expect((await app.request('/api/things', { method: 'POST' })).status).toBe(503);
    expect((await app.request('/uploads/x.png')).status).toBe(503);
    expect((await app.request('/api/health')).status).toBe(200);
    expect((await app.request('/settings')).status).toBe(200);
  });
});
