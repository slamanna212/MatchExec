// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  backupFileName, BACKUP_KINDS, cleanPartials, createBackup, deleteBackup, detectBackupFormat, dumpDatabase, InvalidBackupNameError, isEmbeddedDatabase,
  isoWeekKey, listBackups, pgBinary, PgToolError, pruneAutoBackups, pruneNewest, resolveBackupDir, resolveBackupFile, selectRetention, toolConnection,
} from '../../../lib/backup';

let tmp: string;
const saved = { ...process.env };

/** A fake pg_dump: prints a PGDMP header plus its arguments, or fails the way FAKE_PG_MODE says. */
function installFakeTools(): void {
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  const script = `#!/bin/sh
case "$FAKE_PG_MODE" in
  fail) echo "pg_dump: error: connection refused" >&2; exit 1 ;;
  nozstd) case "$*" in *zstd*) echo "pg_dump: error: this build does not support compression with ZSTD" >&2; exit 1 ;; esac ;;
esac
printf 'PGDMP fake dump args: %s pgpassword=%s' "$*" "$PGPASSWORD"
`;
  fs.writeFileSync(path.join(bin, 'pg_dump'), script, { mode: 0o755 });
  process.env.PG_BIN_DIR = bin;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mx-backup-unit-'));
  process.env.MATCHEXEC_BACKUP_DIR = path.join(tmp, 'backups');
  process.env.DATABASE_URL = 'postgres://u:secret@127.0.0.1:5432/matchexec';
  delete process.env.FAKE_PG_MODE;
});
afterEach(() => {
  process.env = { ...saved };
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('locations and environment', () => {
  it('resolveBackupDir honours MATCHEXEC_BACKUP_DIR', () => {
    expect(resolveBackupDir({ MATCHEXEC_BACKUP_DIR: '/data/b' })).toBe('/data/b');
  });

  it('isEmbeddedDatabase: MATCHEXEC_EMBEDDED_PG wins, otherwise the socket host decides', () => {
    expect(isEmbeddedDatabase({ MATCHEXEC_EMBEDDED_PG: 'true' })).toBe(true);
    expect(isEmbeddedDatabase({ MATCHEXEC_EMBEDDED_PG: '1', DATABASE_URL: 'postgres://h/db' })).toBe(true);
    expect(isEmbeddedDatabase({ MATCHEXEC_EMBEDDED_PG: 'false', DATABASE_URL: 'postgresql:///matchexec?host=/run/postgresql' })).toBe(false);
    expect(isEmbeddedDatabase({ DATABASE_URL: 'postgresql:///matchexec?host=/run/postgresql' })).toBe(true);
    expect(isEmbeddedDatabase({ DATABASE_URL: 'postgresql://%2Frun%2Fpostgresql/matchexec' })).toBe(true);
    expect(isEmbeddedDatabase({ DATABASE_URL: 'postgres://u:p@db.example.com:5432/matchexec' })).toBe(false);
    expect(isEmbeddedDatabase({})).toBe(false);
  });

  it('pgBinary uses PG_BIN_DIR when set', () => {
    expect(pgBinary('pg_dump', { PG_BIN_DIR: '/opt/pg/bin' })).toBe('/opt/pg/bin/pg_dump');
    expect(pgBinary('pg_restore', {})).toBe('pg_restore');
  });

  it('toolConnection moves the password out of the URL and keeps the socket form intact', () => {
    const withPw = toolConnection('postgres://app:p%40ss@db:5432/mx?sslmode=require');
    expect(withPw.env).toEqual({ PGPASSWORD: 'p@ss' });
    expect(withPw.dbname).not.toContain('p%40ss');
    expect(withPw.dbname).toContain('sslmode=require');
    const socket = toolConnection('postgresql:///matchexec?host=/run/postgresql');
    expect(socket).toEqual({ dbname: 'postgresql:///matchexec?host=/run/postgresql', env: {} });
  });
});

describe('format sniffing', () => {
  it('detects MEXECBAK, PGDMP and SQLite by magic bytes', () => {
    expect(detectBackupFormat(Buffer.from('MEXECBAK....'))).toBe('encrypted');
    expect(detectBackupFormat(Buffer.from('PGDMP\u0001\u000e'))).toBe('pgdump');
    expect(detectBackupFormat(Buffer.from('SQLite format 3\0rest'))).toBe('sqlite');
    expect(detectBackupFormat(Buffer.from('hello world'))).toBe('unknown');
    expect(detectBackupFormat(Buffer.alloc(0))).toBe('unknown');
  });
});

describe('retention', () => {
  const at = (iso: string) => ({ filename: `f-${iso}`, createdAt: new Date(iso) });

  it('isoWeekKey follows ISO-8601 (Monday weeks, year boundary)', () => {
    expect(isoWeekKey(new Date('2026-11-02T04:00:00Z'))).toBe('2026-W45');
    expect(isoWeekKey(new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53');
    expect(isoWeekKey(new Date('2024-12-30T00:00:00Z'))).toBe('2025-W01');
  });

  it('keeps the newest per day for the N most recent days, then one per week for the older files', () => {
    const files = [];
    // 60 days of daily backups ending 2026-11-02, two per day (04:00 and 16:00)
    for (let i = 0; i < 60; i++) {
      const d = new Date(Date.UTC(2026, 10, 2) - i * 86_400_000).toISOString().slice(0, 10);
      files.push(at(`${d}T04:00:00Z`), at(`${d}T16:00:00Z`));
    }
    const keep = selectRetention(files, { daily: 14, weekly: 4 });
    const kept = files.filter((f) => keep.has(f.filename));
    expect(kept).toHaveLength(14 + 4);
    // dailies: the 16:00 backup of each of the last 14 days
    for (let i = 0; i < 14; i++) {
      const d = new Date(Date.UTC(2026, 10, 2) - i * 86_400_000).toISOString().slice(0, 10);
      expect(keep.has(`f-${d}T16:00:00Z`)).toBe(true);
      expect(keep.has(`f-${d}T04:00:00Z`)).toBe(false);
    }
    // weeklies come from days older than the daily window, each from a different ISO week
    const older = kept.filter((f) => f.createdAt < new Date('2026-10-20T00:00:00Z'));
    expect(older).toHaveLength(4);
    expect(new Set(older.map((f) => isoWeekKey(f.createdAt))).size).toBe(4);
  });

  it('keeps everything when there are fewer files than the policy, and nothing extra for weekly=0', () => {
    const few = [at('2026-11-02T04:00:00Z'), at('2026-11-01T04:00:00Z')];
    expect(selectRetention(few, { daily: 14, weekly: 4 }).size).toBe(2);
    const many = Array.from({ length: 30 }, (_, i) => at(new Date(Date.UTC(2026, 10, 2) - i * 86_400_000).toISOString()));
    expect(selectRetention(many, { daily: 14, weekly: 0 }).size).toBe(14);
  });
});

describe('dump helper (fake pg_dump)', () => {
  it('writes <file>.partial then renames; passes the documented flags and keeps the password off argv', async () => {
    installFakeTools();
    const out = path.join(tmp, 'out', 'x.dump');
    const res = await dumpDatabase(out);
    expect(res.compression).toBe('zstd');
    expect(fs.existsSync(`${out}.partial`)).toBe(false);
    const text = fs.readFileSync(out, 'utf8');
    expect(text.startsWith('PGDMP')).toBe(true);
    expect(text).toContain('--format=custom');
    expect(text).toContain('--compress=zstd');
    expect(text).toContain('--schema=public');
    expect(text).toContain('pgpassword=secret');
    expect(text.split('pgpassword=')[0]).not.toContain('secret');
    expect(res.bytes).toBe(fs.statSync(out).size);
  });

  it('removes the partial file and reports stderr when pg_dump fails', async () => {
    installFakeTools();
    process.env.FAKE_PG_MODE = 'fail';
    const out = path.join(tmp, 'out', 'x.dump');
    await expect(dumpDatabase(out)).rejects.toThrow(/connection refused/);
    expect(fs.existsSync(out)).toBe(false);
    expect(fs.existsSync(`${out}.partial`)).toBe(false);
  });

  it('falls back to gzip when the tools have no zstd support', async () => {
    installFakeTools();
    process.env.FAKE_PG_MODE = 'nozstd';
    const res = await dumpDatabase(path.join(tmp, 'g.dump'));
    expect(res.compression).toBe('gzip');
    expect(fs.readFileSync(res.path, 'utf8')).toContain('--compress=gzip');
  });

  it('reports a missing binary clearly', async () => {
    process.env.PG_BIN_DIR = path.join(tmp, 'nope');
    const err = await dumpDatabase(path.join(tmp, 'm.dump')).catch((e) => e);
    expect(err).toBeInstanceOf(PgToolError);
    expect(err.reason).toBe('missing-binary');
    expect(err.message).toMatch(/PG_BIN_DIR/);
  });
});

describe('backup library', () => {
  it('createBackup writes into <dir>/<kind>/, listBackups sorts newest first and ignores partials', async () => {
    installFakeTools();
    const a = await createBackup('auto', { now: new Date('2026-11-01T04:00:00Z') });
    const b = await createBackup('auto', { now: new Date('2026-11-02T04:00:00Z') });
    const pre = await createBackup('pre-upgrade', { now: new Date('2026-10-30T10:00:00Z') });
    fs.writeFileSync(path.join(resolveBackupDir(), 'auto', 'matchexec-2026-11-03T00-00-00-000Z.dump.partial'), 'x');
    const all = listBackups();
    expect(all.map((f) => f.id)).toEqual([b.id, a.id, pre.id]);
    expect(b.filename).toBe(backupFileName(new Date('2026-11-02T04:00:00Z')));
    expect(b.filename).toBe('matchexec-2026-11-02T04-00-00-000Z.dump');
    expect(all[0].createdAt.toISOString()).toBe('2026-11-02T04:00:00.000Z');
    expect(listBackups(['pre-restore'])).toEqual([]);
    cleanPartials();
    expect(fs.readdirSync(path.join(resolveBackupDir(), 'auto')).some((n) => n.endsWith('.partial'))).toBe(false);
  });

  it('pruneAutoBackups applies the retention policy; pruneNewest keeps N safety dumps', async () => {
    installFakeTools();
    for (let i = 0; i < 20; i++) await createBackup('auto', { now: new Date(Date.UTC(2026, 10, 2) - i * 86_400_000) });
    const removed = pruneAutoBackups({ daily: 14, weekly: 0 });
    expect(removed).toHaveLength(6);
    expect(listBackups(['auto'])).toHaveLength(14);
    for (let i = 0; i < 8; i++) await createBackup('pre-restore', { now: new Date(Date.UTC(2026, 10, 2, i)) });
    expect(pruneNewest('pre-restore', 5)).toHaveLength(3);
    expect(listBackups(['pre-restore'])).toHaveLength(5);
  });

  it('refuses path traversal and unknown kinds', () => {
    for (const bad of ['../etc/passwd', '..', '/etc/passwd', 'a/../../b.dump', 'x.dump/../../y.dump', '.hidden.dump', 'noext', 'x.dump.partial', 'a\\b.dump', '']) {
      expect(() => resolveBackupFile('auto', bad), bad).toThrow(InvalidBackupNameError);
    }
    expect(() => resolveBackupFile('../auto', 'matchexec-2026-11-02T04-00-00-000Z.dump')).toThrow(InvalidBackupNameError);
    expect(() => resolveBackupFile('manual', 'matchexec-2026-11-02T04-00-00-000Z.dump')).toThrow(InvalidBackupNameError);
    for (const kind of BACKUP_KINDS) {
      const p = resolveBackupFile(kind, 'matchexec-2026-11-02T04-00-00-000Z.dump');
      expect(p).toBe(path.join(path.resolve(resolveBackupDir()), kind, 'matchexec-2026-11-02T04-00-00-000Z.dump'));
    }
  });

  it('deleteBackup removes a file and reports a missing one', async () => {
    installFakeTools();
    const b = await createBackup('auto');
    expect(deleteBackup('auto', b.filename)).toBe(true);
    expect(deleteBackup('auto', b.filename)).toBe(false);
  });
});
