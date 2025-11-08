import type { MatchFormData, SelectedMapCard } from './useMatchForm';
import { logger } from '@/lib/logger/client';

/**
 * Converts local date/time to UTC
 */
export function convertToUTC(date: string, time: string): Date {
  const localDateTime = new Date(`${date}T${time}`);
  return localDateTime;
}

/**
 * Builds match payload from form data
 */
export function buildMatchPayload(formData: Partial<MatchFormData>) {
  if (!formData.name || !formData.date || !formData.time || !formData.gameId) {
    throw new Error('Missing required fields');
  }

  const utcDateTime = convertToUTC(formData.date, formData.time);

  return {
    name: formData.name,
    description: formData.description || '',
    gameId: formData.gameId,
    startDate: utcDateTime.toISOString(),
    livestreamLink: formData.livestreamLink || '',
    rules: formData.rules,
    rounds: (formData.maps || []).length || 1,
    maps: formData.maps || [],
    eventImageUrl: formData.eventImageUrl || null,
    playerNotifications: formData.playerNotifications ?? true,
    announcementVoiceChannel: formData.announcementVoiceChannel || null,
    announcements: formData.announcements || []
  };
}

/**
 * Saves map notes for a match
 */
export async function saveMapNotes(matchId: string, selectedMaps: SelectedMapCard[]): Promise<void> {
  const mapNotesToSave = selectedMaps
    .filter(map => map.note && map.note.trim())
    .map(map => ({ mapId: map.id, note: map.note!.trim() }));

  if (mapNotesToSave.length === 0) return;

  try {
    for (const mapNote of mapNotesToSave) {
      await fetch(`/api/matches/${matchId}/map-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapNote),
      });
    }
  } catch (error) {
    logger.error('Error saving map notes:', error);
    throw error;
  }
}

/**
 * Starts match signups by transitioning to gather stage
 */
export async function startMatchSignups(matchId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/matches/${matchId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newStatus: 'gather' }),
    });

    if (response.ok) {
      logger.info(`✅ Match created and moved to gather stage`);
      return true;
    }

    logger.warning('Match created but failed to start signups automatically');
    return false;
  } catch (error) {
    logger.error('Error transitioning match to gather stage:', error);
    return false;
  }
}
