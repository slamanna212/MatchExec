/**
 * Discord IDs ("snowflakes") are 17-20 digit numbers. The setup flow, the settings pages and the channels API all
 * accepted anything, so a typo only showed up later as a bot that silently failed to post.
 */
export const DISCORD_ID_PATTERN = /^\d{17,20}$/;
export const DISCORD_ID_HINT = 'Discord IDs are 17-20 digit numbers';

export function isDiscordId(value: unknown): value is string {
  return typeof value === 'string' && DISCORD_ID_PATTERN.test(value.trim());
}

/**
 * Error text for a form field, or null when fine. Empty is fine unless `required` (optional fields such as the
 * announcement role may be left blank).
 */
export function discordIdError(value: unknown, label: string, required = false): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return required ? `${label} is required` : null;
  return DISCORD_ID_PATTERN.test(text) ? null : `${label} must be a Discord ID (${DISCORD_ID_HINT.replace('Discord IDs are ', '')})`;
}
