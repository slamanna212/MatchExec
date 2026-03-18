import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Encrypted file format: [MAGIC 8B][SALT 32B][IV 12B][AUTH_TAG 16B][CIPHERTEXT]
const MAGIC = Buffer.from('MEXECBAK');
const PBKDF2_ITERATIONS = 100_000;
const KEY_LEN = 32;

export async function POST(request: NextRequest) {
  let tmpFile: string | null = null;

  try {
    const body = await request.json().catch(() => ({})) as { password?: string };
    const password = body.password?.trim() || undefined;

    const dbPath =
      process.env.DATABASE_PATH ||
      path.join(process.cwd(), 'app_data', 'data', 'matchexec.db');

    if (!fs.existsSync(dbPath)) {
      return NextResponse.json({ error: 'Database file not found' }, { status: 500 });
    }

    // VACUUM INTO creates a clean single-file copy with all WAL data merged in
    tmpFile = path.join(os.tmpdir(), `matchexec-backup-${Date.now()}.db`);
    const db = await getDbInstance();
    await db.run('VACUUM INTO ?', [tmpFile]);

    let fileBuffer = fs.readFileSync(tmpFile);
    const date = new Date().toISOString().split('T')[0];
    let filename: string;

    if (password) {
      const salt = crypto.randomBytes(32);
      const iv = crypto.randomBytes(12);
      const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LEN, 'sha256');

      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(fileBuffer), cipher.final()]);
      const authTag = cipher.getAuthTag();

      fileBuffer = Buffer.concat([MAGIC, salt, iv, authTag, encrypted]);
      filename = `matchexec-backup-${date}.db.enc`;
    } else {
      filename = `matchexec-backup-${date}.db`;
    }

    logger.info(`Database backup created: ${filename}`);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(fileBuffer.length),
      },
    });
  } catch (error) {
    logger.error('Backup failed:', error);
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 });
  } finally {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  }
}
