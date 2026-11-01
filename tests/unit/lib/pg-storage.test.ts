// @vitest-environment node
/** lib/storage.ts: blobs in Postgres (plan 7.4). */
import { describe, it, expect } from 'vitest';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createGame, createGameMode, createMatch } from '../../utils/pg-fixtures';
import { blobs } from '../../../lib/db/schema';
import {
  BlobTooLargeError, MAX_BLOB_BYTES, blobEtag, deleteBlob, deleteBlobsFor, deleteOrphanedMatchBlobs, getBlob, getBlobMeta,
  isValidBlobPath, putBlob,
} from '../../../lib/storage';
import { db } from '../../../lib/db';

setupPgTestFile();

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

describe('isValidBlobPath', () => {
  it('accepts normalised /uploads/ paths only', () => {
    expect(isValidBlobPath('/uploads/events/a.png')).toBe(true);
    expect(isValidBlobPath('/uploads/scorecards/match_1/1_ab.jpg')).toBe(true);
    expect(isValidBlobPath('/uploads/')).toBe(false);
    expect(isValidBlobPath('/other/a.png')).toBe(false);
    expect(isValidBlobPath('/uploads/../etc/passwd')).toBe(false);
    expect(isValidBlobPath('/uploads/a/./b.png')).toBe(false);
    expect(isValidBlobPath('/uploads/a//b.png')).toBe(false);
    expect(isValidBlobPath('/uploads/a\\b.png')).toBe(false);
    expect(isValidBlobPath('/uploads/a\0.png')).toBe(false);
  });
});

describe('putBlob / getBlob', () => {
  it('stores bytes and metadata and reads them back unchanged', async () => {
    const meta = await putBlob(db, { path: '/uploads/events/a.png', kind: 'event-image', contentType: 'image/png', data: png });
    expect(meta).toMatchObject({ path: '/uploads/events/a.png', kind: 'event-image', filename: 'a.png', content_type: 'image/png', size: png.length });

    const blob = await getBlob('/uploads/events/a.png');
    expect(blob?.data.equals(png)).toBe(true);
    expect(blob?.size).toBe(png.length);
    expect(blob?.filename).toBe('a.png');
  });

  it('rewriting the same path replaces the data and changes the ETag', async () => {
    const first = await putBlob(db, { path: '/uploads/stats/m/team.png', kind: 'stat-image', contentType: 'image/png', data: png });
    await new Promise((r) => setTimeout(r, 5));
    const second = await putBlob(db, { path: '/uploads/stats/m/team.png', kind: 'stat-image', contentType: 'image/png', data: Buffer.concat([png, png]) });
    expect(second.id).toBe(first.id);
    expect(second.size).toBe(png.length * 2);
    expect(blobEtag(second)).not.toBe(blobEtag(first));
    expect(await getPgTestDb().select().from(blobs)).toHaveLength(1);
  });

  it('rejects blobs over the 10 MB cap and invalid paths', async () => {
    await expect(putBlob(db, { path: '/uploads/big.png', kind: 'scorecard', contentType: 'image/png', data: Buffer.alloc(MAX_BLOB_BYTES + 1) }))
      .rejects.toBeInstanceOf(BlobTooLargeError);
    await expect(putBlob(db, { path: '/uploads/ok.png', kind: 'scorecard', contentType: 'image/png', data: Buffer.alloc(1024 * 1024) })).resolves.toBeTruthy();
    await expect(putBlob(db, { path: '/etc/passwd', kind: 'scorecard', contentType: 'image/png', data: png })).rejects.toThrow(/Invalid blob path/);
    expect(await getPgTestDb().select().from(blobs)).toHaveLength(1);
  });

  it('getBlob / getBlobMeta return null for unknown or invalid paths', async () => {
    expect(await getBlob('/uploads/none.png')).toBeNull();
    expect(await getBlobMeta('/uploads/none.png')).toBeNull();
    expect(await getBlob('/uploads/../x')).toBeNull();
  });

  it('getBlobMeta does not carry the data', async () => {
    await putBlob(db, { path: '/uploads/events/m.png', kind: 'event-image', contentType: 'image/png', data: png });
    expect(await getBlobMeta('/uploads/events/m.png')).not.toHaveProperty('data');
  });

  it('participates in the caller transaction (rolls back with it)', async () => {
    await expect(db.transaction(async (tx) => {
      await putBlob(tx, { path: '/uploads/tx.png', kind: 'scorecard', contentType: 'image/png', data: png });
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(await getBlobMeta('/uploads/tx.png')).toBeNull();
  });
});

describe('deleting blobs', () => {
  it('deleteBlob removes one path', async () => {
    await putBlob(db, { path: '/uploads/events/x.png', kind: 'event-image', contentType: 'image/png', data: png });
    expect(await deleteBlob(db, '/uploads/events/x.png')).toBe(true);
    expect(await deleteBlob(db, '/uploads/events/x.png')).toBe(false);
  });

  it('deleteBlobsFor removes only that owner’s blobs', async () => {
    await putBlob(db, { path: '/uploads/scorecards/m1/a.png', kind: 'scorecard', contentType: 'image/png', data: png, owner: { type: 'match', id: 'm1' } });
    await putBlob(db, { path: '/uploads/stats/m1/team.png', kind: 'stat-image', contentType: 'image/png', data: png, owner: { type: 'match', id: 'm1' } });
    await putBlob(db, { path: '/uploads/scorecards/m2/a.png', kind: 'scorecard', contentType: 'image/png', data: png, owner: { type: 'match', id: 'm2' } });
    expect(await deleteBlobsFor(db, { type: 'match', id: 'm1' })).toBe(2);
    expect(await getBlobMeta('/uploads/scorecards/m2/a.png')).not.toBeNull();
  });

  it('retention sweep removes blobs of deleted matches and keeps live ones', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id);
    await createMatch(game.id, mode.id, { id: 'live' });
    await putBlob(db, { path: '/uploads/scorecards/live/a.png', kind: 'scorecard', contentType: 'image/png', data: png, owner: { type: 'match', id: 'live' } });
    await putBlob(db, { path: '/uploads/scorecards/gone/a.png', kind: 'scorecard', contentType: 'image/png', data: png, owner: { type: 'match', id: 'gone' } });
    await putBlob(db, { path: '/uploads/events/free.png', kind: 'event-image', contentType: 'image/png', data: png });

    expect(await deleteOrphanedMatchBlobs(db)).toBe(1);
    expect(await getBlobMeta('/uploads/scorecards/gone/a.png')).toBeNull();
    expect(await getBlobMeta('/uploads/scorecards/live/a.png')).not.toBeNull();
    expect(await getBlobMeta('/uploads/events/free.png')).not.toBeNull();
  });
});
