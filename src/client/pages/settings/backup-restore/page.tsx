import {
  Card,
  Text,
  Stack,
  Button,
  Group,
  PasswordInput,
  Alert,
  Modal,
  FileInput,
  Divider,
  Switch,
  Select,
  NumberInput,
  TextInput,
  Table,
  Badge,
  ActionIcon,
  Tooltip,
  Loader,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useCallback, useEffect, useState, useRef } from 'react';
import {
  IconAlertTriangle, IconDownload, IconUpload, IconLock, IconShieldOff, IconDatabaseImport, IconTrash, IconHistory, IconDeviceFloppy,
  IconPlayerPlay,
} from '@tabler/icons-react';
import { notificationHelper } from '@/lib/notifications';
import { logger } from '@/lib/logger/client';
import { PageLayout } from '@/components/PageLayout';
import { PageHeader } from '@/components/PageHeader';


type BackupKind = 'auto' | 'pre-upgrade' | 'pre-restore';

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
  preset: 'daily' | '12h' | 'weekly' | 'custom';
  retention: { daily: number; weekly: number };
  last: { at: string | null; status: 'success' | 'failed' | null; size: number | null; file: string | null; error: string | null };
  backupDir: string;
  pgToolsAvailable: boolean;
}

const KIND_LABEL: Record<BackupKind, { label: string; color: string }> = {
  auto: { label: 'Automatic', color: 'blue' },
  'pre-upgrade': { label: 'Before upgrade', color: 'grape' },
  'pre-restore': { label: 'Before restore', color: 'orange' },
};

const PRESET_OPTIONS = [
  { value: 'daily', label: 'Daily at 04:00' },
  { value: '12h', label: 'Every 12 hours (04:00 and 16:00)' },
  { value: 'weekly', label: 'Weekly (Sunday 04:00)' },
  { value: 'custom', label: 'Custom cron expression' },
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function BackupRestorePage() {
  const [backupPassword, setBackupPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const fileInputRef = useRef<HTMLButtonElement>(null);

  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [backups, setBackups] = useState<StoredBackup[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [preset, setPreset] = useState<string>('daily');
  const [customCron, setCustomCron] = useState('0 4 * * *');
  const [retentionDaily, setRetentionDaily] = useState<number | string>(14);
  const [retentionWeekly, setRetentionWeekly] = useState<number | string>(4);
  const [savingConfig, setSavingConfig] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [rowAction, setRowAction] = useState<{ type: 'restore' | 'delete'; backup: StoredBackup } | null>(null);
  const [rowBusy, setRowBusy] = useState(false);

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

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const response = await fetch('/api/settings/backup/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          schedule: preset === 'custom' ? customCron : preset,
          retention: { daily: Number(retentionDaily), weekly: Number(retentionWeekly) },
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        notificationHelper.error({ title: 'Could not save', message: data.error || 'An unexpected error occurred.' });
        return;
      }
      notificationHelper.success({ title: 'Saved', message: 'Automatic backup settings updated.' });
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
        notificationHelper.success({ title: 'Backup created', message: 'A new automatic-type backup was saved on the server.' });
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
    if (!rowAction) return;
    const { type, backup } = rowAction;
    setRowBusy(true);
    const url = `/api/settings/backup/files/${backup.kind}/${encodeURIComponent(backup.filename)}`;
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
        notificationHelper.success({ title: 'Restore Complete', message: 'Database restored. A copy of the previous data was saved as a "Before restore" backup.' });
      }
    } catch (error) {
      logger.error('Backup row action error:', error);
      notificationHelper.error({ title: 'Request failed', message: 'Could not connect to the server.' });
    } finally {
      setRowBusy(false);
      setRowAction(null);
      await loadAll();
    }
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    const notifId = 'backup-progress';

    notificationHelper.loading({
      id: notifId,
      title: 'Creating backup…',
      message: 'Exporting database, please wait.',
    });

    try {
      const response = await fetch('/api/settings/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: backupPassword || undefined }),
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
    } catch (error) {
      logger.error('Backup error:', error);
      notificationHelper.update(notifId, {
        type: 'error',
        title: 'Backup Failed',
        message: 'Could not connect to the server.',
        autoClose: 6000,
      });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreConfirmed = async () => {
    closeConfirm();

    if (!restoreFile) return;

    setRestoreLoading(true);
    const notifId = 'restore-progress';

    notificationHelper.loading({
      id: notifId,
      title: 'Restoring backup…',
      message: 'Replacing database, please wait.',
    });

    try {
      const formData = new FormData();
      formData.append('file', restoreFile);
      if (restorePassword) formData.append('password', restorePassword);

      const response = await fetch('/api/settings/restore', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json() as { error?: string };

      if (!response.ok) {
        notificationHelper.update(notifId, {
          type: 'error',
          title: 'Restore Failed',
          message: data.error || 'An unexpected error occurred.',
          autoClose: 8000,
        });
        return;
      }

      notificationHelper.update(notifId, {
        type: 'success',
        title: 'Restore Complete',
        message: 'Database restored. The previous data was saved as a "Before restore" backup.',
        autoClose: 6000,
      });

      // Clear form
      setRestoreFile(null);
      setRestorePassword('');
      void loadAll();
    } catch (error) {
      logger.error('Restore error:', error);
      notificationHelper.update(notifId, {
        type: 'error',
        title: 'Restore Failed',
        message: 'Could not connect to the server.',
        autoClose: 6000,
      });
    } finally {
      setRestoreLoading(false);
    }
  };

  const isEncryptedFile = restoreFile?.name.endsWith('.enc') ?? false;

  return (
    <PageLayout narrow>
      <Stack gap="lg">
        <PageHeader
          icon={IconDatabaseImport}
          title="Backup & Restore"
          subtitle="Back up and restore the entire database, automatically or on demand. All matches, tournaments, settings, and configuration are included."
          breadcrumbs={[{ title: 'Settings', href: '/settings' }]}
          docLink="https://docs.matchexec.com/docs/settings/backup-and-restore/"
        />

        {/* Automatic backups */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <div>
              <Text size="md" fw={600} mb={4}>Automatic Backups</Text>
              <Text size="sm" c="dimmed">
                Saves a database dump on the server on a schedule. Older backups are pruned automatically.
                {config ? ` Stored in ${config.backupDir}.` : ''}
              </Text>
            </div>

            <Divider />

            {config && !config.pgToolsAvailable && (
              <Alert icon={<IconAlertTriangle size="1rem" />} color="red" variant="light">
                The PostgreSQL client tools (pg_dump / pg_restore) were not found on the server, so backups cannot run.
              </Alert>
            )}

            <Switch
              label="Enable automatic backups"
              description={config?.enabledIsDefault
                ? `On by default for the built-in database; off for an external database (${config.embedded ? 'built-in database detected' : 'external database detected'}).`
                : undefined}
              checked={enabled}
              onChange={(e) => setEnabled(e.currentTarget.checked)}
            />

            <Select
              label="Schedule"
              description="Runs in the server's time zone."
              data={PRESET_OPTIONS}
              value={preset}
              onChange={(v) => setPreset(v ?? 'daily')}
              allowDeselect={false}
            />
            {preset === 'custom' && (
              <TextInput
                label="Cron expression"
                description="Five fields: minute hour day-of-month month day-of-week"
                value={customCron}
                onChange={(e) => setCustomCron(e.currentTarget.value)}
              />
            )}

            <Group grow align="flex-start">
              <NumberInput
                label="Keep daily backups"
                description="The newest backup of each of the last N days"
                min={1}
                max={365}
                allowDecimal={false}
                value={retentionDaily}
                onChange={setRetentionDaily}
              />
              <NumberInput
                label="Keep weekly backups"
                description="One older backup for each of the last N weeks"
                min={0}
                max={52}
                allowDecimal={false}
                value={retentionWeekly}
                onChange={setRetentionWeekly}
              />
            </Group>

            <Group justify="space-between" align="center">
              <div>
                {config?.last.at ? (
                  <Group gap="xs">
                    <Text size="sm" c="dimmed">Last run: {new Date(config.last.at).toLocaleString()}</Text>
                    <Badge color={config.last.status === 'success' ? 'green' : 'red'} variant="light">
                      {config.last.status === 'success' ? `Success${config.last.size ? `, ${formatBytes(config.last.size)}` : ''}` : 'Failed'}
                    </Badge>
                  </Group>
                ) : (
                  <Text size="sm" c="dimmed">No automatic backup has run yet.</Text>
                )}
                {config?.last.status === 'failed' && config.last.error && (
                  <Text size="xs" c="red" mt={4}>{config.last.error}</Text>
                )}
              </div>
              <Group>
                <Button variant="default" leftSection={<IconPlayerPlay size="1rem" />} onClick={handleBackupNow} loading={runningNow}>
                  Back up now
                </Button>
                <Button leftSection={<IconDeviceFloppy size="1rem" />} onClick={handleSaveConfig} loading={savingConfig}>
                  Save
                </Button>
              </Group>
            </Group>
          </Stack>
        </Card>

        {/* Stored backups */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <div>
              <Text size="md" fw={600} mb={4}>Stored Backups</Text>
              <Text size="sm" c="dimmed">
                Automatic backups, the safety copy taken before each upgrade, and the copy of your data taken before each restore.
              </Text>
            </div>

            <Divider />

            {listLoading ? (
              <Group justify="center"><Loader size="sm" /></Group>
            ) : backups.length === 0 ? (
              <Text size="sm" c="dimmed">No stored backups yet.</Text>
            ) : (
              <Table.ScrollContainer minWidth={520}>
                <Table verticalSpacing="xs" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>Created</Table.Th>
                      <Table.Th>Size</Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {backups.map((b) => (
                      <Table.Tr key={b.id}>
                        <Table.Td><Badge color={KIND_LABEL[b.kind].color} variant="light">{KIND_LABEL[b.kind].label}</Badge></Table.Td>
                        <Table.Td>
                          <Tooltip label={b.filename}><span>{new Date(b.createdAt).toLocaleString()}</span></Tooltip>
                        </Table.Td>
                        <Table.Td>{formatBytes(b.size)}</Table.Td>
                        <Table.Td>
                          <Group gap={4} justify="flex-end" wrap="nowrap">
                            <Tooltip label="Download">
                              <ActionIcon
                                variant="subtle"
                                aria-label={`Download ${b.filename}`}
                                component="a"
                                href={`/api/settings/backup/files/${b.kind}/${encodeURIComponent(b.filename)}`}
                                download={b.filename}
                              >
                                <IconDownload size="1rem" />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Restore">
                              <ActionIcon variant="subtle" color="orange" aria-label={`Restore ${b.filename}`} onClick={() => setRowAction({ type: 'restore', backup: b })}>
                                <IconHistory size="1rem" />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Delete">
                              <ActionIcon variant="subtle" color="red" aria-label={`Delete ${b.filename}`} onClick={() => setRowAction({ type: 'delete', backup: b })}>
                                <IconTrash size="1rem" />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Stack>
        </Card>

        {/* Backup */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <div>
              <Text size="md" fw={600} mb={4}>Create Backup</Text>
              <Text size="sm" c="dimmed">
                Downloads a snapshot of the database. The bot and scheduler continue running during backup.
              </Text>
            </div>

            <Divider />

            <PasswordInput
              label="Encryption Password"
              description="Optional. Leave blank to download an unencrypted .dump file."
              placeholder="Leave blank for no encryption"
              value={backupPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBackupPassword(e.currentTarget.value)}
              leftSection={<IconLock size="1rem" />}
            />

            {!backupPassword && (
              <Alert
                icon={<IconShieldOff size="1rem" />}
                color="yellow"
                variant="light"
              >
                Without a password, the backup contains all data in plaintext — including bot tokens and API keys. Store it somewhere private.
              </Alert>
            )}

            <Group justify="flex-end">
              <Button
                leftSection={<IconDownload size="1rem" />}
                onClick={handleBackup}
                loading={backupLoading}
              >
                Download Backup
              </Button>
            </Group>
          </Stack>
        </Card>

        {/* Restore */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <div>
              <Text size="md" fw={600} mb={4}>Restore Backup</Text>
              <Text size="sm" c="dimmed">
                Upload a backup file to replace the current database. Background work is paused while the restore runs, and your current data is saved as a "Before restore" backup first.
              </Text>
            </div>

            <Divider />

            <Alert
              icon={<IconAlertTriangle size="1rem" />}
              color="red"
              variant="light"
            >
              <Text size="sm" fw={600}>This will overwrite all current data.</Text>
              <Text size="sm">
                All matches, tournaments, participants, and settings will be replaced with the contents of the backup file.
                This cannot be undone.
              </Text>
            </Alert>

            <FileInput
              ref={fileInputRef}
              label="Backup File"
              description="Select a .dump or .dump.enc file exported from MatchExec (older SQLite .db backups work too)"
              placeholder="Click to select backup file"
              accept=".dump,.db,.enc"
              value={restoreFile}
              onChange={setRestoreFile}
              leftSection={<IconUpload size="1rem" />}
              clearable
            />

            {isEncryptedFile && (
              <PasswordInput
                label="Decryption Password"
                description="Required — this file is encrypted"
                placeholder="Enter the backup password"
                value={restorePassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRestorePassword(e.currentTarget.value)}
                leftSection={<IconLock size="1rem" />}
                required
              />
            )}

            {restoreFile && !isEncryptedFile && (
              <PasswordInput
                label="Decryption Password"
                description="Only needed if this backup was encrypted"
                placeholder="Leave blank if not encrypted"
                value={restorePassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRestorePassword(e.currentTarget.value)}
                leftSection={<IconLock size="1rem" />}
              />
            )}

            <Group justify="flex-end">
              <Button
                color="red"
                leftSection={<IconUpload size="1rem" />}
                onClick={openConfirm}
                disabled={!restoreFile || (isEncryptedFile && !restorePassword)}
                loading={restoreLoading}
              >
                Restore Backup
              </Button>
            </Group>
          </Stack>
        </Card>
      </Stack>

      {/* Confirmation modal */}
      <Modal
        opened={confirmOpened}
        onClose={closeConfirm}
        title="Confirm Restore"
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            Are you sure you want to restore from <strong>{restoreFile?.name}</strong>?
          </Text>
          <Text size="sm" c="red">
            All current data will be replaced (a copy is kept in Stored Backups). MatchExec is unavailable for a short while.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={closeConfirm}>Cancel</Button>
            <Button color="red" onClick={handleRestoreConfirmed}>Yes, Restore</Button>
          </Group>
        </Stack>
      </Modal>
      {/* Confirmation for stored-backup actions */}
      <Modal
        opened={rowAction !== null}
        onClose={() => { if (!rowBusy) setRowAction(null); }}
        title={rowAction?.type === 'delete' ? 'Delete Backup' : 'Confirm Restore'}
        centered
        size="sm"
      >
        <Stack gap="md">
          {rowAction?.type === 'delete' ? (
            <Text size="sm">Delete <strong>{rowAction.backup.filename}</strong>? This cannot be undone.</Text>
          ) : (
            <>
              <Text size="sm">Restore the database from <strong>{rowAction?.backup.filename}</strong>?</Text>
              <Text size="sm" c="red">
                All current data will be replaced (a copy is kept as a &quot;Before restore&quot; backup). MatchExec is unavailable for a short while.
              </Text>
            </>
          )}
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setRowAction(null)} disabled={rowBusy}>Cancel</Button>
            <Button color="red" onClick={handleRowAction} loading={rowBusy}>
              {rowAction?.type === 'delete' ? 'Yes, Delete' : 'Yes, Restore'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </PageLayout>
  );
}
