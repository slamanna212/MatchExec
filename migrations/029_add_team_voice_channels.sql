-- Add voice channel assignment fields to matches table
ALTER TABLE matches ADD COLUMN blue_team_voice_channel TEXT;
ALTER TABLE matches ADD COLUMN red_team_voice_channel TEXT;
