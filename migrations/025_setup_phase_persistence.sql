-- Persist Position-mode setup phase data (starting grid order and qualifying times)
ALTER TABLE match_participants ADD COLUMN grid_position INTEGER;
ALTER TABLE match_participants ADD COLUMN qualifying_time_ms INTEGER;
