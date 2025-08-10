-- Create voices table for storing voice announcer data
CREATE TABLE voices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create voice_data_versions table to track voice data seeding
CREATE TABLE voice_data_versions (
  voice_type TEXT PRIMARY KEY DEFAULT 'voices',
  data_version TEXT NOT NULL,
  seeded_at TEXT DEFAULT CURRENT_TIMESTAMP
);