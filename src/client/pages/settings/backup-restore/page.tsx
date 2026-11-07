import {
  Card,
  Text,
  Stack,
  Button,
  Group,
  PasswordInput,
  Alert,
  Modal,
  Divider,
  Switch,
  SegmentedControl,
  NumberInput,
  TextInput,
  Badge,
  ActionIcon,
  Tooltip,
  Loader,
  Box,
  Code,
} from '@mantine/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconAlertTriangle, IconDownload, IconUpload, IconShieldOff, IconDatabaseImport, IconTrash, IconHistory,
  IconPlayerPlay,
} from '@tabler/icons-react';
import { notificationHelper } from '@/lib/notifications';
import { logger } from '@/lib/logger/client';
import { PageLayout } from '@/components/PageLayout';
import { PageHeader } from '@/components/PageHeader';
import { RestoreFileModal } from '@/components/settings/restore-file-modal';
import {
  PRESET_OPTIONS,
  formatBackupDate,
  formatBackupDateProse,
  formatBytes,
  nextRunLabel,
  type BackupPreset,
} from './format';

type BackupKind = 'auto' | 'pre-upgrade' | 'pre-restore';
type KindFilter = 'all' | BackupKind;

interface StoredBackup {
  id: string;
  kind: BackupKind;
  filename: string;
  size: number;
  createdAt: string;
}

interface BackupConfig {
  enabled: boolean;
  enabledIsDefault: boolean;
  embedded: boolean;
  schedule: string;
  preset: BackupPreset;
  retention: { daily: number; weekly: number };
  last: { at: string | null; status: 'success' | 'failed' | null; size: number | null; file: string | null; error: string | null };
  backupDir: string;
  pgToolsAvailable: boolean;
}

type Modals =
  | { type: 'export' }
  | { type: 'file' }
  | { type: 'restore'; backup: StoredBackup }
  | { type: 'delete'; backup: StoredBackup }
  | null;

const KIND_LABEL: Record<BackupKind, { label: string; color: string; hint: string }> = {
  auto: { label: 'Automatic', color: 'blue', hint: 'Taken on the schedule or with Back up now' },
  'pre-upgrade': { label: 'Pre-upgrade', color: 'grape', hint: 'Safety copy taken before an upgrade' },
  'pre-restore': { label: 'Pre-restore', color: 'orange', hint: 'Copy of your data taken before a restore' },
};

const FILTERS: Array<{ value: KindFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'auto', label: KIND_LABEL.auto.label },
  { value: 'pre-upgrade', label: KIND_LABEL['pre-upgrade'].label },
  { value: 'pre-restore', label: KIND_LABEL['pre-restore'].label },
];

const LIST_LIMIT = 6;

const backupFileUrl = (b: StoredBackup) => `/api/settings/backup/files/${b.kind}/${encodeURIComponent(b.filename)}`;

type StatusTone = 'green' | 'red' | 'gray';

interface StatusView {
  tone: StatusTone;
  title: string;
  line: string | null;
  last: string | null;
  error: string | null;
}

function buildStatus(config: BackupConfig | null, now: Date): StatusView {
  if (!config) return { tone: 'gray', title: 'Loading…', line: null, last: null, error: null };

  const next = nextRunLabel(config.preset, now);
  const preset = PRESET_OPTIONS.find((p) => p.value === config.preset);
  const scheduleLine = config.preset === 'custom' ? `Custom: ${config.schedule}` : (preset?.line ?? '');
  const withNext = next ? `${scheduleLine} · next ${next}` : scheduleLine;
  const lastAt = config.last.at ? new Date(config.last.at) : null;
  const lastOk = lastAt && config.last.status === 'success'
    ? `Last backup ${formatBackupDateProse(lastAt, now)}${config.last.size ? ` · ${formatBytes(config.last.size)}` : ''} · keeping ${config.retention.daily} daily, ${config.retention.weekly} weekly`
    : null;

  if (!config.pgToolsAvailable) {
    return { tone: 'red', title: 'Backups can’t run', line: null, last: null, error: null };
  }
  if (!config.enabled) {
    return {
      tone: 'gray',
      title: 'Automatic backups are off',
      line: config.enabledIsDefault && !config.embedded
        ? 'External database detected, so scheduled backups are off by default.'
        : 'Scheduled backups are turned off.',
      last: lastOk,
      error: null,
    };
  }
  if (config.last.status === 'failed') {
    return {
      tone: 'red',
      title: 'Last automatic backup failed',
      line: `${lastAt ? `Failed ${formatBackupDateProse(lastAt, now)}` : 'Failed'}${next ? ` · next attempt ${next}` : ''}`,
      last: null,
      error: config.last.error,
    };
  }
  return {
    tone: 'green',
    title: 'Automatic backups are on',
    line: withNext,
    last: lastOk ?? 'No automatic backup has run yet.',
    error: null,
  };
}

function StatusDot({ tone }: { tone: StatusTone }) {
  const color = tone;
  return (
    <Box
      mt={7}
      w={10}
      h={10}
      style={{
        borderRadius: '50%',
        flexShrink: 0,
        background: `var(--mantine-color-${color}-6)`,
        boxShadow: `0 0 0 4px color-mix(in srgb, var(--mantine-color-${color}-6) 18%, transparent)`,
      }}
    />
  );
}

export default function BackupRestorePage() {
  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [backups, setBackups] = useState<StoredBackup[]>([]);
  const [listLoading, setListLoading] = useState(true);

  // Automatic-backup form (saved with the Save button)
  const [enabled, setEnabled] = useState(false);
  const [preset, setPreset] = useState<BackupPreset>('daily');
  const [customCron, setCustomCron] = useState('0 4 * * *');
  const [retentionDaily, setRetentionDaily] = useState<number | string>(14);
  const [retentionWeekly, setRetentionWeekly] = useState<number | string>(4);
  const [savingConfig, setSavingConfig] = useState(false);
  const [runningNow, setRunningNow] = useState(false);

  // List
  const [filter, setFilter] = useState<KindFilter>('all');
  const [showAll, setShowAll] = useState(false);

  // Modals
  const [modal, setModal] = useState<Modals>(null);
  const [busy, setBusy] = useState(false);
  const [exportPassword, setExportPassword] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const [cfgRes, listRes] = await Promise.all([fetch('/api/settings/backup/config'), fetch('/api/settings/backup/list')]);
      if (cfgRes.ok) {
        const cfg = await cfgRes.json() as BackupConfig;
        setConfig(cfg);
        setEnabled(cfg.enabled);
        setPreset(cfg.preset);
        setCustomCron(cfg.schedule);
        setRetentionDaily(cfg.retention.daily);
        setRetentionWeekly(cfg.retention.weekly);
      }
      if (listRes.ok) setBackups(((await listRes.json()) as { backups: StoredBackup[] }).backups);
    } catch (error) {
      logger.error('Failed to load backup settings:', error);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const closeModal = () => {
    if (busy) return;
    setModal(null);
    setExportPassword('');
  };

  const saveConfig = async (override?: { enabled: boolean }) => {
    setSavingConfig(true);
    try {
      const response = await fetch('/api/settings/backup/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: override?.enabled ?? enabled,
          schedule: preset === 'custom' ? customCron : preset,
          retention: { daily: Number(retentionDaily), weekly: Number(retentionWeekly) },
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        notificationHelper.error({ title: 'Could not save', message: data.error || 'An unexpected error occurred.' });
        return;
      }
      notificationHelper.success({
        title: override?.enabled ? 'Automatic backups on' : 'Saved',
        message: override?.enabled ? 'Scheduled backups are now running.' : 'Automatic backup settings updated.',
      });
      await loadAll();
    } catch (error) {
      logger.error('Save backup settings error:', error);
      notificationHelper.error({ title: 'Could not save', message: 'Could not connect to the server.' });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleBackupNow = async () => {
    setRunningNow(true);
    try {
      const response = await fetch('/api/settings/backup/run', { method: 'POST' });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        notificationHelper.error({ title: 'Backup Failed', message: data.error || 'An unexpected error occurred.' });
      } else {
        notificationHelper.success({ title: 'Backup created', message: 'Saved on the server.' });
      }
      await loadAll();
    } catch (error) {
      logger.error('Backup now error:', error);
      notificationHelper.error({ title: 'Backup Failed', message: 'Could not connect to the server.' });
    } finally {
      setRunningNow(false);
    }
  };

  const handleRowAction = async () => {
    if (modal?.type !== 'restore' && modal?.type !== 'delete') return;
    const { type, backup } = modal;
    setBusy(true);
    const url = backupFileUrl(backup);
    try {
      const response = type === 'delete'
        ? await fetch(url, { method: 'DELETE' })
        : await fetch(`${url}/restore`, { method: 'POST' });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        notificationHelper.error({ title: type === 'delete' ? 'Delete Failed' : 'Restore Failed', message: data.error || 'An unexpected error occurred.' });
      } else if (type === 'delete') {
        notificationHelper.success({ title: 'Deleted', message: backup.filename });
      } else {
        notificationHelper.success({ title: 'Restore Complete', message: 'Database restored. A copy of the previous data was saved as a "Pre-restore" backup.' });
      }
    } catch (error) {
      logger.error('Backup row action error:', error);
      notificationHelper.error({ title: 'Request failed', message: 'Could not connect to the server.' });
    } finally {
      setBusy(false);
      setModal(null);
      await loadAll();
    }
  };

  const handleExport = async () => {
    setBusy(true);
    const notifId = 'backup-progress';
    notificationHelper.loading({ id: notifId, title: 'Creating backup…', message: 'Exporting database, please wait.' });

    try {
      const response = await fetch('/api/settings/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: exportPassword || undefined }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        notificationHelper.update(notifId, {
          type: 'error',
          title: 'Backup Failed',
          message: data.error || 'An unexpected error occurred.',
          autoClose: 6000,
        });
        return;
      }

      // Pull filename from Content-Disposition header
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? 'matchexec-backup.dump';

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);

      notificationHelper.update(notifId, {
        type: 'success',
        title: 'Backup Downloaded',
        message: `Saved as ${filename}`,
        autoClose: 5000,
      });
      setModal(null);
      setExportPassword('');
    } catch (error) {
      logger.error('Backup error:', error);
      notificationHelper.update(notifId, {
        type: 'error',
        title: 'Backup Failed',
        message: 'Could not connect to the server.',
        autoClose: 6000,
      });
    } finally {
      setBusy(false);
    }
  };

  const now = useMemo(() => new Date(), [config, backups]); // eslint-disable-line react-hooks/exhaustive-deps
  const status = buildStatus(config, now);
  const noTools = config ? !config.pgToolsAvailable : false;
  const isOff = !!config && config.pgToolsAvailable && !config.enabled;

  const counts = useMemo(() => {
    const c: Record<KindFilter, number> = { all: backups.length, auto: 0, 'pre-upgrade': 0, 'pre-restore': 0 };
    backups.forEach((b) => { c[b.kind] += 1; });
    return c;
  }, [backups]);
  const visibleFilters = FILTERS.filter((f) => f.value === 'all' || counts[f.value] > 0);
  const filtered = backups.filter((b) => filter === 'all' || b.kind === filter);
  const rows = showAll ? filtered : filtered.slice(0, LIST_LIMIT);

  const rowModalBackup = modal?.type === 'restore' || modal?.type === 'delete' ? modal.backup : null;

  return (
    <PageLayout narrow>
      <Stack gap="lg">
        <PageHeader
          icon={IconDatabaseImport}
          title="Backup & Restore"
          subtitle="Full database backups: matches, tournaments, settings and configuration."
          breadcrumbs={[{ title: 'Settings', href: '/settings' }]}
          docLink="https://docs.matchexec.com/docs/settings/backup-and-restore/"
        />

        {/* Automatic backups: status first, settings below */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            {noTools && (
              <Alert icon={<IconAlertTriangle size="1rem" />} color="red" variant="light">
                PostgreSQL client tools (pg_dump / pg_restore) weren&apos;t found on the server. Backups and restores can&apos;t run until they&apos;re installed.
              </Alert>
            )}

            <Group justify="space-between" align="flex-start" gap="md">
              <Group gap="sm" align="flex-start" wrap="nowrap" style={{ flex: '1 1 320px', minWidth: 0 }}>
                <StatusDot tone={status.tone} />
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Text size="md" fw={600}>{status.title}</Text>
                  {status.line && <Text size="sm">{status.line}</Text>}
                  {status.last && <Text size="sm" c="dimmed">{status.last}</Text>}
                  {status.error && (
                    <Code block c="red" mt={6} style={{ whiteSpace: 'pre-wrap' }}>{status.error}</Code>
                  )}
                </Stack>
              </Group>
              <Group gap="xs">
                {isOff && (
                  <Button onClick={() => void saveConfig({ enabled: true })} loading={savingConfig}>Turn on</Button>
                )}
                <Button
                  variant="default"
                  leftSection={<IconPlayerPlay size="1rem" />}
                  onClick={handleBackupNow}
                  loading={runningNow}
                  disabled={noTools}
                >
                  Back up now
                </Button>
              </Group>
            </Group>

            <Divider />

            <Group justify="space-between" align="center" wrap="nowrap">
              <div>
                <Text fw={500}>Run automatic backups</Text>
                <Text size="xs" c="dimmed">On by default for the built-in database, off for an external one.</Text>
              </div>
              <Switch
                aria-label="Toggle automatic backups"
                checked={enabled}
                onChange={(e) => setEnabled(e.currentTarget.checked)}
              />
            </Group>

            <Stack gap={8} style={{ opacity: enabled ? 1 : 0.45 }}>
              <Text fw={500}>
                Schedule <Text span size="xs" c="dimmed" fw={400}>(server time zone)</Text>
              </Text>
              <SegmentedControl
                style={{ alignSelf: 'flex-start', maxWidth: '100%' }}
                data={PRESET_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
                value={preset}
                onChange={(v) => setPreset(v as BackupPreset)}
              />
              {preset === 'custom' && (
                <TextInput
                  maw={320}
                  aria-label="Cron expression"
                  description="minute hour day-of-month month day-of-week"
                  value={customCron}
                  onChange={(e) => setCustomCron(e.currentTarget.value)}
                  styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
                />
              )}
            </Stack>

            <Stack gap={8} style={{ opacity: enabled ? 1 : 0.45 }}>
              <Text fw={500}>Keep</Text>
              <Group gap="xs" align="center">
                <NumberInput
                  w={84}
                  aria-label="Daily backups to keep"
                  min={1}
                  max={365}
                  allowDecimal={false}
                  value={retentionDaily}
                  onChange={setRetentionDaily}
                />
                <Text size="sm">daily backups and</Text>
                <NumberInput
                  w={84}
                  aria-label="Weekly backups to keep"
                  min={0}
                  max={52}
                  allowDecimal={false}
                  value={retentionWeekly}
                  onChange={setRetentionWeekly}
                />
                <Text size="sm">weekly backups</Text>
              </Group>
              <Text size="xs" c="dimmed">
                The newest backup from each recent day, then one per week after that. Before-upgrade and before-restore copies aren&apos;t pruned.
              </Text>
            </Stack>

            <Group justify="space-between" align="center">
              <Text size="xs" c="dimmed" ff="monospace">{config?.backupDir ?? ''}</Text>
              <Button onClick={() => void saveConfig()} loading={savingConfig}>Save</Button>
            </Group>
          </Stack>
        </Card>

        {/* One list for every backup, all actions in one place */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Group gap="xs" align="baseline">
                <Text size="md" fw={600}>Backups</Text>
                {backups.length > 0 && <Text size="sm" c="dimmed">{backups.length} stored on the server</Text>}
              </Group>
              <Group gap="xs">
                <Button
                  variant="default"
                  size="xs"
                  leftSection={<IconDownload size="0.95rem" />}
                  disabled={noTools}
                  onClick={() => setModal({ type: 'export' })}
                >
                  Download a copy
                </Button>
                <Button
                  variant="default"
                  size="xs"
                  leftSection={<IconUpload size="0.95rem" />}
                  disabled={noTools}
                  onClick={() => setModal({ type: 'file' })}
                >
                  Restore from file
                </Button>
              </Group>
            </Group>

            {listLoading ? (
              <Group justify="center"><Loader size="sm" /></Group>
            ) : backups.length === 0 ? (
              <Stack
                align="center"
                gap={6}
                py="xl"
                px="md"
                style={{ border: '1px dashed var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)', textAlign: 'center' }}
              >
                <Text fw={500}>No backups yet</Text>
                <Text size="sm" c="dimmed" maw={420}>
                  Automatic backups, plus the safety copies taken before upgrades and restores, will be listed here. Use Back up now to create the first one.
                </Text>
              </Stack>
            ) : (
              <Stack gap="sm">
                <Group gap={6}>
                  {visibleFilters.map((f) => {
                    const on = filter === f.value;
                    return (
                      <Button
                        key={f.value}
                        size="compact-sm"
                        radius="xl"
                        variant={on ? 'light' : 'default'}
                        color={on ? 'violet' : undefined}
                        onClick={() => { setFilter(f.value); setShowAll(false); }}
                      >
                        {f.label}
                        <Text span size="xs" ml={6} style={{ opacity: 0.7 }}>{counts[f.value]}</Text>
                      </Button>
                    );
                  })}
                </Group>

                <Stack gap={0}>
                  {rows.map((b) => (
                    <Group
                      key={b.id}
                      justify="space-between"
                      wrap="nowrap"
                      gap="sm"
                      py={10}
                      px={8}
                      style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
                    >
                      <Group gap="md" align="center" style={{ minWidth: 0 }}>
                        <Box w={124} style={{ flexShrink: 0 }}>
                          <Tooltip label={KIND_LABEL[b.kind].hint}>
                            <Badge color={KIND_LABEL[b.kind].color} variant="light" styles={{ label: { overflow: 'visible' } }}>
                              {KIND_LABEL[b.kind].label}
                            </Badge>
                          </Tooltip>
                        </Box>
                        <Tooltip label={b.filename}>
                          <Text fw={500} miw={150}>{formatBackupDate(new Date(b.createdAt), now)}</Text>
                        </Tooltip>
                        <Text c="dimmed" miw={64}>{formatBytes(b.size)}</Text>
                      </Group>
                      <Group gap={2} wrap="nowrap">
                        <Button
                          variant="subtle"
                          color="orange"
                          size="compact-sm"
                          leftSection={<IconHistory size="0.95rem" />}
                          disabled={noTools}
                          aria-label={`Restore ${b.filename}`}
                          onClick={() => setModal({ type: 'restore', backup: b })}
                        >
                          Restore
                        </Button>
                        <Tooltip label="Download">
                          <ActionIcon
                            variant="subtle"
                            color="violet"
                            aria-label={`Download ${b.filename}`}
                            component="a"
                            href={backupFileUrl(b)}
                            download={b.filename}
                          >
                            <IconDownload size="1rem" />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Delete">
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label={`Delete ${b.filename}`}
                            onClick={() => setModal({ type: 'delete', backup: b })}
                          >
                            <IconTrash size="1rem" />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Group>
                  ))}
                  {filtered.length > LIST_LIMIT && (
                    <Box style={{ borderTop: '1px solid var(--mantine-color-default-border)' }} pt="sm" px={8}>
                      <Button variant="subtle" color="violet" size="compact-sm" onClick={() => setShowAll((v) => !v)}>
                        {showAll ? 'Show fewer' : `Show all ${filtered.length}`}
                      </Button>
                    </Box>
                  )}
                </Stack>
              </Stack>
            )}
          </Stack>
        </Card>
      </Stack>

      {/* Download a copy */}
      <Modal opened={modal?.type === 'export'} onClose={closeModal} title="Download a copy" centered size="sm">
        <Stack gap="md">
          <Text size="sm">Takes a fresh snapshot and downloads it to this device. The bot and scheduler keep running.</Text>
          <PasswordInput
            label="Encryption password (optional)"
            placeholder="Leave blank for an unencrypted .dump"
            value={exportPassword}
            onChange={(e) => setExportPassword(e.currentTarget.value)}
          />
          {!exportPassword && (
            <Alert icon={<IconShieldOff size="1rem" />} color="yellow" variant="light">
              Unencrypted backups include bot tokens and API keys in plain text. Keep the file somewhere private.
            </Alert>
          )}
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={closeModal} disabled={busy}>Cancel</Button>
            <Button onClick={handleExport} loading={busy}>
              {exportPassword ? 'Download encrypted' : 'Download'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Restore from file */}
      <RestoreFileModal
        opened={modal?.type === 'file'}
        onClose={() => setModal(null)}
        onRestored={() => { setModal(null); void loadAll(); }}
      />

      {/* Restore a stored backup */}
      <Modal opened={modal?.type === 'restore'} onClose={closeModal} title="Restore this backup?" centered size="sm">
        <Stack gap="md">
          {rowModalBackup && (
            <Group gap="sm">
              <Badge color={KIND_LABEL[rowModalBackup.kind].color} variant="light">{KIND_LABEL[rowModalBackup.kind].label}</Badge>
              <Text fw={500}>{formatBackupDate(new Date(rowModalBackup.createdAt), now)}</Text>
              <Text c="dimmed">{formatBytes(rowModalBackup.size)}</Text>
            </Group>
          )}
          <Alert icon={<IconAlertTriangle size="1rem" />} color="red" variant="light">
            Replaces all current data. Your current data is saved as a Pre-restore backup first, and MatchExec is unavailable for a moment.
          </Alert>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={closeModal} disabled={busy}>Cancel</Button>
            <Button color="red" onClick={handleRowAction} loading={busy}>Replace data and restore</Button>
          </Group>
        </Stack>
      </Modal>

      {/* Delete a stored backup */}
      <Modal opened={modal?.type === 'delete'} onClose={closeModal} title="Delete backup?" centered size="sm">
        <Stack gap="md">
          <Text size="sm">
            <Code>{rowModalBackup?.filename}</Code> will be removed from the server. This can&apos;t be undone.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={closeModal} disabled={busy}>Cancel</Button>
            <Button color="red" onClick={handleRowAction} loading={busy}>Delete</Button>
          </Group>
        </Stack>
      </Modal>
    </PageLayout>
  );
}
