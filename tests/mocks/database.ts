import type { TestDatabase } from '../utils/test-db';
import { getTestDb } from '../utils/test-db';

/**
 * Mock Database wrapper that delegates to the test SQLite database
 * This simply returns the test database instance since it already has the promise-based API
 */

// Create singleton instance
let mockDbInstance: TestDatabase | null = null;

export function getMockDbInstance(): TestDatabase {
  if (!mockDbInstance) {
    mockDbInstance = getTestDb();
  }
  return mockDbInstance;
}

export function resetMockDbInstance(): void {
  mockDbInstance = null;
}
