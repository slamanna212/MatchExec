import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import {
  Modal, Stack, Group, Text, Button, Divider, Alert, Anchor, FileButton, Badge, ScrollArea, Code, Card, Loader,
} from '@mantine/core';
import { IconAlertCircle, IconAlertTriangle, IconFileUpload, IconDownload } from '@tabler/icons-react';
import { logger } from '@/lib/logger/client';
import { notificationHelper } from '@/lib/notifications';
import type { EntrantImportPreview, SeriesEntrantType } from '@/shared/series-types';
import { entrantsApi } from './series-entrants-api';
import { MEMBER_ROLE_LABEL } from './series-entrants-shared';

const errorMessage = (err: unknown, fallback: string): string => (err instanceof Error ? err.message : fallback);

/** Header plus example rows offered as "Download template". */
export function entrantImportTemplate(entrantType: SeriesEntrantType): string {
  return entrantType === 'team'
    ? 'team,tag,division,seed,player,discord_id,role\r\nNight Owls,NOWL,North,1,Ava,123456789012345678,captain\r\nNight Owls,,,,Ben,234567890123456789,player\r\nRed Comets,RC,South,2,Dee,345678901234567890,captain\r\n'
    : 'player,discord_id,division,seed\r\nAva,123456789012345678,North,1\r\nBen,234567890123456789,South,2\r\n';
}

function downloadTemplate(entrantType: SeriesEntrantType): void {
  const blob = new Blob([entrantImportTemplate(entrantType)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = entrantType === 'team' ? 'series-teams-template.csv' : 'series-players-template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface ImportEntrantsModalProps {
  opened: boolean;
  onClose: () => void;
  seriesId: string;
  entrantType: SeriesEntrantType;
  onImported: () => void;
}

/** Counts shown above the preview (new / existing entrants, players to add / already rostered). */
export function summariseImport(preview: EntrantImportPreview): { created: number; updated: number; add: number; skip: number } {
  let created = 0; let updated = 0; let add = 0; let skip = 0;
  for (const e of preview.entrants) {
    const fresh = e.members.filter((m) => m.action === 'new').length;
    if (!e.existing) created++; else if (fresh > 0) updated++;
    add += fresh;
    skip += e.members.length - fresh;
  }
  return { created, updated, add, skip };
}

/**
 * Upload a CSV of entrants (one row per player, Discord ID required), preview what it does (new / existing entrants,
 * errors and warnings by line) and import it in one go. The server re-checks everything on import.
 */
export function ImportEntrantsModal({ opened, onClose, seriesId, entrantType, onImported }: ImportEntrantsModalProps): JSX.Element {
  const team = entrantType === 'team';
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<EntrantImportPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setCsv(null); setFileName(null); setPreview(null); setError(null);
  }, [opened]);

  const check = async (text: string) => {
    setChecking(true);
    setError(null);
    try {
      setPreview(await entrantsApi.importPreview(seriesId, text));
    } catch (err) {
      logger.error('Error previewing entrant import:', err);
      setPreview(null);
      setError(errorMessage(err, 'Failed to read the CSV'));
    } finally {
      setChecking(false);
    }
  };

  const pickFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      setCsv(text);
      setFileName(file.name);
      await check(text);
    } catch (err) {
      logger.error('Error reading CSV file:', err);
      setError('Could not read that file');
    }
  };

  const summary = preview ? summariseImport(preview) : null;
  const canImport = !!csv && !!preview?.ok && !!summary && summary.add + summary.created > 0;

  const handleImport = async () => {
    if (!csv) return;
    setSaving(true);
    setError(null);
    const nid = `series-import-entrants-${seriesId}`;
    notificationHelper.loading({ id: nid, message: 'Importing...' });
    try {
      const r = await entrantsApi.import(seriesId, csv);
      const parts = [
        r.created > 0 ? `${r.created} new ${team ? (r.created === 1 ? 'team' : 'teams') : (r.created === 1 ? 'player' : 'players')}` : null,
        team && r.updated > 0 ? `${r.updated} updated` : null,
        team ? `${r.members_added} ${r.members_added === 1 ? 'player' : 'players'} added` : null,
        r.members_skipped > 0 ? `${r.members_skipped} already on a roster` : null,
      ].filter(Boolean);
      notificationHelper.update(nid, { type: 'success', message: `Imported: ${parts.join(', ')}` });
      onClose();
      onImported();
    } catch (err) {
      logger.error('Error importing series entrants:', err);
      const message = errorMessage(err, 'Failed to import entrants');
      notificationHelper.update(nid, { type: 'error', message });
      setError(message);
      void check(csv); // the series may have changed since the preview
    } finally {
      setSaving(false);
    }
  };

  const errors = preview?.issues.filter((i) => i.level === 'error') ?? [];
  const warnings = preview?.issues.filter((i) => i.level === 'warning') ?? [];

  return (
    <Modal opened={opened} onClose={onClose} title={team ? 'Import teams from CSV' : 'Import players from CSV'} size="lg">
      <Stack gap="md">
        <Stack gap={4}>
          <Text size="sm">
            One row per player. Required columns: {team ? <><Code>team</Code>, </> : null}<Code>player</Code>, <Code>discord_id</Code>.
            Optional: {team ? <><Code>role</Code> (captain / player / sub), <Code>tag</Code>, </> : null}<Code>division</Code>, <Code>seed</Code>, <Code>color</Code>.
          </Text>
          <Text size="xs" c="dimmed">
            {team
              ? 'Rows with the same team name form one team. Existing teams keep their details and get the new players.'
              : 'Players already in this series are skipped.'}
          </Text>
          <Anchor component="button" type="button" size="sm" onClick={() => downloadTemplate(entrantType)} style={{ alignSelf: 'flex-start' }}>
            <Group gap={4}><IconDownload size={14} />Download template</Group>
          </Anchor>
        </Stack>

        <Group gap="sm">
          <FileButton onChange={(f) => { void pickFile(f); }} accept=".csv,text/csv,text/plain">
            {(props) => (
              <Button {...props} variant="light" leftSection={<IconFileUpload size={16} />} disabled={saving}>
                {fileName ? 'Choose another file' : 'Choose CSV file'}
              </Button>
            )}
          </FileButton>
          {fileName && <Text size="sm" c="dimmed" truncate maw={260}>{fileName}</Text>}
          {checking && <Loader size="xs" />}
        </Group>

        {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}

        {preview && summary && (
          <Stack gap="sm">
            <Group gap="xs">
              <Badge variant="light" color="green">{summary.created} new {team ? 'teams' : 'players'}</Badge>
              {team && summary.updated > 0 && <Badge variant="light" color="blue">{summary.updated} existing teams</Badge>}
              {team && <Badge variant="light">{summary.add} players to add</Badge>}
              {summary.skip > 0 && <Badge variant="light" color="gray">{summary.skip} already rostered</Badge>}
              {errors.length > 0 && <Badge variant="light" color="red">{errors.length} {errors.length === 1 ? 'error' : 'errors'}</Badge>}
              {warnings.length > 0 && <Badge variant="light" color="yellow">{warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'}</Badge>}
            </Group>

            {preview.issues.length > 0 && (
              <ScrollArea.Autosize mah={160} type="auto">
                <Stack gap={4}>
                  {preview.issues.map((issue, i) => (
                    <Group key={i} gap={6} wrap="nowrap" align="flex-start">
                      {issue.level === 'error'
                        ? <IconAlertCircle size={14} color="var(--mantine-color-red-6)" style={{ flexShrink: 0, marginTop: 3 }} />
                        : <IconAlertTriangle size={14} color="var(--mantine-color-yellow-6)" style={{ flexShrink: 0, marginTop: 3 }} />}
                      <Text size="sm">{issue.line !== null && <Text span fw={600}>Line {issue.line}: </Text>}{issue.message}</Text>
                    </Group>
                  ))}
                </Stack>
              </ScrollArea.Autosize>
            )}

            {preview.entrants.length > 0 && (
              <ScrollArea.Autosize mah={280} type="auto">
                <Stack gap="xs">
                  {preview.entrants.map((e) => (
                    <Card key={e.name} withBorder radius="sm" p="xs">
                      <Group gap="xs" justify="space-between" wrap="nowrap">
                        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                          <Text size="sm" fw={600} truncate>{e.name}</Text>
                          {e.tag && <Text size="xs" c="dimmed">[{e.tag}]</Text>}
                          {e.division && <Badge size="xs" variant="outline">{e.division}</Badge>}
                          {e.seed !== null && <Badge size="xs" variant="outline" color="gray">Seed {e.seed}</Badge>}
                        </Group>
                        <Badge size="xs" variant="light" color={e.existing ? 'blue' : 'green'}>{e.existing ? 'Existing' : 'New'}</Badge>
                      </Group>
                      {team && (
                        <Group gap={6} mt={6}>
                          {e.members.map((m) => (
                            <Badge
                              key={m.discord_user_id}
                              size="sm"
                              variant={m.action === 'new' ? 'light' : 'default'}
                              color={m.role === 'captain' ? 'yellow' : undefined}
                              title={`${m.discord_user_id} · line ${m.line}${m.action === 'existing' ? ' · already on this roster' : ''}`}
                              style={{ textTransform: 'none', opacity: m.action === 'existing' ? 0.6 : 1 }}
                            >
                              {m.username}{m.role !== 'player' ? ` (${MEMBER_ROLE_LABEL[m.role]})` : ''}
                            </Badge>
                          ))}
                        </Group>
                      )}
                    </Card>
                  ))}
                </Stack>
              </ScrollArea.Autosize>
            )}
          </Stack>
        )}

        <Divider />
        <Group justify="flex-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleImport} loading={saving} disabled={!canImport || checking}>
            {errors.length > 0 ? 'Fix errors to import' : 'Import'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
