/**
 * Serialise async work per key within this process. Used where a check-then-write sequence
 * spans several awaits (e.g. "no matches yet" -> generate -> insert) and two overlapping
 * requests for the same tournament would otherwise both pass the check.
 *
 * In-process only: the web app is a single Node process, and the other processes
 * (bot, scheduler) don't call these routes concurrently with themselves.
 */
const tails = new Map<string, Promise<unknown>>();

export async function withKeyedLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(fn);
  const tail = run.catch(() => undefined);
  tails.set(key, tail);
  try {
    return await run;
  } finally {
    if (tails.get(key) === tail) tails.delete(key);
  }
}
