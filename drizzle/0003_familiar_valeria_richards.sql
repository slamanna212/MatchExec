CREATE TABLE "series_entrant_members" (
	"id" text PRIMARY KEY NOT NULL,
	"entrant_id" text NOT NULL,
	"series_id" text NOT NULL,
	"user_id" text NOT NULL,
	"discord_user_id" text,
	"username" text NOT NULL,
	"role" text DEFAULT 'player' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "series_entrant_members_role_check" CHECK ("series_entrant_members"."role" IN ('captain', 'player', 'sub'))
);
--> statement-breakpoint
CREATE TABLE "series_entrants" (
	"id" text PRIMARY KEY NOT NULL,
	"series_id" text NOT NULL,
	"name" text NOT NULL,
	"tag" text,
	"color" text,
	"logo_url" text,
	"division" text,
	"seed" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"source_entrant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_entrants_series_id_name_unique" UNIQUE("series_id","name"),
	CONSTRAINT "series_entrants_status_check" CHECK ("series_entrants"."status" IN ('pending', 'active', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "series_event_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"series_id" text NOT NULL,
	"stage_id" text,
	"kind" text NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_event_batches_kind_check" CHECK ("series_event_batches"."kind" IN ('round_robin', 'race_calendar'))
);
--> statement-breakpoint
CREATE TABLE "series_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"series_id" text NOT NULL,
	"name" text NOT NULL,
	"stage_order" integer NOT NULL,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"counts_toward_season" boolean DEFAULT true NOT NULL,
	"scoring_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_stages_series_id_stage_order_unique" UNIQUE("series_id","stage_order"),
	CONSTRAINT "series_stages_status_check" CHECK ("series_stages"."status" IN ('upcoming', 'active', 'complete'))
);
--> statement-breakpoint
CREATE TABLE "discord_series_update_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"series_id" text NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"last_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"next_attempt_at" timestamp with time zone,
	"external_message_id" text,
	CONSTRAINT "discord_series_update_queue_dedupe_unique" UNIQUE("series_id","kind","dedupe_key"),
	CONSTRAINT "discord_series_update_queue_status_check" CHECK ("discord_series_update_queue"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "series" DROP CONSTRAINT "series_status_check";--> statement-breakpoint
ALTER TABLE "series_events" DROP CONSTRAINT "series_events_event_type_target_check";--> statement-breakpoint
ALTER TABLE "match_teams" ADD COLUMN "series_entrant_id" text;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD COLUMN "series_entrant_id" text;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "entrant_type" text DEFAULT 'solo' NOT NULL;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "roster_min" integer;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "roster_max" integer;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "scoring_type" text;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "game_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "game_mode_id" text;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "match_defaults" jsonb;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "discord_config" jsonb;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "previous_series_id" text;--> statement-breakpoint
ALTER TABLE "series_events" ADD COLUMN "stage_id" text;--> statement-breakpoint
ALTER TABLE "series_events" ADD COLUMN "role" text DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE "series_events" ADD COLUMN "week" integer;--> statement-breakpoint
ALTER TABLE "series_events" ADD COLUMN "counts_for_standings" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "series_events" ADD COLUMN "batch_id" text;--> statement-breakpoint
ALTER TABLE "series_events" ADD COLUMN "status" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "series_events" ADD COLUMN "entrant_ids" jsonb;--> statement-breakpoint
ALTER TABLE "series_events" ADD COLUMN "seeding_rule" jsonb;--> statement-breakpoint
ALTER TABLE "discord_channels" ADD COLUMN "send_series_updates" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "series_entrant_members" ADD CONSTRAINT "series_entrant_members_entrant_id_series_entrants_id_fk" FOREIGN KEY ("entrant_id") REFERENCES "public"."series_entrants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_entrant_members" ADD CONSTRAINT "series_entrant_members_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_entrants" ADD CONSTRAINT "series_entrants_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_event_batches" ADD CONSTRAINT "series_event_batches_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_event_batches" ADD CONSTRAINT "series_event_batches_stage_id_series_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."series_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_stages" ADD CONSTRAINT "series_stages_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_series_update_queue" ADD CONSTRAINT "discord_series_update_queue_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_series_entrant_members_current" ON "series_entrant_members" USING btree ("series_id","user_id") WHERE "series_entrant_members"."left_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_series_entrant_members_entrant" ON "series_entrant_members" USING btree ("entrant_id");--> statement-breakpoint
CREATE INDEX "idx_series_entrant_members_discord" ON "series_entrant_members" USING btree ("discord_user_id");--> statement-breakpoint
CREATE INDEX "idx_series_entrants_series" ON "series_entrants" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "idx_series_event_batches_series" ON "series_event_batches" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "idx_series_stages_series" ON "series_stages" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "idx_discord_series_update_queue_status" ON "discord_series_update_queue" USING btree ("status");--> statement-breakpoint
ALTER TABLE "match_teams" ADD CONSTRAINT "match_teams_series_entrant_id_series_entrants_id_fk" FOREIGN KEY ("series_entrant_id") REFERENCES "public"."series_entrants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_series_entrant_id_series_entrants_id_fk" FOREIGN KEY ("series_entrant_id") REFERENCES "public"."series_entrants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_previous_series_id_series_id_fk" FOREIGN KEY ("previous_series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_events" ADD CONSTRAINT "series_events_stage_id_series_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."series_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_events" ADD CONSTRAINT "series_events_batch_id_series_event_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."series_event_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_match_teams_series_entrant" ON "match_teams" USING btree ("series_entrant_id");--> statement-breakpoint
CREATE INDEX "idx_tournament_teams_series_entrant" ON "tournament_teams" USING btree ("series_entrant_id");--> statement-breakpoint
CREATE INDEX "idx_series_events_stage" ON "series_events" USING btree ("stage_id");--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_entrant_type_check" CHECK ("series"."entrant_type" IN ('solo', 'team'));--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_scoring_type_check" CHECK ("series"."scoring_type" IS NULL OR "series"."scoring_type" IN ('Normal', 'FFA', 'Position'));--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_status_check" CHECK ("series"."status" IN ('created', 'registration', 'active', 'complete', 'cancelled'));--> statement-breakpoint
ALTER TABLE "series_events" ADD CONSTRAINT "series_events_role_check" CHECK ("series_events"."role" IN ('regular', 'stage_playoff', 'season_playoff', 'exhibition'));--> statement-breakpoint
ALTER TABLE "series_events" ADD CONSTRAINT "series_events_status_check" CHECK ("series_events"."status" IN ('planned', 'live'));--> statement-breakpoint
ALTER TABLE "series_events" ADD CONSTRAINT "series_events_event_type_target_check" CHECK (("series_events"."status" = 'planned' AND "series_events"."match_id" IS NULL AND "series_events"."tournament_id" IS NULL) OR ("series_events"."status" = 'live' AND (("series_events"."event_type" = 'match' AND "series_events"."match_id" IS NOT NULL AND "series_events"."tournament_id" IS NULL) OR ("series_events"."event_type" = 'tournament' AND "series_events"."tournament_id" IS NOT NULL AND "series_events"."match_id" IS NULL))));