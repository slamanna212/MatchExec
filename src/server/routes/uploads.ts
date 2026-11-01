/**
 * Uploaded files:
 *  - `uploadApi`  `/api/upload/event-image` (POST upload, DELETE remove) for event images
 *  - `uploads`    `GET /uploads/*` serves any stored blob (event images, scorecard screenshots, stat images)
 *
 * Files live in the `blobs` table (`lib/storage.ts`), so the bot / stats-processor can write them without a shared disk.
 */
import { Hono } from 'hono';
import { db } from '../../../lib/db';
import { BlobTooLargeError, UPLOADS_PREFIX, blobEtag, deleteBlob, getBlob, getBlobMeta, isValidBlobPath, putBlob } from '../../../lib/storage';
import { logger } from '@/lib/logger';
import { isAllowedImageType, isValidImageBuffer, sanitizeFilename, splitName, uniqueFileStem } from '@/lib/uploads';
import { jsonError } from '../http';

const EVENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const EVENT_IMAGE_PREFIX = `${UPLOADS_PREFIX}events/`;

export const uploadApi = new Hono()
  .post('/event-image', async (c) => {
    try {
      const form = await c.req.formData();
      const file = form.get('image');
      if (!file || typeof file === 'string') return jsonError(c, 'No image file provided', 400);

      if (!isAllowedImageType(file.type)) return jsonError(c, 'Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.', 400);
      if (file.size > EVENT_IMAGE_MAX_BYTES) return jsonError(c, 'File too large. Maximum size is 5MB.', 400);

      const buffer = Buffer.from(await file.arrayBuffer());
      if (!isValidImageBuffer(buffer)) return jsonError(c, 'Invalid image file. File content does not match image format.', 400);

      const { base, ext } = splitName(file.name);
      const filename = `${uniqueFileStem()}_${sanitizeFilename(base)}${ext}`;
      const imageUrl = `${EVENT_IMAGE_PREFIX}${filename}`;
      await putBlob(db, { path: imageUrl, kind: 'event-image', contentType: file.type, data: buffer, filename });

      return c.json({ success: true, imageUrl, filename });
    } catch (error) {
      if (error instanceof BlobTooLargeError) return jsonError(c, error.message, 400);
      logger.error('Error uploading event image:', error);
      return jsonError(c, 'Failed to upload image');
    }
  })
  .delete('/event-image', async (c) => {
    try {
      const imageUrl = c.req.query('imageUrl');
      if (!imageUrl) return jsonError(c, 'No image URL provided', 400);
      // Only event images can be removed through this endpoint
      if (!imageUrl.startsWith(EVENT_IMAGE_PREFIX) || !isValidBlobPath(imageUrl)) return jsonError(c, 'Invalid image URL', 400);

      if (await deleteBlob(db, imageUrl)) logger.debug(`Deleted event image: ${imageUrl}`);
      return c.json({ success: true });
    } catch (error) {
      logger.error('Error deleting event image:', error);
      return jsonError(c, 'Failed to delete image');
    }
  });

function decodePath(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

/** Mounted at `/uploads` BEFORE the auth gate: like the old image-extension matcher exclusion, uploads stay publicly readable (Discord embeds). */
export const uploads = new Hono().get('/*', async (c) => {
  try {
    const path = decodePath(new URL(c.req.url).pathname);
    if (!path || !isValidBlobPath(path)) return c.text('Not found', 404);

    const meta = await getBlobMeta(path, db);
    if (!meta) return c.text('File not found', 404);

    const etag = blobEtag(meta);
    const headers = {
      ETag: etag,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    };
    const ifNoneMatch = c.req.header('if-none-match');
    if (ifNoneMatch && ifNoneMatch.split(',').map((v) => v.trim()).includes(etag)) return c.body(null, 304, headers);

    const blob = await getBlob(path, db);
    if (!blob) return c.text('File not found', 404);
    return c.body(new Uint8Array(blob.data), 200, { ...headers, 'Content-Type': blob.content_type, 'Content-Length': String(blob.size) });
  } catch (error) {
    logger.error('Error serving uploaded file:', error);
    return c.text('Internal Server Error', 500);
  }
});
