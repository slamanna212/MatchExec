'use client'

import { useState, useEffect } from 'react';
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
import { Match, MATCH_FLOW_STEPS } from '../../shared/types';

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
  signup_data: any;
}

interface SignupField {
  id: string;
  label: string;
  type: string;
}

interface SignupConfig {
  fields: SignupField[];
}

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
  const { colorScheme } = useMantineColorScheme();

  useEffect(() => {
    fetchMatches();
    fetchGames();
  }, []);

  const fetchMatches = async () => {
    try {
      const response = await fetch('/api/matches');
      if (response.ok) {
        const data = await response.json();
        setMatches(data);
      }
    } catch (error) {
      console.error('Error fetching matches:', error);
    } finally {
      setLoading(false);
    }
  };

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
        
        maps.forEach((map: any) => {
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

  const fetchParticipants = async (matchId: string) => {
    setParticipantsLoading(true);
    try {
      const response = await fetch(`/api/matches/${matchId}/participants`);
      if (response.ok) {
        const data = await response.json();
        setParticipants(data.participants);
        setSignupConfig(data.signupConfig);
      } else {
        console.error('Failed to fetch participants');
        setParticipants([]);
        setSignupConfig(null);
      }
    } catch (error) {
      console.error('Error fetching participants:', error);
      setParticipants([]);
      setSignupConfig(null);
    } finally {
      setParticipantsLoading(false);
    }
  };

  const handleViewDetails = (match: MatchWithGame) => {
    setSelectedMatch(match);
    setDetailsModalOpen(true);
    fetchParticipants(match.id);
  };

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
            onClick={() => handleStatusTransition(match.id, 'gather')}
          >
            Start Signups
          </Button>
        );
      case 'gather':
        return (
          <Button 
            size="sm" 
            color="orange"
            onClick={() => handleStatusTransition(match.id, 'assign')}
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
            onClick={() => handleStatusTransition(match.id, 'complete')}
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

  const confirmDelete = (match: MatchWithGame) => {
    modals.openConfirmModal({
      title: 'Delete Match',
      children: (
        <Text size="sm">
          Are you sure you want to delete "{match.name}"? This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => handleDeleteMatch(match.id),
    });
  };

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
          {matches.map((match) => (
            <Grid.Col key={match.id} span={{ base: 12, md: 6, lg: 4 }}>
              <Card shadow="sm" padding="lg" radius="md" withBorder>
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
                    <Text size="sm">{new Date(match.created_at).toLocaleDateString('en-US')}</Text>
                  </Group>
                </Stack>
                
                <Group mt="md" gap="xs">
                  <Button 
                    size="sm" 
                    variant="light" 
                    style={{ flex: 1 }}
                    onClick={() => handleViewDetails(match)}
                  >
                    View Details
                  </Button>
                  {getNextStatusButton(match)}
                </Group>
              </Card>
            </Grid.Col>
          ))}
        </Grid>
      )}

      <CreateMatchModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onMatchCreated={handleMatchCreated}
        games={games}
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
                  <Text size="sm">{new Date(selectedMatch.start_date).toLocaleString('en-US')}</Text>
                </Group>
              )}

              <Group justify="space-between">
                <Text size="sm" fw={500} c="dimmed">Created:</Text>
                <Text size="sm">{new Date(selectedMatch.created_at).toLocaleString('en-US')}</Text>
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
              
              {participantsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader size="md" />
                </div>
              ) : participants.length === 0 ? (
                <Card p="lg" withBorder>
                  <Stack align="center">
                    <Text size="md" c="dimmed">No participants yet</Text>
                    <Text size="sm" c="dimmed">
                      Participants will appear here once signups begin
                    </Text>
                  </Stack>
                </Card>
              ) : (
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
                              Joined: {new Date(participant.joined_at).toLocaleDateString('en-US')}
                            </Text>
                          </div>
                        </Group>
                        
                        {participant.signup_data && (
                          <Stack gap="xs" align="flex-end">
                            {Object.entries(participant.signup_data).map(([key, value]) => {
                              // Find the label from signup config
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
              )}
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