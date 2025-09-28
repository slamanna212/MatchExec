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
  RingProgress,
  TextInput,
  useMantineColorScheme,
  Badge
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { Tournament, TOURNAMENT_FLOW_STEPS } from '@/shared/types';
import { TournamentDetailsModal } from './tournament-details-modal';
import { AssignTournamentTeamsModal } from './assign-tournament-teams-modal';

// Utility function to properly convert SQLite UTC timestamps to Date objects
const parseDbTimestamp = (timestamp: string | null | undefined): Date | null => {
  if (!timestamp) return null;
  
  // Check if timestamp already includes timezone info
  if (timestamp.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(timestamp)) {
    return new Date(timestamp);
  }
  
  // SQLite CURRENT_TIMESTAMP returns format like "2025-08-08 22:52:51" (UTC)
  return new Date(timestamp + 'Z');
};

interface TournamentWithGame extends Tournament {
  game_name?: string;
  game_icon?: string;
  game_color?: string;
  participant_count?: number;
  has_bracket?: boolean;
}

interface TournamentCardProps {
  tournament: TournamentWithGame;
  onViewDetails: (tournament: TournamentWithGame) => void;
  getNextStatusButton: (tournament: TournamentWithGame) => React.JSX.Element | null;
}

const TournamentCard = memo(({ 
  tournament, 
  onViewDetails, 
  getNextStatusButton 
}: TournamentCardProps) => {
  const { colorScheme } = useMantineColorScheme();
  
  return (
    <Card 
      shadow={colorScheme === 'light' ? 'lg' : 'sm'}
      padding="lg" 
      radius="md" 
      withBorder
      bg={colorScheme === 'light' ? 'white' : undefined}
      style={{ 
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        borderColor: colorScheme === 'light' ? 'var(--mantine-color-gray-3)' : undefined
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = colorScheme === 'light' ? '0 1px 3px rgba(0,0,0,0.12)' : '0 1px 3px rgba(0,0,0,0.24)';
      }}
      onClick={() => onViewDetails(tournament)}
    >
      <Group mb="md">
        <Avatar
          src={tournament.game_icon}
          alt={tournament.game_name}
          size="md"
        />
        <Stack gap="xs" style={{ flex: 1 }}>
          <Text fw={600}>{tournament.name}</Text>
          <Text size="sm" c="dimmed">{tournament.game_name}</Text>
        </Stack>
        <RingProgress
          size={50}
          thickness={4}
          sections={[
            { 
              value: TOURNAMENT_FLOW_STEPS[tournament.status]?.progress || 0, 
              color: tournament.game_color || '#95a5a6'
            }
          ]}
        />
      </Group>
      
      <Divider mb="md" />
      
      <Stack gap="xs" style={{ minHeight: '140px' }}>
        <div style={{ minHeight: '20px' }}>
          {tournament.description && (
            <Text size="sm" c="dimmed">{tournament.description}</Text>
          )}
        </div>
        
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Format:</Text>
          <Badge size="sm" variant="light">
            {tournament.format === 'single-elimination' ? 'Single Elim' : 'Double Elim'}
          </Badge>
        </Group>
        
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Rounds/Match:</Text>
          <Text size="sm">{tournament.rounds_per_match}</Text>
        </Group>
        
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Participants:</Text>
          <Text size="sm">
            {tournament.participant_count || 0}
            {tournament.max_participants ? ` / ${tournament.max_participants}` : ''}
          </Text>
        </Group>

        {tournament.start_time && (
          <Group justify="space-between">
            <Text size="sm" c="dimmed">Start:</Text>
            <Text size="sm">{parseDbTimestamp(tournament.start_time?.toString())?.toLocaleDateString()}</Text>
          </Group>
        )}
      </Stack>
      
      <Divider mt="md" mb="md" />
      
      <Group justify="space-between" align="center">
        {getNextStatusButton(tournament)}
      </Group>
    </Card>
  );
});

// Performance optimization for card rendering
TournamentCard.displayName = 'TournamentCard';

export function TournamentDashboard() {
  const router = useRouter();
  const { colorScheme } = useMantineColorScheme();
  const [tournaments, setTournaments] = useState<TournamentWithGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshInterval, setRefreshInterval] = useState(30); // default 30 seconds
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<TournamentWithGame | null>(null);
  const [assignTeamsModalOpen, setAssignTeamsModalOpen] = useState(false);
  const [selectedTournamentForAssignment, setSelectedTournamentForAssignment] = useState<TournamentWithGame | null>(null);

  const fetchTournaments = useCallback(async (silent = false) => {
    try {
      const response = await fetch('/api/tournaments');
      if (response.ok) {
        const data = await response.json();
        setTournaments(prevTournaments => {
          // Check if data changed to prevent unnecessary rerenders
          if (prevTournaments.length !== data.length) {
            return data;
          }
          
          const hasChanges = data.some((tournament: TournamentWithGame, index: number) => {
            const prevTournament = prevTournaments[index];
            return !prevTournament || 
              tournament.id !== prevTournament.id ||
              tournament.status !== prevTournament.status ||
              tournament.name !== prevTournament.name ||
              tournament.participant_count !== prevTournament.participant_count ||
              tournament.updated_at !== prevTournament.updated_at;
          });
          
          return hasChanges ? data : prevTournaments;
        });
      }
    } catch (error) {
      console.error('Error fetching tournaments:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  // Fetch UI settings and tournaments on component mount
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

    fetchTournaments();
    fetchUISettings();
  }, [fetchTournaments]);

  // Set up auto-refresh with configurable interval
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchTournaments(true); // Silent refresh
    }, refreshInterval * 1000);

    return () => clearInterval(intervalId);
  }, [refreshInterval, fetchTournaments]);

  const handleCreateTournament = () => {
    router.push('/tournaments/create?step=1');
  };

  const handleViewDetails = useCallback((tournament: TournamentWithGame) => {
    setSelectedTournament(tournament);
    setDetailsModalOpen(true);
  }, []);

  const handleStatusTransition = async (tournamentId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newStatus }),
      });

      if (response.ok) {
        const updatedTournament = await response.json();
        setTournaments(prev => prev.map(tournament => 
          tournament.id === tournamentId ? { ...tournament, ...updatedTournament } : tournament
        ));
      } else {
        const error = await response.json();
        console.error('Failed to transition tournament status:', error);
        alert(error.error || 'Failed to update tournament status');
      }
    } catch (error) {
      console.error('Error transitioning tournament status:', error);
      alert('Failed to update tournament status');
    }
  };

  const handleDeleteTournament = async (tournament: TournamentWithGame) => {
    try {
      const response = await fetch(`/api/tournaments/${tournament.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setTournaments(prev => prev.filter(t => t.id !== tournament.id));
        setDetailsModalOpen(false);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to delete tournament');
      }
    } catch (error) {
      console.error('Error deleting tournament:', error);
      alert('Failed to delete tournament');
    }
  };

  const handleAssignTeamsFromModal = (tournament: TournamentWithGame) => {
    setSelectedTournamentForAssignment(tournament);
    setAssignTeamsModalOpen(true);
  };

  const handleProgressTournament = useCallback(async (tournamentId: string) => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/progress`, {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Tournament progressed:', result.message);

        // Show success notification
        alert(result.message);

        // Refresh tournaments to show updated status
        fetchTournaments(true);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to progress tournament');
      }
    } catch (error) {
      console.error('Error progressing tournament:', error);
      alert('Failed to progress tournament');
    }
  }, [fetchTournaments]);

  const handleGenerateBracket = useCallback(async (tournamentId: string) => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/generate-matches`, {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Bracket generated:', result.message);

        // Show success notification
        alert(result.message);

        // Refresh tournaments to show updated bracket status
        fetchTournaments(true);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to generate bracket');
      }
    } catch (error) {
      console.error('Error generating bracket:', error);
      alert('Failed to generate bracket');
    }
  }, [fetchTournaments]);

  const getNextStatusButton = useCallback((tournament: TournamentWithGame): React.JSX.Element | null => {
    switch (tournament.status) {
      case 'created':
        return (
          <Button 
            size="sm" 
            onClick={(e) => {
              e.stopPropagation();
              handleStatusTransition(tournament.id, 'gather');
            }}
            style={{ flex: 1 }}
          >
            Open Signups
          </Button>
        );
      case 'gather':
        return (
          <Group gap="xs" style={{ flex: 1 }}>
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTournamentForAssignment(tournament);
                setAssignTeamsModalOpen(true);
              }}
              style={{ flex: 1 }}
            >
              Assign
            </Button>
            <Button
              size="sm"
              color="orange"
              onClick={(e) => {
                e.stopPropagation();
                modals.openConfirmModal({
                  title: 'Close Signups',
                  children: (
                    <Text size="sm">
                      Are you sure you want to close signups for &quot;{tournament.name}&quot;? This will prevent new teams from joining the tournament.
                    </Text>
                  ),
                  labels: { confirm: 'Close Signups', cancel: 'Cancel' },
                  confirmProps: { color: 'orange' },
                  onConfirm: () => handleStatusTransition(tournament.id, 'assign'),
                });
              }}
              style={{ flex: 1 }}
            >
              Close Signups
            </Button>
          </Group>
        );
      case 'assign':
        return (
          <Group gap="xs" style={{ flex: 1 }}>
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTournamentForAssignment(tournament);
                setAssignTeamsModalOpen(true);
              }}
              style={{ flex: 1 }}
            >
              Assign
            </Button>
            {tournament.has_bracket ? (
              <Button
                size="sm"
                color="green"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStatusTransition(tournament.id, 'battle');
                }}
                style={{ flex: 1 }}
              >
                Start Tournament
              </Button>
            ) : (
              <Button
                size="sm"
                color="blue"
                onClick={(e) => {
                  e.stopPropagation();
                  handleGenerateBracket(tournament.id);
                }}
                style={{ flex: 1 }}
              >
                Bracket
              </Button>
            )}
          </Group>
        );
      case 'battle':
        return (
          <Group gap="xs" style={{ flex: 1 }}>
            <Button 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                handleProgressTournament(tournament.id);
              }}
              style={{ flex: 1 }}
              color="green"
            >
              Next Round
            </Button>
            <Button 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                // TODO: Open bracket management
                console.log('Manage bracket for tournament:', tournament.id);
              }}
              style={{ flex: 1 }}
            >
              View Bracket
            </Button>
            <Button 
              size="sm" 
              color="red"
              onClick={(e) => {
                e.stopPropagation();
                modals.openConfirmModal({
                  title: 'End Tournament',
                  children: (
                    <Text size="sm">
                      Are you sure you want to end &quot;{tournament.name}&quot;? This will mark the tournament as complete.
                    </Text>
                  ),
                  labels: { confirm: 'End Tournament', cancel: 'Cancel' },
                  confirmProps: { color: 'red' },
                  onConfirm: () => handleStatusTransition(tournament.id, 'complete'),
                });
              }}
              style={{ flex: 1 }}
            >
              End Tournament
            </Button>
          </Group>
        );
      case 'complete':
        return (
          <Text size="sm" c="green" fw={500} ta="center" style={{ flex: 1 }}>
            Tournament Complete
          </Text>
        );
      case 'cancelled':
        return (
          <Text size="sm" c="red" fw={500} ta="center" style={{ flex: 1 }}>
            Tournament Cancelled
          </Text>
        );
      default:
        return null;
    }
  }, [handleProgressTournament]);

  // Filter tournaments based on search query
  const filteredTournaments = useMemo(() => {
    if (!searchQuery.trim()) return tournaments;
    
    const query = searchQuery.toLowerCase();
    return tournaments.filter(tournament => 
      tournament.name.toLowerCase().includes(query) ||
      tournament.game_name?.toLowerCase().includes(query) ||
      tournament.description?.toLowerCase().includes(query)
    );
  }, [tournaments, searchQuery]);

  // Memoize tournament cards for better performance
  const memoizedTournamentCards = useMemo(() => {
    return filteredTournaments.map((tournament) => (
      <Grid.Col key={tournament.id} span={{ base: 12, md: 6, lg: 4 }}>
        <TournamentCard 
          tournament={tournament}
          onViewDetails={handleViewDetails}
          getNextStatusButton={getNextStatusButton}
        />
      </Grid.Col>
    ));
  }, [filteredTournaments, handleViewDetails, getNextStatusButton]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex justify-center md:justify-end mb-6">
        <Group gap="sm" wrap="nowrap">
          {tournaments.length > 0 && (
            <TextInput
              placeholder="Search tournaments..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              style={{ 
                width: 'clamp(150px, 50vw, 300px)',
                flexShrink: 1
              }}
            />
          )}
          <Button 
            size="md"
            onClick={handleCreateTournament}
            style={{ flexShrink: 0 }}
          >
            Create Tournament
          </Button>
        </Group>
      </div>
      <Divider mb="xl" />
      {tournaments.length === 0 ? (
        <Card 
          shadow="sm" 
          padding="xl" 
          radius="md" 
          withBorder
          className="text-center py-12"
          style={{ 
            borderColor: colorScheme === 'light' ? 'var(--mantine-color-gray-3)' : undefined
          }}
        >
          <Stack align="center">
            <Text size="xl" fw={600}>No tournaments yet</Text>
            <Text c="dimmed">
              Create a tournament to get started
            </Text>
          </Stack>
        </Card>
      ) : filteredTournaments.length === 0 ? (
        <div className="text-center py-12">
          <Text size="lg" c="dimmed">No tournaments match your search</Text>
        </div>
      ) : (
        <Grid>
          {memoizedTournamentCards}
        </Grid>
      )}

      <TournamentDetailsModal
        opened={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        tournament={selectedTournament}
        onDelete={handleDeleteTournament}
        onAssign={handleAssignTeamsFromModal}
      />

      <AssignTournamentTeamsModal
        isOpen={assignTeamsModalOpen}
        onClose={() => setAssignTeamsModalOpen(false)}
        tournamentId={selectedTournamentForAssignment?.id || ''}
        tournamentName={selectedTournamentForAssignment?.name || ''}
      />
    </div>
  );
}