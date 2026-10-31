/** Client-safe auth helpers (no server imports). */

/** Only allow same-origin relative paths as post-login redirect targets. */
export function sanitizeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\') || /[\r\n]/.test(next)) {
    return '/';
  }
  if (next === '/login' || next.startsWith('/login?') || next.startsWith('/login/')) return '/';
  return next;
}
