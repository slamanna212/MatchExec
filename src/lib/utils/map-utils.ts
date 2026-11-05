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
 * Index the maps endpoint's rows by id, also by every mode-specific id.
 *
 * `GET /api/games/:id/maps` lists a game whose maps work in every mode once per map name, under the first mode's id
 * (e.g. `battleisland-nobuild`, mode "All Modes"). A match that picked the same map in another mode stores
 * `battleisland-standard`, which is not in that list, so looking it up by id found nothing and the raw id was shown.
 * Here each such map also gets an entry per mode (never replacing a row that already exists under that id).
 */
export function indexMapsWithModeVariants<T extends { id: string; modeName?: string; modeId?: string | null }>(
  maps: T[],
  modes: ReadonlyArray<{ id: string; name: string }>,
): Record<string, T & { modeName?: string; mode_id?: string }> {
  const byId: Record<string, T & { modeName?: string; mode_id?: string }> = {};
  for (const map of maps) byId[map.id] = map;
  for (const map of maps) {
    if (map.modeName !== 'All Modes') continue; // only the name-deduplicated rows stand for several modes
    // Mode IDs can contain hyphens (e.g. arms-race); remove the whole suffix.
    const sourceModeId = map.modeId ?? modes
      .filter(mode => map.id.endsWith(`-${mode.id}`))
      .sort((a, b) => b.id.length - a.id.length)[0]?.id;
    if (!sourceModeId || !map.id.endsWith(`-${sourceModeId}`)) continue;
    const base = map.id.slice(0, -(sourceModeId.length + 1));
    for (const mode of modes) {
      const key = `${base}-${mode.id}`;
      if (!byId[key]) byId[key] = { ...map, id: key, modeName: mode.name, mode_id: mode.id };
    }
  }
  return byId;
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
