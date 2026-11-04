DROP INDEX "idx_auto_voice_channels_channel_id";--> statement-breakpoint
ALTER TABLE "auto_voice_channels" ADD COLUMN "cleanup_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auto_voice_channels" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auto_voice_channels" ADD COLUMN "cleanup_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "auto_voice_channels" ADD COLUMN "last_error" text;--> statement-breakpoint
WITH ranked AS (
  SELECT a.id, row_number() OVER (PARTITION BY a.channel_id ORDER BY
    CASE WHEN m.status NOT IN ('complete', 'cancelled') THEN 0 ELSE 1 END, a.created_at, a.id) AS n
  FROM auto_voice_channels a LEFT JOIN matches m ON m.id = a.match_id
)
DELETE FROM auto_voice_channels WHERE id IN (SELECT id FROM ranked WHERE n > 1);
--> statement-breakpoint
ALTER TABLE "auto_voice_channels" ADD CONSTRAINT "auto_voice_channels_channel_id_unique" UNIQUE("channel_id");
--> statement-breakpoint
-- Older versions forgot ownership at enqueue time, even when deletion failed.
-- Restore it before old RPC requests can expire or be purged. The monitor confirms absence safely.
INSERT INTO auto_voice_channels (id, match_id, channel_id, team_name, created_at)
SELECT 'recovered_' || id, data->>'matchId', data->>'channelId', 'all', created_at
FROM discord_bot_requests
WHERE type = 'voice_channel_delete'
  AND jsonb_typeof(data->'matchId') = 'string' AND length(data->>'matchId') > 0
  AND jsonb_typeof(data->'channelId') = 'string' AND length(data->>'channelId') > 0
ON CONFLICT (channel_id) DO NOTHING;
