/**
 * Discord custom ID parsing utilities
 */

export interface ParsedModalId {
  eventId: string;
  selectedTeamId: string | null;
  isTournament: boolean;
}

/**
 * Parse modal custom ID for signup forms
 * Formats:
 * - "signup_form_<matchId>"
 * - "signup_form_team_<tournamentId>_<teamId>"
 * - "signup_form_<tournamentId>" (tournament without team)
 */
export function parseModalCustomId(customId: string): ParsedModalId | null {
  try {
    const isTeamBased = customId.includes('_team_');
    let eventId = '';
    let selectedTeamId: string | null = null;

    if (isTeamBased) {
      // Format: signup_form_team_<tournamentId>_<teamId>
      const parts = customId.split('_');
      const teamIndex = parts.indexOf('team');
      if (teamIndex !== -1 && parts[teamIndex + 1]) {
        eventId = parts[teamIndex + 1];
        selectedTeamId = parts[teamIndex + 2] || null;
      }
    } else {
      // Format: signup_form_<eventId>
      const prefix = 'signup_form_';
      if (customId.startsWith(prefix)) {
        eventId = customId.substring(prefix.length);
      }
    }

    if (!eventId) return null;

    // Determine if it's a tournament (starts with 'T') or match (starts with 'M')
    const isTournament = eventId.startsWith('T');

    return {
      eventId,
      selectedTeamId,
      isTournament
    };
  } catch {
    return null;
  }
}
