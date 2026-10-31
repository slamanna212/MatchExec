CREATE SCHEMA "control";
--> statement-breakpoint
CREATE TABLE "data_versions" (
	"game_id" text PRIMARY KEY NOT NULL,
	"data_version" text NOT NULL,
	"seeded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_maps" (
	"id" text NOT NULL,
	"game_id" text NOT NULL,
	"name" text NOT NULL,
	"mode_id" text,
	"image_url" text,
	"location" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tournament_enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "game_maps_id_game_id_pk" PRIMARY KEY("id","game_id")
);
--> statement-breakpoint
CREATE TABLE "game_modes" (
	"id" text NOT NULL,
	"game_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"team_size" integer DEFAULT 1,
	"max_teams" integer DEFAULT 2 NOT NULL,
	"scoring_type" text DEFAULT 'Normal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"max_players" integer,
	"setup_components" jsonb,
	CONSTRAINT "game_modes_id_game_id_pk" PRIMARY KEY("id","game_id")
);
--> statement-breakpoint
CREATE TABLE "game_stat_definitions" (
	"id" text NOT NULL,
	"game_id" text NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"stat_type" text DEFAULT 'number' NOT NULL,
	"category" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"format" text,
	"chart_type" text DEFAULT 'bar' NOT NULL,
	CONSTRAINT "game_stat_definitions_id_game_id_pk" PRIMARY KEY("id","game_id")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"genre" text,
	"developer" text,
	"release_date" date,
	"version" text,
	"description" text,
	"min_players" integer,
	"max_players" integer,
	"max_signups" integer,
	"icon_url" text,
	"cover_url" text,
	"color" text,
	"supports_all_modes" boolean DEFAULT false NOT NULL,
	"map_codes_supported" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scoring_config" jsonb,
	"ai_screenshot_notes" text
);
--> statement-breakpoint
CREATE TABLE "voice_data_versions" (
	"voice_type" text PRIMARY KEY NOT NULL,
	"data_version" text NOT NULL,
	"seeded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voices" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_game_placements" (
	"id" text PRIMARY KEY NOT NULL,
	"match_game_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"position" integer,
	"score" integer,
	"points_awarded" integer,
	"is_winner" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_game_placements_match_game_id_entity_type_entity_id_unique" UNIQUE("match_game_id","entity_type","entity_id"),
	CONSTRAINT "match_game_placements_entity_type_check" CHECK ("match_game_placements"."entity_type" IN ('team', 'participant'))
);
--> statement-breakpoint
CREATE TABLE "match_games" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"map_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"discord_notified" boolean DEFAULT false NOT NULL,
	CONSTRAINT "match_games_match_id_round_unique" UNIQUE("match_id","round"),
	CONSTRAINT "match_games_status_check" CHECK ("match_games"."status" IN ('pending', 'ongoing', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "match_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"user_id" text NOT NULL,
	"discord_user_id" text,
	"username" text NOT NULL,
	"signup_data" jsonb,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"receives_map_codes" boolean DEFAULT false NOT NULL,
	"avatar_url" text,
	"last_avatar_check" timestamp with time zone,
	"failed_avatar_checks" integer DEFAULT 0 NOT NULL,
	"team_id" text,
	"grid_position" integer,
	"qualifying_time_ms" integer,
	CONSTRAINT "match_participants_match_id_user_id_unique" UNIQUE("match_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "match_player_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"total_stats_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"maps_played" integer DEFAULT 0 NOT NULL,
	"stat_image_url" text,
	"stat_image_sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stats_dm_sent" boolean DEFAULT false NOT NULL,
	CONSTRAINT "match_player_stats_match_id_participant_id_unique" UNIQUE("match_id","participant_id")
);
--> statement-breakpoint
CREATE TABLE "match_teams" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"team_name" text NOT NULL,
	"team_color" text,
	"team_order" integer NOT NULL,
	"voice_channel_id" text,
	"is_reserve" boolean DEFAULT false NOT NULL,
	CONSTRAINT "match_teams_match_id_team_order_unique" UNIQUE("match_id","team_order")
);
--> statement-breakpoint
CREATE TABLE "match_voice_alternation" (
	"match_id" text PRIMARY KEY NOT NULL,
	"current_team" text NOT NULL,
	"last_first_team" text,
	"last_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"mode_id" text,
	"name" text NOT NULL,
	"description" text,
	"start_date" timestamp with time zone NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone,
	"status" text DEFAULT 'created' NOT NULL,
	"max_participants" integer,
	"current_participants" integer DEFAULT 0 NOT NULL,
	"winner_team" text,
	"map_codes" jsonb,
	"guild_id" text,
	"channel_id" text,
	"match_format" text DEFAULT 'casual' NOT NULL,
	"maps" jsonb,
	"rules" text,
	"rounds" integer,
	"livestream_link" text,
	"event_image_url" text,
	"player_notifications" boolean DEFAULT true NOT NULL,
	"announcements" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tournament_id" text,
	"bracket_type" text,
	"bracket_round" integer,
	"red_team_id" text,
	"blue_team_id" text,
	"tournament_round" integer,
	"tournament_bracket_type" text,
	"team1_name" text,
	"team2_name" text,
	"map_id" text,
	"stats_enabled" boolean DEFAULT false NOT NULL,
	"team_count" integer DEFAULT 2 NOT NULL,
	"position_scoring_override" jsonb,
	CONSTRAINT "matches_status_check" CHECK ("matches"."status" IN ('created', 'gather', 'assign', 'battle', 'complete', 'cancelled')),
	CONSTRAINT "matches_bracket_type_check" CHECK ("matches"."bracket_type" IN ('winners', 'losers', 'final'))
);
--> statement-breakpoint
CREATE TABLE "tournament_matches" (
	"match_id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"round" integer NOT NULL,
	"bracket_type" text NOT NULL,
	"team1_id" text,
	"team2_id" text,
	"match_order" integer NOT NULL,
	"parent_match1_id" text,
	"parent_match2_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_matches_bracket_type_check" CHECK ("tournament_matches"."bracket_type" IN ('winners', 'losers', 'final'))
);
--> statement-breakpoint
CREATE TABLE "tournament_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"user_id" text NOT NULL,
	"discord_user_id" text NOT NULL,
	"username" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"signup_data" jsonb,
	"team_assignment" text,
	CONSTRAINT "tournament_participants_tournament_id_user_id_unique" UNIQUE("tournament_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "tournament_round_byes" (
	"id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"round" integer NOT NULL,
	"bracket_type" text NOT NULL,
	"team_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_round_byes_tournament_id_round_bracket_type_team_id_unique" UNIQUE("tournament_id","round","bracket_type","team_id")
);
--> statement-breakpoint
CREATE TABLE "tournament_team_members" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"discord_user_id" text,
	"username" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_captain" boolean DEFAULT false NOT NULL,
	CONSTRAINT "tournament_team_members_team_id_user_id_unique" UNIQUE("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "tournament_teams" (
	"id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"team_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"format" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"game_id" text NOT NULL,
	"rounds_per_match" integer NOT NULL,
	"ruleset" text DEFAULT 'casual' NOT NULL,
	"max_participants" integer,
	"start_date" timestamp with time zone,
	"start_time" timestamp with time zone,
	"event_image_url" text,
	"signup_config_id" text,
	"allow_player_team_selection" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"allow_match_editing" boolean DEFAULT true NOT NULL,
	"stats_enabled" boolean DEFAULT false NOT NULL,
	"game_mode_id" text,
	"announcements" jsonb,
	"player_notifications" boolean DEFAULT true NOT NULL,
	"livestream_link" text,
	"position_scoring_override" jsonb,
	CONSTRAINT "tournaments_format_check" CHECK ("tournaments"."format" IN ('single-elimination', 'double-elimination', 'cumulative-points')),
	CONSTRAINT "tournaments_status_check" CHECK ("tournaments"."status" IN ('created', 'gather', 'assign', 'battle', 'complete', 'cancelled')),
	CONSTRAINT "tournaments_ruleset_check" CHECK ("tournaments"."ruleset" IN ('casual', 'competitive'))
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'created' NOT NULL,
	"scoring_config" jsonb,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"event_image_url" text,
	"game_id" text,
	"guild_id" text,
	"channel_id" text,
	"announcements" boolean DEFAULT true NOT NULL,
	"player_notifications" boolean DEFAULT true NOT NULL,
	"livestream_link" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_status_check" CHECK ("series"."status" IN ('created', 'active', 'complete', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "series_events" (
	"id" text PRIMARY KEY NOT NULL,
	"series_id" text NOT NULL,
	"event_type" text NOT NULL,
	"match_id" text,
	"tournament_id" text,
	"event_order" integer NOT NULL,
	"event_date" timestamp with time zone,
	"points_multiplier" double precision DEFAULT 1 NOT NULL,
	CONSTRAINT "series_events_series_id_event_order_unique" UNIQUE("series_id","event_order"),
	CONSTRAINT "series_events_event_type_check" CHECK ("series_events"."event_type" IN ('match', 'tournament')),
	CONSTRAINT "series_events_event_type_target_check" CHECK (("series_events"."event_type" = 'match' AND "series_events"."match_id" IS NOT NULL AND "series_events"."tournament_id" IS NULL) OR ("series_events"."event_type" = 'tournament' AND "series_events"."tournament_id" IS NOT NULL AND "series_events"."match_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "announcement_role_settings" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "announcement_role_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"game_id" text NOT NULL,
	"role_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_role_settings_game_id_role_id_unique" UNIQUE("game_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "auto_voice_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"team_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"discord_channel_id" text NOT NULL,
	"name" text NOT NULL,
	"channel_name" text,
	"type" integer NOT NULL,
	"channel_type" text,
	"parent_id" text,
	"send_announcements" boolean DEFAULT true NOT NULL,
	"send_reminders" boolean DEFAULT true NOT NULL,
	"send_match_start" boolean DEFAULT true NOT NULL,
	"send_signup_updates" boolean DEFAULT true NOT NULL,
	"last_name_refresh" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"send_health_alerts" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_events" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"event_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_match_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"message_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"thread_id" text,
	"discord_event_id" text,
	"message_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_settings" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "discord_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"guild_id" text NOT NULL,
	"bot_token" text NOT NULL,
	"application_id" text,
	"command_prefix" text DEFAULT '!' NOT NULL,
	"announcements_channel_id" text,
	"results_channel_id" text,
	"voice_channel_category_id" text,
	"announcement_role_id" text,
	"mention_everyone" boolean DEFAULT false NOT NULL,
	"event_duration_minutes" integer DEFAULT 45 NOT NULL,
	"match_reminder_minutes" integer DEFAULT 10 NOT NULL,
	"player_reminder_minutes" integer DEFAULT 120 NOT NULL,
	"announcer_voice" text,
	"voice_announcements_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voice_channel_cleanup_delay_minutes" integer DEFAULT 10 NOT NULL,
	"match_start_delay_seconds" integer DEFAULT 5 NOT NULL,
	"winner_vote_enabled" boolean DEFAULT true NOT NULL,
	"signup_dm_enabled" boolean DEFAULT true NOT NULL,
	"commander_dm_enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "discord_settings_guild_id_unique" UNIQUE("guild_id")
);
--> statement-breakpoint
CREATE TABLE "discord_winner_vote_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"match_game_id" text NOT NULL,
	"discord_user_id" text NOT NULL,
	"discord_message_id" text NOT NULL,
	"participant_id" text,
	"team_side" text,
	"voted_for" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_winner_vote_messages_team_side_check" CHECK ("discord_winner_vote_messages"."team_side" IN ('blue', 'red')),
	CONSTRAINT "discord_winner_vote_messages_voted_for_check" CHECK ("discord_winner_vote_messages"."voted_for" IN ('blue', 'red'))
);
--> statement-breakpoint
CREATE TABLE "team_voice_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"team_name" text NOT NULL,
	"channel_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_voice_channels_match_id_team_name_unique" UNIQUE("match_id","team_name")
);
--> statement-breakpoint
CREATE TABLE "scorecard_dm_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"match_game_id" text NOT NULL,
	"discord_user_id" text NOT NULL,
	"discord_message_id" text NOT NULL,
	"participant_id" text,
	"team_side" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scorecard_dm_messages_team_side_check" CHECK ("scorecard_dm_messages"."team_side" IN ('blue', 'red'))
);
--> statement-breakpoint
CREATE TABLE "scorecard_player_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"match_id" text NOT NULL,
	"match_game_id" text NOT NULL,
	"participant_id" text,
	"extracted_player_name" text NOT NULL,
	"extracted_hero" text,
	"team_side" text,
	"stats_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assignment_status" text DEFAULT 'unassigned' NOT NULL,
	"confidence_score" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"team_id" text,
	CONSTRAINT "scorecard_player_stats_team_side_check" CHECK ("scorecard_player_stats"."team_side" IN ('blue', 'red')),
	CONSTRAINT "scorecard_player_stats_assignment_status_check" CHECK ("scorecard_player_stats"."assignment_status" IN ('unassigned', 'assigned', 'confirmed'))
);
--> statement-breakpoint
CREATE TABLE "scorecard_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"match_game_id" text NOT NULL,
	"submitted_by_participant_id" text,
	"submitted_by_discord_user_id" text,
	"team_side" text NOT NULL,
	"screenshot_url" text NOT NULL,
	"discord_message_id" text,
	"ai_raw_response" text,
	"ai_extraction_status" text DEFAULT 'pending' NOT NULL,
	"ai_error_message" text,
	"review_status" text DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ai_processing_log" jsonb,
	"suggested_positions" jsonb,
	CONSTRAINT "scorecard_submissions_team_side_check" CHECK ("scorecard_submissions"."team_side" IN ('blue', 'red')),
	CONSTRAINT "scorecard_submissions_ai_extraction_status_check" CHECK ("scorecard_submissions"."ai_extraction_status" IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
	CONSTRAINT "scorecard_submissions_review_status_check" CHECK ("scorecard_submissions"."review_status" IN ('pending', 'approved', 'rejected', 'auto_approved'))
);
--> statement-breakpoint
CREATE TABLE "stats_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"ai_provider" text DEFAULT 'anthropic' NOT NULL,
	"ai_api_key" text,
	"ai_model" text DEFAULT 'sonnet' NOT NULL,
	"ai_providers_config" jsonb,
	"google_api_key" text,
	"openrouter_api_key" text,
	"both_sides_required" boolean DEFAULT false NOT NULL,
	"auto_advance_on_match" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stats_report_dm_enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "stats_settings_singleton_check" CHECK ("stats_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"setting_key" text PRIMARY KEY NOT NULL,
	"setting_value" text NOT NULL,
	"data_type" text DEFAULT 'string' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduler_settings" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "scheduler_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"match_cleanup_cron" text DEFAULT '0 2 * * *' NOT NULL,
	"match_check_cron" text DEFAULT '*/5 * * * *' NOT NULL,
	"reminder_check_cron" text DEFAULT '*/5 * * * *' NOT NULL,
	"cleanup_check_cron" text DEFAULT '0 3 * * *' NOT NULL,
	"channel_refresh_cron" text DEFAULT '0 */6 * * *' NOT NULL,
	"queue_processing_cron" text DEFAULT '*/30 * * * * *' NOT NULL,
	"cleanup_retention_days" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ui_settings" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "ui_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"theme" text DEFAULT 'dark' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"date_format" text DEFAULT 'YYYY-MM-DD' NOT NULL,
	"time_format" text DEFAULT '24h' NOT NULL,
	"auto_refresh_interval_seconds" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_announcement_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"announcement_type" text,
	"announcement_data" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"posted_at" timestamp with time zone,
	"last_error" text,
	"scheduled_for" timestamp with time zone,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"next_attempt_at" timestamp with time zone,
	"external_message_id" text,
	CONSTRAINT "discord_announcement_queue_status_check" CHECK ("discord_announcement_queue"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "discord_bot_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"data" jsonb,
	"result" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"last_error" text,
	"next_attempt_at" timestamp with time zone,
	CONSTRAINT "discord_bot_requests_status_check" CHECK ("discord_bot_requests"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "discord_deletion_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"last_error" text,
	"next_attempt_at" timestamp with time zone,
	CONSTRAINT "discord_deletion_queue_status_check" CHECK ("discord_deletion_queue"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "discord_health_alert_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"severity" text DEFAULT 'critical' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_at" timestamp with time zone,
	"last_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"next_attempt_at" timestamp with time zone,
	"external_message_id" text,
	"processed_at" timestamp with time zone,
	CONSTRAINT "discord_health_alert_queue_status_check" CHECK ("discord_health_alert_queue"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "discord_map_code_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"user_id" text,
	"map_name" text,
	"map_code" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"last_error" text,
	"next_attempt_at" timestamp with time zone,
	CONSTRAINT "discord_map_code_queue_status_check" CHECK ("discord_map_code_queue"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "discord_match_edit_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"last_error" text,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"next_attempt_at" timestamp with time zone,
	CONSTRAINT "discord_match_edit_queue_status_check" CHECK ("discord_match_edit_queue"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "discord_match_reminder_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"reminder_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"last_error" text,
	"next_attempt_at" timestamp with time zone,
	"external_message_id" text,
	CONSTRAINT "discord_match_reminder_queue_status_check" CHECK ("discord_match_reminder_queue"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "discord_match_start_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"last_error" text,
	"next_attempt_at" timestamp with time zone,
	"external_message_id" text,
	CONSTRAINT "discord_match_start_queue_status_check" CHECK ("discord_match_start_queue"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "discord_match_winner_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"match_name" text,
	"game_id" text,
	"winner" text,
	"winning_team_name" text,
	"winning_players" jsonb,
	"team1_score" integer,
	"team2_score" integer,
	"total_maps" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"next_attempt_at" timestamp with time zone,
	"external_message_id" text,
	CONSTRAINT "discord_match_winner_queue_status_check" CHECK ("discord_match_winner_queue"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "discord_player_reminder_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reminder_type" text NOT NULL,
	"reminder_time" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"next_attempt_at" timestamp with time zone,
	"external_message_id" text,
	CONSTRAINT "discord_player_reminder_queue_status_check" CHECK ("discord_player_reminder_queue"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "discord_reminder_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"reminder_type" text NOT NULL,
	"minutes_before" integer NOT NULL,
	"reminder_time" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"next_attempt_at" timestamp with time zone,
	"external_message_id" text,
	CONSTRAINT "discord_reminder_queue_status_check" CHECK ("discord_reminder_queue"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "discord_score_notification_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"game_id" text NOT NULL,
	"map_id" text,
	"game_number" integer,
	"winner" text,
	"winning_team_name" text,
	"winning_players" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"next_attempt_at" timestamp with time zone,
	"external_message_id" text,
	CONSTRAINT "discord_score_notification_queue_status_check" CHECK ("discord_score_notification_queue"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "discord_scorecard_prompt_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"match_game_id" text NOT NULL,
	"map_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"last_error" text,
	"next_attempt_at" timestamp with time zone,
	"external_message_id" text,
	"processed_at" timestamp with time zone,
	CONSTRAINT "discord_scorecard_prompt_queue_status_check" CHECK ("discord_scorecard_prompt_queue"."status" IN ('pending', 'processing', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "discord_stats_report_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"next_attempt_at" timestamp with time zone,
	CONSTRAINT "discord_stats_report_queue_match_id_unique" UNIQUE("match_id"),
	CONSTRAINT "discord_stats_report_queue_status_check" CHECK ("discord_stats_report_queue"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "discord_status_update_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"new_status" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"last_error" text,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"next_attempt_at" timestamp with time zone,
	CONSTRAINT "discord_status_update_queue_status_check" CHECK ("discord_status_update_queue"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "discord_voice_announcement_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"announcement_type" text NOT NULL,
	"blue_team_voice_channel" text,
	"red_team_voice_channel" text,
	"first_team" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"timeout_at" timestamp with time zone,
	"first_attempted_at" timestamp with time zone,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"next_attempt_at" timestamp with time zone,
	CONSTRAINT "discord_voice_announcement_queue_status_check" CHECK ("discord_voice_announcement_queue"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "discord_winner_vote_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"match_game_id" text NOT NULL,
	"map_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"last_error" text,
	"next_attempt_at" timestamp with time zone,
	"external_message_id" text,
	"processed_at" timestamp with time zone,
	CONSTRAINT "discord_winner_vote_queue_status_check" CHECK ("discord_winner_vote_queue"."status" IN ('pending', 'processing', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "stats_image_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"next_attempt_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	CONSTRAINT "stats_image_queue_status_check" CHECK ("stats_image_queue"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "stats_processing_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"match_id" text NOT NULL,
	"match_game_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"next_attempt_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	CONSTRAINT "stats_processing_queue_status_check" CHECK ("stats_processing_queue"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "activity_feed" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"match_id" text,
	"tournament_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_alerts_sent" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "health_alerts_sent_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"alert_type" text NOT NULL,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_alerts_sent_alert_type_unique" UNIQUE("alert_type")
);
--> statement-breakpoint
CREATE TABLE "system_status" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"phase" text DEFAULT 'starting' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_from_sqlite" boolean DEFAULT false NOT NULL,
	"report" jsonb,
	CONSTRAINT "system_status_singleton_check" CHECK ("system_status"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "blobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"owner_type" text,
	"owner_id" text,
	"path" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blobs_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE "control"."maintenance" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"state" text DEFAULT 'normal' NOT NULL,
	"reason" text,
	"started_at" timestamp with time zone,
	CONSTRAINT "maintenance_singleton_check" CHECK ("control"."maintenance"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "control"."workers" (
	"worker_id" text PRIMARY KEY NOT NULL,
	"service" text NOT NULL,
	"pid" integer,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paused_ack" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_versions" ADD CONSTRAINT "data_versions_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_maps" ADD CONSTRAINT "game_maps_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_maps" ADD CONSTRAINT "game_maps_mode_fk" FOREIGN KEY ("mode_id","game_id") REFERENCES "public"."game_modes"("id","game_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_modes" ADD CONSTRAINT "game_modes_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_stat_definitions" ADD CONSTRAINT "game_stat_definitions_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_game_placements" ADD CONSTRAINT "match_game_placements_match_game_id_match_games_id_fk" FOREIGN KEY ("match_game_id") REFERENCES "public"."match_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_games" ADD CONSTRAINT "match_games_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_team_id_match_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."match_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_player_stats" ADD CONSTRAINT "match_player_stats_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_player_stats" ADD CONSTRAINT "match_player_stats_participant_id_match_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."match_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_teams" ADD CONSTRAINT "match_teams_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_voice_alternation" ADD CONSTRAINT "match_voice_alternation_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_red_team_id_tournament_teams_id_fk" FOREIGN KEY ("red_team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_blue_team_id_tournament_teams_id_fk" FOREIGN KEY ("blue_team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_team1_id_tournament_teams_id_fk" FOREIGN KEY ("team1_id") REFERENCES "public"."tournament_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_team2_id_tournament_teams_id_fk" FOREIGN KEY ("team2_id") REFERENCES "public"."tournament_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_parent_match1_id_matches_id_fk" FOREIGN KEY ("parent_match1_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_parent_match2_id_matches_id_fk" FOREIGN KEY ("parent_match2_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD CONSTRAINT "tournament_participants_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD CONSTRAINT "tournament_participants_team_assignment_tournament_teams_id_fk" FOREIGN KEY ("team_assignment") REFERENCES "public"."tournament_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_round_byes" ADD CONSTRAINT "tournament_round_byes_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_round_byes" ADD CONSTRAINT "tournament_round_byes_team_id_tournament_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_team_members" ADD CONSTRAINT "tournament_team_members_team_id_tournament_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."tournament_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_events" ADD CONSTRAINT "series_events_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_events" ADD CONSTRAINT "series_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_events" ADD CONSTRAINT "series_events_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_role_settings" ADD CONSTRAINT "announcement_role_settings_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_channels" ADD CONSTRAINT "discord_channels_guild_id_discord_settings_guild_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."discord_settings"("guild_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_winner_vote_messages" ADD CONSTRAINT "discord_winner_vote_messages_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_winner_vote_messages" ADD CONSTRAINT "discord_winner_vote_messages_match_game_id_match_games_id_fk" FOREIGN KEY ("match_game_id") REFERENCES "public"."match_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_winner_vote_messages" ADD CONSTRAINT "discord_winner_vote_messages_participant_id_match_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."match_participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_dm_messages" ADD CONSTRAINT "scorecard_dm_messages_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_dm_messages" ADD CONSTRAINT "scorecard_dm_messages_match_game_id_match_games_id_fk" FOREIGN KEY ("match_game_id") REFERENCES "public"."match_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_dm_messages" ADD CONSTRAINT "scorecard_dm_messages_participant_id_match_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."match_participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_player_stats" ADD CONSTRAINT "scorecard_player_stats_submission_id_scorecard_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."scorecard_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_player_stats" ADD CONSTRAINT "scorecard_player_stats_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_player_stats" ADD CONSTRAINT "scorecard_player_stats_match_game_id_match_games_id_fk" FOREIGN KEY ("match_game_id") REFERENCES "public"."match_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_player_stats" ADD CONSTRAINT "scorecard_player_stats_participant_id_match_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."match_participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_player_stats" ADD CONSTRAINT "scorecard_player_stats_team_id_match_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."match_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_submissions" ADD CONSTRAINT "scorecard_submissions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_submissions" ADD CONSTRAINT "scorecard_submissions_match_game_id_match_games_id_fk" FOREIGN KEY ("match_game_id") REFERENCES "public"."match_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_submissions" ADD CONSTRAINT "scorecard_submissions_submitted_by_participant_id_match_participants_id_fk" FOREIGN KEY ("submitted_by_participant_id") REFERENCES "public"."match_participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_announcement_queue" ADD CONSTRAINT "discord_announcement_queue_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_map_code_queue" ADD CONSTRAINT "discord_map_code_queue_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_match_edit_queue" ADD CONSTRAINT "discord_match_edit_queue_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_match_reminder_queue" ADD CONSTRAINT "discord_match_reminder_queue_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_match_start_queue" ADD CONSTRAINT "discord_match_start_queue_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_match_winner_queue" ADD CONSTRAINT "discord_match_winner_queue_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_player_reminder_queue" ADD CONSTRAINT "discord_player_reminder_queue_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_reminder_queue" ADD CONSTRAINT "discord_reminder_queue_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_score_notification_queue" ADD CONSTRAINT "discord_score_notification_queue_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_score_notification_queue" ADD CONSTRAINT "discord_score_notification_queue_game_id_match_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."match_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_scorecard_prompt_queue" ADD CONSTRAINT "discord_scorecard_prompt_queue_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_scorecard_prompt_queue" ADD CONSTRAINT "discord_scorecard_prompt_queue_match_game_id_match_games_id_fk" FOREIGN KEY ("match_game_id") REFERENCES "public"."match_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_stats_report_queue" ADD CONSTRAINT "discord_stats_report_queue_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_status_update_queue" ADD CONSTRAINT "discord_status_update_queue_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_voice_announcement_queue" ADD CONSTRAINT "discord_voice_announcement_queue_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_winner_vote_queue" ADD CONSTRAINT "discord_winner_vote_queue_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_winner_vote_queue" ADD CONSTRAINT "discord_winner_vote_queue_match_game_id_match_games_id_fk" FOREIGN KEY ("match_game_id") REFERENCES "public"."match_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats_image_queue" ADD CONSTRAINT "stats_image_queue_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats_processing_queue" ADD CONSTRAINT "stats_processing_queue_submission_id_scorecard_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."scorecard_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats_processing_queue" ADD CONSTRAINT "stats_processing_queue_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats_processing_queue" ADD CONSTRAINT "stats_processing_queue_match_game_id_match_games_id_fk" FOREIGN KEY ("match_game_id") REFERENCES "public"."match_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_feed" ADD CONSTRAINT "activity_feed_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_feed" ADD CONSTRAINT "activity_feed_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_game_maps_mode_id" ON "game_maps" USING btree ("mode_id","game_id");--> statement-breakpoint
CREATE INDEX "idx_game_maps_game_id" ON "game_maps" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "idx_game_modes_game_id" ON "game_modes" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "idx_games_name" ON "games" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_placements_entity" ON "match_game_placements" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_placements_match_game" ON "match_game_placements" USING btree ("match_game_id");--> statement-breakpoint
CREATE INDEX "idx_match_games_match_id" ON "match_games" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_match_participants_team_id" ON "match_participants" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_match_participants_user_id" ON "match_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_match_participants_match_id" ON "match_participants" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_match_player_stats_match" ON "match_player_stats" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_match_teams_match" ON "match_teams" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_match_voice_alternation_last_team" ON "match_voice_alternation" USING btree ("last_first_team");--> statement-breakpoint
CREATE INDEX "idx_matches_status_updated" ON "matches" USING btree ("status","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_matches_map_id" ON "matches" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "idx_matches_winner_team" ON "matches" USING btree ("winner_team");--> statement-breakpoint
CREATE INDEX "idx_matches_tournament_bracket_type" ON "matches" USING btree ("tournament_bracket_type");--> statement-breakpoint
CREATE INDEX "idx_matches_tournament_round" ON "matches" USING btree ("tournament_round");--> statement-breakpoint
CREATE INDEX "idx_matches_blue_team_id" ON "matches" USING btree ("blue_team_id");--> statement-breakpoint
CREATE INDEX "idx_matches_red_team_id" ON "matches" USING btree ("red_team_id");--> statement-breakpoint
CREATE INDEX "idx_matches_bracket_type" ON "matches" USING btree ("bracket_type");--> statement-breakpoint
CREATE INDEX "idx_matches_tournament_id" ON "matches" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "idx_matches_start_time" ON "matches" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "idx_matches_status" ON "matches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_matches_game_id" ON "matches" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "idx_tournament_matches_team2_id" ON "tournament_matches" USING btree ("team2_id");--> statement-breakpoint
CREATE INDEX "idx_tournament_matches_team1_id" ON "tournament_matches" USING btree ("team1_id");--> statement-breakpoint
CREATE INDEX "idx_tournament_matches_bracket_type" ON "tournament_matches" USING btree ("bracket_type");--> statement-breakpoint
CREATE INDEX "idx_tournament_matches_round" ON "tournament_matches" USING btree ("round");--> statement-breakpoint
CREATE INDEX "idx_tournament_matches_tournament_id" ON "tournament_matches" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "idx_tournament_participants_team_assignment" ON "tournament_participants" USING btree ("team_assignment");--> statement-breakpoint
CREATE INDEX "idx_tournament_participants_user_id" ON "tournament_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_tournament_participants_tournament_id" ON "tournament_participants" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "idx_tournament_team_members_user_id" ON "tournament_team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_tournament_team_members_team_id" ON "tournament_team_members" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_tournament_teams_tournament_id" ON "tournament_teams" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "idx_tournaments_game_mode_id" ON "tournaments" USING btree ("game_mode_id");--> statement-breakpoint
CREATE INDEX "idx_tournaments_start_time" ON "tournaments" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "idx_tournaments_status" ON "tournaments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tournaments_game_id" ON "tournaments" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "idx_series_status" ON "series" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_series_game_id" ON "series" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_series_events_unique_tournament" ON "series_events" USING btree ("series_id","tournament_id") WHERE "series_events"."tournament_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_series_events_unique_match" ON "series_events" USING btree ("series_id","match_id") WHERE "series_events"."match_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_series_events_tournament" ON "series_events" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "idx_series_events_match" ON "series_events" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_series_events_series" ON "series_events" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "idx_announcement_role_settings_game_id" ON "announcement_role_settings" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "idx_auto_voice_channels_channel_id" ON "auto_voice_channels" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_auto_voice_channels_match_id" ON "auto_voice_channels" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_discord_channels_guild_id" ON "discord_channels" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "idx_discord_events_match_id" ON "discord_events" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_discord_match_messages_match_id" ON "discord_match_messages" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_winner_vote_messages_msg" ON "discord_winner_vote_messages" USING btree ("discord_message_id");--> statement-breakpoint
CREATE INDEX "idx_winner_vote_messages_game" ON "discord_winner_vote_messages" USING btree ("match_game_id");--> statement-breakpoint
CREATE INDEX "idx_team_voice_channels_match_id" ON "team_voice_channels" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_scorecard_dm_messages_discord" ON "scorecard_dm_messages" USING btree ("discord_user_id","discord_message_id");--> statement-breakpoint
CREATE INDEX "idx_scorecard_player_stats_team_id" ON "scorecard_player_stats" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_scorecard_player_stats_participant" ON "scorecard_player_stats" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "idx_scorecard_player_stats_match" ON "scorecard_player_stats" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_scorecard_player_stats_submission" ON "scorecard_player_stats" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "idx_scorecard_submissions_match_game" ON "scorecard_submissions" USING btree ("match_game_id");--> statement-breakpoint
CREATE INDEX "idx_scorecard_submissions_match" ON "scorecard_submissions" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_app_settings_data_type" ON "app_settings" USING btree ("data_type");--> statement-breakpoint
CREATE INDEX "idx_discord_announcement_queue_scheduled" ON "discord_announcement_queue" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "idx_discord_announcement_queue_status" ON "discord_announcement_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_discord_bot_requests_status" ON "discord_bot_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_discord_deletion_queue_status" ON "discord_deletion_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_discord_health_alert_queue_status" ON "discord_health_alert_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_discord_map_code_queue_status" ON "discord_map_code_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_discord_match_edit_queue_match_id" ON "discord_match_edit_queue" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_discord_match_reminder_queue_scheduled" ON "discord_match_reminder_queue" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "idx_discord_match_reminder_queue_status" ON "discord_match_reminder_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_discord_match_start_queue_status" ON "discord_match_start_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_discord_match_winner_queue_status" ON "discord_match_winner_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_discord_player_reminder_queue_scheduled" ON "discord_player_reminder_queue" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "idx_discord_player_reminder_queue_status" ON "discord_player_reminder_queue" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_discord_reminder_queue_unique_match_reminder" ON "discord_reminder_queue" USING btree ("match_id","reminder_type") WHERE "discord_reminder_queue"."status" NOT IN ('failed');--> statement-breakpoint
CREATE INDEX "idx_discord_reminder_queue_scheduled" ON "discord_reminder_queue" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "idx_discord_reminder_queue_status" ON "discord_reminder_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_discord_score_notification_queue_status" ON "discord_score_notification_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_discord_scorecard_prompt_queue_status" ON "discord_scorecard_prompt_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_discord_status_update_queue_status" ON "discord_status_update_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_winner_vote_queue_status" ON "discord_winner_vote_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_stats_image_queue_status" ON "stats_image_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_stats_processing_queue_status" ON "stats_processing_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_activity_feed_tournament_id" ON "activity_feed" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "idx_activity_feed_match_id" ON "activity_feed" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_activity_feed_priority" ON "activity_feed" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_activity_feed_created_at" ON "activity_feed" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_health_alerts_sent_alert_type" ON "health_alerts_sent" USING btree ("alert_type");--> statement-breakpoint
CREATE INDEX "idx_blobs_owner" ON "blobs" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "idx_blobs_kind" ON "blobs" USING btree ("kind");