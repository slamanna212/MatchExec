import type { JSX, ReactNode } from 'react';
import { Stack, Group, Text, Button, Card, Badge, Image, Divider, Anchor } from '@mantine/core';
import { StageRing } from '@/components/StageRing';
import { SeriesAvatar } from './series-dashboard';
import {
  SERIES_STATUS_COLOR, SERIES_FALLBACK_COLOR, seriesIdentity, seriesHistoryIdentity, seriesProgress,
  formatShortDate, formatFullDateTime, formatPoints, parseScoringConfig, describeSeriesFormat,
} from './series-shared';
import type { SeriesSummary } from './series-shared';

interface SeriesInfoPanelProps {
  series: SeriesSummary;
  onActivate: () => void;
  /** created -> registration. Optional so older callers keep working (the button is then hidden). */
  onOpenRegistration?: () => void;
  onAddEvent: () => void;
  onEdit: () => void;
  onComplete: () => void;
  onCancel: () => void;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <Group justify="space-between" wrap="nowrap" gap="md">
      <Text size="sm" fw={500} c="dimmed" style={{ flexShrink: 0 }}>{label}:</Text>
      {typeof children === 'string' ? <Text size="sm" ta="right">{children}</Text> : children}
    </Group>
  );
}

function EnabledBadge({ on }: { on: boolean }): JSX.Element {
  return <Badge variant="light" color={on ? 'green' : 'gray'}>{on ? 'Enabled' : 'Disabled'}</Badge>;
}

export function SeriesInfoPanel({
  series, onActivate, onOpenRegistration, onAddEvent, onEdit, onComplete, onCancel,
}: SeriesInfoPanelProps): JSX.Element {
  const finished = series.status === 'complete' || series.status === 'cancelled';
  // Finished series have no next event, so identify them by their last event instead.
  const identity = finished ? seriesHistoryIdentity(series) : seriesIdentity(series);
  const accent = identity?.game_color || SERIES_FALLBACK_COLOR;
  const cover = series.event_image_url || identity?.game_cover || null;
  const config = parseScoringConfig(series.scoring_config);
  const placements = config.tournament_position_points ?? [];
  const start = formatShortDate(series.start_date);
  const end = formatShortDate(series.end_date);

  let subtitle: string;
  if (series.next_event?.game_name) subtitle = `Next: ${series.next_event.game_name}`;
  else if (identity?.game_name) subtitle = identity.game_name;
  else subtitle = series.event_count === 0 ? 'No events yet' : 'All events finished';

  return (
    <div style={{ position: 'sticky', top: 20 }}>
      <Stack gap="md">
        {/* Header card: title row, then description, then image (same order as matches) */}
        <Card withBorder radius="md" padding="lg" shadow="sm">
          <Stack gap="md">
            <Group wrap="nowrap">
              <SeriesAvatar icon={identity?.game_icon} name={identity?.game_name} size="lg" />
              <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
                <Text size="xl" fw={600} style={{ wordBreak: 'break-word' }}>{series.name}</Text>
                <Text size="md" c="dimmed">{subtitle}</Text>
              </Stack>
              <StageRing value={seriesProgress(series)} gameColor={accent} size={60} thickness={6} />
            </Group>
            {series.description && (
              <div>
                <Text size="sm" fw={500} c="dimmed">Description:</Text>
                <Text size="sm">{series.description}</Text>
              </div>
            )}
            {cover && <Image src={cover} alt={series.name} radius="md" fit="cover" h={200} />}
          </Stack>
        </Card>

        {/* Details card */}
        <Card withBorder radius="md" padding="lg" shadow="sm">
          <Stack gap="sm">
            <DetailRow label="Status">
              <Badge variant="light" color={SERIES_STATUS_COLOR[series.status]}>{series.status}</Badge>
            </DetailRow>
            <DetailRow label="Events">{`${series.completed_event_count} of ${series.event_count} complete`}</DetailRow>
            {series.entrant_type === 'team' && series.entrant_count > 0 && <DetailRow label="Teams">{String(series.entrant_count)}</DetailRow>}
            <DetailRow label="Players">{String(series.participant_count)}</DetailRow>
            {series.scoring_type && (
              <DetailRow label="Format">{describeSeriesFormat(series.entrant_type ?? 'solo', series.scoring_type)}</DetailRow>
            )}
            {(start || end) && <DetailRow label="Runs">{`${start ?? '?'} → ${end ?? '?'}`}</DetailRow>}
            {config.mode === 'head_to_head' ? (
              <DetailRow label="Win / loss / tie">
                {`${formatPoints(config.win_points ?? 0)} / ${formatPoints(config.loss_points ?? 0)} / ${formatPoints(config.tie_points ?? 0)} pts`}
              </DetailRow>
            ) : (
              <>
                <DetailRow label="Match win / loss">
                  {`${formatPoints(config.match_win_points ?? 0)} / ${formatPoints(config.match_loss_points ?? 0)} pts`}
                </DetailRow>
                <DetailRow label="Placement">
                  {placements.length > 0 ? placements.map(formatPoints).join(' · ') : '—'}
                </DetailRow>
              </>
            )}
            <DetailRow label="Announcements"><EnabledBadge on={series.announcements} /></DetailRow>
            <DetailRow label="Player Notifications"><EnabledBadge on={series.player_notifications} /></DetailRow>
            {series.livestream_link && (
              <DetailRow label="Livestream">
                <Anchor size="sm" href={series.livestream_link} target="_blank" rel="noopener noreferrer">View Stream</Anchor>
              </DetailRow>
            )}
            <DetailRow label="Created">{formatFullDateTime(series.created_at) ?? 'N/A'}</DetailRow>
            {series.status === 'complete' && (
              <DetailRow label="Completed">{formatFullDateTime(series.updated_at) ?? 'N/A'}</DetailRow>
            )}
          </Stack>
        </Card>

        {/* Actions card (MatchActionsCard structure). A finished series is read-only, so it has no actions. */}
        {!finished && (
          <Card withBorder radius="md" padding="lg" shadow="sm">
            <Stack gap="xs">
              {series.status === 'created' && onOpenRegistration && (
                <Button fullWidth variant="light" color="yellow" onClick={onOpenRegistration}>Open registration</Button>
              )}
              {(series.status === 'created' || series.status === 'registration') && (
                <Button fullWidth variant="filled" color="violet" onClick={onActivate}>Start season</Button>
              )}
              {series.status === 'active' && (
                <Button fullWidth variant="filled" color="violet" onClick={onAddEvent}>Add Event</Button>
              )}
              <Group grow gap="xs">
                <Button size="sm" px="xs" variant="light" color="violet" onClick={onEdit}>Edit Series</Button>
                {series.status === 'active' && (
                  <Button size="sm" px="xs" variant="light" color="blue" onClick={onComplete}>Complete Series</Button>
                )}
              </Group>
              <Divider />
              <Button variant="subtle" color="red" fullWidth size="sm" onClick={onCancel}>Cancel Series</Button>
            </Stack>
          </Card>
        )}
      </Stack>
    </div>
  );
}
