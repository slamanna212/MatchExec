import type {NextResponse,  NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';
import { checkRateLimit, clientKey } from '@/lib/rate-limit';
import { resetDbSingleton } from '@/lib/database-init';
import { resetConnectionSingleton } from '@/lib/database/connection';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

// Must match backup route
const MAGIC = Buffer.from('MEXECBAK');
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0');
const PBKDF2_ITERATIONS = 100_000;
const KEY_LEN = 32;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export async function POST(request: NextRequest): Promise<NextResponse> {
  const limited = checkRateLimit(clientKey(request, 'restore'), 5, 10 * 60 * 1000);
  if (limited) return limited;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const password = (formData.get('password') as string | null)?.trim() || undefined;

    if (!file) {
      return apiError('No file provided', 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      return apiError('File too large (max 100 MB)', 400);
    }

    let buffer = Buffer.from(await file.arrayBuffer());

    // Detect and decrypt encrypted backups
    if (buffer.subarray(0, 8).equals(MAGIC)) {
      if (!password) {
        return apiError('This backup is encrypted — please provide the password.', 400);
      }

      try {
        if (buffer.length < 69) {
          return apiError('Backup file is too short or corrupted.', 400);
        }

        const salt = buffer.subarray(8, 40);
        const iv = buffer.subarray(40, 52);
        const authTag = buffer.subarray(52, 68);
        const ciphertext = buffer.subarray(68);

        if (authTag.length !== 16) {
          return apiError('Backup file has invalid authentication tag.', 400);
        }

        const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LEN, 'sha256');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
        decipher.setAuthTag(authTag);
        buffer = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      } catch {
        return apiError('Decryption failed — wrong password or corrupted file.', 400);
      }
    }

    // Validate it's actually a SQLite database
    if (buffer.length < 16 || !buffer.subarray(0, 16).equals(SQLITE_MAGIC)) {
      return apiError('Invalid file — not a valid SQLite database.', 400);
    }

    const dbPath =
      process.env.DATABASE_PATH ||
      path.join(process.cwd(), 'app_data', 'data', 'matchexec.db');

    // Reset singletons before writing so no queries run against the stale connection
    resetDbSingleton();
    resetConnectionSingleton();

    // Write the restored database
    fs.writeFileSync(dbPath, buffer);

    // Remove stale WAL/SHM files — they belong to the old database
    for (const suffix of ['-wal', '-shm']) {
      const p = dbPath + suffix;
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    // Restart bot and scheduler so they pick up the new database
    restartProcesses();

    logger.info('Database restored successfully');
    return apiOk({ success: true });
  } catch (error) {
    logger.error('Restore failed:', error);
    return apiError('Restore failed');
  }
}

function restartProcesses(): void {
  import('child_process').then(({ execFile }) => {
    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
      execFile('npx', ['pm2', 'restart', 'discord-bot-dev', 'scheduler-dev'], (error: Error | null) => {
        if (error) logger.error('Error restarting processes after restore:', error.message);
        else logger.debug('Restarted discord-bot-dev and scheduler-dev after restore');
      });
    } else {
      // s6-overlay will auto-restart after the kill signal — run two separate execFile calls
      execFile('pkill', ['-TERM', '-f', 'node dist/discord-bot.js'], (error: Error | null) => {
        if (error) logger.error('Error signaling discord-bot after restore:', error.message);
        else logger.debug('Restart signal sent to discord-bot after restore');
      });
      execFile('pkill', ['-TERM', '-f', 'node dist/scheduler.js'], (error: Error | null) => {
        if (error) logger.error('Error signaling scheduler after restore:', error.message);
        else logger.debug('Restart signal sent to scheduler after restore');
      });
    }
  }).catch((error) => {
    logger.error('Failed to import child_process for restart:', error);
  });
}
