/**
 * One mapping per Postgres table (58 legacy domain tables; the SQLite-only `migrations` table is ignored, see
 * IGNORED_LEGACY_TABLES). Typed against the Drizzle schema: every column must be listed (mapping.ts), so a schema change
 * is a type error here until the importer is updated. Import order is derived from the foreign keys (plan.ts).
 *
 * Retired legacy columns (plan D1): matches.blue/red_team_voice_channel, match_games.{team_a,team_b,winner_id,
 * participant_winner_id,participant1_id,participant2_id,is_ffa_mode,score_a,score_b,position_results,points_awarded},
 * match_participants.{team,team_assignment}. They are not copied; consistency.ts compares them with match_teams /
 * match_game_placements during the preflight instead.
 */
import * as schema from '../db/schema';
import { DEFAULT, SAME, defineMapping, derive, from, value, type TableMapping } from './mapping';
import { announcementsFromLegacy } from './legacy-values';

/** Legacy tables that are deliberately not imported. */
export const IGNORED_LEGACY_TABLES = ['migrations'];

export const MAPPINGS: TableMapping[] = [
  defineMapping(schema.activityFeed, 'activity_feed', {
    columns: {
      id: SAME, event_type: SAME, priority: SAME, title: SAME, description: SAME, match_id: SAME,
      tournament_id: SAME, metadata: SAME, created_at: SAME,
    },
  }),
  defineMapping(schema.announcementRoleSettings, 'announcement_role_settings', {
    columns: {
      id: SAME, game_id: SAME, role_id: SAME, created_at: SAME,
    },
  }),
  defineMapping(schema.appSettings, 'app_settings', {
    columns: {
      setting_key: SAME, setting_value: SAME, data_type: SAME, metadata: SAME, created_at: SAME,
      updated_at: SAME,
    },
  }),
  defineMapping(schema.autoVoiceChannels, 'auto_voice_channels', {
    columns: {
      id: SAME, match_id: SAME, channel_id: SAME, team_name: SAME, created_at: SAME,
    },
  }),
  defineMapping(schema.dataVersions, 'data_versions', {
    columns: {
      game_id: SAME, data_version: SAME, seeded_at: SAME,
    },
  }),
  defineMapping(schema.discordAnnouncementQueue, 'discord_announcement_queue', {
    columns: {
      id: SAME, match_id: SAME, announcement_type: SAME, announcement_data: SAME, status: SAME,
      attempts: from('retry_count'), created_at: SAME, processed_at: SAME, posted_at: SAME,
      last_error: from('error_message'), scheduled_for: SAME, max_attempts: DEFAULT, claimed_at: DEFAULT,
      claimed_by: DEFAULT, next_attempt_at: DEFAULT, external_message_id: DEFAULT,
    },
    queue: true,
  }),
  defineMapping(schema.discordBotRequests, 'discord_bot_requests', {
    columns: {
      id: SAME, type: SAME, data: SAME, result: SAME, status: SAME, attempts: from('retry_count'),
      created_at: SAME, processed_at: SAME, updated_at: SAME, max_attempts: DEFAULT, claimed_at: DEFAULT,
      claimed_by: DEFAULT, last_error: DEFAULT, next_attempt_at: DEFAULT,
    },
    queue: true,
  }),
  defineMapping(schema.discordChannels, 'discord_channels', {
    columns: {
      id: SAME, guild_id: SAME, discord_channel_id: SAME, name: SAME, channel_name: SAME, type: SAME,
      channel_type: SAME, parent_id: SAME, send_announcements: SAME, send_reminders: SAME,
      send_match_start: SAME, send_signup_updates: SAME, last_name_refresh: SAME, created_at: SAME,
      updated_at: SAME, send_health_alerts: SAME,
    },
  }),
  defineMapping(schema.discordDeletionQueue, 'discord_deletion_queue', {
    columns: {
      id: SAME, match_id: SAME, status: SAME, attempts: from('retry_count'), created_at: SAME,
      processed_at: SAME, max_attempts: DEFAULT, claimed_at: DEFAULT, claimed_by: DEFAULT,
      last_error: DEFAULT, next_attempt_at: DEFAULT,
    },
    queue: true,
  }),
  defineMapping(schema.discordEvents, 'discord_events', {
    columns: {
      id: SAME, match_id: SAME, event_id: SAME, guild_id: SAME, created_at: SAME,
    },
  }),
  defineMapping(schema.discordHealthAlertQueue, 'discord_health_alert_queue', {
    columns: {
      id: SAME, severity: SAME, title: SAME, description: SAME, status: SAME, created_at: SAME,
      posted_at: SAME, last_error: from('error_message'), attempts: DEFAULT, max_attempts: DEFAULT,
      claimed_at: DEFAULT, claimed_by: DEFAULT, next_attempt_at: DEFAULT, external_message_id: DEFAULT,
      processed_at: DEFAULT,
    },
    queue: true,
  }),
  defineMapping(schema.discordMapCodeQueue, 'discord_map_code_queue', {
    columns: {
      id: SAME, match_id: SAME, user_id: SAME, map_name: SAME, map_code: SAME, status: SAME,
      attempts: from('retry_count'), created_at: SAME, processed_at: SAME, max_attempts: DEFAULT,
      claimed_at: DEFAULT, claimed_by: DEFAULT, last_error: DEFAULT, next_attempt_at: DEFAULT,
    },
    queue: true,
    orphans: { 'match_id': 'skip' },
  }),
  defineMapping(schema.discordMatchEditQueue, 'discord_match_edit_queue', {
    columns: {
      id: SAME, match_id: SAME, status: SAME, attempts: from('retry_count'), created_at: SAME,
      processed_at: SAME, last_error: from('error_message'), max_attempts: DEFAULT, claimed_at: DEFAULT,
      claimed_by: DEFAULT, next_attempt_at: DEFAULT,
    },
    queue: true,
    orphans: { 'match_id': 'skip' },
  }),
  defineMapping(schema.discordMatchMessages, 'discord_match_messages', {
    columns: {
      id: SAME, match_id: SAME, message_id: SAME, channel_id: SAME, thread_id: SAME, discord_event_id: SAME,
      message_type: SAME, created_at: SAME,
    },
  }),
  defineMapping(schema.discordMatchReminderQueue, 'discord_match_reminder_queue', {
    columns: {
      id: SAME, match_id: SAME, reminder_type: SAME, status: SAME, attempts: from('retry_count'),
      scheduled_for: SAME, created_at: SAME, processed_at: SAME, max_attempts: DEFAULT, claimed_at: DEFAULT,
      claimed_by: DEFAULT, last_error: DEFAULT, next_attempt_at: DEFAULT, external_message_id: DEFAULT,
    },
    queue: true,
    orphans: { 'match_id': 'skip' },
  }),
  defineMapping(schema.discordMatchStartQueue, 'discord_match_start_queue', {
    columns: {
      id: SAME, match_id: SAME, status: SAME, attempts: from('retry_count'), created_at: SAME,
      processed_at: SAME, max_attempts: DEFAULT, claimed_at: DEFAULT, claimed_by: DEFAULT,
      last_error: DEFAULT, next_attempt_at: DEFAULT, external_message_id: DEFAULT,
    },
    queue: true,
    orphans: { 'match_id': 'skip' },
  }),
  defineMapping(schema.discordMatchWinnerQueue, 'discord_match_winner_queue', {
    columns: {
      id: SAME, match_id: SAME, match_name: SAME, game_id: SAME, winner: SAME, winning_team_name: SAME,
      winning_players: SAME, team1_score: SAME, team2_score: SAME, total_maps: SAME, status: SAME,
      attempts: from('retry_count'), created_at: SAME, processed_at: SAME, sent_at: SAME,
      last_error: from('error_message'), max_attempts: DEFAULT, claimed_at: DEFAULT, claimed_by: DEFAULT,
      next_attempt_at: DEFAULT, external_message_id: DEFAULT,
    },
    queue: true,
  }),
  defineMapping(schema.discordPlayerReminderQueue, 'discord_player_reminder_queue', {
    columns: {
      id: SAME, match_id: SAME, user_id: SAME, reminder_type: SAME, reminder_time: SAME, status: SAME,
      attempts: from('retry_count'), scheduled_for: SAME, created_at: SAME, processed_at: SAME,
      sent_at: SAME, last_error: from('error_message'), max_attempts: DEFAULT, claimed_at: DEFAULT,
      claimed_by: DEFAULT, next_attempt_at: DEFAULT, external_message_id: DEFAULT,
    },
    queue: true,
    orphans: { 'match_id': 'skip' },
  }),
  defineMapping(schema.discordReminderQueue, 'discord_reminder_queue', {
    columns: {
      id: SAME, match_id: SAME, reminder_type: SAME, minutes_before: SAME, reminder_time: SAME,
      status: SAME, attempts: from('retry_count'), scheduled_for: SAME, created_at: SAME,
      processed_at: SAME, sent_at: SAME, last_error: from('error_message'), max_attempts: DEFAULT,
      claimed_at: DEFAULT, claimed_by: DEFAULT, next_attempt_at: DEFAULT, external_message_id: DEFAULT,
    },
    queue: true,
    orphans: { 'match_id': 'skip' },
  }),
  defineMapping(schema.discordScoreNotificationQueue, 'discord_score_notification_queue', {
    columns: {
      id: SAME, match_id: SAME, game_id: SAME, map_id: SAME, game_number: SAME, winner: SAME,
      winning_team_name: SAME, winning_players: SAME, status: SAME, attempts: from('retry_count'),
      created_at: SAME, processed_at: SAME, sent_at: SAME, last_error: from('error_message'),
      max_attempts: DEFAULT, claimed_at: DEFAULT, claimed_by: DEFAULT, next_attempt_at: DEFAULT,
      external_message_id: DEFAULT,
    },
    queue: true,
    orphans: { 'match_id': 'skip' },
  }),
  defineMapping(schema.discordScorecardPromptQueue, 'discord_scorecard_prompt_queue', {
    columns: {
      id: SAME, match_id: SAME, match_game_id: SAME, map_name: SAME, status: SAME, created_at: SAME,
      updated_at: SAME, attempts: DEFAULT, max_attempts: DEFAULT, claimed_at: DEFAULT, claimed_by: DEFAULT,
      last_error: DEFAULT, next_attempt_at: DEFAULT, external_message_id: DEFAULT, processed_at: DEFAULT,
    },
    queue: true,
    orphans: { 'match_id': 'skip', 'match_game_id': 'skip' },
  }),
  defineMapping(schema.discordSettings, 'discord_settings', {
    columns: {
      id: SAME, guild_id: SAME, bot_token: SAME, application_id: SAME, command_prefix: SAME,
      announcements_channel_id: SAME, results_channel_id: SAME, voice_channel_category_id: SAME,
      announcement_role_id: SAME, mention_everyone: SAME, event_duration_minutes: SAME,
      match_reminder_minutes: SAME, player_reminder_minutes: SAME, announcer_voice: SAME,
      voice_announcements_enabled: SAME, created_at: SAME, updated_at: SAME,
      voice_channel_cleanup_delay_minutes: SAME, match_start_delay_seconds: SAME, winner_vote_enabled: SAME,
      signup_dm_enabled: SAME, commander_dm_enabled: SAME,
    },
  }),
  defineMapping(schema.discordStatsReportQueue, 'discord_stats_report_queue', {
    columns: {
      id: SAME, match_id: SAME, status: SAME, last_error: from('error_message'), created_at: SAME,
      processed_at: SAME, attempts: DEFAULT, max_attempts: DEFAULT, claimed_at: DEFAULT,
      claimed_by: DEFAULT, next_attempt_at: DEFAULT,
    },
    queue: true,
    orphans: { 'match_id': 'skip' },
  }),
  defineMapping(schema.discordStatusUpdateQueue, 'discord_status_update_queue', {
    columns: {
      id: SAME, match_id: SAME, new_status: SAME, status: SAME, attempts: from('retry_count'),
      created_at: SAME, processed_at: SAME, last_error: from('error_message'), max_attempts: DEFAULT,
      claimed_at: DEFAULT, claimed_by: DEFAULT, next_attempt_at: DEFAULT,
    },
    queue: true,
  }),
  defineMapping(schema.discordVoiceAnnouncementQueue, 'discord_voice_announcement_queue', {
    columns: {
      id: SAME, match_id: SAME, announcement_type: SAME, blue_team_voice_channel: SAME,
      red_team_voice_channel: SAME, first_team: SAME, status: SAME, attempts: from('retry_count'),
      created_at: SAME, processed_at: SAME, updated_at: SAME, completed_at: SAME,
      last_error: from('error_message'), timeout_at: SAME, first_attempted_at: SAME, max_attempts: DEFAULT,
      claimed_at: DEFAULT, claimed_by: DEFAULT, next_attempt_at: DEFAULT,
    },
    queue: true,
    orphans: { 'match_id': 'skip' },
  }),
  defineMapping(schema.discordWinnerVoteMessages, 'discord_winner_vote_messages', {
    columns: {
      id: SAME, match_id: SAME, match_game_id: SAME, discord_user_id: SAME, discord_message_id: SAME,
      participant_id: SAME, team_side: SAME, voted_for: SAME, created_at: SAME,
    },
    orphans: { 'match_id': 'skip', 'match_game_id': 'skip' },
  }),
  defineMapping(schema.discordWinnerVoteQueue, 'discord_winner_vote_queue', {
    columns: {
      id: SAME, match_id: SAME, match_game_id: SAME, map_name: SAME, status: SAME,
      attempts: from('retry_count'), created_at: SAME, updated_at: SAME, max_attempts: DEFAULT,
      claimed_at: DEFAULT, claimed_by: DEFAULT, last_error: DEFAULT, next_attempt_at: DEFAULT,
      external_message_id: DEFAULT, processed_at: DEFAULT,
    },
    queue: true,
    orphans: { 'match_id': 'skip', 'match_game_id': 'skip' },
  }),
  defineMapping(schema.gameMaps, 'game_maps', {
    columns: {
      id: SAME, game_id: SAME, name: SAME, mode_id: SAME, image_url: SAME, location: SAME, created_at: SAME,
      updated_at: SAME, tournament_enabled: SAME,
    },
    // Seeded reference data: a map whose mode no longer exists keeps the map but loses the mode link.
    orphans: { 'mode_id,game_id': 'null' },
  }),
  defineMapping(schema.gameModes, 'game_modes', {
    columns: {
      id: SAME, game_id: SAME, name: SAME, description: SAME, team_size: SAME, max_teams: SAME,
      scoring_type: SAME, created_at: SAME, updated_at: SAME, max_players: SAME, setup_components: SAME,
    },
  }),
  defineMapping(schema.gameStatDefinitions, 'game_stat_definitions', {
    columns: {
      id: SAME, game_id: SAME, name: SAME, display_name: SAME, stat_type: SAME, category: SAME,
      sort_order: SAME, is_primary: SAME, format: SAME, chart_type: SAME,
    },
  }),
  defineMapping(schema.games, 'games', {
    columns: {
      id: SAME, name: SAME, genre: SAME, developer: SAME, release_date: SAME, version: SAME,
      description: SAME, min_players: SAME, max_players: SAME, max_signups: SAME, icon_url: SAME,
      cover_url: SAME, color: SAME, supports_all_modes: SAME, map_codes_supported: SAME, created_at: SAME,
      updated_at: SAME, scoring_config: SAME, ai_screenshot_notes: SAME,
    },
  }),
  defineMapping(schema.healthAlertsSent, 'health_alerts_sent', {
    columns: {
      id: SAME, alert_type: SAME, last_sent_at: SAME,
    },
  }),
  defineMapping(schema.matchGamePlacements, 'match_game_placements', {
    columns: {
      id: SAME, match_game_id: SAME, entity_type: SAME, entity_id: SAME, position: SAME, score: SAME,
      points_awarded: SAME, is_winner: SAME, created_at: SAME,
    },
  }),
  defineMapping(schema.matchGames, 'match_games', {
    columns: {
      id: SAME, match_id: SAME, round: SAME, map_id: SAME, status: SAME, started_at: SAME,
      completed_at: SAME, notes: SAME, created_at: SAME, updated_at: SAME, discord_notified: SAME,
    },
    dropped: ['team_a', 'team_b', 'winner_id', 'participant_winner_id', 'participant1_id', 'participant2_id', 'is_ffa_mode', 'score_a', 'score_b', 'position_results', 'points_awarded'],
  }),
  defineMapping(schema.matchParticipants, 'match_participants', {
    columns: {
      id: SAME, match_id: SAME, user_id: SAME, discord_user_id: SAME, username: SAME, signup_data: SAME,
      joined_at: SAME, receives_map_codes: SAME, avatar_url: SAME, last_avatar_check: SAME,
      failed_avatar_checks: SAME, team_id: SAME, grid_position: SAME, qualifying_time_ms: SAME,
    },
    dropped: ['team', 'team_assignment'],
  }),
  defineMapping(schema.matchPlayerStats, 'match_player_stats', {
    columns: {
      id: SAME, match_id: SAME, participant_id: SAME, total_stats_json: SAME, maps_played: SAME,
      stat_image_url: SAME, stat_image_sent: SAME, created_at: SAME, updated_at: SAME, stats_dm_sent: SAME,
    },
  }),
  defineMapping(schema.matchTeams, 'match_teams', {
    columns: {
      id: SAME, match_id: SAME, team_name: SAME, team_color: SAME, team_order: SAME, voice_channel_id: SAME,
      is_reserve: SAME,
    },
    // Known repair: a team created before migration 019 carried its Discord voice channel only in the retired
    // matches.blue/red_team_voice_channel columns; keep it so the bot can still clean the channel up.
    post: (row, _src, ctx) => {
      if (row.voice_channel_id != null || row.is_reserve) return;
      const legacy = ctx.hints.legacyVoiceChannels.get(String(row.match_id));
      const channel = row.team_order === 0 ? legacy?.blue : row.team_order === 1 ? legacy?.red : null;
      if (channel) {
        row.voice_channel_id = channel;
        ctx.repair('voice_channel_from_legacy_match_column', 'voice_channel_id', `filled from matches.${row.team_order === 0 ? 'blue' : 'red'}_team_voice_channel`);
      }
    },
  }),
  defineMapping(schema.matchVoiceAlternation, 'match_voice_alternation', {
    columns: {
      match_id: SAME, current_team: SAME, last_first_team: SAME, last_updated_at: SAME, updated_at: SAME,
    },
    // Known orphan pattern: the old match delete never removed this per-match announcer state (249 rows for 23 matches in
    // the dev database); it is meaningless without its match.
    orphans: { match_id: 'skip' },
  }),
  defineMapping(schema.matches, 'matches', {
    columns: {
      id: SAME, game_id: SAME, mode_id: SAME, name: SAME, description: SAME, start_date: SAME,
      start_time: SAME, end_time: SAME, status: SAME, max_participants: SAME, current_participants: SAME,
      winner_team: SAME, map_codes: SAME, guild_id: SAME, channel_id: SAME, match_format: SAME, maps: SAME,
      rules: SAME, rounds: SAME, livestream_link: SAME, event_image_url: SAME, player_notifications: SAME,
      announcements: value((src) => announcementsFromLegacy(src.announcements)), created_at: SAME, updated_at: SAME, tournament_id: SAME,
      bracket_type: SAME,
      bracket_round: SAME, red_team_id: SAME, blue_team_id: SAME, tournament_round: SAME,
      tournament_bracket_type: SAME, team1_name: SAME, team2_name: SAME, map_id: SAME, stats_enabled: SAME,
      team_count: SAME, position_scoring_override: SAME,
    },
    dropped: ['blue_team_voice_channel', 'red_team_voice_channel'],
  }),
  defineMapping(schema.schedulerSettings, 'scheduler_settings', {
    columns: {
      id: SAME, match_cleanup_cron: SAME, match_check_cron: SAME, reminder_check_cron: SAME,
      cleanup_check_cron: SAME, channel_refresh_cron: SAME, queue_processing_cron: SAME,
      cleanup_retention_days: SAME, created_at: SAME, updated_at: SAME,
    },
  }),
  defineMapping(schema.scorecardDmMessages, 'scorecard_dm_messages', {
    columns: {
      id: SAME, match_id: SAME, match_game_id: SAME, discord_user_id: SAME, discord_message_id: SAME,
      participant_id: SAME, team_side: SAME, created_at: SAME,
    },
    orphans: { 'match_id': 'skip', 'match_game_id': 'skip' },
  }),
  defineMapping(schema.scorecardPlayerStats, 'scorecard_player_stats', {
    columns: {
      id: SAME, submission_id: SAME, match_id: SAME, match_game_id: SAME, participant_id: SAME,
      extracted_player_name: SAME, extracted_hero: SAME, team_side: SAME, stats_json: SAME,
      assignment_status: SAME, confidence_score: SAME, created_at: SAME, updated_at: SAME, team_id: SAME,
    },
  }),
  defineMapping(schema.scorecardSubmissions, 'scorecard_submissions', {
    columns: {
      id: SAME, match_id: SAME, match_game_id: SAME, submitted_by_participant_id: SAME,
      submitted_by_discord_user_id: SAME, team_side: SAME, screenshot_url: SAME, discord_message_id: SAME,
      ai_raw_response: SAME, ai_extraction_status: SAME, ai_error_message: SAME, review_status: SAME,
      reviewed_at: SAME, created_at: SAME, updated_at: SAME, ai_processing_log: SAME,
      suggested_positions: SAME,
    },
  }),
  defineMapping(schema.series, 'series', {
    columns: {
      id: SAME, name: SAME, description: SAME, status: SAME, scoring_config: SAME, start_date: SAME,
      end_date: SAME, event_image_url: SAME, game_id: SAME, guild_id: SAME, channel_id: SAME,
      announcements: SAME, player_notifications: SAME, livestream_link: SAME, created_at: SAME,
      updated_at: SAME,
    },
  }),
  defineMapping(schema.seriesEvents, 'series_events', {
    columns: {
      id: SAME, series_id: SAME, event_type: SAME, match_id: SAME, tournament_id: SAME, event_order: SAME,
      event_date: SAME, points_multiplier: SAME,
    },
  }),
  defineMapping(schema.statsImageQueue, 'stats_image_queue', {
    columns: {
      id: SAME, match_id: SAME, status: SAME, last_error: from('error_message'), created_at: SAME,
      updated_at: SAME, attempts: DEFAULT, max_attempts: DEFAULT, claimed_at: DEFAULT, claimed_by: DEFAULT,
      next_attempt_at: DEFAULT, processed_at: DEFAULT,
    },
    queue: true,
    orphans: { 'match_id': 'skip' },
  }),
  defineMapping(schema.statsProcessingQueue, 'stats_processing_queue', {
    columns: {
      id: SAME, submission_id: SAME, match_id: SAME, match_game_id: SAME, status: SAME,
      last_error: from('error_message'), attempts: from('retry_count'), created_at: SAME, updated_at: SAME,
      max_attempts: DEFAULT, claimed_at: DEFAULT, claimed_by: DEFAULT, next_attempt_at: DEFAULT,
      processed_at: DEFAULT,
    },
    queue: true,
    orphans: { 'submission_id': 'skip', 'match_id': 'skip', 'match_game_id': 'skip' },
  }),
  defineMapping(schema.statsSettings, 'stats_settings', {
    columns: {
      id: SAME, enabled: SAME, ai_provider: SAME, ai_api_key: SAME, ai_model: SAME,
      ai_providers_config: SAME, google_api_key: SAME, openrouter_api_key: SAME, both_sides_required: SAME,
      auto_advance_on_match: SAME, created_at: SAME, updated_at: SAME, stats_report_dm_enabled: SAME,
    },
  }),
  defineMapping(schema.teamVoiceChannels, 'team_voice_channels', {
    columns: {
      id: SAME, match_id: SAME, team_name: SAME, channel_id: SAME, created_at: SAME,
    },
  }),
  defineMapping(schema.tournamentMatches, 'tournament_matches', {
    columns: {
      match_id: SAME, tournament_id: SAME, round: SAME, bracket_type: SAME, team1_id: SAME, team2_id: SAME,
      match_order: SAME, parent_match1_id: SAME, parent_match2_id: SAME, created_at: SAME,
    },
  }),
  defineMapping(schema.tournamentParticipants, 'tournament_participants', {
    columns: {
      id: SAME, tournament_id: SAME, user_id: SAME, username: SAME, joined_at: SAME,
      discord_user_id: derive((src, ctx) => {
        if (src.discord_user_id !== null && src.discord_user_id !== undefined && src.discord_user_id !== '') return src.discord_user_id;
        ctx.repair('tournament_participant_discord_id', 'discord_user_id', 'NULL discord_user_id replaced by user_id');
        return src.user_id;
      }),
      signup_data: SAME, team_assignment: SAME,
    },
  }),
  defineMapping(schema.tournamentRoundByes, 'tournament_round_byes', {
    columns: {
      id: SAME, tournament_id: SAME, round: SAME, bracket_type: SAME, team_id: SAME, created_at: SAME,
    },
  }),
  defineMapping(schema.tournamentTeamMembers, 'tournament_team_members', {
    columns: {
      id: SAME, team_id: SAME, user_id: SAME, discord_user_id: SAME, username: SAME, joined_at: SAME,
      is_captain: SAME,
    },
  }),
  defineMapping(schema.tournamentTeams, 'tournament_teams', {
    columns: {
      id: SAME, tournament_id: SAME, team_name: SAME, created_at: SAME,
    },
  }),
  defineMapping(schema.tournaments, 'tournaments', {
    columns: {
      id: SAME, name: SAME, description: SAME, format: SAME, status: SAME, game_id: SAME,
      rounds_per_match: SAME, ruleset: SAME, max_participants: SAME, start_date: SAME, start_time: SAME,
      event_image_url: SAME, signup_config_id: SAME, allow_player_team_selection: SAME, created_at: SAME,
      updated_at: SAME, allow_match_editing: SAME, stats_enabled: SAME, game_mode_id: SAME,
      announcements: value((src) => announcementsFromLegacy(src.announcements)), player_notifications: SAME, livestream_link: SAME,
      position_scoring_override: SAME,
    },
  }),
  defineMapping(schema.uiSettings, 'ui_settings', {
    columns: {
      id: SAME, theme: SAME, language: SAME, timezone: SAME, date_format: SAME, time_format: SAME,
      auto_refresh_interval_seconds: SAME, created_at: SAME, updated_at: SAME,
    },
  }),
  defineMapping(schema.voiceDataVersions, 'voice_data_versions', {
    columns: {
      voice_type: SAME, data_version: SAME, seeded_at: SAME,
    },
  }),
  defineMapping(schema.voices, 'voices', {
    columns: {
      id: SAME, name: SAME, path: SAME, updated_at: SAME, created_at: SAME,
    },
  }),
];
