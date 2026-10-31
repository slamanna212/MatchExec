-- AI-extracted finishing positions are stored as an unverified suggestion
-- (JSON: { "<match_participants.id>": position }) instead of being written as
-- official results. The Position scoring UI pre-fills from it for admin confirmation.
ALTER TABLE scorecard_submissions ADD COLUMN suggested_positions TEXT;
