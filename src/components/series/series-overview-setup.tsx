import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { Stack, Group, Text, Card, ThemeIcon, Badge, Button, SimpleGrid, Alert, Skeleton } from '@mantine/core';
import {
  IconCheck, IconCircleDashed, IconAlertTriangle, IconPencil, IconInfoCircle, IconUserCheck,
} from '@tabler/icons-react';
import { logger } from '@/lib/logger/client';
import { notificationHelper } from '@/lib/notifications';
import type { SeriesBatchDto, SeriesEntrantDto } from '@/shared/series-types';
import { CloseRegistrationCard, PlayoffPictureSection, SeasonLayoutCard } from './series-overview-layout';
import { entrantsApi } from './series-entrants-api';
import { buildSetupChecklist, summarizeRegistration, usesDiscordRegistration } from './series-overview-data';
import type { ChecklistItem, ChecklistState, OverviewData } from './series-overview-data';
import { OverviewSection, StatTile, UpNextList } from './series-overview-parts';
import type { OpenTab } from './series-overview-parts';
import { formatShortDateTime } from './series-shared';
import type { SeriesEventView, SeriesSummary } from './series-shared';

interface SetupViewProps {
  series: SeriesSummary;
  events: SeriesEventView[];
  batches: SeriesBatchDto[];
  data: OverviewData;
  onOpenTab: OpenTab;
  onChanged: () => void;
  refreshToken: number;
  onStartSeason?: () => void;
}

const STATE_ICON: Record<ChecklistState, { color: string; variant: string; icon: JSX.Element }> = {
  done: { color: 'teal', variant: 'filled', icon: <IconCheck size={14} stroke={3} /> },
  todo: { color: 'gray', variant: 'outline', icon: <IconCircleDashed size={14} /> },
  optional: { color: 'gray', variant: 'light', icon: <IconInfoCircle size={14} /> },
  warn: { color: 'yellow', variant: 'light', icon: <IconAlertTriangle size={14} /> },
};

function ChecklistRow({ item, onOpenTab }: { item: ChecklistItem; onOpenTab: OpenTab }): JSX.Element {
  const navigate = useNavigate();
  const { color, variant, icon } = STATE_ICON[item.state];
  const { action } = item;
  const onAction = action
    ? () => { if (action.tab) onOpenTab(action.tab); else if (action.href) navigate(action.href); }
    : undefined;
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start" data-testid={`checklist-${item.key}`} data-state={item.state}>
      <ThemeIcon size={24} radius="xl" color={color} variant={variant} mt={2} style={{ flexShrink: 0 }}>{icon}</ThemeIcon>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Group gap={6}>
          <Text size="sm" fw={600}>{item.label}</Text>
          {item.state === 'optional' && <Badge size="xs" variant="light" color="gray">Optional</Badge>}
        </Group>
        <Text size="sm" c="dimmed">{item.description}</Text>
      </div>
      {action && onAction && (
        <Button size="compact-sm" variant={item.state === 'todo' ? 'filled' : 'subtle'} color="violet" onClick={onAction} style={{ flexShrink: 0 }}>
          {action.label}
        </Button>
      )}
    </Group>
  );
}

/** Draft series: what is left before it is announced, and a preview of the schedule players will see. */
export function DraftOverview({ series, events, batches, data, onOpenTab }: SetupViewProps): JSX.Element {
  const loaded = data.entrants !== null || data.stages !== null;
  const items = buildSetupChecklist(series, events, data, batches);
  const todo = items.filter((i) => i.state === 'todo').length;
  const ready = loaded && todo === 0;

  return (
    <Stack gap="lg">
      <Card withBorder radius="md" padding="lg" data-testid="setup-checklist">
        <Stack gap="md">
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon size={36} radius="md" color={ready ? 'teal' : 'violet'} variant="light">
              {ready ? <IconCheck size={20} /> : <IconPencil size={20} />}
            </ThemeIcon>
            <div>
              <Text fw={700}>{ready ? 'Ready to announce' : 'Draft: finish setting up'}</Text>
              <Text size="sm" c="dimmed">
                {ready
                  ? 'Use Open registration or Start season in the left panel when you are ready.'
                  : 'Players cannot see or join this series yet, and nothing has been posted to Discord.'}
              </Text>
            </div>
          </Group>
          {loaded
            ? items.map((item) => <ChecklistRow key={item.key} item={item} onOpenTab={onOpenTab} />)
            : <Stack gap="sm">{[1, 2, 3, 4].map((i) => <Skeleton key={i} height={36} radius="sm" />)}</Stack>}
        </Stack>
      </Card>

      <SeasonLayoutCard events={events} batches={batches} stages={data.stages} onOpenTab={onOpenTab} />
      {events.some((e) => e.status === 'live') && (
        <UpNextList series={series} events={events} limit={5} label="Schedule preview" onOpenTab={onOpenTab} />
      )}
    </Stack>
  );
}

function PendingRow({ entrant, series, onApprove }: { entrant: SeriesEntrantDto; series: SeriesSummary; onApprove: () => void }): JSX.Element {
  const team = series.entrant_type === 'team';
  const count = entrant.members.length;
  const short = team && series.roster_min ? count < series.roster_min : false;
  const captain = entrant.members.find((m) => m.role === 'captain')?.username;
  return (
    <Group justify="space-between" wrap="nowrap" data-testid="pending-entrant">
      <div style={{ minWidth: 0 }}>
        <Text size="sm" fw={600} truncate>{entrant.name}{entrant.tag ? ` [${entrant.tag}]` : ''}</Text>
        {team && (
          <Group gap={6}>
            <Text size="xs" c="dimmed">
              {count} {count === 1 ? 'player' : 'players'}{captain ? ` · captain ${captain}` : ''}
            </Text>
            {short && <Badge size="xs" color="yellow" variant="light">needs {series.roster_min}</Badge>}
          </Group>
        )}
      </div>
      <Button size="compact-sm" variant="light" color="teal" leftSection={<IconUserCheck size={14} />} onClick={onApprove}>Approve</Button>
    </Group>
  );
}

/** Registration open: sign-ups so far, approvals waiting, and the opening events. */
export function RegistrationOverview({ series, events, batches, data, onOpenTab, onChanged, onStartSeason, refreshToken }: SetupViewProps): JSX.Element {
  const team = series.entrant_type === 'team';
  const who = team ? 'Teams' : 'Players';
  const summary = data.entrants ? summarizeRegistration(data.entrants, series.roster_min, series.entrant_type) : null;
  const firstDate = formatShortDateTime(series.next_event?.start_date);
  const discordSignups = usesDiscordRegistration(series);

  const approve = async (e: SeriesEntrantDto) => {
    const nid = `series-approve-${e.id}`;
    notificationHelper.loading({ id: nid, message: 'Approving...' });
    try {
      await entrantsApi.update(series.id, e.id, { status: 'active' });
      notificationHelper.update(nid, { type: 'success', message: `${e.name} approved` });
      onChanged();
    } catch (err) {
      logger.error('Error approving series entrant:', err);
      notificationHelper.update(nid, { type: 'error', message: err instanceof Error ? err.message : 'Failed to approve' });
    }
  };

  let readiness: { color: string; text: string } | null = null;
  if (summary) {
    if (summary.approved.length < 2) readiness = { color: 'gray', text: `At least two approved ${who.toLowerCase()} are needed to start the season.` };
    else if (summary.shortRosters > 0) readiness = { color: 'yellow', text: `${summary.shortRosters} approved ${summary.shortRosters === 1 ? 'team is' : 'teams are'} below the minimum roster of ${series.roster_min}.` };
    else readiness = { color: 'teal', text: 'Enough entrants to start: close registration when sign-ups are done.' };
  }

  return (
    <Stack gap="lg">
      {!discordSignups && (
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
          {series.announcements ? 'Registration posts are off' : 'Announcements are off'}, so players cannot sign up from Discord. Add entrants in the Entrants tab.
        </Alert>
      )}

      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
        <StatTile label={`${who} approved`} value={summary ? summary.approved.length : '–'} color="teal" />
        <StatTile label="Waiting for approval" value={summary ? summary.pending.length : '–'} color={summary && summary.pending.length > 0 ? 'yellow' : undefined} />
        {team
          ? <StatTile label="Players signed up" value={summary ? summary.players : '–'} hint={series.roster_min || series.roster_max ? `Rosters ${series.roster_min ?? 1}-${series.roster_max ?? 'any'}` : undefined} />
          : <StatTile label="Season opener" value={firstDate ?? 'TBD'} hint={series.next_event?.name ?? undefined} />}
      </SimpleGrid>

      {readiness && <Text size="sm" c={readiness.color === 'gray' ? 'dimmed' : readiness.color} data-testid="registration-readiness">{readiness.text}</Text>}

      <OverviewSection label="Waiting for approval" link={{ label: 'All entrants', onClick: () => onOpenTab('entrants') }}>
        <Card withBorder radius="md" padding="md">
          {!summary && <Skeleton height={32} />}
          {summary && summary.pending.length === 0 && (
            <Text size="sm" c="dimmed">
              {discordSignups ? 'No new registrations. Players sign up from the Discord post.' : 'Nothing waiting.'}
            </Text>
          )}
          {summary && summary.pending.length > 0 && (
            <Stack gap="sm">
              {summary.pending.map((e) => <PendingRow key={e.id} entrant={e} series={series} onApprove={() => { void approve(e); }} />)}
            </Stack>
          )}
        </Card>
      </OverviewSection>

      <CloseRegistrationCard series={series} events={events} batches={batches} approved={summary ? summary.approved.length : null} onStartSeason={onStartSeason} />
      <SeasonLayoutCard events={events} batches={batches} stages={data.stages} onOpenTab={onOpenTab} />
      {events.some((e) => e.status === 'live') && (
        <UpNextList series={series} events={events} limit={3} label="Opening events" onOpenTab={onOpenTab} />
      )}
      <PlayoffPictureSection series={series} events={events} refreshToken={refreshToken} onOpenTab={onOpenTab} />
    </Stack>
  );
}
