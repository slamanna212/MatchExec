import { vi } from 'vitest';
import { getTestDb } from '../utils/test-db';
import { Database } from '@lib/database/connection';

/**
 * Mock Database wrapper that uses the test SQLite database
 */
class MockDatabase extends Database {
  private testDb: ReturnType<typeof getTestDb>;

  constructor() {
    super(':memory:');
    this.testDb = getTestDb();
  }

  async connect(): Promise<void> {
    // Already connected via test setup
    return Promise.resolve();
  }

  async get<T = any>(sql: string, params?: any[]): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.testDb.get(sql, params || [], (err, row) => {
        if (err) reject(err);
        else resolve(row as T | undefined);
      });
    });
  }

  async all<T = any>(sql: string, params?: any[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.testDb.all(sql, params || [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }

  async run(sql: string, params?: any[]): Promise<{ lastID?: number; changes?: number }> {
    return new Promise((resolve, reject) => {
      this.testDb.run(sql, params || [], function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  async exec(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.testDb.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async close(): Promise<void> {
    // Don't close test database during tests
    return Promise.resolve();
  }
}

// Create singleton instance
let mockDbInstance: MockDatabase | null = null;

export function getMockDbInstance(): Database {
  if (!mockDbInstance) {
    mockDbInstance = new MockDatabase();
  }
  return mockDbInstance;
}

export function resetMockDbInstance(): void {
  mockDbInstance = null;
}

// Mock the getDbInstance function
vi.mock('@/lib/database-init', () => ({
  getDbInstance: vi.fn(() => Promise.resolve(getMockDbInstance()))
}));
