-- Create Discord status update queue table
CREATE TABLE IF NOT EXISTS discord_status_update_queue (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    new_status TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processed', 'failed'
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_discord_status_update_queue_status ON discord_status_update_queue(status);
CREATE INDEX IF NOT EXISTS idx_discord_status_update_queue_created_at ON discord_status_update_queue(created_at);