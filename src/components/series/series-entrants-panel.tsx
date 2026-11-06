import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import {
  Stack, Group, Text, Badge, Card, Avatar, Button, ActionIcon, Menu, Switch, ColorSwatch, Loader, Center, Alert, Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  IconPlus, IconDots, IconEdit, IconTrash, IconCheck, IconUserPlus, IconUsers, IconCopy, IconLogout, IconCrown,
  IconAlertCircle, IconLock,
} from '@tabler/icons-react';
import { EmptyState } from '@/components/EmptyState';
import { SectionLabel } from '@/components/SectionLabel';
import { logger } from '@/lib/logger/client';
import { notificationHelper } from '@/lib/notifications';
import type { SeriesEntrantDto, SeriesEntrantMemberDto, SeriesMemberRole } from '@/shared/series-types';
import { entrantsApi, useSeriesEntrants } from './series-entrants-api';
import {
  ENTRANT_STATUS_COLOR, MEMBER_ROLE_COLOR, MEMBER_ROLE_LABEL, currentMembers, formerMembers, groupEntrantsByDivision,
  rosterState, rosteredPlayerKeys,
} from './series-entrants-shared';
import { AddMemberModal, CopyEntrantsModal, EntrantFormModal, WithdrawEntrantModal } from './series-entrant-modals';
import { formatShortDate } from './series-shared';
import type { SeriesSummary } from './series-shared';

export interface SeriesEntrantsPanelProps {
  /** The series (`entrant_type`, `roster_min` / `roster_max` and `status` are used). */
  series: Pick<SeriesSummary, 'id' | 'status' | 'entrant_type' | 'roster_min' | 'roster_max'>;
  /** Called after any change (add / edit / approve / withdraw / delete / roster change) so the page can refresh its own data. */
  onChanged?: () => void;
}

const errorMessage = (err: unknown, fallback: string): string => (err instanceof Error ? err.message : fallback);

/**
 * Entrants of a series: teams (with rosters) or solo players, grouped by division. Handles adding / editing, approving
 * pending sign-ups, withdrawing, deleting, roster changes (player search or manual Discord id) and copying entrants from
 * another series. Self-contained: loads its own data from `/api/series/:id/entrants`.
 */
export function SeriesEntrantsPanel({ series, onChanged }: SeriesEntrantsPanelProps): JSX.Element {
  const entrantType = series.entrant_type ?? 'solo';
  const solo = entrantType === 'solo';
  const [showHistory, setShowHistory] = useState(false);
  const { entrants, loading, error, reload } = useSeriesEntrants(series.id, showHistory);
  // Roster rules and duplicate checks always look at current rosters, so they never depend on the history toggle.
  const rosteredKeys = useMemo(() => rosteredPlayerKeys(entrants), [entrants]);
  const groups = useMemo(() => groupEntrantsByDivision(entrants), [entrants]);
  const readOnly = series.status === 'complete' || series.status === 'cancelled';
  const pendingCount = entrants.filter((e) => e.status === 'pending').length;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SeriesEntrantDto | null>(null);
  const [addingMemberTo, setAddingMemberTo] = useState<SeriesEntrantDto | null>(null);
  const [withdrawing, setWithdrawing] = useState<SeriesEntrantDto | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);

  const refresh = () => {
    void reload();
    onChanged?.();
  };

  const run = async (nid: string, loadingMessage: string, successMessage: string, action: () => Promise<unknown>) => {
    notificationHelper.loading({ id: nid, message: loadingMessage });
    try {
      await action();
      notificationHelper.update(nid, { type: 'success', message: successMessage });
      refresh();
    } catch (err) {
      logger.error('Error updating series entrants:', err);
      notificationHelper.update(nid, { type: 'error', message: errorMessage(err, 'Something went wrong') });
    }
  };

  const approve = (e: SeriesEntrantDto) => run(
    `series-approve-${e.id}`, 'Approving...', `${e.name} approved`,
    () => entrantsApi.update(series.id, e.id, { status: 'active' }),
  );

  const confirmDelete = (e: SeriesEntrantDto) => {
    modals.openConfirmModal({
      title: solo ? 'Remove player' : 'Delete team',
      children: (
        <Text size="sm">
          Delete &quot;{e.name}&quot; from this series{solo ? '' : ' together with its roster'}? Entrants with completed results can not be deleted:
          withdraw them instead.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Back' },
      confirmProps: { color: 'red' },
      onConfirm: () => run(`series-delete-entrant-${e.id}`, 'Deleting...', `${e.name} deleted`, () => entrantsApi.remove(series.id, e.id)),
    });
  };

  const changeRole = (e: SeriesEntrantDto, m: SeriesEntrantMemberDto, role: SeriesMemberRole) => run(
    `series-role-${m.id}`, 'Updating role...', `${m.username} is now ${MEMBER_ROLE_LABEL[role].toLowerCase()}`,
    () => entrantsApi.setMemberRole(series.id, e.id, m.id, role),
  );

  const confirmRemoveMember = (e: SeriesEntrantDto, m: SeriesEntrantMemberDto) => {
    modals.openConfirmModal({
      title: 'Remove player',
      children: (
        <Text size="sm">
          Remove {m.username} from {e.name}? They stay in the roster history and keep the results they already earned.
        </Text>
      ),
      labels: { confirm: 'Remove', cancel: 'Back' },
      confirmProps: { color: 'red' },
      onConfirm: () => run(`series-remove-member-${m.id}`, 'Removing player...', `${m.username} removed`, () => entrantsApi.removeMember(series.id, e.id, m.id)),
    });
  };

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (e: SeriesEntrantDto) => { setEditing(e); setFormOpen(true); };

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Group gap="xs">
          <SectionLabel>{solo ? 'Players' : 'Teams'} ({entrants.filter((e) => e.status !== 'withdrawn').length})</SectionLabel>
          {pendingCount > 0 && <Badge variant="light" color="yellow" size="sm">{pendingCount} pending</Badge>}
        </Group>
        <Group gap="xs">
          {!solo && (
            <Switch
              size="xs"
              label="Show roster history"
              checked={showHistory}
              onChange={(ev) => setShowHistory(ev.currentTarget.checked)}
            />
          )}
          {!readOnly && (
            <>
              <Button size="xs" variant="light" leftSection={<IconCopy size={14} />} onClick={() => setCopyOpen(true)}>
                Copy from series
              </Button>
              <Button size="xs" leftSection={<IconPlus size={14} />} onClick={openAdd}>
                {solo ? 'Add player' : 'Add team'}
              </Button>
            </>
          )}
        </Group>
      </Group>

      {readOnly && (
        <Group gap={6} wrap="nowrap">
          <IconLock size={14} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />
          <Text size="xs" c="dimmed">This series is over, so its entrants can no longer be changed.</Text>
        </Group>
      )}

      {loading && entrants.length === 0 ? (
        <Center py="xl"><Loader /></Center>
      ) : error && entrants.length === 0 ? (
        <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>
      ) : entrants.length === 0 ? (
        <Card withBorder radius="md">
          <EmptyState
            icon={IconUsers}
            title={solo ? 'No players yet' : 'No teams yet'}
            description={solo
              ? 'Add the players competing in this series, or copy them from an earlier season'
              : 'Add the teams competing in this series, then put players on their rosters'}
            action={!readOnly ? <Button size="xs" leftSection={<IconPlus size={14} />} onClick={openAdd}>{solo ? 'Add player' : 'Add team'}</Button> : undefined}
          />
        </Card>
      ) : (
        <Stack gap="lg">
          {groups.map((group) => (
            <Stack key={group.division ?? '__none'} gap="xs">
              {(groups.length > 1 || group.division !== null) && (
                <SectionLabel>{group.label} ({group.entrants.length})</SectionLabel>
              )}
              {group.entrants.map((e) => (
                <EntrantCard
                  key={e.id}
                  entrant={e}
                  solo={solo}
                  readOnly={readOnly}
                  rosterMin={series.roster_min}
                  rosterMax={series.roster_max}
                  showHistory={showHistory}
                  onEdit={() => openEdit(e)}
                  onApprove={() => { void approve(e); }}
                  onWithdraw={() => setWithdrawing(e)}
                  onDelete={() => confirmDelete(e)}
                  onAddMember={() => setAddingMemberTo(e)}
                  onChangeRole={(m, role) => { void changeRole(e, m, role); }}
                  onRemoveMember={(m) => confirmRemoveMember(e, m)}
                />
              ))}
            </Stack>
          ))}
        </Stack>
      )}

      <EntrantFormModal
        opened={formOpen}
        onClose={() => setFormOpen(false)}
        seriesId={series.id}
        entrantType={entrantType}
        entrant={editing}
        entrants={entrants}
        rosteredKeys={rosteredKeys}
        onSaved={refresh}
      />
      <AddMemberModal
        opened={addingMemberTo !== null}
        onClose={() => setAddingMemberTo(null)}
        seriesId={series.id}
        entrantType={entrantType}
        entrant={addingMemberTo}
        rosteredKeys={rosteredKeys}
        onAdded={refresh}
      />
      <WithdrawEntrantModal
        entrant={withdrawing}
        onClose={() => setWithdrawing(null)}
        seriesId={series.id}
        onWithdrawn={refresh}
      />
      <CopyEntrantsModal
        opened={copyOpen}
        onClose={() => setCopyOpen(false)}
        seriesId={series.id}
        entrantType={entrantType}
        onCopied={refresh}
      />
    </Stack>
  );
}

interface EntrantCardProps {
  entrant: SeriesEntrantDto;
  solo: boolean;
  readOnly: boolean;
  rosterMin: number | null | undefined;
  rosterMax: number | null | undefined;
  showHistory: boolean;
  onEdit: () => void;
  onApprove: () => void;
  onWithdraw: () => void;
  onDelete: () => void;
  onAddMember: () => void;
  onChangeRole: (member: SeriesEntrantMemberDto, role: SeriesMemberRole) => void;
  onRemoveMember: (member: SeriesEntrantMemberDto) => void;
}

function EntrantCard({
  entrant, solo, readOnly, rosterMin, rosterMax, showHistory, onEdit, onApprove, onWithdraw, onDelete, onAddMember,
  onChangeRole, onRemoveMember,
}: EntrantCardProps): JSX.Element {
  const withdrawn = entrant.status === 'withdrawn';
  const members = currentMembers(entrant);
  const former = showHistory ? formerMembers(entrant) : [];
  const roster = rosterState(entrant, rosterMin, rosterMax);
  const player = solo ? members[0] : undefined;

  return (
    <Card withBorder radius="md" padding="md" style={{ opacity: withdrawn ? 0.65 : 1 }}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            {solo ? (
              <Avatar src={player?.avatar_url ?? entrant.logo_url} size="md" radius="xl" color={entrant.color ?? undefined}>
                {entrant.name.slice(0, 1).toUpperCase()}
              </Avatar>
            ) : (
              <ColorSwatch color={entrant.color ?? 'var(--mantine-color-gray-5)'} size={22} withShadow={false} />
            )}
            <div style={{ minWidth: 0 }}>
              <Group gap={6} wrap="wrap">
                <Text fw={600} truncate>{entrant.name}</Text>
                {entrant.tag && <Badge size="sm" variant="outline" color="gray">{entrant.tag}</Badge>}
                {solo && entrant.color && <ColorSwatch color={entrant.color} size={12} withShadow={false} />}
              </Group>
              {solo && player && player.username !== entrant.name && (
                <Text size="xs" c="dimmed" truncate>{player.username}</Text>
              )}
            </div>
          </Group>
          <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
            {entrant.seed !== null && (
              <Tooltip label="Seed" withArrow>
                <Badge size="sm" variant="light" color="violet">#{entrant.seed}</Badge>
              </Tooltip>
            )}
            <Badge size="sm" variant="light" color={ENTRANT_STATUS_COLOR[entrant.status]}>{entrant.status}</Badge>
            {entrant.status === 'pending' && !readOnly && (
              <Button size="compact-xs" color="green" variant="light" leftSection={<IconCheck size={12} />} onClick={onApprove}>
                Approve
              </Button>
            )}
            {!readOnly && (
              <Menu withinPortal position="bottom-end">
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${entrant.name}`}>
                    <IconDots size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconEdit size={14} />} onClick={onEdit}>Edit</Menu.Item>
                  {!solo && !withdrawn && (
                    <Menu.Item leftSection={<IconUserPlus size={14} />} onClick={onAddMember}>Add player</Menu.Item>
                  )}
                  {!withdrawn && (
                    <Menu.Item leftSection={<IconLogout size={14} />} onClick={onWithdraw}>Withdraw...</Menu.Item>
                  )}
                  <Menu.Divider />
                  <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={onDelete}>Delete</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        </Group>

        {solo ? (
          entrant.division && (
            <Group gap="xs">
              <Badge size="xs" variant="outline" color="gray">{entrant.division}</Badge>
            </Group>
          )
        ) : (
          <Stack gap={4}>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                Roster · {roster.count}{rosterMax ? ` / ${rosterMax}` : ''} {roster.count === 1 ? 'player' : 'players'}
              </Text>
              {(roster.state === 'short' || roster.state === 'empty') && !withdrawn && (
                <Badge size="xs" variant="light" color="orange">
                  Needs {roster.missing} more
                </Badge>
              )}
            </Group>
            {members.length === 0 && <Text size="sm" c="dimmed">No players on this roster yet.</Text>}
            {members.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                readOnly={readOnly || withdrawn}
                onChangeRole={(role) => onChangeRole(m, role)}
                onRemove={() => onRemoveMember(m)}
              />
            ))}
            {former.length > 0 && (
              <Stack gap={4} mt={4}>
                <Text size="xs" c="dimmed" fw={600}>Former players</Text>
                {former.map((m) => (
                  <Group key={m.id} gap="xs" wrap="nowrap">
                    <Avatar src={m.avatar_url ?? null} size="sm" radius="xl" />
                    <Text size="sm" c="dimmed" td="line-through" truncate style={{ flex: 1 }}>{m.username}</Text>
                    <Badge size="xs" variant="outline" color="gray">{MEMBER_ROLE_LABEL[m.role]}</Badge>
                    <Text size="xs" c="dimmed">left {formatShortDate(m.left_at) ?? ''}</Text>
                  </Group>
                ))}
              </Stack>
            )}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

function MemberRow({
  member, readOnly, onChangeRole, onRemove,
}: {
  member: SeriesEntrantMemberDto;
  readOnly: boolean;
  onChangeRole: (role: SeriesMemberRole) => void;
  onRemove: () => void;
}): JSX.Element {
  return (
    <Group gap="xs" wrap="nowrap">
      <Avatar src={member.avatar_url ?? null} size="sm" radius="xl" />
      <Text size="sm" truncate style={{ flex: 1 }}>{member.username}</Text>
      <Badge
        size="xs"
        variant="light"
        color={MEMBER_ROLE_COLOR[member.role]}
        leftSection={member.role === 'captain' ? <IconCrown size={10} /> : undefined}
      >
        {MEMBER_ROLE_LABEL[member.role]}
      </Badge>
      {!readOnly && (
        <Menu withinPortal position="bottom-end">
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Actions for ${member.username}`}>
              <IconDots size={14} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {(['captain', 'player', 'sub'] as const).filter((r) => r !== member.role).map((r) => (
              <Menu.Item key={r} onClick={() => onChangeRole(r)}>
                {r === 'captain' ? 'Make captain' : r === 'player' ? 'Set as player' : 'Set as sub'}
              </Menu.Item>
            ))}
            <Menu.Divider />
            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={onRemove}>Remove from roster</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}
    </Group>
  );
}
