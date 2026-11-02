/**
 * PostgreSQL client tools for the backup/restore tests (pg_dump / pg_restore, version 18 or newer).
 *
 *  - Native binaries on the PATH (version >= 18) are used as they are.
 *  - Otherwise, when Docker and the `postgres:18-alpine` image are available, `pgBinDir()` writes tiny shim scripts that run the
 *    tools inside that image (`--network host`, stdin/stdout passthrough). That works because lib/backup streams dumps through
 *    stdout and restores through stdin, so no path ever crosses the container boundary. The shims can also mount a directory
 *    (MATCHEXEC_TEST_PG_MOUNT, e.g. a Unix-socket directory).
 *  - Otherwise `pgClientToolsAvailable` is false and the real-Postgres tests skip.
 *
 * Usage: `usePgTools()` sets PG_BIN_DIR for the process (unset = use the PATH).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const IMAGE = 'postgres:18-alpine';

function nativeMajor(): number | null {
  const r = spawnSync('pg_dump', ['--version'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const m = /(\d+)(?:\.\d+)?\s*$/.exec(r.stdout.trim());
  return m ? Number.parseInt(m[1], 10) : null;
}

function hasNative(): boolean {
  const v = nativeMajor();
  return v !== null && v >= 18 && spawnSync('pg_restore', ['--version']).status === 0;
}

function hasDockerImage(): boolean {
  return spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0;
}

const native = hasNative();
const docker = !native && hasDockerImage();

export const pgClientToolsAvailable: boolean = native || docker;

let shimDir: string | null = null;

/** Directory to put in PG_BIN_DIR ('' = use the PATH). */
export function pgBinDir(): string {
  if (native) return '';
  if (!docker) throw new Error('No PostgreSQL 18 client tools available');
  if (shimDir) return shimDir;
  shimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mx-pg-shim-'));
  for (const tool of ['pg_dump', 'pg_restore']) {
    const script = [
      '#!/bin/sh',
      'MOUNT=""',
      '[ -n "$MATCHEXEC_TEST_PG_MOUNT" ] && MOUNT="-v $MATCHEXEC_TEST_PG_MOUNT:$MATCHEXEC_TEST_PG_MOUNT"',
      `exec docker run --rm -i --network host -e PGPASSWORD $MOUNT --entrypoint ${tool} ${IMAGE} "$@"`,
      '',
    ].join('\n');
    fs.writeFileSync(path.join(shimDir, tool), script, { mode: 0o755 });
  }
  return shimDir;
}

/** Use the tools for this process (sets PG_BIN_DIR). */
export function usePgTools(): void {
  const dir = pgBinDir();
  if (dir) process.env.PG_BIN_DIR = dir;
  else delete process.env.PG_BIN_DIR;
}
