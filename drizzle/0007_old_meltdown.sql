DROP INDEX IF EXISTS "idx_games_name";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_placements_match_game";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_match_games_match_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_match_participants_match_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_match_player_stats_match";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_match_teams_match";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_match_voice_alternation_last_team";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_matches_status_updated";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_matches_map_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_matches_winner_team";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_matches_tournament_bracket_type";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_matches_tournament_round";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_matches_bracket_type";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_matches_start_time";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_matches_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tournament_matches_bracket_type";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tournament_matches_round";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tournament_matches_tournament_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tournament_participants_tournament_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tournament_team_members_team_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tournaments_game_mode_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tournaments_start_time";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_series_entrants_series";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_series_events_series";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_series_stages_series";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_announcement_role_settings_game_id";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_app_settings_data_type";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_discord_announcement_queue_scheduled";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_discord_announcement_queue_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_discord_bot_requests_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_discord_deletion_queue_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_discord_health_alert_queue_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_discord_map_code_queue_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_discord_match_reminder_queue_scheduled";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_discord_match_reminder_queue_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_discord_match_start_queue_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_discord_match_winner_queue_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_discord_player_reminder_queue_scheduled";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_discord_player_reminder_queue_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_discord_reminder_queue_scheduled";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_discord_reminder_queue_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_discord_score_notification_queue_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_discord_scorecard_prompt_queue_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_discord_series_update_queue_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_discord_status_update_queue_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_stats_image_queue_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_stats_processing_queue_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_activity_feed_priority";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_health_alerts_sent_alert_type";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_blobs_kind";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_game_stat_definitions_game_id" ON "game_stat_definitions" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_match_player_stats_participant" ON "match_player_stats" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_matches_active_updated" ON "matches" USING btree ("updated_at" DESC NULLS FIRST) WHERE "matches"."status" NOT IN ('complete', 'cancelled');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_matches_finished_updated" ON "matches" USING btree ("updated_at" DESC NULLS FIRST) WHERE "matches"."status" IN ('complete', 'cancelled');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_matches_status_start_date" ON "matches" USING btree ("status","start_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tournament_matches_bracket" ON "tournament_matches" USING btree ("tournament_id","bracket_type","round");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tournament_matches_parent1" ON "tournament_matches" USING btree ("parent_match1_id") WHERE "tournament_matches"."parent_match1_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tournament_matches_parent2" ON "tournament_matches" USING btree ("parent_match2_id") WHERE "tournament_matches"."parent_match2_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tournament_round_byes_team" ON "tournament_round_byes" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_series_previous" ON "series" USING btree ("previous_series_id") WHERE "series"."previous_series_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_series_event_batches_stage" ON "series_event_batches" USING btree ("stage_id") WHERE "series_event_batches"."stage_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_series_events_batch" ON "series_events" USING btree ("batch_id") WHERE "series_events"."batch_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_winner_vote_messages_match" ON "discord_winner_vote_messages" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_winner_vote_messages_participant" ON "discord_winner_vote_messages" USING btree ("participant_id") WHERE "discord_winner_vote_messages"."participant_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scorecard_dm_messages_match" ON "scorecard_dm_messages" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scorecard_dm_messages_match_game" ON "scorecard_dm_messages" USING btree ("match_game_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scorecard_dm_messages_participant" ON "scorecard_dm_messages" USING btree ("participant_id") WHERE "scorecard_dm_messages"."participant_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scorecard_player_stats_match_game" ON "scorecard_player_stats" USING btree ("match_game_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scorecard_submissions_submitted_by" ON "scorecard_submissions" USING btree ("submitted_by_participant_id") WHERE "scorecard_submissions"."submitted_by_participant_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_announcement_queue_status_created" ON "discord_announcement_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_bot_requests_status_created" ON "discord_bot_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_deletion_queue_status_created" ON "discord_deletion_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_health_alert_queue_status_created" ON "discord_health_alert_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_map_code_queue_status_created" ON "discord_map_code_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_map_code_queue_match" ON "discord_map_code_queue" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_match_edit_queue_status_created" ON "discord_match_edit_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_match_reminder_queue_status_created" ON "discord_match_reminder_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_match_reminder_queue_match" ON "discord_match_reminder_queue" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_match_start_queue_status_created" ON "discord_match_start_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_match_start_queue_match" ON "discord_match_start_queue" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_match_winner_queue_status_created" ON "discord_match_winner_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_player_reminder_queue_status_created" ON "discord_player_reminder_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_player_reminder_queue_match" ON "discord_player_reminder_queue" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_reminder_queue_status_created" ON "discord_reminder_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_score_notification_queue_status_created" ON "discord_score_notification_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_score_notification_queue_match" ON "discord_score_notification_queue" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_scorecard_prompt_queue_status_created" ON "discord_scorecard_prompt_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_scorecard_prompt_queue_match" ON "discord_scorecard_prompt_queue" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_scorecard_prompt_queue_match_game" ON "discord_scorecard_prompt_queue" USING btree ("match_game_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_series_update_queue_status_created" ON "discord_series_update_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_stats_report_queue_status_created" ON "discord_stats_report_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_status_update_queue_status_created" ON "discord_status_update_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_voice_announcement_queue_status_created" ON "discord_voice_announcement_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discord_voice_announcement_queue_match" ON "discord_voice_announcement_queue" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_winner_vote_queue_match" ON "discord_winner_vote_queue" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_winner_vote_queue_match_game" ON "discord_winner_vote_queue" USING btree ("match_game_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stats_image_queue_status_created" ON "stats_image_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stats_image_queue_match" ON "stats_image_queue" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stats_processing_queue_status_created" ON "stats_processing_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stats_processing_queue_match" ON "stats_processing_queue" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stats_processing_queue_match_game" ON "stats_processing_queue" USING btree ("match_game_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stats_processing_queue_submission" ON "stats_processing_queue" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_feed_event_type" ON "activity_feed" USING btree ("event_type","created_at");