/**
 * Helpers for side effects around a match transaction.
 *
 * - `AfterCommit` collects work that must NOT run inside the database transaction (activity-feed writes, anything that
 *   talks to another system) and runs it once the business transaction has committed.
 * - `bestEffort` runs non-critical work (e.g. a queue insert for a notification) inside a savepoint: a failure is
 *   logged and rolled back to the savepoint, and does not poison the surrounding transaction.
 */
import type { Executor } from '../../../lib/db';
import { logger } from '../logger';

export class AfterCommit {
  private readonly fns: Array<() => Promise<void> | void> = [];

  add(fn: () => Promise<void> | void): void {
    this.fns.push(fn);
  }

  /** Run (and clear) the collected callbacks; errors are logged, never thrown. */
  async run(): Promise<void> {
    const fns = this.fns.splice(0);
    for (const fn of fns) {
      try {
        await fn();
      } catch (error) {
        logger.error('Post-commit side effect failed:', error);
      }
    }
  }
}

/** Run `fn` in a savepoint; on failure log and return `fallback` without aborting the outer transaction. */
export async function bestEffort<T>(ex: Executor, label: string, fn: (sp: Executor) => Promise<T>, fallback: T): Promise<T> {
  try {
    return await ex.transaction(async (sp) => fn(sp));
  } catch (error) {
    logger.error(`${label}:`, error);
    return fallback;
  }
}
