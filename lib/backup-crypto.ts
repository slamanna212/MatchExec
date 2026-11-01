/**
 * AES-256-GCM envelope for backup files (preserved from the SQLite backup/restore routes; Stage 6 rebuilds
 * backup/restore on pg_dump and reuses this).
 *
 * File format: [MAGIC 8B "MEXECBAK"][SALT 32B][IV 12B][AUTH_TAG 16B][CIPHERTEXT]. Key = PBKDF2-SHA256(password, salt, 100k, 32B).
 */
import * as crypto from 'crypto';

export const BACKUP_MAGIC = Buffer.from('MEXECBAK');
const PBKDF2_ITERATIONS = 100_000;
const KEY_LEN = 32;
const SALT_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = BACKUP_MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN; // 68

export class BackupDecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupDecryptError';
  }
}

/** True when the buffer starts with the encrypted-backup magic. */
export function isEncryptedBackup(buffer: Buffer): boolean {
  return buffer.length >= BACKUP_MAGIC.length && buffer.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC);
}

export function encryptBackup(plain: Buffer, password: string): Buffer {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LEN, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([BACKUP_MAGIC, salt, iv, cipher.getAuthTag(), encrypted]);
}

/** Throws BackupDecryptError (short/corrupt file, wrong password or tampering). */
export function decryptBackup(buffer: Buffer, password: string): Buffer {
  if (buffer.length < HEADER_LEN + 1) throw new BackupDecryptError('Backup file is too short or corrupted.');
  let offset = BACKUP_MAGIC.length;
  const salt = buffer.subarray(offset, (offset += SALT_LEN));
  const iv = buffer.subarray(offset, (offset += IV_LEN));
  const authTag = buffer.subarray(offset, (offset += TAG_LEN));
  const ciphertext = buffer.subarray(offset);
  try {
    const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LEN, 'sha256');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LEN });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new BackupDecryptError('Decryption failed — wrong password or corrupted file.');
  }
}
