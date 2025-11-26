'use client'

import { useState } from 'react';
import {
  Stack,
  Group,
  Text,
  Button,
  TextInput,
  SegmentedControl
} from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import type { Match } from '@/shared/types';
import { ParticipantsList } from './ParticipantsList';
import { RemindersList } from './RemindersList';
import { MapResultsSection } from './MapResultsSection';
import classes from '../gradient-segmented-control.module.css';

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
  event_image_url?: string;
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

interface MatchGameResult {
  id: string;
  match_id: string;
  round: number;
  map_id: string;
  map_name: string;
  winner_id?: string;
  status: 'pending' | 'ongoing' | 'completed';
}

interface MatchContentPanelProps {
  match: MatchWithGame;
  participants: MatchParticipant[];
  reminders: ReminderData[];
  mapDetails: {[key: string]: {name: string, imageUrl?: string, modeName?: string, location?: string, note?: string}};
  mapNotes: {[key: string]: string};
  signupConfig: SignupConfig | null;
  parseDbTimestamp: (timestamp: string | null | undefined) => Date | null;
  formatMapName: (mapId: string) => string;

  // Match games
  matchGames?: MatchGameResult[];
  gamesLoading?: boolean;

  // Map codes
  mapCodes?: Record<string, string>;
  onMapCodeChange?: (mapId: string, code: string) => void;
  onMapCodesSave?: () => void;
  mapCodesSaving?: boolean;

  // Loading states
  participantsLoading?: boolean;
  remindersLoading?: boolean;
}

export function MatchContentPanel({
  match,
  participants,
  reminders,
  mapDetails,
  mapNotes,
  signupConfig,
  parseDbTimestamp,
  formatMapName,
  matchGames,
  gamesLoading: _gamesLoading = false,
  mapCodes = {},
  onMapCodeChange,
  onMapCodesSave,
  mapCodesSaving = false,
  participantsLoading = false,
  remindersLoading = false
}: MatchContentPanelProps) {
  const [activeTab, setActiveTab] = useState<'participants' | 'announcements' | 'maps' | 'matchcodes'>('participants');

  return (
    <Stack gap="md">
        {/* Tab Navigation */}
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <Group justify="center" mb="sm">
            <SegmentedControl
              radius="xl"
              size="sm"
              data={[
                {
                  label: `Players (${participants.length}/${match.max_participants})`,
                  value: 'participants'
                },
                {
                  label: `Maps (${match.maps?.length || 0})`,
                  value: 'maps'
                },
                {
                  label: `Alerts (${reminders.length})`,
                  value: 'announcements'
                },
                ...(match.map_codes_supported ? [{
                  label: 'Match Codes',
                  value: 'matchcodes'
                }] : [])
              ]}
              value={activeTab}
              onChange={(value) => setActiveTab(value as 'participants' | 'announcements' | 'maps' | 'matchcodes')}
              classNames={classes}
              style={{ minWidth: 'fit-content' }}
            />
          </Group>
        </div>

        {/* Tab Content */}
        {activeTab === 'participants' && (
          <ParticipantsList
            participants={participants}
            loading={participantsLoading}
            matchStatus={match.status}
            signupConfig={signupConfig}
            parseDbTimestamp={parseDbTimestamp}
          />
        )}

        {activeTab === 'maps' && (
          <div>
            {match.maps && match.maps.length > 0 ? (
              <MapResultsSection
                maps={match.maps}
                mapDetails={mapDetails}
                mapNotes={mapNotes}
                formatMapName={formatMapName}
                matchGames={matchGames}
                showWinner={match.status === 'battle' || match.status === 'complete'}
              />
            ) : (
              <Text size="sm" c="dimmed" ta="center" py="md">
                No maps configured for this match
              </Text>
            )}
          </div>
        )}

        {activeTab === 'announcements' && (
          <RemindersList
            reminders={reminders}
            loading={remindersLoading}
            matchStatus={match.status}
            parseDbTimestamp={parseDbTimestamp}
            showDescription={true}
          />
        )}

        {activeTab === 'matchcodes' && match.map_codes_supported && (
          <div>
            <Stack gap="md">
              {match.maps && match.maps.length > 0 ? (
                <>
                  <MapResultsSection
                    maps={match.maps}
                    mapDetails={mapDetails}
                    mapNotes={mapNotes}
                    formatMapName={formatMapName}
                  >
                    {(mapId) => (
                      onMapCodeChange && (
                        <TextInput
                          placeholder="Enter map code"
                          value={mapCodes[mapId] || ''}
                          onChange={(event) => onMapCodeChange(mapId, event.currentTarget.value)}
                          maxLength={24}
                          size="sm"
                          styles={{
                            input: {
                              fontFamily: 'monospace',
                              fontSize: '0.9em'
                            }
                          }}
                        />
                      )
                    )}
                  </MapResultsSection>
                  {onMapCodesSave && (
                    <Group justify="center">
                      <Button
                        size="sm"
                        loading={mapCodesSaving}
                        onClick={onMapCodesSave}
                        leftSection={<IconDeviceFloppy size={16} />}
                      >
                        Save Codes
                      </Button>
                    </Group>
                  )}
                </>
              ) : (
                <Text size="sm" c="dimmed" ta="center" py="md">
                  No maps configured for this match
                </Text>
              )}
            </Stack>
          </div>
        )}
    </Stack>
  );
}
