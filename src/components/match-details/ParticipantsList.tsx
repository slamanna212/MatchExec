'use client'

import { Stack, Card, Group, Avatar, Text, Badge, Loader, Grid } from '@mantine/core';

interface MatchParticipant {
  id: string;
  user_id: string;
  username: string;
  avatar_url?: string | null;
  joined_at: string;
  signup_data: Record<string, unknown>;
  team_assignment?: 'reserve' | 'blue' | 'red';
}

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
  signupConfig: SignupConfig | null;
  parseDbTimestamp: (timestamp: string | null | undefined) => Date | null;
}

export function ParticipantsList({
  participants,
  loading,
  matchStatus,
  signupConfig,
  parseDbTimestamp
}: ParticipantsListProps) {
  // Utility function for team card styling
  const getTeamCardStyles = (team: 'blue' | 'red' | 'reserve' | null) => {
    switch(team) {
      case 'blue':
        return {
          borderLeft: '4px solid var(--mantine-color-blue-6)'
        };
      case 'red':
        return {
          borderLeft: '4px solid var(--mantine-color-red-6)'
        };
      case 'reserve':
      case null:
        return {
          borderLeft: '4px solid var(--mantine-color-yellow-6)'
        };
      default:
        return {};
    }
  };

  // Utility function for badge colors
  const getBadgeColor = (team: 'blue' | 'red' | 'reserve' | null) => {
    switch(team) {
      case 'blue': return 'orange';
      case 'red': return 'cyan';
      default: return 'violet';
    }
  };

  // Utility function for avatar colors
  const getAvatarColor = (team: 'blue' | 'red' | 'reserve' | null) => {
    if (team === 'blue') return 'blue';
    if (team === 'red') return 'red';
    return matchStatus === 'complete' ? 'green' : 'teal';
  };

  // Render individual participant card
  const renderParticipantCard = (
    participant: MatchParticipant,
    index: number,
    teamColor: 'blue' | 'red' | 'reserve' | null
  ) => {
    return (
      <Card
        key={participant.id}
        shadow="sm"
        padding="md"
        radius="md"
        withBorder
        style={getTeamCardStyles(teamColor)}
      >
        <Group align="flex-start" gap="md" wrap="nowrap">
          <Avatar size="lg" color={getAvatarColor(teamColor)} src={participant.avatar_url || undefined}>
            {index}
          </Avatar>
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Text fw={500} size="sm">{participant.username}</Text>
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
        </Group>
      </Card>
    );
  };

  // Render team section with header
  const renderTeamSection = (
    title: string,
    teamPlayers: MatchParticipant[],
    teamColor: 'blue' | 'red'
  ) => {
    return (
      <div>
        <Group justify="space-between" mb="sm">
          <Text size="lg" fw={600} c={teamColor}>
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
      <div className="flex justify-center py-4">
        <Loader size="md" />
      </div>
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

  // Group participants by team
  const blueTeam = participants.filter(p => p.team_assignment === 'blue');
  const redTeam = participants.filter(p => p.team_assignment === 'red');
  const unassigned = participants.filter(
    p => !p.team_assignment || p.team_assignment === 'reserve'
  );

  const allUnassigned = blueTeam.length === 0 && redTeam.length === 0;

  return (
    <Stack gap="lg">
      {/* Team Columns - Blue vs Red */}
      {!allUnassigned && (
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, md: 6 }}>
            {renderTeamSection('Blue Team', blueTeam, 'blue')}
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            {renderTeamSection('Red Team', redTeam, 'red')}
          </Grid.Col>
        </Grid>
      )}

      {/* Special Case: All Unassigned - Split into 2 columns */}
      {allUnassigned && unassigned.length > 0 && (
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Text size="lg" fw={600} c="gray" mb="sm">Unassigned Players</Text>
            <Stack gap="xs">
              {unassigned.slice(0, Math.ceil(unassigned.length / 2)).map((p, i) =>
                renderParticipantCard(p, i + 1, null)
              )}
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Text size="lg" fw={600} c="gray" mb="sm" style={{ opacity: 0 }}>&nbsp;</Text>
            <Stack gap="xs">
              {unassigned.slice(Math.ceil(unassigned.length / 2)).map((p, i) =>
                renderParticipantCard(p, Math.ceil(unassigned.length / 2) + i + 1, null)
              )}
            </Stack>
          </Grid.Col>
        </Grid>
      )}

      {/* Unassigned Players Section - When teams exist */}
      {!allUnassigned && unassigned.length > 0 && (
        <div>
          <Text size="lg" fw={600} c="gray" mb="sm">Unassigned Players</Text>
          <Grid gutter="md">
            {unassigned.map((participant, index) => (
              <Grid.Col key={participant.id} span={{ base: 12, md: 6 }}>
                {renderParticipantCard(participant, blueTeam.length + redTeam.length + index + 1, 'reserve')}
              </Grid.Col>
            ))}
          </Grid>
        </div>
      )}
    </Stack>
  );
}
