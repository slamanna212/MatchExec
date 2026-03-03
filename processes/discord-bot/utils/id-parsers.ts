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
 * - "signup_form_team:<tournamentId>:<teamId>"
 * - "signup_form_<tournamentId>" (tournament without team)
 */
export function parseModalCustomId(customId: string): ParsedModalId | null {
  try {
    const isTeamBased = customId.startsWith('signup_form_team:');
    let eventId = '';
    let selectedTeamId: string | null = null;

    if (isTeamBased) {
      // Format: signup_form_team:<eventId>:<selectedTeamId>
      const rest = customId.slice('signup_form_team:'.length);
      const colonIdx = rest.indexOf(':');
      if (colonIdx !== -1) {
        eventId = rest.slice(0, colonIdx);
        selectedTeamId = rest.slice(colonIdx + 1);
      }
    } else {
      // Format: signup_form_<eventId>
      const prefix = 'signup_form_';
      if (customId.startsWith(prefix)) {
        eventId = customId.substring(prefix.length);
      }
    }

    if (!eventId) return null;

    // Determine if it's a tournament (starts with 'tournament_') or match (starts with 'match_')
    const isTournament = eventId.startsWith('tournament_');

    return {
      eventId,
      selectedTeamId,
      isTournament
    };
  } catch {
    return null;
  }
}
