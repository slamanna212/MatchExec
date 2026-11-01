import { describe, it, expect } from 'vitest';
import { BACKUP_MAGIC, BackupDecryptError, decryptBackup, encryptBackup, isEncryptedBackup } from '../../../lib/backup-crypto';

describe('backup-crypto', () => {
  const plain = Buffer.from('some backup bytes '.repeat(50));

  it('round-trips with the right password', () => {
    const enc = encryptBackup(plain, 'secret');
    expect(decryptBackup(enc, 'secret').equals(plain)).toBe(true);
  });

  it('writes the MEXECBAK envelope (magic, salt, iv, tag, ciphertext)', () => {
    const enc = encryptBackup(plain, 'secret');
    expect(enc.subarray(0, 8).equals(BACKUP_MAGIC)).toBe(true);
    expect(enc.length).toBe(8 + 32 + 12 + 16 + plain.length);
    expect(isEncryptedBackup(enc)).toBe(true);
  });

  it('uses fresh salt/iv per call', () => {
    expect(encryptBackup(plain, 'p').equals(encryptBackup(plain, 'p'))).toBe(false);
  });

  it('rejects the wrong password', () => {
    expect(() => decryptBackup(encryptBackup(plain, 'right'), 'wrong')).toThrow(BackupDecryptError);
  });

  it('rejects tampered ciphertext', () => {
    const enc = Buffer.from(encryptBackup(plain, 'p'));
    enc[enc.length - 1] ^= 0xff;
    expect(() => decryptBackup(enc, 'p')).toThrow(/Decryption failed/);
  });

  it('rejects a too-short file', () => {
    expect(() => decryptBackup(Buffer.concat([BACKUP_MAGIC, Buffer.alloc(20)]), 'p')).toThrow(/too short/);
  });

  it('rejects an envelope with garbage fields (old "wrong password" case)', () => {
    const fake = Buffer.concat([BACKUP_MAGIC, Buffer.alloc(32, 1), Buffer.alloc(12, 2), Buffer.alloc(16, 3), Buffer.alloc(64, 4)]);
    expect(() => decryptBackup(fake, 'wrong-password')).toThrow(/wrong password/);
  });

  it('isEncryptedBackup is false for plain data and short buffers', () => {
    expect(isEncryptedBackup(Buffer.from('SQLite format 3\0'))).toBe(false);
    expect(isEncryptedBackup(Buffer.alloc(3))).toBe(false);
  });
});
