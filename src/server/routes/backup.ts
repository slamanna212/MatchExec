/**
 * Backup and restore API (plan Stage 6), mounted under `/api/settings`:
 *
 *   POST   /backup                              manual backup: pg_dump streamed to the response, optional password -> MEXECBAK
 *   GET    /backup/config                       automatic-backup settings + last run + environment info
 *   PUT    /backup/config                       update them
 *   POST   /backup/run                          "Back up now" (an automatic-type backup, pruned like the scheduled ones)
 *   GET    /backup/list                         stored backups (auto, pre-upgrade, pre-restore)
 *   GET    /backup/files/:kind/:filename        download a stored backup
 *   DELETE /backup/files/:kind/:filename        delete one
 *   POST   /backup/files/:kind/:filename/restore  restore from a stored backup
 *   POST   /restore                             restore from an uploaded file (multipart: file, password?)
 *   GET    /restore/status                      maintenance state + live workers (for the UI)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { Hono, type Context } from 'hono';
import { logger } from '@/lib/logger';
import { BackupDecryptError, decryptBackup, encryptBackup, isEncryptedBackup } from '@lib/backup-crypto';
import {
  dumpDatabase, detectBackupFileFormat, detectBackupFormat, InvalidBackupNameError, deleteBackup, listBackups, pgToolsAvailable,
  PgToolError, resolveBackupDir, resolveBackupFile,
} from '@lib/backup';
import { getMaintenance, listFreshWorkers } from '@lib/maintenance';
import { getPool } from '@lib/db';
import { restoreBackup, RestoreError, type RestoreFormat } from '@lib/restore';
import { runAutoBackup } from '@/lib/backup-service';
import { BackupSettingsError, getBackupSettings, updateBackupSettings } from '@/lib/backup-settings';
import { HttpError, jsonError } from '../http';
import { checkRateLimit, clientKey } from '../middleware/rate-limit';
import { releaseInflight } from '../middleware/maintenance';

/** Upload limit for a restore: 100 MB (MATCHEXEC_RESTORE_MAX_MB overrides, mainly for tests). */
const maxRestoreBytes = (): number => (Number.parseInt(process.env.MATCHEXEC_RESTORE_MAX_MB ?? '', 10) || 100) * 1024 * 1024;
const TEN_MINUTES = 10 * 60 * 1000;

function fileStream(file: string, onClose: () => void): ReadableStream {
  const stream = fs.createReadStream(file);
  stream.on('close', onClose);
  return Readable.toWeb(stream) as unknown as ReadableStream;
}

function attachment(filename: string, size: number): Record<string, string> {
  return {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': String(size),
  };
}

function toHttpError(error: unknown, fallback: string): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof RestoreError) return new HttpError(error.status, error.message);
  if (error instanceof InvalidBackupNameError) return HttpError.badRequest(error.message);
  if (error instanceof BackupSettingsError) return HttpError.badRequest(error.message);
  if (error instanceof PgToolError) return new HttpError(500, `${fallback}: ${error.message}`);
  return new HttpError(500, fallback);
}

async function restoreFromFile(c: Context, file: string, format: RestoreFormat) {
  const result = await restoreBackup({
    file,
    format,
    log: (m) => logger.info(`[restore] ${m}`),
    beforeQuiesce: () => releaseInflight(c),
  });
  logger.info(`Database restored from a ${format === 'pgdump' ? 'PostgreSQL' : 'SQLite'} backup in ${result.durationMs} ms (previous data: ${result.preRestoreBackup})`);
  return c.json({ success: true, format: result.format, preRestoreBackup: result.preRestoreBackup, durationMs: result.durationMs });
}

// ─── /api/settings/backup ───────────────────────────────────────────────────

export const backupRoutes = new Hono()
  .post('/', async (c) => {
    checkRateLimit(clientKey(c, 'backup'), 10, TEN_MINUTES);
    const body = (await c.req.json().catch(() => ({}))) as { password?: unknown };
    const password = typeof body.password === 'string' ? body.password.trim() || undefined : undefined;

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'matchexec-backup-'));
    const cleanup = (): void => fs.rmSync(dir, { recursive: true, force: true });
    try {
      const date = new Date().toISOString().split('T')[0];
      const dump = await dumpDatabase(path.join(dir, 'backup.dump'));
      if (password) {
        const filename = `matchexec-backup-${date}.dump.enc`;
        const encrypted = encryptBackup(fs.readFileSync(dump.path), password);
        cleanup();
        logger.info(`Database backup created: ${filename}`);
        return new Response(new Uint8Array(encrypted), { headers: attachment(filename, encrypted.length) });
      }
      const filename = `matchexec-backup-${date}.dump`;
      logger.info(`Database backup created: ${filename}`);
      return new Response(fileStream(dump.path, cleanup), { headers: attachment(filename, dump.bytes) });
    } catch (error) {
      cleanup();
      logger.error('Backup failed:', error);
      throw error instanceof PgToolError ? new HttpError(500, `Backup failed: ${error.message}`) : new HttpError(500, 'Backup failed');
    }
  })
  .get('/config', async (c) => {
    const settings = await getBackupSettings();
    return c.json({ ...settings, backupDir: resolveBackupDir(), pgToolsAvailable: await pgToolsAvailable() });
  })
  .put('/config', async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, any> | null;
    if (!body || typeof body !== 'object') return jsonError(c, 'Invalid request body', 400);
    try {
      await updateBackupSettings({
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
        schedule: typeof body.schedule === 'string' ? body.schedule : undefined,
        retention: body.retention && typeof body.retention === 'object'
          ? { daily: body.retention.daily, weekly: body.retention.weekly }
          : undefined,
      });
    } catch (error) {
      throw toHttpError(error, 'Failed to update backup settings');
    }
    return c.json({ success: true, ...(await getBackupSettings()) });
  })
  .post('/run', async (c) => {
    checkRateLimit(clientKey(c, 'backup-run'), 10, TEN_MINUTES);
    const outcome = await runAutoBackup('manual');
    if (!outcome.ok) return jsonError(c, `Backup failed: ${outcome.error}`, 500);
    const { backup } = outcome;
    return c.json({ success: true, backup: { id: backup.id, kind: backup.kind, filename: backup.filename, size: backup.size, createdAt: backup.createdAt.toISOString() } });
  })
  .get('/list', (c) => {
    return c.json({
      backups: listBackups().map((b) => ({ id: b.id, kind: b.kind, filename: b.filename, size: b.size, createdAt: b.createdAt.toISOString() })),
    });
  })
  .get('/files/:kind/:filename', (c) => {
    let file: string;
    try {
      file = resolveBackupFile(c.req.param('kind'), c.req.param('filename'));
    } catch (error) {
      throw toHttpError(error, 'Invalid backup');
    }
    if (!fs.existsSync(file)) return jsonError(c, 'Backup not found', 404);
    return new Response(fileStream(file, () => undefined), { headers: attachment(path.basename(file), fs.statSync(file).size) });
  })
  .delete('/files/:kind/:filename', (c) => {
    try {
      if (!deleteBackup(c.req.param('kind'), c.req.param('filename'))) return jsonError(c, 'Backup not found', 404);
    } catch (error) {
      throw toHttpError(error, 'Failed to delete the backup');
    }
    return c.json({ success: true });
  })
  .post('/files/:kind/:filename/restore', async (c) => {
    checkRateLimit(clientKey(c, 'restore'), 5, TEN_MINUTES);
    let file: string;
    try {
      file = resolveBackupFile(c.req.param('kind'), c.req.param('filename'));
    } catch (error) {
      throw toHttpError(error, 'Invalid backup');
    }
    if (!fs.existsSync(file)) return jsonError(c, 'Backup not found', 404);
    const format = detectBackupFileFormat(file);
    if (format !== 'pgdump') return jsonError(c, 'Invalid file — not a valid PostgreSQL backup.', 400);
    try {
      return await restoreFromFile(c, file, 'pgdump');
    } catch (error) {
      logger.error('Restore failed:', error);
      throw toHttpError(error, 'Restore failed');
    }
  });

// ─── /api/settings/restore ──────────────────────────────────────────────────

export const restoreRoutes = new Hono()
  .get('/status', async (c) => {
    try {
      const [maintenance, workers] = await Promise.all([getMaintenance(getPool()), listFreshWorkers(getPool())]);
      return c.json({
        state: maintenance.state,
        reason: maintenance.reason,
        startedAt: maintenance.started_at?.toISOString() ?? null,
        workers: workers.map((w) => ({ service: w.service, workerId: w.worker_id, pausedAck: w.paused_ack })),
      });
    } catch {
      // During the swap the control schema is still there, but never let a status poll fail loudly.
      return c.json({ state: 'unknown', reason: null, startedAt: null, workers: [] });
    }
  })
  .post('/', async (c) => {
    checkRateLimit(clientKey(c, 'restore'), 5, TEN_MINUTES);

    const declared = Number.parseInt(c.req.header('content-length') ?? '', 10);
    if (Number.isFinite(declared) && declared > maxRestoreBytes() + 1024 * 1024) return jsonError(c, `File too large (max ${maxRestoreBytes() / 1024 / 1024} MB)`, 400);

    const form = await c.req.formData().catch(() => null);
    const upload = form?.get('file');
    if (!upload || typeof upload === 'string') return jsonError(c, 'No file provided', 400);
    if (upload.size > maxRestoreBytes()) return jsonError(c, `File too large (max ${maxRestoreBytes() / 1024 / 1024} MB)`, 400);
    const rawPassword = form?.get('password');
    const password = typeof rawPassword === 'string' ? rawPassword.trim() || undefined : undefined;

    let buffer: Buffer = Buffer.from(await upload.arrayBuffer());
    if (isEncryptedBackup(buffer)) {
      if (!password) return jsonError(c, 'This backup is encrypted — please provide the password.', 400);
      try {
        buffer = decryptBackup(buffer, password);
      } catch (error) {
        if (error instanceof BackupDecryptError) return jsonError(c, error.message, 400);
        throw error;
      }
    }

    const format = detectBackupFormat(buffer.subarray(0, 16));
    if (format !== 'pgdump' && format !== 'sqlite') {
      return jsonError(c, 'Invalid file — not a valid MatchExec backup (expected a PostgreSQL dump or a legacy SQLite database).', 400);
    }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'matchexec-restore-'));
    try {
      const file = path.join(dir, format === 'pgdump' ? 'upload.dump' : 'upload.db');
      fs.writeFileSync(file, buffer);
      buffer = Buffer.alloc(0);
      return await restoreFromFile(c, file, format);
    } catch (error) {
      logger.error('Restore failed:', error);
      throw toHttpError(error, 'Restore failed');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
