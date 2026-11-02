// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cronState = vi.hoisted(() => ({ tasks: [] as Array<{ expr: string; stop: ReturnType<typeof vi.fn>; fire: () => void }> }));

vi.mock('node-cron', () => ({
  validate: () => true,
  schedule: (expr: string, fn: () => void) => {
    const task = { expr, stop: vi.fn(), fire: fn };
    cronState.tasks.push(task);
    return task;
  },
}));
vi.mock('../../../src/lib/logger/server', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() } }));

const settings = vi.hoisted(() => ({ value: { enabled: true, enabledIsDefault: false, embedded: true, schedule: '0 4 * * *' } as Record<string, unknown> }));
vi.mock('../../../src/lib/backup-settings', () => ({ getBackupSettings: vi.fn(async () => settings.value) }));
const run = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock('../../../src/lib/backup-service', () => ({ runAutoBackup: run }));

import { AutoBackupJob } from '../../../processes/scheduler/jobs/auto-backup';
import { resetLocalMaintenance, setLocalState } from '../../../lib/maintenance';

describe('AutoBackupJob', () => {
  let job: AutoBackupJob;
  beforeEach(() => {
    cronState.tasks.length = 0;
    run.mockClear();
    settings.value = { enabled: true, enabledIsDefault: false, embedded: true, schedule: '0 4 * * *' };
    job = new AutoBackupJob();
    resetLocalMaintenance();
  });
  afterEach(() => { job.stop(); resetLocalMaintenance(); });

  it('schedules the configured cron when enabled and runs the backup on every tick', async () => {
    await job.start();
    expect(cronState.tasks.map((t) => t.expr)).toEqual(['0 4 * * *']);
    cronState.tasks[0].fire();
    await vi.waitFor(() => expect(run).toHaveBeenCalledWith('schedule'));
  });

  it('does nothing when disabled (external database default)', async () => {
    settings.value = { enabled: false, enabledIsDefault: true, embedded: false, schedule: '0 4 * * *' };
    await job.start();
    expect(cronState.tasks).toHaveLength(0);
  });

  it('reschedules when the settings change and stops the old task; unchanged settings keep the task', async () => {
    await job.start();
    await job.refresh();
    expect(cronState.tasks).toHaveLength(1);
    settings.value = { ...settings.value, schedule: '0 4,16 * * *' };
    await job.refresh();
    expect(cronState.tasks).toHaveLength(2);
    expect(cronState.tasks[0].stop).toHaveBeenCalled();
    expect(cronState.tasks[1].expr).toBe('0 4,16 * * *');
    settings.value = { ...settings.value, enabled: false };
    await job.refresh();
    expect(cronState.tasks[1].stop).toHaveBeenCalled();
  });

  it('skips a tick while a restore is draining', async () => {
    await job.start();
    setLocalState('maintenance');
    cronState.tasks[0].fire();
    await new Promise((r) => setTimeout(r, 20));
    expect(run).not.toHaveBeenCalled();
  });
});
