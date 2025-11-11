/**
 * Custom hook for fetching match games data
 */

import { useState, useEffect } from 'react';
import { logger } from '@/lib/logger/client';

export interface MatchGame {
  id: string;
  match_id: string;
  round: number;
  map_id: string;
  map_name: string;
  image_url?: string;
  mode_id: string;
  mode_scoring_type?: 'Normal' | 'FFA' | 'Position';
  game_id: string;
  status: 'pending' | 'ongoing' | 'completed';
  winner_id?: string;
  participant_winner_id?: string;
  is_ffa_mode?: boolean;
}

export interface MatchParticipant {
  id: string;
  username: string;
  team_assignment?: string;
}

export interface UseMatchGamesDataResult {
  matchGames: MatchGame[];
  participants: MatchParticipant[];
  team1Name: string | null;
  team2Name: string | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMatchGamesData(matchId: string): UseMatchGamesDataResult {
  const [matchGames, setMatchGames] = useState<MatchGame[]>([]);
  const [participants, setParticipants] = useState<MatchParticipant[]>([]);
  const [team1Name, setTeam1Name] = useState<string | null>(null);
  const [team2Name, setTeam2Name] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGamesData = async (): Promise<MatchGame[]> => {
    const url = `/api/matches/${matchId}/games?t=${Date.now()}`;
    logger.debug('useMatchGamesData: Fetching from URL:', url);

    let response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });

    logger.debug('useMatchGamesData: Response received:', response.status, response.statusText);

    if (!response.ok) {
      response = await handleFailedGamesResponse(response);
    }

    const responseData = await response.json();
    logger.debug('useMatchGamesData: Response data:', responseData);

    return responseData.games || [];
  };

  const handleFailedGamesResponse = async (response: Response): Promise<Response> => {
    const errorMessage = await extractErrorMessage(response);

    if (response.status === 405) {
      return await retryGamesRequest(errorMessage);
    }

    throw new Error(errorMessage);
  };

  const extractErrorMessage = async (response: Response): Promise<string> => {
    let errorMessage = `HTTP ${response.status}: Failed to load match games`;

    try {
      const responseText = await response.text();
      logger.debug('useMatchGamesData: Error response body:', responseText);

      if (responseText.trim()) {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error || errorMessage;
      }
    } catch (jsonError) {
      logger.error('Failed to parse error response as JSON:', jsonError);
    }

    return errorMessage;
  };

  const retryGamesRequest = async (fallbackError: string): Promise<Response> => {
    logger.debug('useMatchGamesData: Got 405, retrying after delay...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    const retryResponse = await fetch(`/api/matches/${matchId}/games?retry=${Date.now()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });

    if (retryResponse.ok) {
      logger.debug('useMatchGamesData: Retry successful');
      return retryResponse;
    }

    throw new Error(fallbackError);
  };

  const fetchParticipantsData = async (): Promise<MatchParticipant[]> => {
    const participantsResponse = await fetch(`/api/matches/${matchId}/participants`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!participantsResponse.ok) {
      return [];
    }

    const participantsData = await participantsResponse.json();
    return participantsData.participants || [];
  };

  const fetchTeamNames = async (): Promise<{ team1: string | null; team2: string | null }> => {
    const matchResponse = await fetch(`/api/matches/${matchId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!matchResponse.ok) {
      return { team1: null, team2: null };
    }

    const matchData = await matchResponse.json();
    return {
      team1: matchData.team1_name || null,
      team2: matchData.team2_name || null
    };
  };

  const fetchMatchData = async () => {
    if (!matchId || matchId.trim() === '') {
      logger.debug('useMatchGamesData: Waiting for valid matchId');
      setLoading(true);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const games = await fetchGamesData();
      setMatchGames(games);

      const participants = await fetchParticipantsData();
      setParticipants(participants);

      const { team1, team2 } = await fetchTeamNames();
      setTeam1Name(team1);
      setTeam2Name(team2);
    } catch (err) {
      logger.error('useMatchGamesData: Error fetching match data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load match data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatchData();
  }, [matchId]);

  return {
    matchGames,
    participants,
    team1Name,
    team2Name,
    loading,
    error,
    refetch: fetchMatchData
  };
}
