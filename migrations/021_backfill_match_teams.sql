-- Phase 1c: Backfill match_teams and match_game_placements from legacy columns.
-- Runs after 019 and 020. Safe to run multiple times (INSERT OR IGNORE throughout).

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Create match_teams rows for Normal matches (scoring_type = 'Normal' or NULL mode)
--    Blue team (order=0, #4A90E2) and Red team (order=1, #E04A4A)
-- ────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO match_teams (id, match_id, team_name, team_color, team_order, voice_channel_id, is_reserve)
SELECT
  'mt_blue_' || m.id,
  m.id,
  'Blue',
  '#4A90E2',
  0,
  m.blue_team_voice_channel,
  0
FROM matches m
LEFT JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
WHERE (gm.scoring_type = 'Normal' OR gm.scoring_type IS NULL OR m.mode_id IS NULL);

INSERT OR IGNORE INTO match_teams (id, match_id, team_name, team_color, team_order, voice_channel_id, is_reserve)
SELECT
  'mt_red_' || m.id,
  m.id,
  'Red',
  '#E04A4A',
  1,
  m.red_team_voice_channel,
  0
FROM matches m
LEFT JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
WHERE (gm.scoring_type = 'Normal' OR gm.scoring_type IS NULL OR m.mode_id IS NULL);

-- Reserve team for Normal matches (catches participants with team_assignment='reserve')
-- Only created if there are reserve participants
INSERT OR IGNORE INTO match_teams (id, match_id, team_name, team_color, team_order, voice_channel_id, is_reserve)
SELECT
  'mt_reserve_' || m.id,
  m.id,
  'Reserve',
  NULL,
  99,
  NULL,
  1
FROM matches m
LEFT JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
WHERE (gm.scoring_type = 'Normal' OR gm.scoring_type IS NULL OR m.mode_id IS NULL)
  AND EXISTS (
    SELECT 1 FROM match_participants mp
    WHERE mp.match_id = m.id AND mp.team_assignment = 'reserve'
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Create match_teams rows for FFA matches (one per participant)
-- ────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO match_teams (id, match_id, team_name, team_color, team_order, voice_channel_id, is_reserve)
SELECT
  'mt_ffa_' || mp.id,
  mp.match_id,
  mp.username,
  NULL,
  ROW_NUMBER() OVER (PARTITION BY mp.match_id ORDER BY mp.joined_at, mp.id) - 1,
  NULL,
  0
FROM match_participants mp
JOIN matches m ON m.id = mp.match_id
JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
WHERE gm.scoring_type = 'FFA';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Create match_teams rows for Position individual matches (one per participant)
-- ────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO match_teams (id, match_id, team_name, team_color, team_order, voice_channel_id, is_reserve)
SELECT
  'mt_pos_' || mp.id,
  mp.match_id,
  mp.username,
  NULL,
  ROW_NUMBER() OVER (PARTITION BY mp.match_id ORDER BY mp.joined_at, mp.id) - 1,
  NULL,
  0
FROM match_participants mp
JOIN matches m ON m.id = mp.match_id
JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
WHERE gm.scoring_type = 'Position';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Backfill match_participants.team_id for Normal matches
-- ────────────────────────────────────────────────────────────────────────────
-- blue → Blue team row
UPDATE match_participants
SET team_id = 'mt_blue_' || match_id
WHERE team_assignment = 'blue'
  AND match_id IN (
    SELECT m.id FROM matches m
    LEFT JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
    WHERE (gm.scoring_type = 'Normal' OR gm.scoring_type IS NULL OR m.mode_id IS NULL)
  )
  AND team_id IS NULL;

-- red → Red team row
UPDATE match_participants
SET team_id = 'mt_red_' || match_id
WHERE team_assignment = 'red'
  AND match_id IN (
    SELECT m.id FROM matches m
    LEFT JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
    WHERE (gm.scoring_type = 'Normal' OR gm.scoring_type IS NULL OR m.mode_id IS NULL)
  )
  AND team_id IS NULL;

-- reserve → Reserve team row
UPDATE match_participants
SET team_id = 'mt_reserve_' || match_id
WHERE team_assignment = 'reserve'
  AND match_id IN (
    SELECT m.id FROM matches m
    LEFT JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
    WHERE (gm.scoring_type = 'Normal' OR gm.scoring_type IS NULL OR m.mode_id IS NULL)
  )
  AND team_id IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Backfill match_participants.team_id for FFA matches
-- ────────────────────────────────────────────────────────────────────────────
UPDATE match_participants
SET team_id = 'mt_ffa_' || id
WHERE match_id IN (
    SELECT m.id FROM matches m
    JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
    WHERE gm.scoring_type = 'FFA'
  )
  AND team_id IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Backfill match_participants.team_id for Position matches
-- ────────────────────────────────────────────────────────────────────────────
UPDATE match_participants
SET team_id = 'mt_pos_' || id
WHERE match_id IN (
    SELECT m.id FROM matches m
    JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
    WHERE gm.scoring_type = 'Position'
  )
  AND team_id IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Backfill matches.team_count
-- ────────────────────────────────────────────────────────────────────────────
UPDATE matches
SET team_count = (
  SELECT COUNT(*) FROM match_teams mt
  WHERE mt.match_id = matches.id AND mt.is_reserve = 0
)
WHERE team_count IS NULL OR team_count = 2;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. Backfill match_game_placements from Normal match results (winner_id)
-- ────────────────────────────────────────────────────────────────────────────
-- winner team
INSERT OR IGNORE INTO match_game_placements (id, match_game_id, entity_type, entity_id, position, score, is_winner)
SELECT
  'mgp_w_' || mg.id,
  mg.id,
  'team',
  CASE mg.winner_id
    WHEN 'team1' THEN 'mt_blue_' || mg.match_id
    WHEN 'team2' THEN 'mt_red_' || mg.match_id
  END,
  1,
  CASE mg.winner_id WHEN 'team1' THEN mg.score_a ELSE mg.score_b END,
  1
FROM match_games mg
JOIN matches m ON m.id = mg.match_id
LEFT JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
WHERE mg.winner_id IN ('team1', 'team2')
  AND (gm.scoring_type = 'Normal' OR gm.scoring_type IS NULL OR m.mode_id IS NULL);

-- losing team
INSERT OR IGNORE INTO match_game_placements (id, match_game_id, entity_type, entity_id, position, score, is_winner)
SELECT
  'mgp_l_' || mg.id,
  mg.id,
  'team',
  CASE mg.winner_id
    WHEN 'team1' THEN 'mt_red_' || mg.match_id
    WHEN 'team2' THEN 'mt_blue_' || mg.match_id
  END,
  2,
  CASE mg.winner_id WHEN 'team1' THEN mg.score_b ELSE mg.score_a END,
  0
FROM match_games mg
JOIN matches m ON m.id = mg.match_id
LEFT JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
WHERE mg.winner_id IN ('team1', 'team2')
  AND (gm.scoring_type = 'Normal' OR gm.scoring_type IS NULL OR m.mode_id IS NULL);

-- ────────────────────────────────────────────────────────────────────────────
-- 9. Backfill match_game_placements for FFA matches (participant_winner_id)
-- ────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO match_game_placements (id, match_game_id, entity_type, entity_id, position, is_winner)
SELECT
  'mgp_ffa_' || mg.id,
  mg.id,
  'participant',
  mg.participant_winner_id,
  1,
  1
FROM match_games mg
JOIN matches m ON m.id = mg.match_id
JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
WHERE gm.scoring_type = 'FFA'
  AND mg.participant_winner_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. Backfill match_game_placements for Position matches (position_results JSON)
--     SQLite JSON functions: json_each to expand the object into rows.
-- ────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO match_game_placements (id, match_game_id, entity_type, entity_id, position, points_awarded, is_winner)
SELECT
  'mgp_pos_' || mg.id || '_' || je.key,
  mg.id,
  'participant',
  je.key,
  CAST(je.value AS INTEGER),
  CAST(json_extract(mg.points_awarded, '$.' || je.key) AS INTEGER),
  CASE WHEN CAST(je.value AS INTEGER) = 1 THEN 1 ELSE 0 END
FROM match_games mg
JOIN matches m ON m.id = mg.match_id
JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
JOIN json_each(mg.position_results) je
WHERE gm.scoring_type = 'Position'
  AND mg.position_results IS NOT NULL
  AND mg.position_results != '';
