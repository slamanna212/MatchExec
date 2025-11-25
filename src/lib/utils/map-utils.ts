/**
 * Map utility functions for cleaning IDs, formatting names, and generating image URLs
 */

/**
 * Remove timestamp suffix from map IDs (format: -timestamp-randomstring)
 * Example: "hanamura-1234567890-abc123" -> "hanamura"
 */
export function cleanMapId(mapId: string): string {
  return mapId.replace(/-\d+-[a-zA-Z0-9]+$/, '');
}

/**
 * Generate image URL for a map
 */
export function getMapImageUrl(gameId: string, mapId: string): string {
  const cleanedMapId = cleanMapId(mapId);
  return `/images/games/${gameId}/maps/${cleanedMapId}.jpg`;
}

/**
 * Format map name with fallback to cleaned ID
 */
export function formatMapName(mapId: string, mapName?: string | null): string {
  if (mapName) return mapName;
  const cleanedId = cleanMapId(mapId);
  // Convert snake_case or kebab-case to Title Case
  return cleanedId
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get status color based on match/map status
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'green';
    case 'ongoing':
    case 'battle':
      return 'blue';
    case 'cancelled':
      return 'red';
    case 'created':
    case 'gather':
    case 'assign':
      return 'yellow';
    default:
      return 'gray';
  }
}
