import { beforeAll, afterAll, afterEach } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, resetTestDatabase } from './utils/test-db';

beforeAll(async () => {
  await setupTestDatabase();
});

afterEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await teardownTestDatabase();
});
