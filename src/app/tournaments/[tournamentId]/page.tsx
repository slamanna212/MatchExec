'use client'

import { logger } from '@/lib/logger/client';
import { use, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Skeleton,
  Container,
  Text,
  Center,
  Stack,
  Grid,
  Breadcrumbs,
  Anchor
} from '@mantine/core';
import { modals } from '@mantine/modals';
import type { Tournament, TournamentTeam, TournamentTeamMember } from '@/shared/types';
import { TournamentInfoPanel } from '@/components/tournament-details/TournamentInfoPanel';
import { TournamentContentPanel } from '@/components/tournament-details/TournamentContentPanel';
import { showError, notificationHelper } from '@/lib/notifications';

// Utility function to properly convert SQLite UTC timestamps to Date objects
const parseDbTimestamp = (timestamp: string | null | undefined): Date | null => {
  if (!timestamp) return null;

  // Check if timestamp already includes timezone info
  if (timestamp.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(timestamp)) {
    return new Date(timestamp);
  }

  // SQLite CURRENT_TIMESTAMP returns format like "2025-08-08 22:52:51" (UTC)
  return new Date(`${timestamp}Z`);
};

interface TournamentWithGame extends Omit<Tournament, 'created_at' | 'updated_at' | 'start_date' | 'start_time'> {
  game_name?: string;
  game_icon?: string;
  game_color?: string;
  participant_count?: number;
  event_image_url?: string;
  created_at: string;
  updated_at: string;
  start_time?: string;
  teams?: TeamWithMembers[];
}

interface TeamWithMembers extends TournamentTeam {
  members: TournamentTeamMember[];
}

interface BracketMatch {
  id: string;
  round: number;
  bracket_type: 'winners' | 'losers' | 'final';
  team1?: { id: string; name: string };
  team2?: { id: string; name: string };
  winner?: string;
  status: 'pending' | 'ongoing' | 'complete';
  rawStatus: string;
  match_order: number;
}

interface BracketAssignment {
  position: number;
  teamId: string;
}

interface TeamStanding {
  team_id: string;
  team_name: string;
  matches_played: number;
  wins: number;
  losses: number;
}

export default function TournamentPage({
  params
}: {
  params: Promise<{ tournamentId: string }>
}) {
  const { tournamentId } = use(params);
  const router = useRouter();
  const [tournament, setTournament] = useState<TournamentWithGame | null>(null);
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(30);

  const hasBracket = matches.length > 0;

  // Fetch matches
  const fetchMatches = useCallback(async (silent = false) => {
    if (!silent) setContentLoading(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/matches`);
      if (response.ok) {
        const data = await response.json();
        setMatches(data.matches || []);
      }
    } catch (err) {
      logger.error('Error fetching tournament matches:', err);
    } finally {
      if (!silent) setContentLoading(false);
    }
  }, [tournamentId]);

  // Fetch standings
  const fetchStandings = useCallback(async () => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/standings`);
      if (response.ok) {
        const data = await response.json();
        setStandings(data.standings || []);
      }
    } catch (err) {
      logger.error('Error fetching tournament standings:', err);
    }
  }, [tournamentId]);

  // Fetch tournament data (includes teams)
  const fetchTournament = useCallback(async () => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}`);
      if (response.ok) {
        const data = await response.json();
        setTournament(data);
        setTeams(data.teams || []);
      }
    } catch (err) {
      logger.error('Error fetching tournament:', err);
    }
  }, [tournamentId]);

  // Fetch UI settings
  useEffect(() => {
    const fetchUISettings = async () => {
      try {
        const response = await fetch('/api/settings/ui');
        if (response.ok) {
          const uiSettings = await response.json();
          setRefreshInterval(uiSettings.auto_refresh_interval_seconds || 30);
        }
      } catch (err) {
        logger.error('Error fetching UI settings:', err);
      }
    };

    fetchUISettings();
  }, []);

  // Initial data fetch
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [tournamentRes, matchesRes, standingsRes] = await Promise.all([
          fetch(`/api/tournaments/${tournamentId}`),
          fetch(`/api/tournaments/${tournamentId}/matches`),
          fetch(`/api/tournaments/${tournamentId}/standings`)
        ]);

        if (!tournamentRes.ok) {
          setError(tournamentRes.status === 404 ? 'Tournament not found' : 'Failed to load tournament');
          return;
        }

        const tournamentData = await tournamentRes.json();
        setTournament(tournamentData);
        setTeams(tournamentData.teams || []);

        if (matchesRes.ok) {
          const matchesData = await matchesRes.json();
          setMatches(matchesData.matches || []);
        }

        if (standingsRes.ok) {
          const standingsData = await standingsRes.json();
          setStandings(standingsData.standings || []);
        }
      } catch (err) {
        logger.error('Error fetching tournament data:', err);
        setError('An error occurred while loading the tournament');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tournamentId]);

  // Auto-refresh matches and standings during battle phase
  useEffect(() => {
    if (!tournament || tournament.status !== 'battle') return undefined;

    const interval = setInterval(() => {
      fetchMatches(true);
      fetchStandings();
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [tournament, refreshInterval, fetchMatches, fetchStandings]);

  // Handle status transition
  const handleStatusTransition = useCallback(async (newStatus: string) => {
    if (!tournament) return;

    const notificationId = `tournament-transition-${tournament.id}`;
    const actionMessages: Record<string, { loading: string; success: string }> = {
      gather: { loading: 'Opening signups...', success: 'Signups opened successfully!' },
      assign: { loading: 'Closing signups...', success: 'Signups closed successfully!' },
      battle: { loading: 'Starting tournament...', success: 'Tournament started successfully!' },
      complete: { loading: 'Ending tournament...', success: 'Tournament ended successfully!' },
    };

    const messages = actionMessages[newStatus] || {
      loading: 'Processing...',
      success: 'Status updated successfully!'
    };

    notificationHelper.loading({ id: notificationId, message: messages.loading });

    try {
      const response = await fetch(`/api/tournaments/${tournament.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newStatus }),
      });

      if (response.ok) {
        const updatedTournament = await response.json();
        setTournament(prev => prev ? { ...prev, ...updatedTournament } : updatedTournament);
        notificationHelper.update(notificationId, { type: 'success', message: messages.success });
      } else {
        const errorData = await response.json();
        notificationHelper.update(notificationId, {
          type: 'error',
          message: errorData.error || 'Failed to update tournament status'
        });
      }
    } catch (err) {
      logger.error('Error transitioning tournament status:', err);
      notificationHelper.update(notificationId, {
        type: 'error',
        message: 'An error occurred while updating the tournament status'
      });
    }
  }, [tournament]);

  // Handle delete
  const handleDelete = useCallback(() => {
    if (!tournament) return;

    modals.openConfirmModal({
      title: 'Delete Tournament',
      children: (
        <Stack gap="sm">
          <Text size="sm">
            Are you sure you want to delete &quot;{tournament.name}&quot;?
          </Text>
          {tournament.status === 'battle' && (
            <Text size="sm" c="orange" fw={500}>
              ⚠️ This tournament has active matches that will also be deleted.
            </Text>
          )}
          {(tournament.participant_count || 0) > 0 && (
            <Text size="sm" c="orange" fw={500}>
              ⚠️ This tournament has {tournament.participant_count} registered participants.
            </Text>
          )}
          <Text size="sm" c="red" fw={500}>This action cannot be undone.</Text>
        </Stack>
      ),
      labels: { confirm: 'Delete Tournament', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/tournaments/${tournament.id}`, { method: 'DELETE' });
          if (response.ok) {
            router.push('/tournaments');
          } else {
            showError('Failed to delete tournament. Please try again.');
          }
        } catch (err) {
          logger.error('Error deleting tournament:', err);
          showError('An error occurred while deleting the tournament.');
        }
      },
    });
  }, [tournament, router]);

  // Handle generate bracket
  const handleGenerateBracket = useCallback(async () => {
    if (!tournament) return;

    const notificationId = `bracket-generation-${tournament.id}`;
    notificationHelper.loading({ id: notificationId, message: 'Generating tournament bracket...' });

    try {
      const response = await fetch(`/api/tournaments/${tournament.id}/generate-matches`, {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        notificationHelper.update(notificationId, {
          type: 'success',
          title: 'Bracket Generated',
          message: result.message || 'Tournament bracket generated successfully'
        });
        await fetchMatches();
      } else {
        const errorData = await response.json();
        notificationHelper.update(notificationId, {
          type: 'error',
          title: 'Bracket Generation Failed',
          message: errorData.error || 'Failed to generate bracket'
        });
      }
    } catch (err) {
      logger.error('Error generating bracket:', err);
      notificationHelper.update(notificationId, {
        type: 'error',
        title: 'Connection Error',
        message: 'Failed to generate bracket'
      });
    }
  }, [tournament, fetchMatches]);

  // Handle progress tournament
  const handleProgressTournament = useCallback(async () => {
    if (!tournament) return;

    try {
      const response = await fetch(`/api/tournaments/${tournament.id}/progress`, {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        notificationHelper.success({
          title: 'Round Advanced',
          message: result.message
        });
        await Promise.all([fetchTournament(), fetchMatches()]);
      } else {
        const errorData = await response.json();
        notificationHelper.error({
          title: 'Progress Failed',
          message: errorData.error || 'Failed to progress tournament'
        });
      }
    } catch (err) {
      logger.error('Error progressing tournament:', err);
      notificationHelper.error({
        title: 'Connection Error',
        message: 'Failed to progress tournament'
      });
    }
  }, [tournament, fetchTournament, fetchMatches]);

  // Handle bracket assignment
  const handleBracketAssignment = useCallback(async (assignments: BracketAssignment[]) => {
    if (!tournament) return;

    try {
      const response = await fetch(`/api/tournaments/${tournament.id}/bracket-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments })
      });

      if (!response.ok) {
        logger.error('Failed to save bracket assignments');
      }
    } catch (err) {
      logger.error('Error saving bracket assignments:', err);
    }
  }, [tournament]);

  // Handle starting a single match
  const handleStartMatch = useCallback(async (matchId: string) => {
    // If tournament hasn't been started yet, start it (which auto-starts all round-1 matches)
    if (tournament?.status === 'assign') {
      await handleStatusTransition('battle');
      await fetchMatches(true);
      return;
    }

    const notificationId = `start-match-${matchId}`;
    notificationHelper.loading({ id: notificationId, message: 'Starting match...' });

    try {
      const response = await fetch(`/api/matches/${matchId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newStatus: 'battle' }),
      });

      if (response.ok) {
        notificationHelper.update(notificationId, { type: 'success', message: 'Match started!' });
        await fetchMatches(true);
      } else {
        const errorData = await response.json();
        notificationHelper.update(notificationId, {
          type: 'error',
          message: errorData.error || 'Failed to start match'
        });
      }
    } catch (err) {
      logger.error('Error starting match:', err);
      notificationHelper.update(notificationId, {
        type: 'error',
        message: 'An error occurred while starting the match'
      });
    }
  }, [fetchMatches, tournament, handleStatusTransition]);

  // Handle starting all gather-phase matches at once
  const handleStartAllMatches = useCallback(async (matchIds: string[]) => {
    // If tournament hasn't been started yet, start it (which auto-starts all round-1 matches)
    if (tournament?.status === 'assign') {
      const notificationId = `start-all-matches-${tournamentId}`;
      notificationHelper.loading({ id: notificationId, message: 'Starting tournament...' });
      await handleStatusTransition('battle');
      notificationHelper.update(notificationId, { type: 'success', message: 'Tournament started and all matches launched!' });
      await fetchMatches(true);
      return;
    }

    const notificationId = `start-all-matches-${tournamentId}`;
    notificationHelper.loading({ id: notificationId, message: `Starting ${matchIds.length} matches...` });

    try {
      await Promise.all(matchIds.map(id =>
        fetch(`/api/matches/${id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newStatus: 'battle' }),
        })
      ));
      notificationHelper.update(notificationId, { type: 'success', message: 'All matches started!' });
      await fetchMatches(true);
    } catch (err) {
      logger.error('Error starting all matches:', err);
      notificationHelper.update(notificationId, {
        type: 'error',
        message: 'An error occurred while starting matches'
      });
    }
  }, [tournamentId, fetchMatches, tournament, handleStatusTransition]);

  if (loading) {
    return (
      <Container>
        <Grid mt="md">
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Stack>
              <Skeleton height={200} radius="md" />
              <Skeleton height={250} radius="md" />
              <Skeleton height={120} radius="md" />
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 8 }}>
            <Skeleton height={40} radius="sm" mb="md" />
            <Skeleton height={400} radius="md" />
          </Grid.Col>
        </Grid>
      </Container>
    );
  }

  if (error || !tournament) {
    return (
      <Container>
        <Center style={{ minHeight: '400px' }}>
          <Stack align="center" gap="md">
            <Text size="xl" fw={600} c="red">
              {error || 'Tournament not found'}
            </Text>
            <Text size="sm" c="dimmed">
              The tournament you&apos;re looking for doesn&apos;t exist or has been deleted.
            </Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  return (
    <div className="container mx-auto py-6 px-2">
      <Stack gap="lg">
        <Breadcrumbs>
          <Anchor onClick={() => router.push('/tournaments')} style={{ cursor: 'pointer' }}>
            Tournaments
          </Anchor>
          <Text>{tournament.name}</Text>
        </Breadcrumbs>

        <Grid>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <TournamentInfoPanel
              tournament={tournament}
              hasBracket={hasBracket}
              parseDbTimestamp={parseDbTimestamp}
              onAssignTeams={() => router.push(`/tournaments/${tournamentId}/assign`)}
              onDelete={handleDelete}
              onStatusTransition={handleStatusTransition}
              onGenerateBracket={handleGenerateBracket}
              onProgressTournament={handleProgressTournament}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 8 }}>
            <TournamentContentPanel
              tournament={tournament}
              teams={teams}
              matches={matches}
              standings={standings}
              loading={contentLoading}
              onGenerateMatches={handleGenerateBracket}
              onBracketAssignment={handleBracketAssignment}
              onStartMatch={handleStartMatch}
              onStartAllMatches={handleStartAllMatches}
            />
          </Grid.Col>
        </Grid>
      </Stack>
    </div>
  );
}
