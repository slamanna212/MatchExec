'use client'

import { Modal, Stack, Group, Avatar, Text, Divider } from '@mantine/core';
import type { Match } from '@/shared/types';
import { StageRing } from './StageRing';
import { useMatchGames } from './match-details/useMatchGames';
import { useMapCodes } from './match-details/useMapCodes';
import { MatchInfoSection } from './match-details/MatchInfoSection';
import { TabbedMatchDetails } from './match-details/TabbedMatchDetails';
import { NonTabbedMatchDetails } from './match-details/NonTabbedMatchDetails';
import { MatchActionsFooter } from './match-details/MatchActionsFooter';

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

interface MatchWithGame extends Omit<Match, 'created_at' | 'updated_at' | 'start_date' | 'end_date'> {
  game_name?: string;
  game_icon?: string;
  game_color?: string;
  map_codes_supported?: boolean;
  rules?: string;
  rounds?: number;
  maps?: string[];
  map_codes?: Record<string, string>;
  livestream_link?: string;
  created_at: string;
  updated_at: string;
  start_date?: string;
  end_date?: string;
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

interface MatchDetailsModalProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  selectedMatch: MatchWithGame | null;
  participants: MatchParticipant[];
  participantsLoading: boolean;
  signupConfig: SignupConfig | null;
  reminders: ReminderData[];
  remindersLoading: boolean;
  mapDetails: {[key: string]: {name: string, imageUrl?: string, modeName?: string, location?: string, note?: string}};
  mapNotes: {[key: string]: string};
  formatMapName: (mapId: string) => string;
  parseDbTimestamp: (timestamp: string | null | undefined) => Date | null;
  showTabs?: boolean;
  showDeleteButton?: boolean;
  onDelete?: (match: MatchWithGame) => void;
  onAssign?: (match: MatchWithGame) => void;
}

export function MatchDetailsModal({
  opened,
  onClose,
  title,
  selectedMatch,
  participants,
  participantsLoading,
  signupConfig,
  reminders,
  remindersLoading,
  mapDetails,
  mapNotes,
  formatMapName,
  parseDbTimestamp,
  showTabs = true,
  showDeleteButton = false,
  onDelete,
  onAssign
}: MatchDetailsModalProps) {
  const { matchGames, gamesLoading } = useMatchGames(selectedMatch, opened);
  const { mapCodes, mapCodesSaving, saveMapCodes, updateMapCode } = useMapCodes(selectedMatch, opened);

  if (!selectedMatch) return null;

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="lg">
      <Stack gap="md">
        <Group>
          <Avatar src={selectedMatch.game_icon} alt={selectedMatch.game_name} size="lg" />
          <Stack gap="xs" style={{ flex: 1 }}>
            <Text size="xl" fw={600}>{selectedMatch.name}</Text>
            <Text size="md" c="dimmed">{selectedMatch.game_name}</Text>
          </Stack>
          <StageRing status={selectedMatch.status} gameColor={selectedMatch.game_color} size={60} thickness={6} />
        </Group>

        <Divider />

        <MatchInfoSection
          selectedMatch={selectedMatch}
          mapDetails={mapDetails}
          mapNotes={mapNotes}
          formatMapName={formatMapName}
          matchGames={matchGames}
          gamesLoading={gamesLoading}
          parseDbTimestamp={parseDbTimestamp}
        />

        <Divider />

        {showTabs ? (
          <TabbedMatchDetails
            selectedMatch={selectedMatch}
            participants={participants}
            participantsLoading={participantsLoading}
            signupConfig={signupConfig}
            reminders={reminders}
            remindersLoading={remindersLoading}
            mapDetails={mapDetails}
            mapNotes={mapNotes}
            formatMapName={formatMapName}
            parseDbTimestamp={parseDbTimestamp}
            mapCodes={mapCodes}
            mapCodesSaving={mapCodesSaving}
            saveMapCodes={saveMapCodes}
            updateMapCode={updateMapCode}
          />
        ) : (
          <NonTabbedMatchDetails
            selectedMatch={selectedMatch}
            participants={participants}
            participantsLoading={participantsLoading}
            signupConfig={signupConfig}
            reminders={reminders}
            remindersLoading={remindersLoading}
            parseDbTimestamp={parseDbTimestamp}
          />
        )}

        <Divider />

        <MatchActionsFooter
          selectedMatch={selectedMatch}
          showDeleteButton={showDeleteButton}
          onDelete={onDelete}
          onClose={onClose}
          onAssign={onAssign}
        />
      </Stack>
    </Modal>
  );
}
