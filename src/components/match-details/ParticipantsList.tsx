import type { JSX } from 'react';
import { Stack, Card, Group, Avatar, Text, Badge, Skeleton, Grid, ActionIcon } from '@mantine/core';
import { IconMapRoute, IconBrandDiscord } from '@tabler/icons-react';
import { layoutParticipants, type TeamGroup } from './participant-groups';

interface MatchParticipant {
  id: string;
  user_id: string;
  discord_user_id?: string | null;
  username: string;
  avatar_url?: string | null;
  joined_at: string;
  signup_data: Record<string, unknown>;
  team_assignment?: 'reserve' | 'blue' | 'red' | null;
  team_id?: string | null;
  team_name?: string | null;
  team_color?: string | null;
  team_order?: number | null;
  receives_map_codes?: boolean;
}

/** Mantine colour name of a team section; null/'reserve' is the "unassigned" look. */
type TeamColor = string | null;

interface SignupField {
  id: string;
  label: string;
  type: string;
}

interface SignupConfig {
  fields: SignupField[];
}

interface ParticipantsListProps {
  participants: MatchParticipant[];
  loading: boolean;
  matchStatus?: string;
  /** 'Normal' (default) | 'FFA' | 'Position'. FFA and one-person-per-team Position matches have no team columns. */
  scoringType?: string;
  signupConfig: SignupConfig | null;
  parseDbTimestamp: (timestamp: string | null | undefined) => Date | null;
}

export function ParticipantsList({
  participants,
  loading,
  matchStatus,
  scoringType = 'Normal',
  signupConfig,
  parseDbTimestamp
}: ParticipantsListProps): JSX.Element {
  // Utility function for team card styling
  const getTeamCardStyles = (team: TeamColor) => {
    if (team === null || team === 'reserve') return { borderLeft: '4px solid var(--mantine-color-yellow-6)' };
    return { borderLeft: `4px solid var(--mantine-color-${team}-6)` };
  };

  // Utility function for badge colors
  const getBadgeColor = (team: TeamColor) => {
    switch(team) {
      case 'blue': return 'orange';
      case 'red': return 'cyan';
      default: return 'violet';
    }
  };

  // Utility function for avatar colors
  const getAvatarColor = (team: TeamColor) => {
    if (team !== null && team !== 'reserve') return team;
    return matchStatus === 'complete' ? 'green' : 'teal';
  };

  // Render individual participant card
  const renderParticipantCard = (
    participant: MatchParticipant,
    index: number,
    teamColor: TeamColor
  ) => {
    return (
      <Card
        key={participant.id}
        shadow="sm"
        padding="md"
        radius="md"
        withBorder
        style={{ ...getTeamCardStyles(teamColor), contentVisibility: 'auto', containIntrinsicSize: '0 80px' }}
      >
        <Group align="center" gap="md" wrap="nowrap">
          <Avatar size="lg" color={getAvatarColor(teamColor)} src={participant.avatar_url || undefined}>
            {index}
          </Avatar>
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Group gap={4} align="center">
              <Text fw={500} size="sm">{participant.username}</Text>
              {participant.discord_user_id && (
                <ActionIcon
                  component="a"
                  href={`https://discord.com/users/${participant.discord_user_id}`}
                  target="_blank"
                  variant="subtle"
                  color="indigo"
                  size="xs"
                  title="View Discord profile"
                >
                  <IconBrandDiscord size={12} />
                </ActionIcon>
              )}
            </Group>
            <Text size="xs" c="dimmed">
              Joined: {parseDbTimestamp(participant.joined_at)?.toLocaleDateString('en-US') || 'N/A'}
            </Text>
            {participant.signup_data && Object.entries(participant.signup_data).map(([key, value]) => {
              const field = signupConfig?.fields.find(f => f.id === key);
              const displayLabel = field?.label || key.replace(/([A-Z])/g, ' $1').trim();

              return (
                <Group key={key} gap={4}>
                  <Text size="xs" c="dimmed">{displayLabel}:</Text>
                  <Badge size="xs" variant="light" color={getBadgeColor(teamColor)}>
                    {String(value)}
                  </Badge>
                </Group>
              );
            })}
          </Stack>
          {participant.receives_map_codes && (
            <IconMapRoute
              size={32}
              style={{ color: `var(--mantine-color-${getBadgeColor(teamColor)}-6)`, flexShrink: 0 }}
              title="Match Commander"
            />
          )}
        </Group>
      </Card>
    );
  };

  // Render team section with header
  const renderTeamSection = (
    title: string,
    teamPlayers: MatchParticipant[],
    teamColor: string
  ) => {
    return (
      <div>
        <Group justify="space-between" mb="sm">
          <Text size="md" fw={600} c={teamColor}>
            {title}
          </Text>
          <Badge size="md" color={teamColor} variant="light">
            {teamPlayers.length}
          </Badge>
        </Group>

        <Stack gap="xs">
          {teamPlayers.length === 0 ? (
            <Card p="lg" withBorder style={{ borderStyle: 'dashed' }}>
              <Text size="sm" c="dimmed" ta="center">
                No players assigned
              </Text>
            </Card>
          ) : (
            teamPlayers.map((participant, index) =>
              renderParticipantCard(participant, index + 1, teamColor)
            )
          )}
        </Stack>
      </div>
    );
  };

  if (loading) {
    return (
      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Stack gap="xs">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} shadow="sm" padding="md" radius="md" withBorder>
                <Group gap="md">
                  <Skeleton height={50} width={50} circle />
                  <Stack gap={4} style={{ flex: 1 }}>
                    <Skeleton height={14} width="60%" />
                    <Skeleton height={12} width="40%" />
                  </Stack>
                </Group>
              </Card>
            ))}
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Stack gap="xs">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} shadow="sm" padding="md" radius="md" withBorder>
                <Group gap="md">
                  <Skeleton height={50} width={50} circle />
                  <Stack gap={4} style={{ flex: 1 }}>
                    <Skeleton height={14} width="60%" />
                    <Skeleton height={12} width="40%" />
                  </Stack>
                </Group>
              </Card>
            ))}
          </Stack>
        </Grid.Col>
      </Grid>
    );
  }

  if (participants.length === 0) {
    return (
      <Card p="lg" withBorder>
        <Stack align="center">
          <Text size="md" c="dimmed">
            {matchStatus === 'complete' ? 'No participants data' : 'No participants yet'}
          </Text>
          {matchStatus === 'complete' && (
            <Text size="sm" c="dimmed">
              Participant information may not be available for this match
            </Text>
          )}
        </Stack>
      </Card>
    );
  }

  const layout = layoutParticipants(participants, scoringType);

  // FFA / Position without teams: one flat list, no team sections.
  if (layout.kind === 'flat') {
    const half = Math.ceil(layout.players.length / 2);
    return (
      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Stack gap="xs">
            {layout.players.slice(0, half).map((p, i) => renderParticipantCard(p, i + 1, null))}
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Stack gap="xs">
            {layout.players.slice(half).map((p, i) => renderParticipantCard(p, half + i + 1, null))}
          </Stack>
        </Grid.Col>
      </Grid>
    );
  }

  const renderUnassigned = (unassigned: MatchParticipant[], offset: number) => (
    <div>
      <Text size="md" fw={600} c="gray" mb="sm">Unassigned Players</Text>
      <Grid gap="md">
        {unassigned.map((participant, index) => (
          <Grid.Col key={participant.id} span={{ base: 12, md: 6 }}>
            {renderParticipantCard(participant, offset + index + 1, 'reserve')}
          </Grid.Col>
        ))}
      </Grid>
    </div>
  );

  // Three or more teams: one section per team.
  if (layout.kind === 'teams') {
    return (
      <Stack gap="lg">
        <Grid gap="md">
          {layout.teams.map((team: TeamGroup<MatchParticipant>) => (
            <Grid.Col key={team.key} span={{ base: 12, md: 6 }}>
              {renderTeamSection(team.title, team.players, team.color)}
            </Grid.Col>
          ))}
        </Grid>
        {layout.unassigned.length > 0 &&
          renderUnassigned(layout.unassigned, layout.teams.reduce((n, t) => n + t.players.length, 0))}
      </Stack>
    );
  }

  const { blue, red, unassigned } = layout;
  const allUnassigned = blue.players.length === 0 && red.players.length === 0;

  return (
    <Stack gap="lg">
      {/* Team Columns - two teams side by side */}
      {!allUnassigned && (
        <Grid gap="md">
          <Grid.Col span={{ base: 12, md: 6 }}>
            {renderTeamSection(blue.title, blue.players, 'blue')}
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            {renderTeamSection(red.title, red.players, 'red')}
          </Grid.Col>
        </Grid>
      )}

      {/* Special Case: All Unassigned - Split into 2 columns on desktop */}
      {allUnassigned && unassigned.length > 0 && (
        <>
          <Text size="md" fw={600} c="gray" mb="sm">Unassigned Players</Text>
          <Grid gap="md">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack gap="xs">
                {unassigned.slice(0, Math.ceil(unassigned.length / 2)).map((p, i) =>
                  renderParticipantCard(p, i + 1, null)
                )}
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack gap="xs">
                {unassigned.slice(Math.ceil(unassigned.length / 2)).map((p, i) =>
                  renderParticipantCard(p, Math.ceil(unassigned.length / 2) + i + 1, null)
                )}
              </Stack>
            </Grid.Col>
          </Grid>
        </>
      )}

      {/* Unassigned Players Section - When teams exist */}
      {!allUnassigned && unassigned.length > 0 &&
        renderUnassigned(unassigned, blue.players.length + red.players.length)}
    </Stack>
  );
}
