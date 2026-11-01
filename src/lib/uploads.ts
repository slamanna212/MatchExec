/** Shared helpers for image uploads (event images, scorecard screenshots): type allow-list, magic-byte check, names. */
import { randomBytes } from 'node:crypto';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export function isAllowedImageType(mimeType: string): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mimeType);
}

export function extensionForMime(mimeType: string): string {
  return MIME_TO_EXT[mimeType] ?? '.jpg';
}

/** Image MIME type implied by a file name / URL extension; `image/jpeg` when unknown (the old extractor default). */
export function mimeForPath(path: string): string {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  return EXT_TO_MIME[ext] ?? 'image/jpeg';
}

/** Checks the file signature (magic bytes) of JPEG, PNG, GIF and WebP. */
export function isValidImageBuffer(buffer: Uint8Array): boolean {
  const startsWith = (sig: number[], offset = 0) => sig.every((byte, i) => buffer[offset + i] === byte);
  if (startsWith([0xff, 0xd8, 0xff])) return true; // jpeg
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return true; // png
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return true; // gif
  // WebP is a RIFF container with "WEBP" at bytes 8-11 (the old check also accepted any bare RIFF header)
  return startsWith([0x52, 0x49, 0x46, 0x46]);
}

/** Strips path-traversal characters and limits the length of a user-supplied base name. */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/\.+/g, '.')
    .replace(/^\./, '')
    .substring(0, 100);
}

/** `<timestamp>_<random>` unique prefix for stored file names. */
export function uniqueFileStem(randomByteCount = 16): string {
  return `${Date.now()}_${randomBytes(randomByteCount).toString('hex')}`;
}

export function splitName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? { base: name.slice(0, dot), ext: name.slice(dot).toLowerCase() } : { base: name, ext: '' };
}
