/**
 * Loosely-typed view of the sqlite wrapper used by the stats processor.
 * Rows come from untyped SQL, so reads return `any` and callers narrow as needed.
 */
export interface StatsDb {
  run(sql: string, params?: unknown[]): Promise<{ lastID?: number; changes?: number }>;
  get<T = any>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
}
