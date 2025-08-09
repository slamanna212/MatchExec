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
import { modals } from '@mantine/modals';
import { Match, MATCH_FLOW_STEPS } from '@/shared/types';

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
import { CreateMatchModal } from './create-match-modal';
import { AssignPlayersModal } from './assign-players-modal';

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

interface MatchWithGame extends Match {
  game_name?: string;
  game_icon?: string;
  rules?: string;
  rounds?: number;
  maps?: string[];
  livestream_link?: string;
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

interface MatchCardProps {
  match: MatchWithGame;
  mapNames: {[key: string]: string};
  colorScheme: string;
  onViewDetails: (match: MatchWithGame) => void;
  onAssignPlayers: (match: MatchWithGame) => void;
  onStatusTransition: (matchId: string, newStatus: string) => void;
  formatMapName: (mapId: string) => string;
  getStatusColor: (status: string) => string;
  getStatusColorForProgress: (status: string, isDark: boolean) => string;
  getNextStatusButton: (match: MatchWithGame) => JSX.Element | null;
}

const MatchCard = memo(({ 
  match, 
  mapNames, 
  colorScheme, 
  onViewDetails, 
  onAssignPlayers, 
  onStatusTransition, 
  formatMapName, 
  getStatusColor, 
  getStatusColorForProgress, 
  getNextStatusButton 
}: MatchCardProps) => {
  return (
    <Card 
      shadow="sm" 
      padding="lg" 
      radius="md" 
      withBorder
      style={{ cursor: 'pointer' }}
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
              color: getStatusColorForProgress(match.status, colorScheme === 'dark')
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
          <Text size="sm" c="dimmed">Created:</Text>
          <Text size="sm">{parseDbTimestamp(match.created_at)?.toLocaleDateString('en-US') || 'N/A'}</Text>
        </Group>
      </Stack>
      
      <Group mt="md" gap="xs">
        {(match.status === 'gather' || match.status === 'assign') && (
          <Button 
            size="sm" 
            onClick={(e) => {
              e.stopPropagation();
              onAssignPlayers(match);
            }}
            style={{ flex: 1 }}
          >
            Assign Players
          </Button>
        )}
        {getNextStatusButton(match)}
      </Group>
    </Card>
  );
});

MatchCard.displayName = 'MatchCard';

export function MatchDashboard() {
  const [matches, setMatches] = useState<MatchWithGame[]>([]);
  const [games, setGames] = useState<GameWithIcon[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchWithGame | null>(null);
  const [participants, setParticipants] = useState<MatchParticipant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [signupConfig, setSignupConfig] = useState<SignupConfig | null>(null);
  const [assignPlayersModalOpen, setAssignPlayersModalOpen] = useState(false);
  const [selectedMatchForAssignment, setSelectedMatchForAssignment] = useState<MatchWithGame | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(30); // default 30 seconds
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
    fetchGames();
    fetchUISettings();
  }, []);

  const fetchMatches = useCallback(async (silent = false) => {
    try {
      const response = await fetch('/api/matches');
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

  // Set up auto-refresh with configurable interval
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchMatches(true); // Silent refresh to prevent loading states
    }, refreshInterval * 1000);

    // Cleanup interval on unmount or when refreshInterval changes
    return () => clearInterval(intervalId);
  }, [refreshInterval, fetchMatches]);

  const fetchGames = async () => {
    try {
      const response = await fetch('/api/games');
      if (response.ok) {
        const data = await response.json();
        setGames(data);
      }
    } catch (error) {
      console.error('Error fetching games:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'created': return 'gray';
      case 'gather': return 'blue';
      case 'assign': return 'orange';
      case 'battle': return 'yellow';
      case 'complete': return 'green';
      case 'cancelled': return 'red';
      default: return 'gray';
    }
  };

  const getStatusColorForProgress = (status: string, isDark: boolean) => {
    if (status === 'created' && isDark) {
      return 'white';
    }
    return getStatusColor(status) + '.8';
  };

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

  const handleMatchCreated = (match: Match) => {
    // Add the new match to the top of the list
    setMatches(prev => [match, ...prev]);
  };

  const fetchParticipants = useCallback(async (matchId: string, silent = false) => {
    if (!silent) {
      setParticipantsLoading(true);
    }
    try {
      const response = await fetch(`/api/matches/${matchId}/participants`);
      if (response.ok) {
        const data = await response.json();
        // Only update if data actually changed
        setParticipants(prevParticipants => {
          // More efficient comparison for participants array
          if (prevParticipants.length !== data.participants.length) {
            return data.participants;
          }
          
          const hasChanges = data.participants.some((participant: MatchParticipant, index: number) => {
            const prevParticipant = prevParticipants[index];
            return !prevParticipant ||
              participant.id !== prevParticipant.id ||
              participant.username !== prevParticipant.username ||
              participant.joined_at !== prevParticipant.joined_at;
          });
          
          return hasChanges ? data.participants : prevParticipants;
        });
        setSignupConfig(prevConfig => {
          // Simple reference check for signup config since it rarely changes
          if (!prevConfig && !data.signupConfig) return prevConfig;
          if (!prevConfig || !data.signupConfig) return data.signupConfig;
          
          // Compare field count as a quick check
          if (prevConfig.fields.length !== data.signupConfig.fields.length) {
            return data.signupConfig;
          }
          
          return prevConfig;
        });
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

  // Auto-refresh participants when details modal is open
  useEffect(() => {
    if (detailsModalOpen && selectedMatch) {
      // Use the same refresh interval for participants
      const participantsInterval = setInterval(() => {
        fetchParticipants(selectedMatch.id, true); // Silent refresh
      }, refreshInterval * 1000);

      return () => clearInterval(participantsInterval);
    }
  }, [detailsModalOpen, selectedMatch, refreshInterval, fetchParticipants]);

  const handleDeleteMatch = async (matchId: string) => {
    try {
      const response = await fetch(`/api/matches/${matchId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Remove the match from the list
        setMatches(prev => prev.filter(match => match.id !== matchId));
        setDetailsModalOpen(false);
      } else {
        console.error('Failed to delete match');
      }
    } catch (error) {
      console.error('Error deleting match:', error);
    }
  };

  const handleStatusTransition = async (matchId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/matches/${matchId}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newStatus }),
      });

      if (response.ok) {
        const updatedMatch = await response.json();
        // Update the match in the list
        setMatches(prev => prev.map(match => 
          match.id === matchId ? updatedMatch : match
        ));
        
        if (newStatus === 'gather') {
          console.log(`✅ Match transitioned to gather stage - Discord announcement will be posted`);
        }
      } else {
        console.error('Failed to transition match status');
      }
    } catch (error) {
      console.error('Error transitioning match status:', error);
    }
  };

  const getNextStatusButton = (match: MatchWithGame) => {
    switch (match.status) {
      case 'created':
        return (
          <Button 
            size="sm" 
            onClick={(e) => {
              e.stopPropagation();
              handleStatusTransition(match.id, 'gather');
            }}
            style={{ flex: 1 }}
          >
            Start Signups
          </Button>
        );
      case 'gather':
        return (
          <Button 
            size="sm" 
            color="orange"
            onClick={(e) => {
              e.stopPropagation();
              handleStatusTransition(match.id, 'assign');
            }}
            style={{ flex: 1 }}
          >
            Close Signups
          </Button>
        );
      case 'assign':
        return null; // Battle starts automatically at scheduled time
      case 'battle':
        return (
          <Button 
            size="sm" 
            color="green"
            onClick={(e) => {
              e.stopPropagation();
              handleStatusTransition(match.id, 'complete');
            }}
            style={{ flex: 1 }}
          >
            End Match
          </Button>
        );
      case 'complete':
        return null; // No further transitions
      case 'cancelled':
        return null; // No further transitions
      default:
        return null;
    }
  };

  const handleAssignPlayers = (match: MatchWithGame) => {
    setSelectedMatchForAssignment(match);
    setAssignPlayersModalOpen(true);
  };

  const confirmDelete = (match: MatchWithGame) => {
    modals.openConfirmModal({
      title: 'Delete Match',
      children: (
        <Text size="sm">
          Are you sure you want to delete &quot;{match.name}&quot;? This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => handleDeleteMatch(match.id),
    });
  };

  // Memoize expensive match card rendering
  const memoizedMatchCards = useMemo(() => {
    return matches.map((match) => (
      <Grid.Col key={match.id} span={{ base: 12, md: 6, lg: 4 }}>
        <MatchCard 
          match={match}
          mapNames={mapNames}
          colorScheme={colorScheme}
          onViewDetails={handleViewDetails}
          onAssignPlayers={handleAssignPlayers}
          onStatusTransition={handleStatusTransition}
          formatMapName={formatMapName}
          getStatusColor={getStatusColor}
          getStatusColorForProgress={getStatusColorForProgress}
          getNextStatusButton={getNextStatusButton}
        />
      </Grid.Col>
    ));
  }, [matches, mapNames, colorScheme]);

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
            <Text size="md" c="dimmed">No participants yet</Text>
            <Text size="sm" c="dimmed">
              Participants will appear here once signups begin
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
                <Avatar size="sm" color="blue">
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
          <Text size="xl" fw={700}>Match Dashboard</Text>
          <Text c="dimmed" mt="xs">Manage and view all matches</Text>
        </div>
        <Button 
          size="lg"
          onClick={() => setCreateModalOpen(true)}
        >
          Create Match
        </Button>
      </Group>

      <Divider mb="xl" />

      {matches.length === 0 ? (
        <Card p="xl">
          <Stack align="center">
            <Text size="xl" fw={600}>No matches yet</Text>
            <Text c="dimmed" mb="md">
              Create your first match to get started
            </Text>
            <Button 
              onClick={() => setCreateModalOpen(true)}
            >
              Create Match
            </Button>
          </Stack>
        </Card>
      ) : (
        <Grid>
          {memoizedMatchCards}
        </Grid>
      )}

      <CreateMatchModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onMatchCreated={handleMatchCreated}
        games={games}
      />

      <AssignPlayersModal
        isOpen={assignPlayersModalOpen}
        onClose={() => setAssignPlayersModalOpen(false)}
        matchId={selectedMatchForAssignment?.id || ''}
        matchName={selectedMatchForAssignment?.name || ''}
      />

      <Modal
        opened={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        title="Match Details"
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
                    color: getStatusColorForProgress(selectedMatch.status, colorScheme === 'dark')
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
            </Stack>

            <Divider />

            <div>
              <Group justify="space-between" mb="md">
                <Text size="lg" fw={600}>Participants</Text>
                <Badge size="lg" variant="light">
                  {participants.length}/{selectedMatch.max_participants}
                </Badge>
              </Group>
              
              {memoizedParticipantsList}
            </div>

            <Divider />
            
            <Group justify="space-between" mt="md">
              <Button
                color="red"
                variant="light"
                onClick={() => confirmDelete(selectedMatch)}
              >
                Delete Match
              </Button>
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