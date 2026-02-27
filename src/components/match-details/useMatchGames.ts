import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/lib/logger/client';

interface MatchGameResult {
  id: string;
  match_id: string;
  round: number;
  map_id: string;
  map_name: string;
  winner_id?: string;
  status: 'pending' | 'ongoing' | 'completed';
}

interface Match {
  id: string;
  status: string;
}

export function useMatchGames(match: Match | null, opened: boolean) {
  const [matchGames, setMatchGames] = useState<MatchGameResult[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);

  const fetchMatchGames = useCallback(async () => {
    if (!match || !opened) return;
    if (match.status !== 'battle' && match.status !== 'complete') return;

    try {
      setGamesLoading(true);
      const response = await fetch(`/api/matches/${match.id}/games`);
      if (response.ok) {
        const data = await response.json();
        setMatchGames(data.games || []);
      }
    } catch (error) {
      logger.error('Failed to fetch match games:', error);
    } finally {
      setGamesLoading(false);
    }
  }, [match, opened]);

  useEffect(() => {
    fetchMatchGames();
  }, [fetchMatchGames]);

  return { matchGames, gamesLoading, refetch: fetchMatchGames };
}
