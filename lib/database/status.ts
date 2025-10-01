import fs from 'fs';
import path from 'path';
import { logger } from '../../src/lib/logger/server';

export interface DatabaseStatus {
  ready: boolean;
  progress: string;
  timestamp: number;
}

const STATUS_FILE_PATH = path.join(process.cwd(), 'app_data', 'data', '.db-status.json');

/**
 * Ensure the status file directory exists
 */
function ensureStatusDirectory(): void {
  const dir = path.dirname(STATUS_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Write database status to file
 */
export function writeDbStatus(status: DatabaseStatus): void {
  try {
    ensureStatusDirectory();
    fs.writeFileSync(STATUS_FILE_PATH, JSON.stringify(status, null, 2), 'utf8');
  } catch (error) {
    logger.error('Failed to write database status:', error);
  }
}

/**
 * Read database status from file
 */
export function readDbStatus(): DatabaseStatus {
  try {
    if (fs.existsSync(STATUS_FILE_PATH)) {
      const content = fs.readFileSync(STATUS_FILE_PATH, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    logger.error('Failed to read database status:', error);
  }

  // Default: not ready
  return {
    ready: false,
    progress: 'Initializing database...',
    timestamp: Date.now()
  };
}

/**
 * Mark database as ready
 */
export function markDbReady(): void {
  writeDbStatus({
    ready: true,
    progress: 'Database ready',
    timestamp: Date.now()
  });
}

/**
 * Mark database as not ready with progress message
 */
export function markDbNotReady(progress: string): void {
  writeDbStatus({
    ready: false,
    progress,
    timestamp: Date.now()
  });
}