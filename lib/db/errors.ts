/** Helpers for recognising Postgres errors through Drizzle's wrapping (`DrizzleQueryError.cause`). */

interface PgErrorLike { code?: unknown; constraint?: unknown; cause?: unknown }

/** Walk the `cause` chain for a Postgres error carrying `code`. */
function findPgError(err: unknown, code: string): PgErrorLike | null {
  let cur: unknown = err;
  for (let depth = 0; depth < 5 && cur && typeof cur === 'object'; depth++) {
    const e = cur as PgErrorLike;
    if (e.code === code) return e;
    cur = e.cause;
  }
  return null;
}

/**
 * When `err` is a unique violation (SQLSTATE 23505), the name of the violated constraint/index (may be '' when the
 * driver does not report it); otherwise null.
 */
export function uniqueViolationConstraint(err: unknown): string | null {
  const e = findPgError(err, '23505');
  if (!e) return null;
  return typeof e.constraint === 'string' ? e.constraint : '';
}
