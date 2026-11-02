/**
 * Backup primitives (plan Stage 6): the pg_dump / pg_restore wrappers, the on-disk backup library
 * (`$MATCHEXEC_BACKUP_DIR/{auto,pre-upgrade,pre-restore}/matchexec-<ISO>.dump`), retention and file-format sniffing.
 *
 * - No logger and no app imports: this module is bundled into the migrate process (pre-upgrade dump), the scheduler and the web
 *   server alike.
 * - The PostgreSQL client tools are located via `PG_BIN_DIR` (a directory holding `pg_dump` / `pg_restore`) or the PATH. The
 *   production image ships both (Stage 7). Tests without local binaries point `PG_BIN_DIR` at shims that run the tools in a
 *   `postgres:18-alpine` container (tests/utils/pg-bin.ts).
 * - Dumps are streamed through stdout and restores read from stdin, so no tool ever needs to see a path: that is what lets the
 *   same code drive native binaries and a containerised shim.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BACKUP_MAGIC } from './backup-crypto';

// ─── Locations ───────────────────────────────────────────────────────────────

export const BACKUP_KINDS = ['auto', 'pre-upgrade', 'pre-restore'] as const;
export type BackupKind = (typeof BACKUP_KINDS)[number];

export const DEFAULT_RETENTION = { daily: 14, weekly: 4 } as const;
/** How many pre-upgrade / pre-restore safety dumps are kept (the newest). */
export const SAFETY_DUMPS_KEPT = 5;

/** `MATCHEXEC_BACKUP_DIR`, else `/app/app_data/backups` inside the image, else `./app_data/backups`. */
export function resolveBackupDir(env: Record<string, string | undefined> = process.env, cwd = process.cwd()): string {
  if (env.MATCHEXEC_BACKUP_DIR) return path.resolve(env.MATCHEXEC_BACKUP_DIR);
  if (env.NODE_ENV !== 'development' && fs.existsSync('/app/app_data')) return '/app/app_data/backups';
  return path.join(cwd, 'app_data', 'backups');
}

export function kindDir(kind: BackupKind, env: Record<string, string | undefined> = process.env): string {
  return path.join(resolveBackupDir(env), kind);
}

/** True for the all-in-one image's Postgres: `MATCHEXEC_EMBEDDED_PG` (set by s6, Stage 7) or a Unix-socket `DATABASE_URL`. */
export function isEmbeddedDatabase(env: Record<string, string | undefined> = process.env): boolean {
  const flag = env.MATCHEXEC_EMBEDDED_PG?.trim().toLowerCase();
  if (flag) return ['1', 'true', 'yes'].includes(flag);
  const url = env.DATABASE_URL;
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = u.searchParams.get('host') ?? decodeURIComponent(u.hostname);
    return host.startsWith('/');
  } catch {
    return false;
  }
}

// ─── Tool invocation ─────────────────────────────────────────────────────────

export type PgTool = 'pg_dump' | 'pg_restore';

export class PgToolError extends Error {
  constructor(message: string, readonly reason: 'missing-binary' | 'failed', readonly stderr = '') {
    super(message);
    this.name = 'PgToolError';
  }
}

export function pgBinary(tool: PgTool, env: Record<string, string | undefined> = process.env): string {
  return env.PG_BIN_DIR ? path.join(env.PG_BIN_DIR, tool) : tool;
}

export function resolveDatabaseUrlForTools(databaseUrl?: string, env: Record<string, string | undefined> = process.env): string {
  const url = databaseUrl ?? env.DATABASE_URL ?? (env.NODE_ENV === 'development' ? 'postgres://matchexec:matchexec@127.0.0.1:5432/matchexec' : undefined);
  if (!url) throw new Error('DATABASE_URL is not set');
  return url;
}

/**
 * libpq understands both `postgres://user:pw@host/db` and the socket form `postgresql:///db?host=/run/postgresql` natively, so
 * the URL is passed through as the dbname. A password is moved out of argv into PGPASSWORD (visible in `ps` otherwise).
 */
export function toolConnection(databaseUrl: string): { dbname: string; env: Record<string, string> } {
  try {
    const u = new URL(databaseUrl);
    if (u.password) {
      const password = decodeURIComponent(u.password);
      u.password = '';
      return { dbname: u.toString(), env: { PGPASSWORD: password } };
    }
  } catch { /* not a URL: libpq may accept a keyword/value string */ }
  return { dbname: databaseUrl, env: {} };
}

interface RunToolOptions {
  args: string[];
  env?: Record<string, string>;
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
  /** Collect stdout in memory (only for small outputs such as `pg_restore --list`). */
  captureStdout?: boolean;
}

function runTool(tool: PgTool, options: RunToolOptions): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(pgBinary(tool), options.args, {
      env: { ...process.env, ...options.env },
      stdio: [options.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const fail = (e: PgToolError) => { if (!settled) { settled = true; reject(e); } };

    child.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') {
        fail(new PgToolError(`${tool} was not found. Install the PostgreSQL client tools or set PG_BIN_DIR to the directory containing them.`, 'missing-binary'));
      } else {
        fail(new PgToolError(`Could not run ${tool}: ${e.message}`, 'failed'));
      }
    });
    child.stderr!.on('data', (d: Buffer) => { stderr = (stderr + d.toString()).slice(-8000); });
    if (options.stdout) {
      child.stdout!.pipe(options.stdout, { end: false });
    } else if (options.captureStdout) {
      child.stdout!.on('data', (d: Buffer) => { stdout += d.toString(); });
    } else {
      child.stdout!.resume();
    }
    if (options.stdin) {
      child.stdin!.on('error', () => { /* the tool exited early; its exit code explains why */ });
      options.stdin.on('error', (e) => fail(new PgToolError(`Could not read the input file: ${e.message}`, 'failed')));
      options.stdin.pipe(child.stdin!);
    }
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) resolve({ stdout, stderr });
      else reject(new PgToolError(`${tool} exited with code ${code}: ${stderr.trim().split('\n').slice(-6).join(' | ')}`, 'failed', stderr));
    });
  });
}

// ─── Dump ────────────────────────────────────────────────────────────────────

export interface DumpResult {
  path: string;
  bytes: number;
  compression: 'zstd' | 'gzip';
}

async function dumpToStream(databaseUrl: string, out: fs.WriteStream, compress: string): Promise<void> {
  const conn = toolConnection(databaseUrl);
  let streamError: Error | null = null;
  const finished = new Promise<void>((resolve) => {
    out.on('finish', resolve);
    out.on('error', (e) => { streamError = e; resolve(); });
  });
  try {
    await runTool('pg_dump', {
      // Only the application data: the `control` schema (restore coordination) is deliberately excluded.
      args: ['--format=custom', `--compress=${compress}`, '--schema=public', '--lock-wait-timeout=30000', '--dbname', conn.dbname],
      env: conn.env,
      stdout: out,
    });
  } finally {
    out.end();
    await finished;
  }
  if (streamError) throw new PgToolError(`Could not write the backup file: ${(streamError as Error).message}`, 'failed');
}

/**
 * `pg_dump --format=custom --compress=zstd --schema=public` of `databaseUrl` into `outPath`: written to `<outPath>.partial` and
 * renamed on success, so a half-written file never looks like a backup. Falls back to gzip when the tools were built without zstd.
 */
export async function dumpDatabase(outPath: string, options: { databaseUrl?: string } = {}): Promise<DumpResult> {
  const databaseUrl = resolveDatabaseUrlForTools(options.databaseUrl);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const partial = `${outPath}.partial`;
  const attempt = async (compress: string): Promise<void> => {
    await dumpToStream(databaseUrl, fs.createWriteStream(partial), compress);
  };
  let compression: DumpResult['compression'] = 'zstd';
  try {
    try {
      await attempt('zstd');
    } catch (e) {
      if (e instanceof PgToolError && e.reason === 'failed' && /zstd/i.test(e.stderr) && /(not support|without|compiled)/i.test(e.stderr)) {
        compression = 'gzip';
        await attempt('gzip');
      } else {
        throw e;
      }
    }
    fs.renameSync(partial, outPath);
  } catch (e) {
    fs.rmSync(partial, { force: true });
    throw e;
  }
  return { path: outPath, bytes: fs.statSync(outPath).size, compression };
}

export function backupFileName(now = new Date()): string {
  return `matchexec-${now.toISOString().replace(/[:.]/g, '-')}.dump`;
}

export interface BackupFileInfo {
  /** `<kind>/<filename>`: the identifier used by the API. */
  id: string;
  kind: BackupKind;
  filename: string;
  size: number;
  createdAt: Date;
}

const NAME_RE = /^matchexec-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.dump$/;
const SAFE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.dump$/;

function createdAtFor(filename: string, fallback: Date): Date {
  const m = NAME_RE.exec(filename);
  return m ? new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : fallback;
}

/** Dump the database into `<backupDir>/<kind>/matchexec-<ISO>.dump`. */
export async function createBackup(kind: BackupKind, options: { databaseUrl?: string; now?: Date } = {}): Promise<BackupFileInfo & DumpResult> {
  const now = options.now ?? new Date();
  const dir = kindDir(kind);
  let filename = backupFileName(now);
  for (let i = 2; fs.existsSync(path.join(dir, filename)); i++) filename = backupFileName(new Date(now.getTime() + i));
  const result = await dumpDatabase(path.join(dir, filename), { databaseUrl: options.databaseUrl });
  return { ...result, id: `${kind}/${filename}`, kind, filename, size: result.bytes, createdAt: createdAtFor(filename, now) };
}

export function listBackups(kinds: readonly BackupKind[] = BACKUP_KINDS): BackupFileInfo[] {
  const out: BackupFileInfo[] = [];
  for (const kind of kinds) {
    const dir = kindDir(kind);
    let names: string[];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const filename of names) {
      if (!SAFE_NAME_RE.test(filename)) continue; // skips *.partial and strangers
      const stat = fs.statSync(path.join(dir, filename));
      if (!stat.isFile()) continue;
      out.push({ id: `${kind}/${filename}`, kind, filename, size: stat.size, createdAt: createdAtFor(filename, stat.mtime) });
    }
  }
  return out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.filename.localeCompare(a.filename));
}

export class InvalidBackupNameError extends Error {
  constructor(message = 'Invalid backup name') {
    super(message);
    this.name = 'InvalidBackupNameError';
  }
}

/** Absolute path of a stored backup. Rejects unknown kinds and anything that is not a plain `*.dump` file name (path traversal). */
export function resolveBackupFile(kind: string, filename: string): string {
  if (!(BACKUP_KINDS as readonly string[]).includes(kind)) throw new InvalidBackupNameError('Unknown backup type');
  if (!SAFE_NAME_RE.test(filename) || filename !== path.basename(filename) || filename.includes('..')) throw new InvalidBackupNameError();
  const dir = path.resolve(kindDir(kind as BackupKind));
  const full = path.resolve(dir, filename);
  if (path.dirname(full) !== dir) throw new InvalidBackupNameError();
  return full;
}

export function deleteBackup(kind: string, filename: string): boolean {
  const full = resolveBackupFile(kind, filename);
  if (!fs.existsSync(full)) return false;
  fs.rmSync(full);
  return true;
}

// ─── Retention ───────────────────────────────────────────────────────────────

export interface RetentionPolicy {
  daily: number;
  weekly: number;
}

const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

/** ISO-8601 week key (`YYYY-Www`, UTC). */
export function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Which automatic backups survive pruning: the newest backup of each of the `daily` most recent days that have one, plus the
 * newest backup of each of the `weekly` most recent ISO weeks among the REMAINING (older) files. UTC day/week boundaries.
 * So with 14 + 4 you keep two weeks of dailies and four further weekly snapshots, about six weeks of history in total.
 */
export function selectRetention<T extends { filename: string; createdAt: Date }>(files: readonly T[], policy: RetentionPolicy): Set<string> {
  const keep = new Set<string>();
  const sorted = [...files].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.filename.localeCompare(a.filename));

  const days = new Set<string>();
  for (const f of sorted) {
    const k = dayKey(f.createdAt);
    if (days.has(k)) continue;
    if (days.size >= Math.max(0, policy.daily)) break;
    days.add(k);
    keep.add(f.filename);
  }

  // Weekly snapshots come only from days OLDER than the daily window (siblings of a kept day are simply dropped).
  const oldestDay = [...days].sort()[0];
  const weeks = new Set<string>();
  for (const f of sorted) {
    if (oldestDay !== undefined && dayKey(f.createdAt) >= oldestDay) continue;
    const k = isoWeekKey(f.createdAt);
    if (weeks.has(k)) continue;
    if (weeks.size >= Math.max(0, policy.weekly)) break;
    weeks.add(k);
    keep.add(f.filename);
  }
  return keep;
}

/** Delete automatic backups outside the retention policy. Returns the deleted file names. */
export function pruneAutoBackups(policy: RetentionPolicy): string[] {
  const files = listBackups(['auto']);
  const keep = selectRetention(files, policy);
  const removed: string[] = [];
  for (const f of files) {
    if (keep.has(f.filename)) continue;
    fs.rmSync(path.join(kindDir('auto'), f.filename), { force: true });
    removed.push(f.filename);
  }
  return removed;
}

/** Keep only the newest `keep` files of a safety-dump kind (pre-upgrade / pre-restore). */
export function pruneNewest(kind: BackupKind, keep = SAFETY_DUMPS_KEPT): string[] {
  const files = listBackups([kind]);
  const removed: string[] = [];
  for (const f of files.slice(Math.max(0, keep))) {
    fs.rmSync(path.join(kindDir(kind), f.filename), { force: true });
    removed.push(f.filename);
  }
  return removed;
}

/** Remove leftover `*.partial` files (a crash mid-dump). */
export function cleanPartials(): void {
  for (const kind of BACKUP_KINDS) {
    const dir = kindDir(kind);
    let names: string[];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const n of names) if (n.endsWith('.partial')) fs.rmSync(path.join(dir, n), { force: true });
  }
}

// ─── Format detection and inspection ────────────────────────────────────────

export type BackupFormat = 'encrypted' | 'pgdump' | 'sqlite' | 'unknown';

const PGDMP_MAGIC = Buffer.from('PGDMP');
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0');

/** Sniff the first bytes of a file: MEXECBAK (encrypted envelope), PGDMP (pg custom dump), SQLite format 3 (legacy .db). */
export function detectBackupFormat(head: Buffer): BackupFormat {
  if (head.length >= BACKUP_MAGIC.length && head.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) return 'encrypted';
  if (head.length >= PGDMP_MAGIC.length && head.subarray(0, PGDMP_MAGIC.length).equals(PGDMP_MAGIC)) return 'pgdump';
  if (head.length >= SQLITE_MAGIC.length && head.subarray(0, SQLITE_MAGIC.length).equals(SQLITE_MAGIC)) return 'sqlite';
  return 'unknown';
}

export function detectBackupFileFormat(file: string): BackupFormat {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(16);
    const n = fs.readSync(fd, head, 0, 16, 0);
    return detectBackupFormat(head.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
}

export interface DumpInfo {
  /** `CREATE SCHEMA public` is part of the archive (always true for dumps made by this module). */
  hasPublicSchema: boolean;
  tableCount: number;
  compression: string | null;
  dumpedFrom: string | null;
}

/** Parse the table of contents with `pg_restore --list`: proves the header and TOC are readable before anything is touched. */
export async function inspectPgDump(file: string): Promise<DumpInfo> {
  const { stdout } = await runTool('pg_restore', { args: ['--list'], stdin: fs.createReadStream(file), captureStdout: true });
  const lines = stdout.split('\n');
  return {
    hasPublicSchema: lines.some((l) => /\bSCHEMA - public\b/.test(l)),
    tableCount: lines.filter((l) => /^\d+; \d+ \d+ TABLE public /.test(l)).length,
    compression: /^;\s+Compression:\s+(\S+)/m.exec(stdout)?.[1] ?? null,
    dumpedFrom: /^; Dumped from database version:\s+(\S+)/m.exec(stdout)?.[1] ?? null,
  };
}

/** `pg_restore --single-transaction --no-owner --no-privileges --exit-on-error` of `file` into the target database. */
export async function restorePgDump(file: string, options: { databaseUrl?: string } = {}): Promise<void> {
  const conn = toolConnection(resolveDatabaseUrlForTools(options.databaseUrl));
  await runTool('pg_restore', {
    args: ['--single-transaction', '--no-owner', '--no-privileges', '--exit-on-error', '--dbname', conn.dbname],
    env: conn.env,
    stdin: fs.createReadStream(file),
  });
}

/** True when `pg_dump` can be started (used by the UI to warn about a missing client). */
export async function pgToolsAvailable(): Promise<boolean> {
  try {
    await runTool('pg_dump', { args: ['--version'], captureStdout: true });
    return true;
  } catch {
    return false;
  }
}
