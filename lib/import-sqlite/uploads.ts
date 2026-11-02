/**
 * Plan 5.3 step 5: legacy uploads (`public/uploads/**` on disk: event images, scorecard screenshots, stat images) -> `blobs`,
 * keeping the public URL path (`/uploads/<relative path>`) so stored URLs and Discord embeds keep working. Files are
 * only read; they are never moved or deleted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { blobs } from '../db/schema';
import type { Executor } from '../db';
import { MAX_BLOB_BYTES, UPLOADS_PREFIX, isValidBlobPath } from '../storage';
import type { Issue, Repair } from './types';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

export interface UploadFile {
  /** Public URL path, e.g. /uploads/scorecards/<matchId>/x.png */
  urlPath: string;
  file: string;
  size: number;
  mtime: Date;
}

export function defaultUploadDirs(env: Record<string, string | undefined> = process.env, legacyDbPath?: string): string[] {
  const dirs = [env.MATCHEXEC_UPLOADS_DIR, path.join(process.cwd(), 'public', 'uploads'), '/app/public/uploads'];
  // <root>/app_data/data/matchexec.db  ->  <root>/public/uploads
  if (legacyDbPath) dirs.push(path.resolve(path.dirname(legacyDbPath), '..', '..', 'public', 'uploads'));
  const real = new Set<string>();
  const out: string[] = [];
  for (const d of dirs) {
    if (!d || !fs.existsSync(d) || !fs.statSync(d).isDirectory()) continue;
    const r = fs.realpathSync(d);
    if (!real.has(r)) { real.add(r); out.push(d); }
  }
  return out;
}

/** List files below the upload directories (first directory wins on duplicate URL paths). Symlinks are not followed. */
export function listUploads(dirs: string[]): UploadFile[] {
  const out = new Map<string, UploadFile>();
  const walk = (root: string, dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(root, full);
      else if (entry.isFile()) {
        const rel = path.relative(root, full).split(path.sep).join('/');
        const urlPath = `${UPLOADS_PREFIX}${rel}`;
        if (out.has(urlPath) || !isValidBlobPath(urlPath)) continue;
        const st = fs.statSync(full);
        out.set(urlPath, { urlPath, file: full, size: st.size, mtime: st.mtime });
      }
    }
  };
  for (const d of dirs) if (fs.existsSync(d) && fs.statSync(d).isDirectory()) walk(d, d);
  return [...out.values()].sort((a, b) => a.urlPath.localeCompare(b.urlPath));
}

export function classifyUpload(urlPath: string): { kind: string; owner?: { type: string; id: string } } {
  const [, , area, owner] = urlPath.split('/'); // '', 'uploads', area, owner, ...
  if (area === 'scorecards' && owner) return { kind: 'scorecard', owner: { type: 'match', id: owner } };
  if (area === 'stats' && owner) return { kind: 'stat-image', owner: { type: 'match', id: owner } };
  if (area === 'events') return { kind: 'event-image' };
  return { kind: 'upload' };
}

export function contentTypeFor(file: string): string {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/** Files over the 10 MB blob cap cannot be stored: an issue (lossy mode skips them; the file stays on disk). */
export function checkUploads(files: UploadFile[], allowLossy: boolean, issues: Issue[], repairs: Repair[]): UploadFile[] {
  return files.filter((f) => {
    if (f.size <= MAX_BLOB_BYTES) return true;
    const detail = `${f.size} bytes exceeds the ${MAX_BLOB_BYTES} byte blob limit`;
    if (allowLossy) repairs.push({ rule: 'lossy_skip_upload', table: 'blobs', id: f.urlPath, action: `${detail}; not imported (file left on disk)`, known: false });
    else issues.push({ kind: 'blob_too_large', table: 'blobs', id: f.urlPath, detail, lossyAction: 'upload not imported' });
    return false;
  });
}

export async function insertUploads(ex: Executor, files: UploadFile[], onProgress?: (n: number) => void): Promise<{ imported: number; bytes: number }> {
  let imported = 0;
  let bytes = 0;
  for (const f of files) {
    const data = fs.readFileSync(f.file);
    const { kind, owner } = classifyUpload(f.urlPath);
    await ex.insert(blobs).values({
      kind, owner_type: owner?.type ?? null, owner_id: owner?.id ?? null, path: f.urlPath,
      filename: path.basename(f.file), content_type: contentTypeFor(f.file), size: data.byteLength, data, created_at: f.mtime,
    });
    imported++;
    bytes += data.byteLength;
    onProgress?.(imported);
  }
  return { imported, bytes };
}
