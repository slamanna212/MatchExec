-- ai_processor_version: real rollback switch for the scoring-rewrite-aware AI
-- extraction prompt (Phase 5 of the scoring rewrite). Defaults to 'v2' since
-- that's the only implementation now maintained; setting it to 'legacy'
-- forces the extractor back to the pre-rewrite mode-blind (always blue/red)
-- prompt if the new scoring_type-aware prompts produce worse extractions.
ALTER TABLE stats_settings ADD COLUMN ai_processor_version TEXT NOT NULL DEFAULT 'v2';
