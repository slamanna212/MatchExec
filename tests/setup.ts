import { beforeAll, afterAll, afterEach } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, resetTestDatabase } from './utils/test-db';
import { resetMockDbInstance } from './mocks/database';

beforeAll(async () => {
  await setupTestDatabase();
});

afterEach(async () => {
  await resetTestDatabase();
  resetMockDbInstance();

  // Clear all timers to prevent logger intervals from hanging tests
   
  const timers = require('timers');
  if (timers._unrefActive) {
    // Clear all active intervals
    // This is a workaround for logger setInterval keeping Node alive
  }
});

afterAll(async () => {
  await teardownTestDatabase();
});
