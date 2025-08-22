'use client'

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Card, 
  Text, 
  Button, 
  Avatar,
  Divider,
  Loader,
  Group,
  Stack,
  Grid,
  RingProgress
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { Match, MATCH_FLOW_STEPS, MatchResult, SignupConfig, ReminderData } from '@/shared/types';

import { AssignPlayersModal } from './assign-players-modal';
import { ScoringModal } from './scoring/ScoringModal';

import { MatchDetailsModal } from './match-details-modal';

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
  game_color?: string;
  rules?: string;
  rounds?: number;
  maps?: string[];
  livestream_link?: string;
  created_at: string;
  updated_at: string;
  start_date?: string;
  end_date?: string;
}

interface MatchCardProps {
  match: MatchWithGame;
  mapNames: {[key: string]: string};
  onViewDetails: (match: MatchWithGame) => void;
  onAssignPlayers: (match: MatchWithGame) => void;
  formatMapName: (mapId: string) => string;
  getNextStatusButton: (match: MatchWithGame) => React.JSX.Element | null;
}

const MatchCard = memo(({ 
  match, 
  mapNames, 
  onViewDetails, 
  onAssignPlayers, 
  formatMapName, 
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
              color: match.game_color || '#95a5a6'
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
            Assign
          </Button>
        )}
        {getNextStatusButton(match)}
      </Group>
    </Card>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to ensure re-render when match status or other critical props change
  return (
    prevProps.match.id === nextProps.match.id &&
    prevProps.match.status === nextProps.match.status &&
    prevProps.match.name === nextProps.match.name &&
    prevProps.match.updated_at === nextProps.match.updated_at &&
    prevProps.match.game_color === nextProps.match.game_color &&
    JSON.stringify(prevProps.mapNames) === JSON.stringify(nextProps.mapNames)
  );
});

MatchCard.displayName = 'MatchCard';

export function MatchDashboard() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchWithGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchWithGame | null>(null);
  const [participants, setParticipants] = useState<{
    id: string;
    user_id: string;
    username: string;
    joined_at: string;
    signup_data: Record<string, unknown>;
  }[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [signupConfig, setSignupConfig] = useState<SignupConfig | null>(null);
  const [assignPlayersModalOpen, setAssignPlayersModalOpen] = useState(false);
  const [selectedMatchForAssignment, setSelectedMatchForAssignment] = useState<MatchWithGame | null>(null);
  const [scoringModalOpen, setScoringModalOpen] = useState(false);
  const [selectedMatchForScoring, setSelectedMatchForScoring] = useState<MatchWithGame | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(10); // default 10 seconds
  const [reminders, setReminders] = useState<ReminderData[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(false);

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
  }, [fetchMatches]);

  // Set up auto-refresh with configurable interval
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

  const handleCreateMatch = () => {
    router.push('/matches/create');
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
          
          const hasChanges = data.participants.some((participant: {
            id: string;
            user_id: string;
            username: string;
            joined_at: string;
            signup_data: Record<string, unknown>;
          }, index: number) => {
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

  const fetchReminders = useCallback(async (matchId: string, silent = false) => {
    if (!silent) {
      setRemindersLoading(true);
    }
    try {
      const response = await fetch(`/api/matches/${matchId}/reminders`);
      if (response.ok) {
        const data = await response.json();
        setReminders(data.reminders || []);
      } else {
        console.error('Failed to fetch reminders');
        if (!silent) {
          setReminders([]);
        }
      }
    } catch (error) {
      console.error('Error fetching reminders:', error);
      if (!silent) {
        setReminders([]);
      }
    } finally {
      if (!silent) {
        setRemindersLoading(false);
      }
    }
  }, []);

  const handleViewDetails = useCallback((match: MatchWithGame) => {
    setSelectedMatch(match);
    setDetailsModalOpen(true);
    fetchParticipants(match.id);
    fetchReminders(match.id);
  }, [fetchParticipants, fetchReminders]);

  // Auto-refresh participants and reminders when details modal is open
  useEffect(() => {
    if (detailsModalOpen && selectedMatch) {
      // Use the same refresh interval for participants and reminders
      const participantsInterval = setInterval(() => {
        fetchParticipants(selectedMatch.id, true); // Silent refresh
        fetchReminders(selectedMatch.id, true); // Silent refresh
      }, refreshInterval * 1000);

      return () => clearInterval(participantsInterval);
    }
  }, [detailsModalOpen, selectedMatch, refreshInterval, fetchParticipants, fetchReminders]);

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

  const handleStatusTransition = useCallback(async (matchId: string, newStatus: string) => {
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
  }, []);

  const getNextStatusButton = useCallback((match: MatchWithGame) => {
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
              modals.openConfirmModal({
                title: 'Close Signups',
                children: (
                  <Text size="sm">
                    Are you sure you want to close signups for &quot;{match.name}&quot;? This will prevent new players from joining the match.
                  </Text>
                ),
                labels: { confirm: 'Close Signups', cancel: 'Cancel' },
                confirmProps: { color: 'orange' },
                onConfirm: () => handleStatusTransition(match.id, 'assign'),
              });
            }}
            style={{ flex: 1 }}
          >
            Close Signups
          </Button>
        );
      case 'assign':
        return (
          <Button 
            size="sm" 
            color="yellow"
            onClick={(e) => {
              e.stopPropagation();
              handleStatusTransition(match.id, 'battle');
            }}
            style={{ flex: 1 }}
          >
            Start Match
          </Button>
        );
      case 'battle':
        return (
          <Group gap="xs" style={{ flex: 1 }}>
            <Button 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                setSelectedMatchForScoring(match);
                setScoringModalOpen(true);
              }}
              style={{ flex: 1 }}
            >
              Scoring
            </Button>
            <Button 
              size="sm" 
              color="red"
              onClick={(e) => {
                e.stopPropagation();
                modals.openConfirmModal({
                  title: 'End Match',
                  children: (
                    <Text size="sm">
                      Are you sure you want to end the match &quot;{match.name}&quot;? This will mark the match as complete.
                    </Text>
                  ),
                  labels: { confirm: 'End Match', cancel: 'Cancel' },
                  confirmProps: { color: 'red' },
                  onConfirm: () => handleStatusTransition(match.id, 'complete'),
                });
              }}
              style={{ flex: 1 }}
            >
              End Match
            </Button>
          </Group>
        );
      case 'complete':
        return null; // No further transitions
      case 'cancelled':
        return null; // No further transitions
      default:
        return null;
    }
  }, [handleStatusTransition]);

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
  // Handle score submission
  const handleResultSubmit = async (result: MatchResult) => {
    if (!selectedMatchForScoring) return;

    try {
      const response = await fetch(`/api/matches/${selectedMatchForScoring.id}/games/${result.gameId}/result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(result),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save result');
      }
      
      // Refresh matches to show updated status
      fetchMatches();
      
      // Close modal
      setScoringModalOpen(false);
      setSelectedMatchForScoring(null);
    } catch (error) {
      console.error('Error submitting result:', error);
      throw error; // Re-throw to let the modal handle the error display
    }
  };

  const memoizedMatchCards = useMemo(() => {
    return matches.map((match) => (
      <Grid.Col key={match.id} span={{ base: 12, md: 6, lg: 4 }}>
        <MatchCard 
          match={match}
          mapNames={mapNames}
          onViewDetails={handleViewDetails}
          onAssignPlayers={handleAssignPlayers}
          formatMapName={formatMapName}
          getNextStatusButton={getNextStatusButton}
        />
      </Grid.Col>
    ));
  }, [matches, mapNames, handleViewDetails, getNextStatusButton]);


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
          size="md"
          onClick={handleCreateMatch}
        >
          Create Match
        </Button>
      </Group>

      <Divider mb="xl" />

      {matches.length === 0 ? (
        <Card p="xl">
          <Stack align="center">
            <Text size="xl" fw={600}>No matches yet</Text>
            <Text c="dimmed">
              Create a match to get started
            </Text>
          </Stack>
        </Card>
      ) : (
        <Grid>
          {memoizedMatchCards}
        </Grid>
      )}


      <AssignPlayersModal
        isOpen={assignPlayersModalOpen}
        onClose={() => setAssignPlayersModalOpen(false)}
        matchId={selectedMatchForAssignment?.id || ''}
        matchName={selectedMatchForAssignment?.name || ''}
      />

      {selectedMatchForScoring && (
        <ScoringModal
          opened={scoringModalOpen}
          onClose={() => {
            setScoringModalOpen(false);
            setSelectedMatchForScoring(null);
          }}
          matchId={selectedMatchForScoring.id}
          gameId={selectedMatchForScoring.game_id}
          matchFormat={selectedMatchForScoring.match_format || 'casual'}
          onResultSubmit={handleResultSubmit}
        />
      )}

      <MatchDetailsModal
        opened={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        title="Match Details"
        selectedMatch={selectedMatch}
        participants={participants}
        participantsLoading={participantsLoading}
        signupConfig={signupConfig}
        reminders={reminders}
        remindersLoading={remindersLoading}
        mapDetails={mapDetails}
        formatMapName={formatMapName}
        parseDbTimestamp={parseDbTimestamp}
        showTabs={true}
        showDeleteButton={true}
        showAssignButton={true}
        onDelete={(match) => confirmDelete(match)}
        onAssign={(match) => handleAssignPlayers(match)}
      />
    </div>
  );
}