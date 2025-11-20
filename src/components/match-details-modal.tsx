'use client'

import { useState } from 'react';
import {
  Modal,
  Stack,
  Group,
  Avatar,
  Text,
  RingProgress,
  Divider,
  Button,
  Badge,
  Loader,
  SegmentedControl,
  TextInput
} from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import type { Match} from '@/shared/types';
import { MATCH_FLOW_STEPS } from '@/shared/types';
import classes from './gradient-segmented-control.module.css';
import { ParticipantsList } from './match-details/ParticipantsList';
import { RemindersList } from './match-details/RemindersList';
import { MapResultsSection } from './match-details/MapResultsSection';
import { useMatchGames } from './match-details/useMatchGames';
import { useMapCodes } from './match-details/useMapCodes';

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
  showAssignButton?: boolean;
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
  const [activeTab, setActiveTab] = useState<'participants' | 'announcements' | 'mapcodes'>('participants');

  // Use custom hooks to manage match games and map codes
  const { matchGames, gamesLoading } = useMatchGames(selectedMatch, opened);
  const { mapCodes, mapCodesSaving, saveMapCodes, updateMapCode } = useMapCodes(selectedMatch, opened);


  if (!selectedMatch) return null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      size="lg"
    >
      <Stack gap="md">
        <Group>
          <Avatar
            src={selectedMatch.game_icon}
            alt={selectedMatch.game_name}
            size="lg"
          />
          <Stack gap="xs" style={{ flex: 1 }}>
            <Text size="xl" fw={600}>{selectedMatch.name}</Text>
            <Text size="md" c="dimmed">{selectedMatch.game_name}</Text>
          </Stack>
          <RingProgress
            size={60}
            thickness={6}
            sections={[
              { 
                value: MATCH_FLOW_STEPS[selectedMatch.status]?.progress || 0, 
                color: selectedMatch.game_color || '#95a5a6'
              }
            ]}
          />
        </Group>

        <Divider />

        <Stack gap="sm">
          {selectedMatch.description && (
            <div>
              <Text size="sm" fw={500} c="dimmed">Description:</Text>
              <Text size="sm">{selectedMatch.description}</Text>
            </div>
          )}

          {selectedMatch.rules && (
            <Group justify="space-between">
              <Text size="sm" fw={500} c="dimmed">Rules:</Text>
              <Text size="sm" tt="capitalize">{selectedMatch.rules}</Text>
            </Group>
          )}

          {selectedMatch.rounds && (
            <Group justify="space-between">
              <Text size="sm" fw={500} c="dimmed">Rounds:</Text>
              <Text size="sm">{selectedMatch.rounds}</Text>
            </Group>
          )}

          {selectedMatch.maps && selectedMatch.maps.length > 0 && (
            <div>
              <Group justify="space-between" mb="md">
                <Text size="sm" fw={500} c="dimmed">Maps:</Text>
                {gamesLoading && (selectedMatch.status === 'battle' || selectedMatch.status === 'complete') && (
                  <Loader size="xs" />
                )}
              </Group>
              <MapResultsSection
                maps={selectedMatch.maps}
                mapDetails={mapDetails}
                mapNotes={mapNotes}
                formatMapName={formatMapName}
                matchGames={matchGames}
                showWinner={selectedMatch.status === 'battle' || selectedMatch.status === 'complete'}
              />
            </div>
          )}

          {selectedMatch.livestream_link && (
            <Group justify="space-between">
              <Text size="sm" fw={500} c="dimmed">Livestream:</Text>
              <Text size="sm" component="a" href={selectedMatch.livestream_link} target="_blank">
                View Stream
              </Text>
            </Group>
          )}

          <Group justify="space-between">
            <Text size="sm" fw={500} c="dimmed">Max Participants:</Text>
            <Text size="sm">{selectedMatch.max_participants}</Text>
          </Group>

          {selectedMatch.start_date && (
            <Group justify="space-between">
              <Text size="sm" fw={500} c="dimmed">Start Date:</Text>
              <Text size="sm">{parseDbTimestamp(selectedMatch.start_date)?.toLocaleString('en-US', { 
                year: 'numeric', 
                month: 'numeric', 
                day: 'numeric', 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
              }) || 'N/A'}</Text>
            </Group>
          )}

          <Group justify="space-between">
            <Text size="sm" fw={500} c="dimmed">Created:</Text>
            <Text size="sm">{parseDbTimestamp(selectedMatch.created_at)?.toLocaleString('en-US', { 
              year: 'numeric', 
              month: 'numeric', 
              day: 'numeric', 
              hour: 'numeric', 
              minute: '2-digit',
              hour12: true 
            }) || 'N/A'}</Text>
          </Group>

          {selectedMatch.status === 'complete' && (
            <Group justify="space-between">
              <Text size="sm" fw={500} c="dimmed">Completed:</Text>
              <Text size="sm">{parseDbTimestamp(selectedMatch.updated_at)?.toLocaleString('en-US', { 
                year: 'numeric', 
                month: 'numeric', 
                day: 'numeric', 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
              }) || 'N/A'}</Text>
            </Group>
          )}
        </Stack>

        <Divider />

        {showTabs ? (
          <>
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <Group justify="center" mb="sm">
                <SegmentedControl
                  radius="xl"
                  size="sm"
                  data={[
                    { 
                      label: `Players (${participants.length}/${selectedMatch.max_participants})`, 
                      value: 'participants' 
                    },
                    { 
                      label: `Alerts (${reminders.length})`, 
                      value: 'announcements' 
                    },
                    ...(selectedMatch.map_codes_supported ? [{ 
                      label: 'Map Codes', 
                      value: 'mapcodes' 
                    }] : [])
                  ]}
                  value={activeTab}
                  onChange={(value) => setActiveTab(value as 'participants' | 'announcements' | 'mapcodes')}
                  classNames={classes}
                  style={{ minWidth: 'fit-content' }}
                />
              </Group>
            </div>

            {activeTab === 'participants' && (
              <ParticipantsList
                participants={participants}
                loading={participantsLoading}
                matchStatus={selectedMatch.status}
                signupConfig={signupConfig}
                parseDbTimestamp={parseDbTimestamp}
              />
            )}

            {activeTab === 'announcements' && (
              <RemindersList
                reminders={reminders}
                loading={remindersLoading}
                matchStatus={selectedMatch.status}
                parseDbTimestamp={parseDbTimestamp}
                showDescription={true}
              />
            )}

            {activeTab === 'mapcodes' && selectedMatch.map_codes_supported && (
              <div>
                <Stack gap="md">
                  <Group justify="space-between" align="center">
                    <Text size="lg" fw={600}>Map Codes</Text>
                    <Button
                      size="sm"
                      loading={mapCodesSaving}
                      onClick={saveMapCodes}
                      leftSection={<IconDeviceFloppy size={16} />}
                    >
                      Save Codes
                    </Button>
                  </Group>

                  {selectedMatch.maps && selectedMatch.maps.length > 0 ? (
                    <MapResultsSection
                      maps={selectedMatch.maps}
                      mapDetails={mapDetails}
                      mapNotes={mapNotes}
                      formatMapName={formatMapName}
                    >
                      {(mapId) => (
                        <TextInput
                          placeholder="Enter map code"
                          value={mapCodes[mapId] || ''}
                          onChange={(event) => updateMapCode(mapId, event.currentTarget.value)}
                          maxLength={24}
                          size="sm"
                          styles={{
                            input: {
                              fontFamily: 'monospace',
                              fontSize: '0.9em'
                            }
                          }}
                        />
                      )}
                    </MapResultsSection>
                  ) : (
                    <Text size="sm" c="dimmed" ta="center" py="md">
                      No maps configured for this match
                    </Text>
                  )}
                </Stack>
              </div>
            )}

          </>
        ) : (
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
        )}

        <Divider />
        
        <Group justify="space-between" mt="md">
          <Group gap="sm">
            {showDeleteButton && (
              <Button
                color="red"
                variant="light"
                onClick={() => onDelete?.(selectedMatch)}
              >
                Delete Match
              </Button>
            )}
            {(selectedMatch.status === 'gather' || selectedMatch.status === 'assign' || selectedMatch.status === 'battle') && (
              <Button
                variant="light"
                onClick={() => {
                  onClose();
                  onAssign?.(selectedMatch);
                }}
              >
                Assign Players
              </Button>
            )}
          </Group>
          <Button
            variant="outline"
            onClick={onClose}
          >
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}