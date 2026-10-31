-- POST /api/matches used to leave matches.mode_id NULL, which made every match-level
-- scoring path (winner, overall score, team setup) treat FFA/Position matches as Normal.
-- Backfill it from the first selected map. Map ids may carry a "-<timestamp>-<random>"
-- suffix, so match on the longest game_maps.id that is the id or a prefix of it.
UPDATE matches
SET mode_id = (
  SELECT gm.mode_id
  FROM game_maps gm
  WHERE gm.game_id = matches.game_id
    AND (json_extract(matches.maps, '$[0]') = gm.id
         OR json_extract(matches.maps, '$[0]') LIKE gm.id || '-%')
  ORDER BY length(gm.id) DESC
  LIMIT 1
)
WHERE mode_id IS NULL
  AND maps IS NOT NULL
  AND json_valid(maps)
  AND json_array_length(maps) > 0;
