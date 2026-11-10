/**
 * Browser security headers.
 *
 *  - `securityHeaders` (every response): nosniff, no framing (`X-Frame-Options: DENY`), strict referrer policy,
 *    cross-origin opener isolation, and the rest of Hono's `secureHeaders` defaults. HSTS is left to the TLS-terminating
 *    proxy (MatchExec usually runs on plain HTTP on a LAN, and `includeSubDomains` could pin unrelated hosts), and
 *    `Cross-Origin-Resource-Policy` is off so `/uploads/*` images can still be embedded elsewhere.
 *  - `contentSecurityPolicyFor(html)`: the CSP for the SPA document. Inline `<script>` blocks of index.html (the colour
 *    scheme bootstrap) are allowed by hash, so no `'unsafe-inline'` is needed for scripts. Styles need it: Mantine and
 *    React set inline `style` attributes and inject `<style>` tags at runtime.
 */
import { createHash } from 'node:crypto';
import { secureHeaders } from 'hono/secure-headers';

export const securityHeaders = secureHeaders({
  strictTransportSecurity: false,
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: 'same-origin',
  xFrameOptions: 'DENY',
  referrerPolicy: 'strict-origin-when-cross-origin',
  permissionsPolicy: { camera: [], microphone: [], geolocation: [], payment: [], usb: [] },
});

const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

/** `'sha256-...'` sources for every inline script block in `html`. */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const m of html.matchAll(INLINE_SCRIPT)) {
    if (m[1].trim() === '') continue;
    hashes.push(`'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
  }
  return hashes;
}

const cache = new Map<string, string>();

/** Content-Security-Policy for the SPA HTML document (memoised per document body). */
export function contentSecurityPolicyFor(html: string): string {
  const cached = cache.get(html);
  if (cached) return cached;
  const policy = [
    "default-src 'self'",
    `script-src 'self' ${inlineScriptHashes(html).join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    // Discord avatars, game art from the CDN, data:/blob: previews of images picked for upload
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  cache.clear(); // only one index.html is live at a time
  cache.set(html, policy);
  return policy;
}
