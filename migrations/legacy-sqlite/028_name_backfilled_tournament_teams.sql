-- 021 backfilled every pre-rewrite Normal match with generic 'Blue'/'Red'
-- match_teams rows, including tournament matches. New tournament matches get
-- their match_teams named after the tournament teams (setupTournamentMatchTeams),
-- so give the backfilled ones the same names; otherwise score notifications and
-- the scoring UI for upgraded tournament matches say "Blue"/"Red" instead of
-- the real team names. Team1 = blue (order 0), team2 = red (order 1), matching
-- the legacy winner_id 'team1'/'team2' mapping used by 021. Idempotent.

UPDATE match_teams
SET team_name = (
  SELECT tt.team_name
  FROM tournament_matches tm
  JOIN tournament_teams tt ON tt.id = tm.team1_id
  WHERE tm.match_id = match_teams.match_id
)
WHERE id = 'mt_blue_' || match_id
  AND team_name = 'Blue'
  AND EXISTS (
    SELECT 1 FROM tournament_matches tm
    JOIN tournament_teams tt ON tt.id = tm.team1_id
    WHERE tm.match_id = match_teams.match_id
  );

UPDATE match_teams
SET team_name = (
  SELECT tt.team_name
  FROM tournament_matches tm
  JOIN tournament_teams tt ON tt.id = tm.team2_id
  WHERE tm.match_id = match_teams.match_id
)
WHERE id = 'mt_red_' || match_id
  AND team_name = 'Red'
  AND EXISTS (
    SELECT 1 FROM tournament_matches tm
    JOIN tournament_teams tt ON tt.id = tm.team2_id
    WHERE tm.match_id = match_teams.match_id
  );
