'use client'

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { 
  Card, 
  Text, 
  Button, 
  Badge,
  Avatar,
  Divider,
  Loader,
  Group,
  Stack,
  Grid,
  Modal,
  Image,
  RingProgress,
  useMantineColorScheme
} from '@mantine/core';
import { Match, MATCH_FLOW_STEPS } from '@/shared/types';
import Link from 'next/link';

interface GameWithIcon {
  id: string;
  name: string;
  genre: string;
  developer: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  iconUrl: string;
  coverUrl: string;
  mapCount: number;
  modeCount: number;
}

// Utility function to properly convert SQLite UTC timestamps to Date objects
const parseDbTimestamp = (timestamp: string | null | undefined): Date | null => {
  if (!timestamp) return null;
  
  // Check if timestamp already includes timezone info (Z, +offset, or -offset at the end)
  // Note: SQLite date format "2025-08-09 00:40:16" contains dashes but they're part of the date, not timezone
  if (timestamp.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(timestamp)) {
    return new Date(timestamp);
  }
  
  // SQLite CURRENT_TIMESTAMP returns format like "2025-08-08 22:52:51" (UTC)
  // We need to treat this as UTC, so append 'Z'
  return new Date(timestamp + 'Z');
};

interface MatchWithGame extends Omit<Match, 'created_at' | 'updated_at' | 'start_date' | 'end_date'> {
  game_name?: string;
  game_icon?: string;
  rules?: string;
  rounds?: number;
  maps?: string[];
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

interface HistoryMatchCardProps {
  match: MatchWithGame;
  mapNames: {[key: string]: string};
  onViewDetails: (match: MatchWithGame) => void;
  formatMapName: (mapId: string) => string;
}

const HistoryMatchCard = memo(({ 
  match, 
  mapNames, 
  onViewDetails, 
  formatMapName 
}: HistoryMatchCardProps) => {
  return (
    <Card 
      shadow="sm" 
      padding="lg" 
      radius="md" 
      withBorder
      style={{ cursor: 'pointer', opacity: 0.9 }}
      onClick={() => onViewDetails(match)}
    >
      <Group mb="md">
        <Avatar
          src={match.game_icon}
          alt={match.game_name}
          size="md"
        />
        <Stack gap="xs" style={{ flex: 1 }}>
          <Text fw={600}>{match.name}</Text>
          <Text size="sm" c="dimmed">{match.game_name}</Text>
        </Stack>
        <RingProgress
          size={50}
          thickness={4}
          sections={[
            { 
              value: MATCH_FLOW_STEPS[match.status]?.progress || 0, 
              color: 'green'
            }
          ]}
        />
      </Group>
      
      <Divider mb="md" />
      
      <Stack gap="xs" style={{ minHeight: '140px' }}>
        <div style={{ minHeight: '20px' }}>
          {match.description && (
            <Text size="sm" c="dimmed">{match.description}</Text>
          )}
        </div>
        
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Rules:</Text>
          <Text size="sm" tt="capitalize">{match.rules || 'Not specified'}</Text>
        </Group>
        
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Rounds:</Text>
          <Text size="sm">{match.rounds || 'Not specified'}</Text>
        </Group>
        
        <Group justify="space-between" align="center">
          <Text size="sm" c="dimmed">Maps:</Text>
          <Text size="sm" ta="right" style={{ maxWidth: '60%' }} truncate="end">
            {match.maps && match.maps.length > 0 ? (
              match.maps.length > 1
                ? `${mapNames[match.maps[0]] || formatMapName(match.maps[0])} +${match.maps.length - 1} more`
                : mapNames[match.maps[0]] || formatMapName(match.maps[0])
            ) : (
              'None selected'
            )}
          </Text>
        </Group>
        
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Max Participants:</Text>
          <Text size="sm">{match.max_participants}</Text>
        </Group>
        
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Completed:</Text>
          <Text size="sm">{parseDbTimestamp(match.updated_at)?.toLocaleDateString('en-US') || 'N/A'}</Text>
        </Group>
      </Stack>
    </Card>
  );
});

HistoryMatchCard.displayName = 'HistoryMatchCard';

export function MatchHistoryDashboard() {
  const [matches, setMatches] = useState<MatchWithGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchWithGame | null>(null);
  const [participants, setParticipants] = useState<MatchParticipant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [signupConfig, setSignupConfig] = useState<SignupConfig | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const { colorScheme } = useMantineColorScheme();

  // Fetch UI settings on component mount
  useEffect(() => {
    const fetchUISettings = async () => {
      try {
        const response = await fetch('/api/settings/ui');
        if (response.ok) {
          const uiSettings = await response.json();
          setRefreshInterval(uiSettings.auto_refresh_interval_seconds || 30);
        }
      } catch (error) {
        console.error('Error fetching UI settings:', error);
      }
    };

    fetchMatches();
    fetchUISettings();
  }, []);

  const fetchMatches = useCallback(async (silent = false) => {
    try {
      // Fetch only completed matches
      const response = await fetch('/api/matches?status=complete');
      if (response.ok) {
        const data = await response.json();
        // Only update if data actually changed to prevent unnecessary rerenders
        setMatches(prevMatches => {
          // More efficient comparison than JSON.stringify for arrays
          if (prevMatches.length !== data.length) {
            return data;
          }
          
          // Check if any match has changed by comparing key properties
          const hasChanges = data.some((match: MatchWithGame, index: number) => {
            const prevMatch = prevMatches[index];
            return !prevMatch || 
              match.id !== prevMatch.id ||
              match.status !== prevMatch.status ||
              match.name !== prevMatch.name ||
              match.created_at !== prevMatch.created_at ||
              match.updated_at !== prevMatch.updated_at;
          });
          
          return hasChanges ? data : prevMatches;
        });
      }
    } catch (error) {
      console.error('Error fetching matches:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  // Set up auto-refresh with configurable interval (less frequent for history)
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchMatches(true); // Silent refresh to prevent loading states
    }, refreshInterval * 1000);

    // Cleanup interval on unmount or when refreshInterval changes
    return () => clearInterval(intervalId);
  }, [refreshInterval, fetchMatches]);

  const formatMapName = (mapId: string) => {
    // Convert map ID to proper display name
    // Examples: "circuit-royal" -> "Circuit Royal", "kings-row" -> "Kings Row"
    return mapId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const [mapNames, setMapNames] = useState<{[key: string]: string}>({});
  const [mapDetails, setMapDetails] = useState<{[key: string]: {name: string, imageUrl?: string, modeName?: string, location?: string}}>({});

  const fetchMapNames = async (gameId: string) => {
    try {
      const response = await fetch(`/api/games/${gameId}/maps`);
      if (response.ok) {
        const maps = await response.json();
        const mapNamesObj: {[key: string]: string} = {};
        const mapDetailsObj: {[key: string]: {name: string, imageUrl?: string, modeName?: string, location?: string}} = {};
        
        maps.forEach((map: { id: string; name: string; imageUrl?: string; modeName?: string; location?: string }) => {
          mapNamesObj[map.id] = map.name;
          mapDetailsObj[map.id] = {
            name: map.name,
            imageUrl: map.imageUrl,
            modeName: map.modeName,
            location: map.location
          };
        });
        
        setMapNames(prev => ({ ...prev, ...mapNamesObj }));
        setMapDetails(prev => ({ ...prev, ...mapDetailsObj }));
      }
    } catch (error) {
      console.error('Error fetching map names:', error);
    }
  };

  useEffect(() => {
    // Fetch all map names for games that have matches
    const gameIds = new Set<string>();
    matches.forEach(match => {
      if (match.maps && match.maps.length > 0) {
        gameIds.add(match.game_id);
      }
    });

    gameIds.forEach(gameId => {
      fetchMapNames(gameId);
    });
  }, [matches]);

  const fetchParticipants = useCallback(async (matchId: string, silent = false) => {
    if (!silent) {
      setParticipantsLoading(true);
    }
    try {
      const response = await fetch(`/api/matches/${matchId}/participants`);
      if (response.ok) {
        const data = await response.json();
        setParticipants(data.participants || []);
        setSignupConfig(data.signupConfig || null);
      } else {
        console.error('Failed to fetch participants');
        if (!silent) {
          setParticipants([]);
          setSignupConfig(null);
        }
      }
    } catch (error) {
      console.error('Error fetching participants:', error);
      if (!silent) {
        setParticipants([]);
        setSignupConfig(null);
      }
    } finally {
      if (!silent) {
        setParticipantsLoading(false);
      }
    }
  }, []);

  const handleViewDetails = (match: MatchWithGame) => {
    setSelectedMatch(match);
    setDetailsModalOpen(true);
    fetchParticipants(match.id);
  };

  // Memoize expensive match card rendering
  const memoizedMatchCards = useMemo(() => {
    return matches.map((match) => (
      <Grid.Col key={match.id} span={{ base: 12, md: 6, lg: 4 }}>
        <HistoryMatchCard 
          match={match}
          mapNames={mapNames}
          onViewDetails={handleViewDetails}
          formatMapName={formatMapName}
        />
      </Grid.Col>
    ));
  }, [matches, mapNames]);

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
            <Text size="md" c="dimmed">No participants data</Text>
            <Text size="sm" c="dimmed">
              Participant information may not be available for this match
            </Text>
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
                <Avatar size="sm" color="green">
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
  }, [participants, participantsLoading, signupConfig]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <Group justify="space-between" mb="xl">
        <div>
          <Text size="xl" fw={700}>Match History</Text>
          <Text c="dimmed" mt="xs">View completed matches</Text>
        </div>
      </Group>

      <Divider mb="xl" />

      {matches.length === 0 ? (
        <Card p="xl">
          <Stack align="center">
            <Text size="xl" fw={600}>No completed matches yet</Text>
            <Text c="dimmed" mb="md">
              Completed matches will appear here
            </Text>
            <Button 
              component={Link}
              href="/matches"
            >
              View Active Matches
            </Button>
          </Stack>
        </Card>
      ) : (
        <Grid>
          {memoizedMatchCards}
        </Grid>
      )}

      <Modal
        opened={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        title="Match History Details"
        size="lg"
      >
        {selectedMatch && (
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
                    color: 'green'
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
                  <Text size="sm" fw={500} c="dimmed" mb="md">Maps:</Text>
                  <Grid>
                    {selectedMatch.maps.map(mapId => {
                      const mapDetail = mapDetails[mapId];
                      return (
                        <Grid.Col key={mapId} span={12}>
                          <Card shadow="sm" padding="sm" radius="md" withBorder>
                            <Group wrap="nowrap" align="center" gap="md">
                              <div style={{ width: '50%' }}>
                                <Image
                                  src={mapDetail?.imageUrl}
                                  alt={mapDetail?.name || formatMapName(mapId)}
                                  height={60}
                                  radius="sm"
                                  fallbackSrc="data:image/svg+xml,%3csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100' height='100' fill='%23f1f3f4'/%3e%3c/svg%3e"
                                />
                              </div>
                              <div style={{ width: '50%' }}>
                                <Text fw={500} size="sm" lineClamp={1}>
                                  {mapDetail?.name || formatMapName(mapId)}
                                </Text>
                                {mapDetail?.location && (
                                  <Text size="xs" c="dimmed" lineClamp={1}>
                                    {mapDetail.location}
                                  </Text>
                                )}
                                {mapDetail?.modeName && (
                                  <Badge size="xs" variant="light" mt={2}>
                                    {mapDetail.modeName}
                                  </Badge>
                                )}
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
                  <Text size="sm">{parseDbTimestamp(selectedMatch.start_date)?.toLocaleString('en-US') || 'N/A'}</Text>
                </Group>
              )}

              <Group justify="space-between">
                <Text size="sm" fw={500} c="dimmed">Created:</Text>
                <Text size="sm">{parseDbTimestamp(selectedMatch.created_at)?.toLocaleString('en-US') || 'N/A'}</Text>
              </Group>

              <Group justify="space-between">
                <Text size="sm" fw={500} c="dimmed">Completed:</Text>
                <Text size="sm">{parseDbTimestamp(selectedMatch.updated_at)?.toLocaleString('en-US') || 'N/A'}</Text>
              </Group>
            </Stack>

            <Divider />

            <div>
              <Group justify="space-between" mb="md">
                <Text size="lg" fw={600}>Participants</Text>
                <Badge size="lg" variant="light" color="green">
                  {participants.length}/{selectedMatch.max_participants}
                </Badge>
              </Group>
              
              {memoizedParticipantsList}
            </div>

            <Divider />
            
            <Group justify="flex-end" mt="md">
              <Button
                variant="outline"
                onClick={() => setDetailsModalOpen(false)}
              >
                Close
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </div>
  );
}