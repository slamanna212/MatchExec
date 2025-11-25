/**
 * Shared Discord embed field builders
 */

/**
 * Format Discord mentions for participants
 */
export function formatParticipantMentions(participants: Array<{ discord_id?: string | null }>): string {
  return participants
    .map(p => p.discord_id ? `<@${p.discord_id}>` : 'Unknown')
    .join(', ') || 'None';
}

/**
 * Format team name with fallback
 */
export function formatTeamName(teamName: string | null | undefined, defaultName: string): string {
  return teamName || defaultName;
}

/**
 * Build voice channel field for embed
 */
export function buildVoiceChannelField(channelId: string | null | undefined): { name: string; value: string } | null {
  if (!channelId) return null;

  return {
    name: 'Voice Channel',
    value: `<#${channelId}>`
  };
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength - 3)  }...`;
}
