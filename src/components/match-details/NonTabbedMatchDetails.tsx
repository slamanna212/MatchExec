'use client'

import { Group, Text, Badge, Divider } from '@mantine/core';
import { ParticipantsList } from './ParticipantsList';
import { RemindersList } from './RemindersList';

interface ReminderData {
  id: string;
  match_id: string;
  reminder_time: string;
  status: 'pending' | 'sent' | 'failed' | 'processed' | 'completed' | 'scheduled';
  error_message?: string;
  created_at: string;
  sent_at?: string;
  processed_at?: string;
  type: 'discord_general' | 'discord_match' | 'discord_player' | 'timed_announcement';
  description?: string;
}

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

interface NonTabbedMatchDetailsProps {
  selectedMatch: {
    status: string;
    max_participants: number;
  };
  participants: MatchParticipant[];
  participantsLoading: boolean;
  signupConfig: SignupConfig | null;
  reminders: ReminderData[];
  remindersLoading: boolean;
  parseDbTimestamp: (timestamp: string | null | undefined) => Date | null;
}

export function NonTabbedMatchDetails({
  selectedMatch,
  participants,
  participantsLoading,
  signupConfig,
  reminders,
  remindersLoading,
  parseDbTimestamp
}: NonTabbedMatchDetailsProps) {
  return (
    <div>
      <Group justify="space-between" mb="md">
        <Text size="lg" fw={600}>Participants</Text>
        <Badge size="lg" variant="light" color={selectedMatch.status === 'complete' ? 'green' : 'blue'}>
          {participants.length}/{selectedMatch.max_participants}
        </Badge>
      </Group>

      <ParticipantsList
        participants={participants}
        loading={participantsLoading}
        matchStatus={selectedMatch.status}
        signupConfig={signupConfig}
        parseDbTimestamp={parseDbTimestamp}
      />

      {reminders.length > 0 && (
        <>
          <Divider mt="md" />
          <div>
            <Group justify="space-between" mb="md">
              <Text size="lg" fw={600}>Reminders</Text>
              <Badge size="lg" variant="light">
                {reminders.length}
              </Badge>
            </Group>

            <RemindersList
              reminders={reminders}
              loading={remindersLoading}
              matchStatus={selectedMatch.status}
              parseDbTimestamp={parseDbTimestamp}
              showDescription={false}
            />
          </div>
        </>
      )}
    </div>
  );
}
