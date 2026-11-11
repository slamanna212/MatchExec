ALTER TABLE "series_event_batches" ADD COLUMN "status" text DEFAULT 'generated' NOT NULL;--> statement-breakpoint
ALTER TABLE "series_event_batches" ADD COLUMN "position" integer;--> statement-breakpoint
ALTER TABLE "series_events" ADD COLUMN "match_template" jsonb;--> statement-breakpoint
ALTER TABLE "series_event_batches" ADD CONSTRAINT "series_event_batches_status_check" CHECK ("series_event_batches"."status" IN ('planned', 'generated'));