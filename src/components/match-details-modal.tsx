'use client'

import { useState, useMemo, useEffect } from 'react';
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
  Card,
  Grid,
  Image,
  Loader,
  SegmentedControl,
  TextInput
} from '@mantine/core';
import { IconTrophy, IconDeviceFloppy } from '@tabler/icons-react';
import { Match, MATCH_FLOW_STEPS } from '@/shared/types';
import classes from './gradient-segmented-control.module.css';
import responsiveTextClasses from './responsive-text.module.css';

interface ReminderData {
  id: string;
  match_id: string;
  reminder_time: string;
  status: 'pending' | 'sent' | 'failed' | 'processed' | 'posted' | 'scheduled';
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

interface MatchGameResult {
  id: string;
  match_id: string;
  round: number;
  map_id: string;
  map_name: string;
  winner_id?: string;
  status: 'pending' | 'ongoing' | 'completed';
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
  mapDetails: {[key: string]: {name: string, imageUrl?: string, modeName?: string, location?: string}};
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
  formatMapName,
  parseDbTimestamp,
  showTabs = true,
  showDeleteButton = false,
  onDelete
}: MatchDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<'participants' | 'announcements' | 'mapcodes'>('participants');
  const [matchGames, setMatchGames] = useState<MatchGameResult[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [mapCodes, setMapCodes] = useState<Record<string, string>>({});
  const [mapCodesSaving, setMapCodesSaving] = useState(false);

  // Fetch match games for battle/complete status matches
  useEffect(() => {
    if (!selectedMatch || !opened) return;
    if (selectedMatch.status !== 'battle' && selectedMatch.status !== 'complete') return;

    const fetchMatchGames = async () => {
      try {
        setGamesLoading(true);
        const response = await fetch(`/api/matches/${selectedMatch.id}/games`);
        if (response.ok) {
          const data = await response.json();
          setMatchGames(data.games || []);
        }
      } catch (error) {
        console.error('Failed to fetch match games:', error);
      } finally {
        setGamesLoading(false);
      }
    };

    fetchMatchGames();
  }, [selectedMatch, opened]);

  // Load map codes when modal opens
  useEffect(() => {
    if (!selectedMatch || !opened) return;
    
    // Initialize map codes from selected match data
    if (selectedMatch.map_codes) {
      setMapCodes(selectedMatch.map_codes);
    } else {
      // Initialize empty map codes for all maps
      const initialMapCodes: Record<string, string> = {};
      selectedMatch.maps?.forEach(mapId => {
        initialMapCodes[mapId] = '';
      });
      setMapCodes(initialMapCodes);
    }
  }, [selectedMatch, opened]);

  // Function to save map codes
  const saveMapCodes = async () => {
    if (!selectedMatch) return;
    
    try {
      setMapCodesSaving(true);
      const response = await fetch(`/api/matches/${selectedMatch.id}/map-codes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mapCodes }),
      });

      if (!response.ok) {
        throw new Error('Failed to save map codes');
      }
      
      // Update the selected match with new map codes
      if (selectedMatch) {
        selectedMatch.map_codes = mapCodes;
      }
    } catch (error) {
      console.error('Failed to save map codes:', error);
    } finally {
      setMapCodesSaving(false);
    }
  };

  // Function to update a specific map code
  const updateMapCode = (mapId: string, code: string) => {
    // Limit to 24 characters
    const trimmedCode = code.slice(0, 24);
    setMapCodes(prev => ({
      ...prev,
      [mapId]: trimmedCode
    }));
  };

  // Helper function to get winner for a specific map
  const getMapWinner = (mapId: string) => {
    const game = matchGames.find(g => g.map_id === mapId);
    if (!game || !game.winner_id) return null;
    
    return {
      team: game.winner_id === 'team1' ? 'Blue Team' : 'Red Team',
      color: game.winner_id === 'team1' ? 'blue' : 'red'
    };
  };

  // Memoize participants list to prevent unnecessary rerenders
  const memoizedParticipantsList = useMemo(() => {
    if (participantsLoading) {
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
              {selectedMatch?.status === 'complete' ? 'No participants data' : 'No participants yet'}
            </Text>
            {selectedMatch?.status === 'complete' && (
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
                <Avatar size="sm" color={selectedMatch?.status === 'complete' ? 'green' : 'blue'}>
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
  }, [participants, participantsLoading, signupConfig, selectedMatch, parseDbTimestamp]);

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
              <Grid>
                {selectedMatch.maps.map(mapId => {
                  // Strip timestamp from map ID to look up details
                  const cleanMapId = mapId.replace(/-\d+$/, '');
                  const mapDetail = mapDetails[cleanMapId];
                  const winner = getMapWinner(mapId);
                  return (
                    <Grid.Col key={mapId} span={12}>
                      <Card shadow="sm" padding={0} radius="md" withBorder style={{ overflow: 'hidden' }}>
                        <Group wrap="nowrap" align="stretch" gap={0}>
                          <div style={{ width: '50%', position: 'relative' }}>
                            <Image
                              src={mapDetail?.imageUrl}
                              alt={mapDetail?.name || formatMapName(cleanMapId)}
                              height={80}
                              radius={0}
                              style={{
                                borderTopLeftRadius: 'var(--mantine-radius-md)',
                                borderBottomLeftRadius: 'var(--mantine-radius-md)',
                                objectFit: 'cover',
                                width: '100%',
                                height: '100%'
                              }}
                              fallbackSrc="data:image/svg+xml,%3csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100' height='100' fill='%23f1f3f4'/%3e%3c/svg%3e"
                            />
                          </div>
                          <div style={{ width: '50%', padding: 'var(--mantine-spacing-sm)' }}>
                            <Stack gap="xs" justify="center" style={{ height: '100%' }}>
                              <div>
                                <Text fw={500} lineClamp={1} className={responsiveTextClasses.mapNameResponsive}>
                                  {mapDetail?.name || formatMapName(cleanMapId)}
                                </Text>
                                {mapDetail?.location && (
                                  <Text c="dimmed" lineClamp={1} className={responsiveTextClasses.locationResponsive}>
                                    {mapDetail.location}
                                  </Text>
                                )}
                                {(mapDetail?.modeName || cleanMapId.includes('-')) && (
                                  <Badge size="xs" variant="light" mt={2}>
                                    {mapDetail?.modeName || (() => {
                                      // Fallback: extract mode from map ID
                                      const parts = cleanMapId.split('-');
                                      const lastPart = parts[parts.length - 1];
                                      return lastPart === 'bomb' ? 'Bomb' :
                                             lastPart === 'hostage' ? 'Hostage' :
                                             lastPart === 'secure-area' ? 'Secure Area' :
                                             lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
                                    })()}
                                  </Badge>
                                )}
                              </div>
                              {winner && (
                                <Group gap={4} justify="flex-start">
                                  <IconTrophy size={14} color="gold" />
                                  <Badge size="xs" color={winner.color} variant="filled">
                                    {winner.team}
                                  </Badge>
                                </Group>
                              )}
                            </Stack>
                          </div>
                        </Group>
                      </Card>
                    </Grid.Col>
                  );
                })}
              </Grid>
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
              <div>
                {memoizedParticipantsList}
              </div>
            )}

            {activeTab === 'announcements' && (
              <div>
                {remindersLoading ? (
                  <Group justify="center" py="md">
                    <Loader size="sm" />
                  </Group>
                ) : reminders.length === 0 ? (
                  <Text size="sm" c="dimmed" ta="center" py="md">
                    {selectedMatch.status === 'complete' 
                      ? 'No reminders were sent for this match'
                      : 'No scheduled announcements for this match'}
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {reminders.map((reminder) => (
                      <Card key={reminder.id} shadow="sm" padding="sm" radius="md" withBorder>
                        <Group justify="space-between" align="flex-start">
                          <Stack gap="xs" style={{ flex: 1 }}>
                            <Group gap="xs">
                              <Badge 
                                size="xs" 
                                variant="light"
                                color={
                                  reminder.status === 'sent' || reminder.status === 'processed' || reminder.status === 'posted' ? 'green' :
                                  reminder.status === 'failed' ? 'red' :
                                  reminder.status === 'scheduled' ? 'blue' :
                                  'yellow'
                                }
                                style={{ textTransform: 'none' }}
                              >
                                {reminder.status === 'processed' || reminder.status === 'posted' ? 'Sent' : 
                                 reminder.status === 'scheduled' ? 'Scheduled' :
                                 reminder.status === 'pending' ? 'Pending' :
                                 reminder.status === 'failed' ? 'Failed' :
                                 reminder.status.charAt(0).toUpperCase() + reminder.status.slice(1).toLowerCase()}
                              </Badge>
                            </Group>
                            
                            {reminder.type === 'timed_announcement' && reminder.description && (
                              <Text size="sm" fw={500}>
                                {reminder.description}
                              </Text>
                            )}
                            
                            {reminder.reminder_time && reminder.reminder_time !== 'N/A' && (
                              <Text size="xs" c="dimmed">
                                {reminder.type === 'timed_announcement' ? 'Announcement Time' : 'Reminder Time'}: {parseDbTimestamp(reminder.reminder_time)?.toLocaleString('en-US', { 
                                  year: 'numeric', 
                                  month: 'numeric', 
                                  day: 'numeric', 
                                  hour: 'numeric', 
                                  minute: '2-digit',
                                  hour12: true 
                                }) || 'N/A'}
                              </Text>
                            )}
                            
                            
                            {(reminder.sent_at || reminder.processed_at) && (
                              <Text size="xs" c="dimmed">
                                Sent: {parseDbTimestamp(reminder.sent_at || reminder.processed_at || '')?.toLocaleString('en-US', { 
                                  year: 'numeric', 
                                  month: 'numeric', 
                                  day: 'numeric', 
                                  hour: 'numeric', 
                                  minute: '2-digit',
                                  hour12: true 
                                }) || 'N/A'}
                              </Text>
                            )}
                            
                            {reminder.error_message && (
                              <Text size="xs" c="red">
                                Error: {reminder.error_message}
                              </Text>
                            )}
                          </Stack>
                        </Group>
                      </Card>
                    ))}
                  </Stack>
                )}
              </div>
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
                    <Stack gap="sm">
                      {selectedMatch.maps.map(mapId => {
                        // Strip timestamp from map ID to look up details
                        const cleanMapId = mapId.replace(/-\d+$/, '');
                        const mapDetail = mapDetails[cleanMapId];
                        return (
                          <Card key={mapId} shadow="sm" padding={0} radius="md" withBorder style={{ overflow: 'hidden' }}>
                            <Group wrap="nowrap" align="stretch" gap={0}>
                              <div style={{ width: '40%', position: 'relative' }}>
                                <Image
                                  src={mapDetail?.imageUrl}
                                  alt={mapDetail?.name || formatMapName(cleanMapId)}
                                  height={80}
                                  radius={0}
                                  style={{
                                    borderTopLeftRadius: 'var(--mantine-radius-md)',
                                    borderBottomLeftRadius: 'var(--mantine-radius-md)',
                                    objectFit: 'cover',
                                    width: '100%',
                                    height: '100%'
                                  }}
                                  fallbackSrc="data:image/svg+xml,%3csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100' height='100' fill='%23f1f3f4'/%3e%3c/svg%3e"
                                />
                              </div>
                              <div style={{ width: '60%', padding: 'var(--mantine-spacing-md)' }}>
                                <Stack gap="xs" justify="center" style={{ height: '100%' }}>
                                  <div>
                                    <Text fw={500} lineClamp={1} className={responsiveTextClasses.mapNameResponsive}>
                                      {mapDetail?.name || formatMapName(cleanMapId)}
                                    </Text>
                                    {mapDetail?.location && (
                                      <Text c="dimmed" lineClamp={1} className={responsiveTextClasses.locationResponsive}>
                                        {mapDetail.location}
                                      </Text>
                                    )}
                                    {(mapDetail?.modeName || cleanMapId.includes('-')) && (
                                      <Badge size="xs" variant="light" mt={2}>
                                        {mapDetail?.modeName || (() => {
                                          // Fallback: extract mode from map ID
                                          const parts = cleanMapId.split('-');
                                          const lastPart = parts[parts.length - 1];
                                          return lastPart === 'bomb' ? 'Bomb' :
                                                 lastPart === 'hostage' ? 'Hostage' :
                                                 lastPart === 'secure-area' ? 'Secure Area' :
                                                 lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
                                        })()}
                                      </Badge>
                                    )}
                                  </div>
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
                                </Stack>
                              </div>
                            </Group>
                          </Card>
                        );
                      })}
                    </Stack>
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
            
            {memoizedParticipantsList}

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
                  
                  {remindersLoading ? (
                    <Group justify="center" py="md">
                      <Loader size="sm" />
                    </Group>
                  ) : (
                    <Stack gap="xs">
                      {reminders.map((reminder) => (
                        <Card key={reminder.id} shadow="sm" padding="sm" radius="md" withBorder>
                          <Group justify="space-between" align="flex-start">
                            <Stack gap="xs" style={{ flex: 1 }}>
                              <Group gap="xs">
                                <Badge 
                                  size="xs" 
                                  variant="light"
                                  color={
                                    reminder.status === 'sent' || reminder.status === 'processed' ? 'green' :
                                    reminder.status === 'failed' ? 'red' :
                                    'yellow'
                                  }
                                >
                                  {reminder.status === 'processed' ? 'Sent' : reminder.status}
                                </Badge>
                              </Group>
                              
                              {reminder.reminder_time && reminder.reminder_time !== 'N/A' && (
                                <Text size="xs" c="dimmed">
                                  Reminder Time: {parseDbTimestamp(reminder.reminder_time)?.toLocaleString('en-US', { 
                                    year: 'numeric', 
                                    month: 'numeric', 
                                    day: 'numeric', 
                                    hour: 'numeric', 
                                    minute: '2-digit',
                                    hour12: true 
                                  }) || 'N/A'}
                                </Text>
                              )}
                              
                              
                              {(reminder.sent_at || reminder.processed_at) && (
                                <Text size="xs" c="dimmed">
                                  Sent: {parseDbTimestamp(reminder.sent_at || reminder.processed_at || '')?.toLocaleString('en-US', { 
                                    year: 'numeric', 
                                    month: 'numeric', 
                                    day: 'numeric', 
                                    hour: 'numeric', 
                                    minute: '2-digit',
                                    hour12: true 
                                  }) || 'N/A'}
                                </Text>
                              )}
                              
                              {reminder.error_message && (
                                <Text size="xs" c="red">
                                  Error: {reminder.error_message}
                                </Text>
                              )}
                            </Stack>
                          </Group>
                        </Card>
                      ))}
                    </Stack>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <Divider />
        
        <Group justify="space-between" mt="md">
          {showDeleteButton && (
            <Button
              color="red"
              variant="light"
              onClick={() => onDelete?.(selectedMatch)}
            >
              Delete Match
            </Button>
          )}
          {!showDeleteButton && <div />}
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