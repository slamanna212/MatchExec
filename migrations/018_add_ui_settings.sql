-- Create UI settings table
CREATE TABLE IF NOT EXISTS ui_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    auto_refresh_interval_seconds INTEGER NOT NULL DEFAULT 10,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (id = 1) -- Ensure only one row
);

-- Insert default settings
INSERT OR IGNORE INTO ui_settings (id, auto_refresh_interval_seconds) VALUES (1, 10);