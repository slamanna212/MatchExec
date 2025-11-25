'use client'

import { Stack, Card, Group, Avatar, Text, Badge, Loader } from '@mantine/core';

interface MatchParticipant {
  id: string;
  user_id: string;
  username: string;
  joined_at: string;
  signup_data: Record<string, unknown>;
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

  return (
    <Stack gap="xs">
      {participants.map((participant, index) => (
        <Card key={participant.id} shadow="sm" padding="md" radius="md" withBorder>
          <Group justify="space-between" align="center">
            <Group align="center">
              <Avatar size="sm" color={matchStatus === 'complete' ? 'green' : 'teal'}>
                {index + 1}
              </Avatar>
              <div>
                <Text fw={500} size="sm">{participant.username}</Text>
                <Text size="xs" c="dimmed">
                  Joined: {parseDbTimestamp(participant.joined_at)?.toLocaleDateString('en-US') || 'N/A'}
                </Text>
              </div>
            </Group>

            {participant.signup_data && (
              <Stack gap="xs" align="flex-end">
                {Object.entries(participant.signup_data).map(([key, value]) => {
                  const field = signupConfig?.fields.find(f => f.id === key);
                  const displayLabel = field?.label || key.replace(/([A-Z])/g, ' $1').trim();

                  return (
                    <Group key={key} gap="xs">
                      <Text size="xs" c="dimmed">
                        {displayLabel}:
                      </Text>
                      <Badge size="xs" variant="light">
                        {String(value)}
                      </Badge>
                    </Group>
                  );
                })}
              </Stack>
            )}
          </Group>
        </Card>
      ))}
    </Stack>
  );
}
