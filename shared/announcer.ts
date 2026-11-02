/**
 * Announcer defaults. One place, used by the settings API, the settings page and the Discord bot, so the page shows what
 * the bot actually does (they used to disagree: the page said 45 s and a default voice the bot never selected).
 */
/** Voice used until one is picked on the Announcer settings page. */
export const DEFAULT_ANNOUNCER_VOICE = 'wrestling-announcer';
/** Seconds between a match starting and the announcer's opening line. Matches the column default every install has had since v0.6. */
export const DEFAULT_MATCH_START_DELAY_SECONDS = 5;
