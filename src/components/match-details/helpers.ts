interface MatchGameResult {
  id: string;
  match_id: string;
  round: number;
  map_id: string;
  map_name: string;
  winner_id?: string;
  status: 'pending' | 'ongoing' | 'completed';
}

interface MapWinner {
  team: string;
  color: string;
}

type ReminderStatus = 'pending' | 'sent' | 'failed' | 'processed' | 'completed' | 'scheduled';

/**
 * Get color for reminder status badge
 */
export function getReminderStatusColor(status: ReminderStatus): string {
  if (status === 'sent' || status === 'processed' || status === 'completed') {
    return 'green';
  }
  if (status === 'failed') {
    return 'red';
  }
  if (status === 'scheduled') {
    return 'blue';
  }
  return 'yellow';
}

/**
 * Format reminder status text for display
 */
export function formatReminderStatus(status: ReminderStatus): string {
  if (status === 'processed' || status === 'completed') {
    return 'Sent';
  }
  if (status === 'scheduled') {
    return 'Scheduled';
  }
  if (status === 'pending') {
    return 'Pending';
  }
  if (status === 'failed') {
    return 'Failed';
  }
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

/**
 * Get winner information for a specific map
 */
export function getMapWinner(mapId: string, matchGames: MatchGameResult[]): MapWinner | null {
  const game = matchGames.find(g => g.map_id === mapId);
  if (!game || !game.winner_id) return null;

  return {
    team: game.winner_id === 'team1' ? 'Blue Team' : 'Red Team',
    color: game.winner_id === 'team1' ? 'blue' : 'red'
  };
}

/**
 * Extract game mode name from map ID with fallback formatting
 */
export function extractModeNameFromMapId(cleanMapId: string): string {
  const parts = cleanMapId.split('-');
  const lastPart = parts[parts.length - 1];

  if (lastPart === 'bomb') return 'Bomb';
  if (lastPart === 'hostage') return 'Hostage';
  if (lastPart === 'secure-area') return 'Secure Area';

  return lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
}

/**
 * Clean map ID by removing instance suffixes
 */
export function cleanMapId(mapId: string): string {
  return mapId.replace(/-\d+-[a-zA-Z0-9]+$/, '');
}
