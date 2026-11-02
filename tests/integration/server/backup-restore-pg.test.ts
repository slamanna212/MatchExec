// @vitest-environment node
/**
 * Checkpoint 6 on a REAL Postgres (TEST_DATABASE_URL, e.g. `pnpm test:pg`) with the real pg_dump / pg_restore (native, or the
 * postgres:18-alpine container via tests/utils/pg-bin.ts). Skipped when either is missing.
 *
 *   - backup -> restore round trip (library and HTTP, plain and encrypted)
 *   - restore while a worker is mid-job waits for it; a worker that never acknowledges aborts the restore cleanly
 *   - corrupt files and failed sanity checks roll back cleanly (previous data and schema intact, maintenance cleared)
 *   - legacy SQLite .db restore through the importer
 *   - pre-upgrade dump wiring in the migrator
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { pgClientToolsAvailable, usePgTools } from '../../utils/pg-bin';
import { createRealDb, realPostgresUrl, type RealDb } from '../../utils/pg-real-db';
import { appRequest } from '../../utils/app-request';
import { makeLegacyHome, useLegacyHomes } from '../../utils/import-harness';
import { createBackup, listBackups, resolveBackupDir } from '../../../lib/backup';
import { restoreBackup, RestoreError } from '../../../lib/restore';
import {
  beginJob, enterMaintenance, exitMaintenance, getLocalState, getMaintenance, resetLocalMaintenance, RESTORE_LOCK_ID, ROLLBACK_FAILED_REASON,
  startWorkerControl, type WorkerControl,
} from '../../../lib/maintenance';
import { getAppSetting, setAppSetting } from '../../../src/lib/settings';
import { migrationHooks, runMigrations } from '../../../lib/db/migrate';
import { activityFeed, matches } from '../../../lib/db/schema';
import { resetRateLimits } from '../../../src/server/middleware/rate-limit';
import { inflightRequests } from '../../../src/server/middleware/maintenance';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

const enabled = !!realPostgresUrl() && pgClientToolsAvailable;
useLegacyHomes();

describe.skipIf(!enabled)('backup and restore on real Postgres (Checkpoint 6)', () => {
  let real: RealDb;
  let tmp: string;
  const saved = { ...process.env };

  beforeAll(async () => {
    usePgTools();
    real = await createRealDb();
  }, 120_000);

  afterAll(async () => {
    await real?.drop();
    process.env = { ...saved };
  });

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mx-bk-pg-'));
    process.env.MATCHEXEC_BACKUP_DIR = path.join(tmp, 'backups');
    process.env.MATCHEXEC_RESTORE_MAX_MB = '100';
    resetRateLimits();
    resetLocalMaintenance();
    await real.pool.query(`UPDATE control.maintenance SET state='normal', reason=NULL, started_at=NULL`);
    await real.pool.query('DELETE FROM control.workers');
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const marker = (): Promise<string | undefined> => getAppSetting('rt_marker');
  const priorSchemas = async (): Promise<string[]> =>
    (await real.pool.query<{ n: string }>(`SELECT nspname AS n FROM pg_namespace WHERE nspname LIKE 'prerestore\\_%'`)).rows.map((r) => r.n);

  async function tableCounts(): Promise<Record<string, number>> {
    const names = (await real.pool.query<{ t: string }>(`SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`)).rows.map((r) => r.t);
    const out: Record<string, number> = {};
    for (const t of names) out[t] = (await real.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM public."${t}"`)).rows[0].n;
    return out;
  }

  async function addFeedRow(id: string): Promise<void> {
    await real.db.insert(activityFeed).values({ id, event_type: 'health_alert', priority: 2, title: `t-${id}` });
  }

  async function expectHealthy(): Promise<void> {
    expect(await priorSchemas()).toEqual([]);
    expect((await getMaintenance(real.pool)).state).toBe('normal');
    const t = await real.pool.query(`SELECT to_regclass('public.matches') AS m, to_regclass('public.blobs') AS b`);
    expect(t.rows[0].m).not.toBeNull();
    expect(t.rows[0].b).not.toBeNull();
  }

  it('round trip: a dump restores the data exactly, replaces newer data and keeps a pre-restore backup', async () => {
    await setAppSetting('rt_marker', 'v1');
    await addFeedRow('feed_a');
    const countsAtDump = await tableCounts();
    const backup = await createBackup('auto');
    expect(fs.readFileSync(backup.path).subarray(0, 5).toString()).toBe('PGDMP');

    await setAppSetting('rt_marker', 'v2');
    await addFeedRow('feed_b');
    await real.pool.query(`INSERT INTO public.app_settings (setting_key, setting_value) VALUES ('only_in_v2', 'x')`);

    const result = await restoreBackup({ file: backup.path, format: 'pgdump', quiescePollMs: 50 });
    expect(result.format).toBe('pgdump');

    expect(await marker()).toBe('v1');
    expect(await getAppSetting('only_in_v2')).toBeUndefined();
    expect(await tableCounts()).toEqual(countsAtDump);
    await expectHealthy();
    // new rows still get ids / constraints work after the restore (sequences and indexes came back)
    await addFeedRow('feed_c');

    const pre = listBackups(['pre-restore']);
    expect(pre.map((b) => b.filename)).toContain(result.preRestoreBackup);
    // the pre-restore dump really holds the data from before the restore
    await restoreBackup({ file: path.join(resolveBackupDir(), 'pre-restore', result.preRestoreBackup), format: 'pgdump', quiescePollMs: 50 });
    expect(await marker()).toBe('v2');
    expect(await getAppSetting('only_in_v2')).toBe('x');
    await expectHealthy();
  }, 180_000);

  it('HTTP round trip with the web server gate: encrypted download, restore with password, in-flight request released', async () => {
    const control = startWorkerControl({ service: 'web', pool: real.pool, intervalMs: 100, busy: inflightRequests });
    try {
      await setAppSetting('rt_marker', 'http-v1');
      const dl = await (await import('../../../src/server/app')).app.request('/api/settings/backup', {
        method: 'POST', body: JSON.stringify({ password: 'pw-123' }), headers: { 'content-type': 'application/json' },
      });
      expect(dl.status).toBe(200);
      expect(dl.headers.get('content-disposition')).toMatch(/\.dump\.enc"$/);
      const encrypted = Buffer.from(await dl.arrayBuffer());
      expect(encrypted.subarray(0, 8).toString()).toBe('MEXECBAK');

      await setAppSetting('rt_marker', 'http-v2');
      // wrong password first: nothing changes
      const form = (pw: string) => { const fd = new FormData(); fd.append('file', new Blob([encrypted]), 'b.dump.enc'); fd.append('password', pw); return fd; };
      expect((await appRequest('/api/settings/restore', { method: 'POST', body: form('nope') })).status).toBe(400);
      expect(await marker()).toBe('http-v2');

      const ok = await appRequest('/api/settings/restore', { method: 'POST', body: form('pw-123') });
      expect(ok.status).toBe(200);
      expect(ok.data).toMatchObject({ success: true, format: 'pgdump' });
      expect(await marker()).toBe('http-v1');
      await expectHealthy();
      expect(inflightRequests()).toBe(0);
    } finally {
      await control.stop();
    }
  }, 180_000);

  it('unencrypted upload and the stored-backup API (run now, list, restore, download, delete)', async () => {
    await setAppSetting('rt_marker', 'stored-v1');
    const run = await appRequest('/api/settings/backup/run', { method: 'POST' });
    expect(run.status).toBe(200);
    const id: string = run.data.backup.id;
    expect((await appRequest('/api/settings/backup/list')).data.backups.map((b: { id: string }) => b.id)).toContain(id);

    await setAppSetting('rt_marker', 'stored-v2');
    const restored = await appRequest(`/api/settings/backup/files/${id}/restore`, { method: 'POST' });
    expect(restored.status).toBe(200);
    expect(await marker()).toBe('stored-v1');

    const file = await (await import('../../../src/server/app')).app.request(`/api/settings/backup/files/${id}`);
    const bytes = Buffer.from(await file.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe('PGDMP');

    await setAppSetting('rt_marker', 'stored-v3');
    const fd = new FormData();
    fd.append('file', new Blob([bytes]), 'matchexec-backup.dump');
    expect((await appRequest('/api/settings/restore', { method: 'POST', body: fd })).status).toBe(200);
    expect(await marker()).toBe('stored-v1');

    expect((await appRequest(`/api/settings/backup/files/${id}`, { method: 'DELETE' })).status).toBe(200);
    expect(listBackups(['auto']).map((b) => b.id)).not.toContain(id);
    await expectHealthy();
  }, 180_000);

  it('restore while a worker is mid-job waits for it to finish', async () => {
    await setAppSetting('rt_marker', 'w-v1');
    const backup = await createBackup('auto');
    await setAppSetting('rt_marker', 'w-v2');

    const worker: WorkerControl = startWorkerControl({ service: 'bot', pool: real.pool, intervalMs: 100 });
    const endJob = beginJob(); // the worker is in the middle of a job
    let finished = false;
    const restore = restoreBackup({ file: backup.path, format: 'pgdump', quiescePollMs: 50, quiesceTimeoutMs: 30_000 }).finally(() => { finished = true; });
    try {
      await new Promise((r) => setTimeout(r, 2000));
      expect(finished).toBe(false);
      expect((await getMaintenance(real.pool)).state).toBe('maintenance');
      expect(await marker()).toBe('w-v2'); // nothing touched yet
      // while draining the web server refuses writes but still serves reads
      const write = await appRequest('/api/settings/ui', { method: 'PUT', json: { theme: 'dark' } });
      expect(write.status).toBe(503);
      expect(write.data.maintenance).toBe(true);
      expect((await appRequest('/api/health')).status).toBe(200);
      const acks = (await real.pool.query('SELECT paused_ack FROM control.workers WHERE service = $1', ['bot'])).rows;
      expect(acks.every((r) => r.paused_ack === false)).toBe(true);
    } finally {
      endJob();
    }
    await restore;
    expect(await marker()).toBe('w-v1');
    await expectHealthy();
    // the worker saw the end of maintenance and went back to normal
    await new Promise((r) => setTimeout(r, 400));
    const after = await real.pool.query('SELECT paused_ack FROM control.workers WHERE service = $1', ['bot']);
    expect(after.rows[0].paused_ack).toBe(false);
    await worker.stop();
  }, 180_000);

  it('a worker that never acknowledges aborts the restore: nothing changed, maintenance cleared, culprit named', async () => {
    await setAppSetting('rt_marker', 'g-v1');
    const backup = await createBackup('auto');
    await setAppSetting('rt_marker', 'g-v2');
    await real.pool.query(`INSERT INTO control.workers (worker_id, service, paused_ack) VALUES ('ghost:1', 'bot', false)`);
    const before = listBackups(['pre-restore']).length;

    const err = await restoreBackup({ file: backup.path, format: 'pgdump', quiescePollMs: 50, quiesceTimeoutMs: 800 }).catch((e) => e);
    expect(err).toBeInstanceOf(RestoreError);
    expect(err.status).toBe(409);
    expect(err.message).toContain('bot (ghost:1)');
    expect(await marker()).toBe('g-v2');
    expect(listBackups(['pre-restore']).length).toBe(before);
    await expectHealthy();
  }, 120_000);

  it('corrupt dumps never leave a half-restored database: rejected up front, or rolled back after the swap started', async () => {
    await setAppSetting('rt_marker', 'c-v1');
    const good = await createBackup('auto');
    const bytes = fs.readFileSync(good.path);
    await setAppSetting('rt_marker', 'c-v2');
    const countsCurrent = await tableCounts();

    // Each variant is damaged differently; whichever stage notices (pg_restore --list, pg_restore itself) the outcome must be
    // the same: an error, the previous data untouched, no leftover schema, maintenance cleared.
    const variants: Record<string, Buffer> = {
      'truncated at 60%': bytes.subarray(0, Math.floor(bytes.length * 0.6)),
      'truncated at 97%': bytes.subarray(0, Math.floor(bytes.length * 0.97)),
      'last 40 bytes cut': bytes.subarray(0, bytes.length - 40),
      'bytes overwritten in the data section': Buffer.concat([bytes.subarray(0, Math.floor(bytes.length * 0.8)), Buffer.alloc(64, 0xff), bytes.subarray(Math.floor(bytes.length * 0.8) + 64)]),
    };
    let reachedSwap = 0;
    for (const [name, data] of Object.entries(variants)) {
      const file = path.join(tmp, `corrupt-${reachedSwap}-${name.length}.dump`);
      fs.writeFileSync(file, data);
      const preBefore = listBackups(['pre-restore']).length;
      const err = await restoreBackup({ file, format: 'pgdump', quiescePollMs: 50 }).catch((e) => e);
      if (!(err instanceof RestoreError)) {
        // a corruption pg_restore tolerates (e.g. trailing bytes) simply restores: put the data back for the next variant
        await setAppSetting('rt_marker', 'c-v2');
        continue;
      }
      expect(await marker(), name).toBe('c-v2');
      expect(await tableCounts(), name).toEqual(countsCurrent);
      await expectHealthy();
      if (listBackups(['pre-restore']).length > preBefore) reachedSwap++;
    }
    // at least one variant must have failed INSIDE the swap (pre-restore dump taken, schema renamed, then rolled back)
    expect(reachedSwap).toBeGreaterThan(0);
  }, 240_000);

  it('garbage bytes after a valid header are rejected over HTTP without touching anything', async () => {
    await setAppSetting('rt_marker', 'h-v1');
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.concat([Buffer.from('PGDMP\u0001\u000e\u0000'), Buffer.alloc(200, 0x41)])]), 'bad.dump');
    const res = await appRequest('/api/settings/restore', { method: 'POST', body: fd });
    expect(res.status).toBe(400);
    expect(await marker()).toBe('h-v1');
    await expectHealthy();
  }, 120_000);

  it('a restorable but unusable database (failed sanity check) is rolled back after pg_restore succeeded', async () => {
    await setAppSetting('rt_marker', 's-v1');
    await real.pool.query('ALTER TABLE public.blobs RENAME TO blobs_hidden');
    let bad;
    try {
      bad = await createBackup('auto'); // a dump without the blobs table
    } finally {
      await real.pool.query('ALTER TABLE public.blobs_hidden RENAME TO blobs');
    }
    await setAppSetting('rt_marker', 's-v2');
    const countsCurrent = await tableCounts();

    const err = await restoreBackup({ file: bad.path, format: 'pgdump', quiescePollMs: 50 }).catch((e) => e);
    expect(err).toBeInstanceOf(RestoreError);
    expect(err.message).toMatch(/blobs/);
    expect(await marker()).toBe('s-v2');
    expect(await tableCounts()).toEqual(countsCurrent);
    await expectHealthy();
  }, 180_000);

  it('legacy SQLite .db restore goes through the importer (HTTP upload)', async () => {
    await setAppSetting('rt_marker', 'before-sqlite');
    const home = makeLegacyHome();
    const fd = new FormData();
    fd.append('file', new Blob([fs.readFileSync(home.dbPath)]), 'matchexec-backup-2026-03-18.db');
    const res = await appRequest('/api/settings/restore', { method: 'POST', body: fd });
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data).toMatchObject({ success: true, format: 'sqlite' });

    const [{ n }] = await real.db.select({ n: sql<number>`count(*)::int` }).from(matches);
    expect(n).toBe(12); // the scenario's matches
    expect(await marker()).toBeUndefined(); // the old data was replaced
    const games = await real.pool.query('SELECT count(*)::int AS n FROM public.games');
    expect(games.rows[0].n).toBeGreaterThan(0);
    const status = await real.pool.query('SELECT phase, imported_from_sqlite FROM public.system_status WHERE id = 1');
    expect(status.rows[0]).toMatchObject({ phase: 'ready', imported_from_sqlite: true });
    await expectHealthy();
    // the data that was replaced is recoverable from the pre-restore dump
    const pre = listBackups(['pre-restore']);
    expect(pre.length).toBeGreaterThan(0);
    await restoreBackup({ file: pre[0].filename ? path.join(resolveBackupDir(), 'pre-restore', pre[0].filename) : '', format: 'pgdump', quiescePollMs: 50 });
    expect(await marker()).toBe('before-sqlite');
    await expectHealthy();
  }, 240_000);

  it('an encrypted legacy .db that fails the importer preflight changes nothing', async () => {
    await setAppSetting('rt_marker', 'enc-sqlite-before');
    const { encryptBackup } = await import('../../../lib/backup-crypto');
    const bad = makeLegacyHome({ corrupt: ['orphanTeamMember'] });
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(encryptBackup(fs.readFileSync(bad.dbPath), "pw"))]), 'b.db.enc');
    fd.append('password', 'pw');
    const res = await appRequest('/api/settings/restore', { method: 'POST', body: fd });
    expect(res.status, JSON.stringify(res.data)).toBe(400);
    expect(res.data.error).toMatch(/cannot be imported/i);
    expect(await marker()).toBe('enc-sqlite-before');
    const status = await real.pool.query('SELECT phase FROM public.system_status WHERE id = 1');
    expect(status.rows[0].phase).toBe('ready');
    await expectHealthy();
  }, 240_000);

  describe('control plane', () => {
    it('workers heartbeat, acknowledge only when idle, and see maintenance end (onResume)', async () => {
      let resumed = 0;
      let paused = 0;
      // a real restore holds this lock for its whole duration (otherwise workers treat the maintenance state as stale)
      const holder = await real.pool.connect();
      await holder.query('SELECT pg_advisory_lock($1::bigint)', [RESTORE_LOCK_ID]);
      const worker = startWorkerControl({ service: 'stats', pool: real.pool, intervalMs: 50, onResume: () => { resumed++; }, onPause: () => { paused++; } });
      try {
        await worker.tick();
        const row = async () => (await real.pool.query('SELECT paused_ack, heartbeat_at FROM control.workers WHERE worker_id = $1', [worker.workerId])).rows[0];
        expect((await row()).paused_ack).toBe(false);

        const startedAt = await enterMaintenance(real.pool, 'test');
        expect(startedAt).toBeInstanceOf(Date);
        expect(await enterMaintenance(real.pool, 'second')).toBeNull(); // only one maintenance at a time
        await worker.tick();
        expect(getLocalState()).toBe('maintenance');
        const ack = await row();
        expect(ack.paused_ack).toBe(true);
        expect(ack.heartbeat_at.getTime()).toBeGreaterThanOrEqual(startedAt!.getTime());

        await exitMaintenance(real.pool);
        await worker.tick();
        expect(getLocalState()).toBe('normal');
        expect((await row()).paused_ack).toBe(false);
        expect(paused).toBe(1);
        expect(resumed).toBe(1);

        const end = beginJob();
        await enterMaintenance(real.pool, 'busy');
        await worker.tick();
        expect((await row()).paused_ack).toBe(false); // a job is running: no ack
        end();
        await worker.tick();
        expect((await row()).paused_ack).toBe(true);
        await exitMaintenance(real.pool);
      } finally {
        await holder.query('SELECT pg_advisory_unlock($1::bigint)', [RESTORE_LOCK_ID]);
        holder.release();
        await worker.stop();
      }
      expect((await real.pool.query('SELECT 1 FROM control.workers WHERE worker_id = $1', [worker.workerId])).rowCount).toBe(0);
    });

    it('maintenance left behind by a crashed restore (nobody holds the restore lock) is cleared by the next heartbeat', async () => {
      await real.pool.query(`UPDATE control.maintenance SET state = 'restoring', reason = 'restore', started_at = now()`);
      const worker = startWorkerControl({ service: 'bot', pool: real.pool, intervalMs: 5000 });
      try {
        await worker.tick();
        expect((await getMaintenance(real.pool)).state).toBe('normal');
        expect(getLocalState()).toBe('normal');
      } finally {
        await worker.stop();
      }
    });

    it('but not while a restore holds the lock, and never after a failed rollback', async () => {
      const holder = await real.pool.connect();
      const worker = startWorkerControl({ service: 'bot', pool: real.pool, intervalMs: 5000 });
      try {
        await holder.query('SELECT pg_advisory_lock($1::bigint)', [RESTORE_LOCK_ID]);
        await real.pool.query(`UPDATE control.maintenance SET state = 'restoring', reason = 'restore', started_at = now()`);
        await worker.tick();
        expect((await getMaintenance(real.pool)).state).toBe('restoring');
        await holder.query('SELECT pg_advisory_unlock($1::bigint)', [RESTORE_LOCK_ID]);

        await real.pool.query(`UPDATE control.maintenance SET state = 'maintenance', reason = $1`, [`${ROLLBACK_FAILED_REASON}: data is in prerestore_x`]);
        await worker.tick();
        expect((await getMaintenance(real.pool)).state).toBe('maintenance');
      } finally {
        holder.release();
        await worker.stop();
        await real.pool.query(`UPDATE control.maintenance SET state = 'normal', reason = NULL, started_at = NULL`);
      }
    });

    it('a second restore while one is running is refused with 409 and does not disturb the first', async () => {
      await setAppSetting('rt_marker', 'x-v1');
      const backup = await createBackup('auto');
      const holder = await real.pool.connect();
      try {
        await holder.query('SELECT pg_advisory_lock($1::bigint)', [RESTORE_LOCK_ID]);
        const err = await restoreBackup({ file: backup.path, format: 'pgdump', quiescePollMs: 50 }).catch((e) => e);
        expect(err).toBeInstanceOf(RestoreError);
        expect(err.status).toBe(409);
        expect(err.message).toMatch(/already in progress/);
      } finally {
        await holder.query('SELECT pg_advisory_unlock($1::bigint)', [RESTORE_LOCK_ID]);
        holder.release();
      }
      await expectHealthy();
    }, 120_000);
  });

  describe('pre-upgrade dump', () => {
    it('the hook writes backups/pre-upgrade/*.dump (and keeps only the newest 5)', async () => {
      for (let i = 0; i < 6; i++) await migrationHooks.preUpgradeDump({ pool: real.pool, pendingMigrations: 1 });
      const files = listBackups(['pre-upgrade']);
      expect(files).toHaveLength(5);
      expect(fs.readFileSync(path.join(resolveBackupDir(), 'pre-upgrade', files[0].filename)).subarray(0, 5).toString()).toBe('PGDMP');
    }, 180_000);

    it('runMigrations calls it only when migrations were applied before and some are pending', async () => {
      const folder = path.join(tmp, 'drizzle');
      fs.cpSync(path.join(process.cwd(), 'drizzle'), folder, { recursive: true });
      const journalPath = path.join(folder, 'meta', '_journal.json');
      const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
      journal.entries.push({ idx: journal.entries.length, version: journal.entries[0].version, when: journal.entries[journal.entries.length - 1].when + 1000, tag: '0001_test_noop', breakpoints: true });
      fs.writeFileSync(journalPath, JSON.stringify(journal));
      fs.writeFileSync(path.join(folder, '0001_test_noop.sql'), 'CREATE TABLE IF NOT EXISTS public.zz_test_noop (id integer);\n');

      const spy = vi.spyOn(migrationHooks, 'preUpgradeDump').mockResolvedValue();
      try {
        await runMigrations({ pool: real.pool, migrationsFolder: folder, seed: false, skipLegacyImport: true });
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0].pendingMigrations).toBe(1);
        await runMigrations({ pool: real.pool, migrationsFolder: folder, seed: false, skipLegacyImport: true });
        expect(spy).toHaveBeenCalledTimes(1); // nothing pending the second time
      } finally {
        spy.mockRestore();
        await real.pool.query('DROP TABLE IF EXISTS public.zz_test_noop');
        await real.pool.query(`DELETE FROM public.__drizzle_migrations WHERE id = (SELECT max(id) FROM public.__drizzle_migrations) AND (SELECT count(*) FROM public.__drizzle_migrations) > 1`);
      }
    }, 120_000);

    it('a failing dump aborts the upgrade with a clear message; MATCHEXEC_SKIP_PREUPGRADE_DUMP overrides', async () => {
      const prev = process.env.PG_BIN_DIR;
      process.env.PG_BIN_DIR = path.join(tmp, 'nothing-here');
      try {
        await expect(migrationHooks.preUpgradeDump({ pool: real.pool, pendingMigrations: 2 })).rejects.toThrow(/2 pending migration\(s\) were NOT applied.*pg_dump was not found/s);
        process.env.MATCHEXEC_SKIP_PREUPGRADE_DUMP = 'true';
        await expect(migrationHooks.preUpgradeDump({ pool: real.pool, pendingMigrations: 2 })).resolves.toBeUndefined();
      } finally {
        delete process.env.MATCHEXEC_SKIP_PREUPGRADE_DUMP;
        if (prev === undefined) delete process.env.PG_BIN_DIR; else process.env.PG_BIN_DIR = prev;
      }
    });
  });
});
