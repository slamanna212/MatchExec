'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { Stack, Group, Card, Button, Text, Badge, Divider, Alert, Loader, Box, ActionIcon } from '@mantine/core';
import { IconMap, IconCheck, IconClock, IconTrophy, IconSwords, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { MatchResult } from '@/shared/types';

interface MatchGame {
  id: string;
  match_id: string;
  round: number;
  map_id: string;
  map_name: string;
  image_url?: string;
  mode_id: string;
  mode_scoring_type?: 'Normal' | 'FFA';
  game_id: string; // game type like "overwatch2"
  status: 'pending' | 'ongoing' | 'completed';
  winner_id?: string;
  participant_winner_id?: string;
  is_ffa_mode?: boolean;
}

interface SimpleMapScoringProps {
  matchId: string;
  gameType: string; // The game type (e.g., "marvelrivals", "overwatch2")
  onResultSubmit: (result: MatchResult) => Promise<void>;
  submitting: boolean;
  onAllMapsCompleted?: () => void; // Optional callback when all maps are completed
}

const CARD_WIDTH = 180 + 16; // Card width + gap

interface MatchParticipant {
  id: string;
  username: string;
  team_assignment?: string;
}

export function SimpleMapScoring({
  matchId,
  gameType,
  onResultSubmit,
  submitting,
  onAllMapsCompleted
}: SimpleMapScoringProps) {
  const [matchGames, setMatchGames] = useState<MatchGame[]>([]);
  const [participants, setParticipants] = useState<MatchParticipant[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch match games and participants
  useEffect(() => {
    if (!matchId || matchId.trim() === '') {
      console.log('SimpleMapScoring: Waiting for valid matchId, current value:', matchId);
      setLoading(true); // Keep loading while waiting for valid matchId
      setError(null);
      return;
    }
    
    const fetchMatchData = async () => {
      let response: Response | undefined;
      try {
        setLoading(true);
        setError(null);
        const url = `/api/matches/${matchId}/games?t=${Date.now()}`;
        console.log('SimpleMapScoring: Fetching from URL:', url);
        console.log('SimpleMapScoring: matchId:', matchId);
        response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
          },
        });
        console.log('SimpleMapScoring: Response received:', response.status, response.statusText);
        if (!response.ok) {
          let errorMessage = `HTTP ${response.status}: Failed to load match games`;
          try {
            const responseText = await response.text();
            console.log('SimpleMapScoring: Error response body:', responseText);
            if (responseText.trim()) {
              const errorData = JSON.parse(responseText);
              errorMessage = errorData.error || errorMessage;
            }
          } catch (jsonError) {
            console.error('Failed to parse error response as JSON:', jsonError);
          }
          
          // If it's a 405 error, it might be a transient routing issue in development
          // Let's retry once after a short delay
          if (response.status === 405) {
            console.log('SimpleMapScoring: Got 405, retrying after delay...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
              const retryUrl = `/api/matches/${matchId}/games?retry=${Date.now()}`;
              const retryResponse = await fetch(retryUrl, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                  'Cache-Control': 'no-cache',
                },
              });
              
              if (retryResponse.ok) {
                console.log('SimpleMapScoring: Retry successful');
                response = retryResponse;
              } else {
                console.log('SimpleMapScoring: Retry also failed:', retryResponse.status);
                throw new Error(errorMessage);
              }
            } catch (retryError) {
              console.error('SimpleMapScoring: Retry failed:', retryError);
              throw new Error(errorMessage);
            }
          } else {
            throw new Error(errorMessage);
          }
        }
        
        const data = await response.json();
        setMatchGames(data.games || []);
        
        // Fetch participants for FFA modes
        try {
          const participantsResponse = await fetch(`/api/matches/${matchId}/participants`);
          if (participantsResponse.ok) {
            const participantsData = await participantsResponse.json();
            setParticipants(participantsData.participants || []);
          } else {
            console.warn('Failed to fetch participants:', participantsResponse.status);
          }
        } catch (participantsError) {
          console.warn('Error fetching participants:', participantsError);
        }
        
        // Auto-select the first pending/ongoing game
        const activeGame = data.games.find((game: MatchGame) => 
          game.status === 'pending' || game.status === 'ongoing'
        );
        if (activeGame) {
          setSelectedGameId(activeGame.id);
        }
      } catch (err) {
        console.error('Error fetching match games:', err);
        console.error('Response status:', response?.status);
        setError(err instanceof Error ? err.message : 'Failed to load match games');
      } finally {
        setLoading(false);
      }
    };

    fetchMatchData();
  }, [matchId]);

  const getMaxScroll = useCallback(() => {
    if (!containerRef.current) return 0;
    const containerWidth = containerRef.current.offsetWidth;
    const totalWidth = matchGames.length * CARD_WIDTH;
    return Math.max(0, totalWidth - containerWidth);
  }, [matchGames.length]);

  const scrollToMap = useCallback((gameIndex: number) => {
    if (!containerRef.current) return;
    
    const containerWidth = containerRef.current.offsetWidth;
    const cardPosition = gameIndex * CARD_WIDTH;
    const centerPosition = cardPosition - (containerWidth / 2) + (CARD_WIDTH / 2);
    
    const maxScroll = getMaxScroll();
    const targetScroll = Math.max(0, Math.min(maxScroll, centerPosition));
    
    setScrollPosition(targetScroll);
  }, [getMaxScroll, setScrollPosition]);

  // Auto-scroll to selected map when it changes
  useEffect(() => {
    if (selectedGameId && matchGames.length > 0) {
      const gameIndex = matchGames.findIndex(game => game.id === selectedGameId);
      if (gameIndex !== -1) {
        // Use setTimeout to ensure the DOM has updated
        setTimeout(() => {
          scrollToMap(gameIndex);
        }, 100);
      }
    }
  }, [selectedGameId, matchGames, scrollToMap]);

  const selectedGame = matchGames.find(game => game.id === selectedGameId);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <IconCheck size={16} color="green" />;
      case 'ongoing':
        return <IconClock size={16} color="orange" />;
      default:
        return <IconMap size={16} color="gray" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'green';
      case 'ongoing':
        return 'orange';
      default:
        return 'gray';
    }
  };

  const formatMapName = (mapId: string, mapName?: string) => {
    if (mapName) return mapName;
    
    // Fallback formatting
    return mapId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getMapImageUrl = (gameId: string, mapId: string) => {
    // Handle special cases where maps don't use webp format
    if (gameId === 'overwatch2' && mapId === 'ow2-workshop') {
      return `/assets/games/${gameId}/maps/${mapId}.jpg`;
    }
    // Default to webp for all other maps
    return `/assets/games/${gameId}/maps/${mapId}.webp`;
  };

  
  const handleScrollLeft = () => {
    setScrollPosition(Math.max(0, scrollPosition - CARD_WIDTH));
  };

  const handleScrollRight = () => {
    const maxScroll = getMaxScroll();
    setScrollPosition(Math.min(maxScroll, scrollPosition + CARD_WIDTH));
  };

  const handleTeamWin = async (winner: 'team1' | 'team2') => {
    if (!selectedGame) return;

    try {
      const result: MatchResult = {
        matchId,
        gameId: selectedGame.id,
        winner,
        isFfaMode: false,
        completedAt: new Date()
      };
      
      await onResultSubmit(result);
      
      // Instead of immediately refreshing, optimistically update the local state
      // and let the main useEffect handle the refresh
      const updatedGames = matchGames.map(game => 
        game.id === selectedGame.id 
          ? { ...game, status: 'completed' as const, winner_id: winner }
          : game
      );
      setMatchGames(updatedGames);
      
      // Move to next pending game if current one is completed
      const nextGame = updatedGames.find((game: MatchGame) => 
        game.status === 'pending' || game.status === 'ongoing'
      );
      if (nextGame && nextGame.id !== selectedGameId) {
        setSelectedGameId(nextGame.id);
      } else if (!nextGame && onAllMapsCompleted) {
        // No more pending games - all maps are completed
        onAllMapsCompleted();
      }
      
      // Trigger a background refresh after a delay to sync with server
      setTimeout(async () => {
        try {
          const refreshResponse = await fetch(`/api/matches/${matchId}/games`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });
          
          if (refreshResponse.ok) {
            const data = await refreshResponse.json();
            setMatchGames(data.games || []);
          } else {
            console.warn('Background refresh failed:', refreshResponse.status);
            // Don't show error to user since optimistic update already worked
          }
        } catch (error) {
          console.warn('Background refresh error:', error);
          // Don't show error to user since optimistic update already worked
        }
      }, 1000);
    } catch (error) {
      console.error('Error in handleTeamWin:', error);
      setError(error instanceof Error ? error.message : 'Failed to save result');
    }
  };

  const handleParticipantWin = async (participantId: string) => {
    if (!selectedGame) return;

    try {
      const result: MatchResult = {
        matchId,
        gameId: selectedGame.id,
        winner: 'team1', // Required field but not used in FFA mode
        participantWinnerId: participantId,
        isFfaMode: true,
        completedAt: new Date()
      };
      
      await onResultSubmit(result);
      
      // Update local state optimistically
      const updatedGames = matchGames.map(game => 
        game.id === selectedGame.id 
          ? { ...game, status: 'completed' as const, participant_winner_id: participantId, is_ffa_mode: true }
          : game
      );
      setMatchGames(updatedGames);
      
      // Move to next pending game if current one is completed
      const nextGame = updatedGames.find((game: MatchGame) => 
        game.status === 'pending' || game.status === 'ongoing'
      );
      if (nextGame && nextGame.id !== selectedGameId) {
        setSelectedGameId(nextGame.id);
      } else if (!nextGame && onAllMapsCompleted) {
        // No more pending games - all maps are completed
        onAllMapsCompleted();
      }
      
      // Trigger a background refresh after a delay to sync with server
      setTimeout(async () => {
        try {
          const refreshResponse = await fetch(`/api/matches/${matchId}/games`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });
          
          if (refreshResponse.ok) {
            const data = await refreshResponse.json();
            setMatchGames(data.games || []);
          } else {
            console.warn('Background refresh failed:', refreshResponse.status);
          }
        } catch (error) {
          console.warn('Background refresh error:', error);
        }
      }, 1000);
    } catch (error) {
      console.error('Error in handleParticipantWin:', error);
      setError(error instanceof Error ? error.message : 'Failed to save result');
    }
  };

  if (loading) {
    return (
      <Group justify="center" p="xl">
        <Loader size="md" />
        <Text>Loading match maps...</Text>
      </Group>
    );
  }

  if (error) {
    return (
      <Alert color="red" icon={<IconTrophy size={16} />}>
        {error}
      </Alert>
    );
  }

  if (matchGames.length === 0) {
    return (
      <Alert color="yellow" icon={<IconMap size={16} />}>
        No maps found for this match. Please check the match configuration.
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      {/* Map Selection */}
      <Card withBorder p="md">
        <Stack gap="sm">
          <Text fw={600} size="sm">Match Schedule</Text>
          
          {/* Map Cards with Horizontal Scrolling */}
          <Box pos="relative">
            <Group gap="xs" align="center">
              {/* Left Arrow */}
              <ActionIcon
                variant="light"
                size="lg"
                onClick={handleScrollLeft}
                disabled={scrollPosition <= 0}
                style={{ flexShrink: 0 }}
              >
                <IconChevronLeft size={16} />
              </ActionIcon>

              {/* Scrollable Map Container */}
              <Box
                ref={containerRef}
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  position: 'relative'
                }}
              >
                <Group
                  gap="md"
                  style={{
                    transform: `translateX(-${scrollPosition}px)`,
                    transition: 'transform 0.3s ease',
                    flexWrap: 'nowrap'
                  }}
                >
                  {matchGames.map((game) => (
                    <Card
                      key={game.id}
                      withBorder
                      onClick={() => setSelectedGameId(game.id)}
                      style={{
                        cursor: submitting ? 'not-allowed' : 'pointer',
                        minWidth: 180,
                        height: 120,
                        backgroundImage: `linear-gradient(${selectedGameId === game.id ? 'rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.6)'}), url('${game.image_url || getMapImageUrl(gameType, game.map_id)}')`,
                        backgroundSize: 'cover', // Full card coverage
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat',
                        backgroundColor: '#1a1b1e', // Fallback color
                        border: selectedGameId === game.id ? `2px solid var(--mantine-color-${getStatusColor(game.status)}-6)` : 'none',
                        boxShadow: selectedGameId === game.id ? `0 0 0 1px var(--mantine-color-${getStatusColor(game.status)}-6)` : undefined,
                        opacity: submitting ? 0.6 : 1,
                        position: 'relative'
                      }}
                      p="sm"
                    >
                      <Stack gap="xs" h="100%" justify="space-between">
                        {/* Status Icon and Badge */}
                        <Group justify="space-between" align="flex-start">
                          {getStatusIcon(game.status)}
                          <Badge 
                            color={getStatusColor(game.status)} 
                            size="xs"
                            style={{ backgroundColor: `var(--mantine-color-${getStatusColor(game.status)}-6)` }}
                          >
                            {game.status}
                          </Badge>
                        </Group>
                        
                        {/* Map Info */}
                        <Box>
                          <Text 
                            size="xs" 
                            fw={600} 
                            c="white"
                            style={{ 
                              textShadow: '0 0 4px rgba(0, 0, 0, 0.9), 1px 1px 2px rgba(0, 0, 0, 0.8)',
                              lineHeight: 1.2,
                              fontWeight: 700
                            }}
                          >
                            Map {game.round}
                          </Text>
                          <Text 
                            size="xs" 
                            c="white"
                            style={{ 
                              textShadow: '0 0 4px rgba(0, 0, 0, 0.9), 1px 1px 2px rgba(0, 0, 0, 0.8)',
                              lineHeight: 1.1,
                              fontWeight: 600
                            }}
                          >
                            {formatMapName(game.map_id, game.map_name)}
                          </Text>
                        </Box>
                      </Stack>
                    </Card>
                  ))}
                </Group>
              </Box>

              {/* Right Arrow */}
              <ActionIcon
                variant="light"
                size="lg"
                onClick={handleScrollRight}
                disabled={scrollPosition >= getMaxScroll()}
                style={{ flexShrink: 0 }}
              >
                <IconChevronRight size={16} />
              </ActionIcon>
            </Group>
          </Box>
          
          {/* Status summary */}
          <Group gap="lg" mt="xs">
            <Group gap="xs">
              <IconCheck size={14} color="green" />
              <Text size="xs" c="dimmed">
                {matchGames.filter(g => g.status === 'completed').length} Completed
              </Text>
            </Group>
            <Group gap="xs">
              <IconClock size={14} color="orange" />
              <Text size="xs" c="dimmed">
                {matchGames.filter(g => g.status === 'ongoing').length} In Progress
              </Text>
            </Group>
            <Group gap="xs">
              <IconMap size={14} color="gray" />
              <Text size="xs" c="dimmed">
                {matchGames.filter(g => g.status === 'pending').length} Pending
              </Text>
            </Group>
          </Group>
        </Stack>
      </Card>

      {/* Error display */}
      {error && (
        <Alert color="red" icon={<IconTrophy size={16} />}>
          {error}
        </Alert>
      )}

      {/* Selected Map Winner Selection */}
      {selectedGame && (
        <Card withBorder p="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Group gap="sm">
                <Text fw={600}>
                  Map {selectedGame.round}: {formatMapName(selectedGame.map_id, selectedGame.map_name)}
                </Text>
                <Badge color={getStatusColor(selectedGame.status)} size="sm">
                  {selectedGame.status}
                </Badge>
                {selectedGame.mode_scoring_type === 'FFA' && (
                  <Badge color="violet" size="sm">
                    Free-For-All
                  </Badge>
                )}
                {selectedGame.status === 'completed' && selectedGame.mode_scoring_type === 'FFA' && selectedGame.participant_winner_id && (
                  <Badge color="green" size="sm">
                    Winner: {participants.find(p => p.id === selectedGame.participant_winner_id)?.username || 'Unknown Player'}
                  </Badge>
                )}
                {selectedGame.status === 'completed' && selectedGame.mode_scoring_type !== 'FFA' && selectedGame.winner_id && (
                  <Badge color={selectedGame.winner_id === 'team1' ? 'blue' : 'red'} size="sm">
                    Winner: {selectedGame.winner_id === 'team1' ? 'Blue Team' : 'Red Team'}
                  </Badge>
                )}
              </Group>
            </Group>

            <Divider />

            {/* Winner Selection */}
            {selectedGame.status !== 'completed' && (
              <Stack gap="md">
                {selectedGame.mode_scoring_type === 'FFA' ? (
                  <>
                    <Text size="sm" c="dimmed" ta="center">
                      <IconTrophy size={16} style={{ marginRight: 8 }} />
                      Select the winner of this Free-For-All match:
                    </Text>
                    
                    <Stack gap="sm" align="center">
                      {participants.map((participant) => (
                        <Button
                          key={participant.id}
                          size="md"
                          color="violet"
                          variant="outline"
                          onClick={() => handleParticipantWin(participant.id)}
                          disabled={submitting}
                          loading={submitting}
                          leftSection={<IconTrophy size={18} />}
                          style={{ minWidth: 200 }}
                        >
                          {participant.username} Wins
                        </Button>
                      ))}
                    </Stack>
                  </>
                ) : (
                  <>
                    <Text size="sm" c="dimmed" ta="center">
                      <IconSwords size={16} style={{ marginRight: 8 }} />
                      Who won this map?
                    </Text>
                    
                    <Group justify="center" gap="xl">
                      <Button
                        size="lg"
                        color="blue"
                        variant="outline"
                        onClick={() => handleTeamWin('team1')}
                        disabled={submitting}
                        loading={submitting}
                        leftSection={<IconTrophy size={20} />}
                      >
                        Blue Team Wins
                      </Button>
                      
                      <Button
                        size="lg"
                        color="red"
                        variant="outline"
                        onClick={() => handleTeamWin('team2')}
                        disabled={submitting}
                        loading={submitting}
                        leftSection={<IconTrophy size={20} />}
                      >
                        Red Team Wins
                      </Button>
                    </Group>
                  </>
                )}
              </Stack>
            )}

            {/* Already completed */}
            {selectedGame.status === 'completed' && (
              <Alert color="green" icon={<IconCheck size={16} />}>
                {selectedGame.mode_scoring_type === 'FFA' ? (
                  <>This FFA match has been completed. Winner: {participants.find(p => p.id === selectedGame.participant_winner_id)?.username || 'Unknown Player'}</>
                ) : (
                  <>This map has been completed. Winner: {selectedGame.winner_id === 'team1' ? 'Blue Team' : 'Red Team'}</>
                )}
              </Alert>
            )}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}