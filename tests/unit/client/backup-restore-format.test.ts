import { describe, it, expect } from 'vitest';
import {
  formatBackupDate,
  formatBackupDateProse,
  formatBytes,
  nextRunLabel,
} from '../../../src/client/pages/settings/backup-restore/format';

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe('formatBytes', () => {
  it('scales units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(4.2 * 1024 * 1024)).toBe('4.2 MB');
  });
});

describe('formatBackupDate / prose', () => {
  const now = at(2026, 11, 5, 21, 0);
  it('uses Today and Yesterday', () => {
    expect(formatBackupDate(at(2026, 11, 5, 4, 0), now)).toBe('Today, 04:00');
    expect(formatBackupDate(at(2026, 11, 4, 4, 5), now)).toBe('Yesterday, 04:05');
    expect(formatBackupDateProse(at(2026, 11, 5, 4, 0), now)).toBe('today at 04:00');
    expect(formatBackupDateProse(at(2026, 11, 4, 4, 0), now)).toBe('yesterday at 04:00');
  });
  it('uses a weekday and date for older backups', () => {
    expect(formatBackupDate(at(2026, 10, 28, 19, 42), now)).toBe('Wed, Oct 28, 19:42');
    expect(formatBackupDateProse(at(2026, 10, 28, 19, 42), now)).toBe('Wed, Oct 28 at 19:42');
  });
});

describe('nextRunLabel', () => {
  it('daily', () => {
    expect(nextRunLabel('daily', at(2026, 11, 5, 3, 0))).toBe('today at 04:00');
    expect(nextRunLabel('daily', at(2026, 11, 5, 21, 0))).toBe('tomorrow at 04:00');
  });
  it('12h', () => {
    expect(nextRunLabel('12h', at(2026, 11, 5, 2, 0))).toBe('today at 04:00');
    expect(nextRunLabel('12h', at(2026, 11, 5, 10, 0))).toBe('today at 16:00');
    expect(nextRunLabel('12h', at(2026, 11, 5, 17, 0))).toBe('tomorrow at 04:00');
  });
  it('weekly (Nov 8 2026 is a Sunday)', () => {
    expect(nextRunLabel('weekly', at(2026, 11, 8, 3, 0))).toBe('today at 04:00');
    expect(nextRunLabel('weekly', at(2026, 11, 8, 5, 0))).toBe('Sunday at 04:00');
    expect(nextRunLabel('weekly', at(2026, 11, 5, 5, 0))).toBe('Sunday at 04:00');
  });
  it('is null for custom cron', () => {
    expect(nextRunLabel('custom', at(2026, 11, 5))).toBeNull();
  });
});
