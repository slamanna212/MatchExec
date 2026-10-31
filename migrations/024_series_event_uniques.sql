-- Prevent the same match/tournament from being added to a series twice.
-- First remove any existing duplicates (keeping the lowest event_order) so
-- index creation cannot fail on existing data.

DELETE FROM series_events
WHERE match_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM series_events o
    WHERE o.series_id = series_events.series_id
      AND o.match_id = series_events.match_id
      AND (o.event_order < series_events.event_order
           OR (o.event_order = series_events.event_order AND o.id < series_events.id))
  );

DELETE FROM series_events
WHERE tournament_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM series_events o
    WHERE o.series_id = series_events.series_id
      AND o.tournament_id = series_events.tournament_id
      AND (o.event_order < series_events.event_order
           OR (o.event_order = series_events.event_order AND o.id < series_events.id))
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_series_events_unique_match
  ON series_events(series_id, match_id) WHERE match_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_series_events_unique_tournament
  ON series_events(series_id, tournament_id) WHERE tournament_id IS NOT NULL;
