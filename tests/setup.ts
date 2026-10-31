import { beforeAll, afterAll, afterEach, expect } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, resetTestDatabase } from './utils/test-db';
import { resetMockDbInstance } from './mocks/database';

// Enable React act() environment to suppress "not configured to support act(...)" warnings
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Postgres-backed test files (see tests/utils/pg-test-db.ts) opt out of the legacy SQLite per-file setup:
// anything under tests/integration/server/ or named pg-*.test.ts.
function usesPgHarness(): boolean {
  const file = (expect.getState().testPath ?? '').replace(/\\/g, '/');
  return /\/tests\/integration\/server\//.test(file) || /\/pg-[^/]*\.test\.tsx?$/.test(file);
}

let sqliteActive = false;

beforeAll(async () => {
  sqliteActive = !usesPgHarness();
  if (sqliteActive) await setupTestDatabase();
});

afterEach(async () => {
  if (!sqliteActive) return;
  await resetTestDatabase();
  resetMockDbInstance();
});

afterAll(async () => {
  if (sqliteActive) await teardownTestDatabase();
});
