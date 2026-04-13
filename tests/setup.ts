import { beforeAll, afterAll, afterEach } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, resetTestDatabase } from './utils/test-db';
import { resetMockDbInstance } from './mocks/database';

// Enable React act() environment to suppress "not configured to support act(...)" warnings
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(async () => {
  await setupTestDatabase();
});

afterEach(async () => {
  await resetTestDatabase();
  resetMockDbInstance();
});

afterAll(async () => {
  await teardownTestDatabase();
});
