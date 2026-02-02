import { beforeAll, afterAll, afterEach } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, resetTestDatabase } from './utils/test-db';
import { resetMockDbInstance } from './mocks/database';

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
