import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';

const storage = vi.hoisted(() => ({ getBlob: vi.fn() }));
vi.mock('../../../lib/storage', async (orig) => ({
  ...(await orig<typeof import('../../../lib/storage')>()),
  getBlob: storage.getBlob,
}));

import { loadImage, imageExtension, safePublicPath } from '../../../processes/discord-bot/utils/image-source';

const staticName = '__image-source-test.png';
const staticFile = path.join(process.cwd(), 'public', staticName);

describe('loadImage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterAll(() => { fs.rmSync(staticFile, { force: true }); });

  it('reads /uploads/* from the blobs table', async () => {
    storage.getBlob.mockResolvedValue({ data: Buffer.from('abc'), filename: 'a.jpg', content_type: 'image/jpeg' });
    const img = await loadImage('/uploads/events/a.jpg');
    expect(storage.getBlob).toHaveBeenCalledWith('/uploads/events/a.jpg');
    expect(img).toEqual({ buffer: Buffer.from('abc'), filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(imageExtension(img!)).toBe('jpg');
  });

  it('returns null on blob miss without touching disk', async () => {
    storage.getBlob.mockResolvedValue(null);
    expect(await loadImage('/uploads/events/missing.png')).toBeNull();
  });

  it('rejects invalid uploads paths', async () => {
    expect(await loadImage('/uploads/../etc/passwd')).toBeNull();
    expect(storage.getBlob).not.toHaveBeenCalled();
  });

  it('reads static files from public/', async () => {
    fs.writeFileSync(staticFile, Buffer.from('png-data'));
    const img = await loadImage(`/${staticName}`);
    expect(storage.getBlob).not.toHaveBeenCalled();
    expect(img?.buffer.toString()).toBe('png-data');
    expect(img?.contentType).toBe('image/png');
    expect(img?.filename).toBe(staticName);
  });

  it('returns null for a missing static file and for empty input', async () => {
    expect(await loadImage('/assets/nope/none.png')).toBeNull();
    expect(await loadImage('')).toBeNull();
    expect(await loadImage(undefined)).toBeNull();
  });

  it('blocks path traversal out of public/', async () => {
    expect(safePublicPath('/../package.json')).toBeNull();
    expect(await loadImage('/../package.json')).toBeNull();
    expect(await loadImage('//../../package.json')).toBeNull();
  });
});
