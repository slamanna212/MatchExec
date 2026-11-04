CREATE TABLE "voice_cleanup_schedules" (
	"match_id" text PRIMARY KEY NOT NULL,
	"cleanup_after" timestamp with time zone NOT NULL
);
