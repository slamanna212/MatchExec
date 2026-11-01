/**
 * Uploaded files in Postgres (plan 7.4). The bot (scorecard screenshots), the stats-processor (stat images) and the web
 * app (event images) all write here, and the web app serves them from `GET /uploads/*`, so no shared disk is needed.
 *
 * `path` is the public URL path (`/uploads/scorecards/<matchId>/<file>.png`) and is unique; stored URLs and Discord
 * embeds therefore keep working unchanged. Every writer takes an `Executor` so the blob can commit in the same
 * transaction as the row that references it.
 */
import { and, eq, notExists, sql } from 'drizzle-orm';
import { db as defaultDb, type Executor } from './db';
import { blobs, matches } from './db/schema';

/** Hard cap per blob (10 MB). */
export const MAX_BLOB_BYTES = 10 * 1024 * 1024;

export const UPLOADS_PREFIX = '/uploads/';

export type BlobKind = 'event-image' | 'scorecard' | 'stat-image';

export interface BlobOwner {
  type: string;
  id: string;
}

export class BlobTooLargeError extends Error {
  constructor(readonly size: number) {
    super(`File too large. Maximum size is ${MAX_BLOB_BYTES / (1024 * 1024)}MB.`);
    this.name = 'BlobTooLargeError';
  }
}

export interface PutBlobInput {
  /** Public URL path, must start with `/uploads/`. */
  path: string;
  kind: BlobKind;
  contentType: string;
  data: Uint8Array;
  /** Defaults to the last path segment. */
  filename?: string;
  owner?: BlobOwner;
}

export interface BlobMeta {
  id: string;
  kind: string;
  path: string;
  filename: string;
  content_type: string;
  size: number;
  created_at: Date;
}

export interface StoredBlob extends BlobMeta {
  data: Buffer;
}

/**
 * True for a normalised uploads path: starts with `/uploads/`, no empty / `.` / `..` segments, no NUL or backslash.
 * Used for every read so a request can never address anything but a stored key.
 */
export function isValidBlobPath(path: string): boolean {
  if (!path.startsWith(UPLOADS_PREFIX) || path.length === UPLOADS_PREFIX.length) return false;
  if (path.includes('\0') || path.includes('\\')) return false;
  return path.slice(UPLOADS_PREFIX.length).split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

const metaColumns = {
  id: blobs.id, kind: blobs.kind, path: blobs.path, filename: blobs.filename,
  content_type: blobs.content_type, size: blobs.size, created_at: blobs.created_at,
};

/** Insert (or replace, when the same path is written again, e.g. regenerated stat images) a blob. */
export async function putBlob(ex: Executor, input: PutBlobInput): Promise<BlobMeta> {
  if (!isValidBlobPath(input.path)) throw new Error(`Invalid blob path: ${input.path}`);
  if (input.data.byteLength > MAX_BLOB_BYTES) throw new BlobTooLargeError(input.data.byteLength);
  const data = Buffer.from(input.data);
  const values = {
    kind: input.kind,
    owner_type: input.owner?.type ?? null,
    owner_id: input.owner?.id ?? null,
    path: input.path,
    filename: input.filename ?? input.path.slice(input.path.lastIndexOf('/') + 1),
    content_type: input.contentType,
    size: data.byteLength,
    data,
  };
  const [row] = await ex.insert(blobs).values(values)
    .onConflictDoUpdate({ target: blobs.path, set: { ...values, created_at: new Date() } })
    .returning(metaColumns);
  return row;
}

/** Metadata only (no `data`), used for ETag / 304 handling without reading the file. */
export async function getBlobMeta(path: string, ex: Executor = defaultDb): Promise<BlobMeta | null> {
  if (!isValidBlobPath(path)) return null;
  const [row] = await ex.select(metaColumns).from(blobs).where(eq(blobs.path, path)).limit(1);
  return row ?? null;
}

export async function getBlob(path: string, ex: Executor = defaultDb): Promise<StoredBlob | null> {
  if (!isValidBlobPath(path)) return null;
  const [row] = await ex.select({ ...metaColumns, data: blobs.data }).from(blobs).where(eq(blobs.path, path)).limit(1);
  return row ? { ...row, data: Buffer.from(row.data) } : null;
}

/** Delete one blob by its public path. Returns whether something was deleted. */
export async function deleteBlob(ex: Executor, path: string): Promise<boolean> {
  const rows = await ex.delete(blobs).where(eq(blobs.path, path)).returning({ id: blobs.id });
  return rows.length > 0;
}

/** Delete every blob owned by `owner` (e.g. `{ type: 'match', id }`). Returns the number deleted. */
export async function deleteBlobsFor(ex: Executor, owner: BlobOwner): Promise<number> {
  const rows = await ex.delete(blobs)
    .where(and(eq(blobs.owner_type, owner.type), eq(blobs.owner_id, owner.id)))
    .returning({ id: blobs.id });
  return rows.length;
}

/** Retention sweep: blobs owned by a match that no longer exists (deleted, or removed by a tournament cascade). */
export async function deleteOrphanedMatchBlobs(ex: Executor = defaultDb): Promise<number> {
  const rows = await ex.delete(blobs)
    .where(and(
      eq(blobs.owner_type, 'match'),
      notExists(ex.select({ one: sql`1` }).from(matches).where(eq(matches.id, blobs.owner_id))),
    ))
    .returning({ id: blobs.id });
  return rows.length;
}

/** Strong ETag for a stored blob (changes whenever the path is rewritten). */
export function blobEtag(meta: Pick<BlobMeta, 'size' | 'created_at'>): string {
  return `"${meta.size.toString(16)}-${meta.created_at.getTime().toString(16)}"`;
}
