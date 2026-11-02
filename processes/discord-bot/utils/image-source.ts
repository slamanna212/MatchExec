import fs from 'fs';
import path from 'path';
import { getBlob, isValidBlobPath, UPLOADS_PREFIX } from '../../../lib/storage';

export interface LoadedImage {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
};

/** Resolve `imageUrl` to a path inside public/, or null if it would escape that directory. */
export function safePublicPath(imageUrl: string): string | null {
  const base = path.resolve(process.cwd(), 'public');
  const resolved = path.resolve(base, imageUrl.replace(/^\/+/, ''));
  if (!resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

/**
 * Load an image by its stored URL. `/uploads/*` lives in the Postgres `blobs` table (no shared disk between the web app
 * and the bot); anything else (e.g. `/assets/*` game images) is a static file shipped in public/.
 * Returns null when the image does not exist, is empty, or the path is invalid / escapes the allowed roots.
 */
export async function loadImage(imageUrl: string | null | undefined): Promise<LoadedImage | null> {
  const url = imageUrl?.trim();
  if (!url) return null;

  if (url.startsWith(UPLOADS_PREFIX)) {
    if (!isValidBlobPath(url)) return null;
    const blob = await getBlob(url);
    if (!blob || blob.data.length === 0) return null;
    return { buffer: blob.data, filename: blob.filename, contentType: blob.content_type };
  }

  const filePath = safePublicPath(url);
  if (!filePath) return null;
  let buffer: Buffer;
  try {
    buffer = await fs.promises.readFile(filePath);
  } catch {
    return null;
  }
  if (!buffer || buffer.length === 0) return null;
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return {
    buffer,
    filename: path.basename(filePath),
    contentType: MIME_BY_EXT[ext] ?? 'application/octet-stream',
  };
}

/** File extension (no dot) for a loaded image, from its filename, falling back to its content type. */
export function imageExtension(image: LoadedImage): string {
  const ext = path.extname(image.filename).slice(1).toLowerCase();
  if (ext) return ext;
  const found = Object.entries(MIME_BY_EXT).find(([, mime]) => mime === image.contentType);
  return found ? found[0] : 'png';
}
