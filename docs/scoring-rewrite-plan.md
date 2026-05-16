# Scoring & Match Type System Rewrite

## Context

MatchExec began as a Discord bot for team-based competitive shooters (Overwatch, Valorant, CS2). The data model still reflects that — hardcoded blue/red teams, a forced team-assignment lifecycle phase, and an AI stats processor that tags every player as `blue` or `red` regardless of game mode.

Since then we've added:
- **FFA** modes: CS2 Deathmatch/Arms Race, Valorant Deathmatch, OW2 Workshop, Fortnite Solo, Marvel Rivals Doom Match
- **Position-based** modes: Mario Kart (VS Race, Grand Prix), Assetto Corsa Competizione (Track Day, Quick Race, Endurance Race)
- **Future needs we want to support**:
  - N-team matches (>2 teams), e.g. multi-team endurance races
  - Qualifying rounds, multi-class events, grid orders for racing
  - Championship series — multiple matches and/or tournaments aggregated into one season

The current code doesn't fit. Specifically:
- FFA matches incorrectly run team-assignment UI (everyone is their own team, there's nothing to assign).
- AI stats processor in `processes/stats-processor/modules/ai-extractor.ts` is **fully mode-blind** — it never reads `mode_id`, always tags `team_side='blue'|'red'`.
- Position-based scoring exists (migration 006) but has no per-match override and is bolted on as a separate branch in the scoring UI.
- No support for 24-hour team endurance (8 teams of 3 drivers, position-scored at team level).
- No support for multi-event series / seasons / championships.

This rewrite makes **`game_modes.scoring_type`** the single source of truth that drives every downstream system (data model, lifecycle, UI, AI processor, tournament logic). It also introduces a new top-level **Series** entity to model multi-event championships.

**Migration approach:** clean break with one-shot data migration. New schema replaces old; legacy columns dropped at the end. No backwards-compat shims.

**Out of scope (for now):** stream overlay generation — but `match_teams.team_color` is being added with that future in mind.

---

## Design Summary

### 1. `scoring_type` drives everything

The `game_modes.scoring_type` column (TEXT, already exists) is the canonical type discriminator. Current values are capitalized: **`'Normal'` | `'FFA'` | `'Position'`**. Keep these capitalized values to avoid pointless string churn — just enforce that every system reads and branches on them.

This single field controls:
- Whether team assignment happens in the `assign` phase
- Which scoring UI component renders
- Whether tournament bracket logic is even possible (brackets are `Normal`-only)
- How the AI stats processor extracts data
- Default `setup` phase sub-components

### 2. Data model changes

**A. `match_teams` table (NEW)** — replaces hardcoded blue/red:
```sql
CREATE TABLE match_teams (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  team_color TEXT,           -- hex string for future stream overlays
  team_order INTEGER NOT NULL,
  voice_channel_id TEXT,     -- Discord voice channel for this team (nullable)
  is_reserve BOOLEAN DEFAULT 0,
  UNIQUE(match_id, team_order)
);
```
- `Normal` mode: 2 rows by default ('Blue'/'Red'), up to N for multi-team formats.
- `FFA` mode: one row per participant, auto-created at `gather → assign` transition (each participant is their own team).
- `Position` mode (individual): same as FFA.
- `Position` mode (team endurance): N rows, participants distributed across them.
- Reserve row(s): `is_reserve=1`. Participants benched land here.

**B. `match_participants.team_id`** — new FK column to `match_teams.id`. Replaces the existing `team_assignment` string. The existing `team` column (also a string) gets dropped in the same migration.

**C. `matches.team_count`** — int, denormalized for fast reads.

**D. `match_game_placements` table (NEW)** — replaces all the per-mode result columns on `match_games`:
```sql
CREATE TABLE match_game_placements (
  id TEXT PRIMARY KEY,
  match_game_id TEXT NOT NULL REFERENCES match_games(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('team', 'participant')),
  entity_id TEXT NOT NULL,         -- FK to match_teams.id OR match_participants.id (validated app-side)
  position INTEGER,                -- 1-based; null if unranked / DNF
  score INTEGER,                   -- raw score, optional
  points_awarded INTEGER,          -- computed from scoring spread (Position mode)
  is_winner BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(match_game_id, entity_type, entity_id)
);
CREATE INDEX idx_placements_match_game ON match_game_placements(match_game_id);
CREATE INDEX idx_placements_entity ON match_game_placements(entity_type, entity_id);
```
Replaces these legacy columns on `match_games`: `team_a`, `team_b`, `winner_id`, `participant_winner_id`, `participant1_id`, `participant2_id`, `is_ffa_mode`, `score_a`, `score_b`, `position_results`, `points_awarded`.

**E. `matches.position_scoring_override` (TEXT JSON)** — optional per-match override of the game-mode default spread. Same shape as `games.scoring_config`.

**F. `tournaments.position_scoring_override`** — same idea at tournament level.

**G. `tournaments.format`** — extend CHECK constraint from `('single-elimination', 'double-elimination')` to also allow `'cumulative-points'`. FFA and Position tournaments use this — no bracket, just a leaderboard of cumulative points across N rounds.

**H. Series tables (NEW)**:
```sql
CREATE TABLE series (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'active', 'complete', 'cancelled')),
  scoring_config TEXT,             -- JSON: how event outcomes convert to series points
  start_date DATETIME,
  end_date DATETIME,
  event_image_url TEXT,
  game_id TEXT REFERENCES games(id), -- nullable; series can span games
  guild_id TEXT,
  channel_id TEXT,
  announcements BOOLEAN DEFAULT 1,
  player_notifications BOOLEAN DEFAULT 1,
  livestream_link TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE series_events (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('match', 'tournament')),
  match_id TEXT REFERENCES matches(id) ON DELETE SET NULL,
  tournament_id TEXT REFERENCES tournaments(id) ON DELETE SET NULL,
  event_order INTEGER NOT NULL,
  event_date DATETIME,
  points_multiplier REAL DEFAULT 1.0,
  UNIQUE(series_id, event_order),
  CHECK (
    (event_type = 'match' AND match_id IS NOT NULL AND tournament_id IS NULL) OR
    (event_type = 'tournament' AND tournament_id IS NOT NULL AND match_id IS NULL)
  )
);

CREATE INDEX idx_series_events_series ON series_events(series_id);
CREATE INDEX idx_series_events_match ON series_events(match_id);
CREATE INDEX idx_series_events_tournament ON series_events(tournament_id);
```

Series standings are computed on demand. No materialized standings table for v1.

**I. `game_modes.setup_components` (TEXT JSON, NEW)** — declarative list of setup-phase components to render, in order. Defaults inferred from `scoring_type` when null:
- `Normal` default: `["teams"]`
- `FFA` default: `["confirm_participants"]`
- `Position` default: `["grid_order"]`

Racing modes (ACC) override to `["qualifying", "grid_order"]`. Game data files (`data/games/*/modes.json`) carry the override.

### 3. Lifecycle

Phase names unchanged: `created → gather → assign → battle → complete` (+ `cancelled`). The user explicitly wants to keep `assign` for all modes because it doubles as a setup hook for qualifying, class grouping, etc.

The `assign` phase becomes scoring-type-aware via the `setup_components` dispatcher. Drop hardcoded `matches.blue_team_voice_channel` and `matches.red_team_voice_channel`. Voice channels live on `match_teams.voice_channel_id`. Cap voice-channel creation at `MAX_VOICE_CHANNELS_PER_MATCH` (default 8); for FFA/Position default to a single shared voice channel or none.

### 4. Tournaments

- `Normal` tournaments: existing single/double-elimination logic, but reads/writes go through `match_game_placements`. Legacy `matches.red_team_id` / `matches.blue_team_id` FKs to `tournament_teams` stay; at `gather → assign` for a tournament match, the two `match_teams` rows are seeded from those tournament team references.
- `FFA` / `Position` tournaments: new `'cumulative-points'` format. Each round = one event with all participants playing. Placements convert to points via the active scoring spread.

### 5. Series (new feature)

- Top-level entity, equal sibling of Match and Tournament. UI at `/series/...`.
- Series owns its event schedule via a calendar UI (Mantine v9 `Calendar`/`DatePicker`).
- `series.scoring_config` declares conversion rules:
  ```json
  {
    "match_win_points": 10,
    "match_loss_points": 0,
    "tournament_position_points": [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
    "position_event_use_event_spread": true
  }
  ```

### 6. AI Stats Processor

Rewrite `processes/stats-processor/modules/ai-extractor.ts` to branch on the match's `scoring_type`. New `scorecard_player_stats.team_id` (nullable FK to `match_teams.id`) replaces the authoritative role of legacy `team_side`; `team_side` stays for legacy display until Phase 8 drop.

---

## Phased Implementation

This is a large rewrite. **Implement in order — each phase must compile and pass its tests before moving on.** Phases 1–7 ship behind dual-write/legacy fallback guards; Phase 8 drops legacy columns.

### Phase 1: Schema + data migration (foundation)

Add new tables/columns. Backfill from legacy columns. **Do not drop legacy columns yet** — they remain until Phase 8.

**New migration files (in `migrations/`)**:

1. `019_match_teams_and_placements.sql`:
   - Create `match_teams`.
   - Create `match_game_placements` + indexes.
   - `ALTER TABLE matches ADD COLUMN team_count INTEGER DEFAULT 2`.
   - `ALTER TABLE matches ADD COLUMN position_scoring_override TEXT`.
   - `ALTER TABLE match_participants ADD COLUMN team_id TEXT REFERENCES match_teams(id)`.
   - `ALTER TABLE tournaments ADD COLUMN position_scoring_override TEXT`.
   - `ALTER TABLE game_modes ADD COLUMN setup_components TEXT`.
   - `ALTER TABLE scorecard_player_stats ADD COLUMN team_id TEXT REFERENCES match_teams(id)`.
   - Indexes: `idx_match_teams_match`, `idx_match_participants_team_id`, `idx_scorecard_player_stats_team_id`.

2. `020_tournaments_cumulative_format.sql`:
   - SQLite can't easily widen a CHECK constraint. Rebuild `tournaments` with `format` CHECK including `'cumulative-points'`, copy data through. Same table-rebuild pattern as migration 018 used for `matches`.

3. `021_backfill_match_teams.sql` (data migration):
   - For every existing match:
     - For `Normal` matches: insert two `match_teams` rows ('Blue' #4A90E2 order=0, 'Red' #E04A4A order=1) using existing `blue_team_voice_channel` / `red_team_voice_channel`.
     - For `FFA` / `Position` individual matches: insert one `match_teams` row per participant (order=0..N, is_reserve=0).
   - Backfill `match_participants.team_id`:
     - `Normal`: map `team_assignment='blue'` → Blue row, `team_assignment='red'` → Red row, `team_assignment='reserve'` → new reserve row per match (`is_reserve=1, team_order=99`).
     - `FFA` / `Position` individual: each participant → their own team row.
   - Backfill `matches.team_count` from `scoring_type` and current data.
   - Backfill `match_game_placements` from legacy columns:
     - From `match_games.winner_id` (`'team1'`/`'team2'`) → insert placement rows for both teams, `is_winner=1` for winner.
     - From `match_games.participant_winner_id` → insert placement with `position=1, is_winner=1`.
     - From `match_games.position_results` JSON → one placement row per participant with `position` + `points_awarded` from `match_games.points_awarded`.

4. `022_series_tables.sql`:
   - Create `series`, `series_events`, indexes.

5. `023_drop_legacy_columns.sql` (**only run in Phase 8**):
   - Drop from `matches`: `blue_team_voice_channel`, `red_team_voice_channel`.
   - Rebuild `match_games` without: `team_a`, `team_b`, `winner_id`, `participant_winner_id`, `participant1_id`, `participant2_id`, `is_ffa_mode`, `score_a`, `score_b`, `position_results`, `points_awarded`.
   - Drop from `match_participants`: `team`, `team_assignment`. Make `team_id` NOT NULL.
   - Drop from `scorecard_player_stats`: legacy `team_side`.

### Phase 2: Scoring engine rewrite

**Files (modify):**
- `src/lib/scoring-functions.ts` — full rewrite, scoring_type aware:
  - `saveMatchResult(matchId, gameId, result)` → dispatches by scoring_type to `saveTeamResult`, `saveFfaResult`, `savePositionResult` (all write to `match_game_placements`).
  - `getMatchResult(matchId, gameId)` → reads placements, returns discriminated union.
  - `getOverallMatchScore(matchId)` → branches on scoring_type.
  - `determineMatchWinner(matchId)` → branches on scoring_type.
  - `getPointsForPosition(position, matchId)` → reads `matches.position_scoring_override` first, falls back to `games.scoring_config`.
- `src/app/api/matches/[matchId]/games/[gameId]/result/route.ts` — accept type-tagged body.
- `src/app/api/matches/[matchId]/games-with-results/route.ts` — return new discriminated shape.

**Files (new):**
- `src/lib/types/scoring.ts` — `ScoringType`, `Placement`, `MatchGameResult` discriminated union types.

### Phase 3: Lifecycle + setup phase generalization

**Files (modify):**
- `src/lib/transition-handlers.ts` — `gather → assign` creates `match_teams` per scoring_type; voice channel creation iterates non-reserve teams with cap.
- `processes/discord-bot/modules/interaction-handler.ts` — N-team assignment commands; suppress for non-Normal modes.
- `processes/discord-bot/modules/announcement-handler.ts` — read team names + colors from `match_teams`; embed copy per scoring_type.
- `src/components/assign-players-modal.tsx` → rename to `src/components/setup/setup-phase.tsx`; convert to dispatcher.
- `src/app/api/matches/[matchId]/assign-teams/route.ts` — generalize to N teams (accept team_id rather than 'blue'/'red').
- `src/app/api/matches/[matchId]/transition/route.ts` — call into `match-setup.ts`.
- `data/games/assettocorsacompetizione/modes.json` — add `setup_components: ["qualifying", "grid_order"]`.
- `data/games/mariokart8deluxe/modes.json` — add `setup_components: ["grid_order"]`.
- The seeder that ingests `data/games/*/modes.json` (verify exact file under `src/lib/`) — read and persist `setup_components` into `game_modes.setup_components`.

**Files (new):**
- `src/lib/match-setup.ts` — helpers that build `match_teams` rows per scoring_type.
- `src/components/setup/teams-setup.tsx` (extracted drag-drop, N teams)
- `src/components/setup/confirm-participants.tsx`
- `src/components/setup/grid-order.tsx`
- `src/components/setup/qualifying.tsx`
- `src/components/setup/classes.tsx`

### Phase 4: Tournament FFA/Position support

**Files (modify):**
- `src/lib/tournament-bracket.ts` — bracket logic gated to `Normal`; add `generateCumulativeRound`, `computeCumulativeStandings`.
- `src/app/api/tournaments/[tournamentId]/standings/route.ts` — branch on `format`.
- `src/app/api/tournaments/[tournamentId]/generate-matches/route.ts` — route to cumulative when applicable.
- `src/app/api/tournaments/[tournamentId]/transition/route.ts` — cumulative round advancement.
- `src/app/tournaments/[tournamentId]/page.tsx` — pick `BracketView` vs `LeaderboardView`.

**Files (new):**
- `src/components/tournament/leaderboard-view.tsx`.

### Phase 5: AI stats processor rewrite

**Files (modify):**
- `processes/stats-processor/modules/ai-extractor.ts` — scoring_type aware; build prompt per type; resolve teams via `match_teams`.
- `src/lib/scoring-functions.ts` → `queueScorecardPrompts` — DM copy adapts per scoring_type.
- App settings (DB): add `ai_processor_version` ('legacy' | 'v2'), defaults to 'legacy' through Phase 7; flipped in Phase 8.

### Phase 6: Series entity

**Files (new):**
- `src/lib/series.ts` — CRUD + `computeSeriesStandings`.
- `src/app/api/series/route.ts`, `[seriesId]/route.ts`, `[seriesId]/events/route.ts`, `[seriesId]/standings/route.ts`, `[seriesId]/transition/route.ts`.
- `src/app/series/page.tsx`, `create/page.tsx`, `[seriesId]/page.tsx`, `[seriesId]/edit/page.tsx`, `history/page.tsx`.
- `src/components/series/series-calendar.tsx`, `series-standings.tsx`, `add-event-modal.tsx`, `scoring-config-editor.tsx`.

**Files (modify):**
- `processes/discord-bot/modules/announcement-handler.ts` — series announcements (kickoff, event reminders, finale, final standings).
- Sidebar/layout component (verify path) — add "Series" entry.

### Phase 7: UI updates (creation flows, scoring, dashboards)

**Files (modify):**
- `src/components/create-match-page.tsx` — capture `team_count` and `position_scoring_override`; remove blue/red voice channel pickers; add "create voice channel per team" toggle.
- `src/components/create-tournament-page.tsx` — `'cumulative-points'` option when game_mode is FFA/Position; position scoring override step.
- `src/components/scoring/PositionScoring.tsx` — read from `match_game_placements`; honor per-match override.
- `src/app/matches/[matchId]/scoring/page.tsx` — dispatcher by scoring_type.
- Match dashboards/history pages — read team names/colors from `match_teams`.

**Files (new):**
- `src/components/scoring/TeamMapScoring.tsx` (split out of SimpleMapScoring)
- `src/components/scoring/FfaMapScoring.tsx` (split out of SimpleMapScoring)

**Files (delete):**
- `src/components/scoring/SimpleMapScoring.tsx` — fully replaced by Team/Ffa variants.
- `src/components/assign-players-modal.tsx` — renamed/replaced by `src/components/setup/setup-phase.tsx` in Phase 3.

### Phase 8: Final cleanup

- Flip `ai_processor_version` setting to `'v2'`.
- Run migration `023_drop_legacy_columns.sql`.
- Delete any dual-write / legacy fallback shims left in `scoring-functions.ts`.
- Delete any unused references to dropped columns (`blue_team_voice_channel`, `red_team_voice_channel`, `team_assignment`, `team`, `team_side` authoritative path, legacy match_games columns).
- Update `CLAUDE.md`:
  - Note the new architecture under "Match System"
  - Update schema bullet list under "Database"
  - Add a "Series System" section
- Final regression sweep: `npm run lint`, `npm run test`, manual end-to-end of each scoring_type.

---

## Critical Files (existing) — to be modified

| File | Phase | Reason |
|------|-------|--------|
| `src/lib/scoring-functions.ts` | 2 | Full rewrite |
| `src/lib/transition-handlers.ts` | 3 | match_teams creation; voice channel iteration |
| `src/lib/tournament-bracket.ts` | 4 | Cumulative-points format |
| `src/components/scoring/PositionScoring.tsx` | 7 | Read from placements; per-match override |
| `src/components/create-match-page.tsx` | 7 | N-teams + scoring override |
| `src/components/create-tournament-page.tsx` | 7 | Cumulative format option |
| `src/app/api/matches/[matchId]/games/[gameId]/result/route.ts` | 2 | New result shape |
| `src/app/api/matches/[matchId]/games-with-results/route.ts` | 2 | New return shape |
| `src/app/api/matches/[matchId]/assign-teams/route.ts` | 3 | N teams |
| `src/app/api/matches/[matchId]/transition/route.ts` | 3 | Lifecycle hook |
| `src/app/api/tournaments/[tournamentId]/standings/route.ts` | 4 | Format branch |
| `src/app/api/tournaments/[tournamentId]/generate-matches/route.ts` | 4 | Cumulative path |
| `src/app/api/tournaments/[tournamentId]/transition/route.ts` | 4 | Cumulative round advance |
| `src/app/matches/[matchId]/scoring/page.tsx` | 7 | Dispatcher |
| `src/app/tournaments/[tournamentId]/page.tsx` | 4 | Bracket vs leaderboard |
| `processes/stats-processor/modules/ai-extractor.ts` | 5 | scoring_type aware |
| `processes/discord-bot/modules/interaction-handler.ts` | 3 | N-team commands |
| `processes/discord-bot/modules/announcement-handler.ts` | 3, 6 | Team source + series announcements |
| `data/games/assettocorsacompetizione/modes.json` | 3 | setup_components |
| `data/games/mariokart8deluxe/modes.json` | 3 | setup_components |
| Seeder under `src/lib/` (locate file that reads modes.json) | 3 | Persist `setup_components` |
| `CLAUDE.md` | 8 | Final doc update |

## New source files

- `migrations/019_match_teams_and_placements.sql`
- `migrations/020_tournaments_cumulative_format.sql`
- `migrations/021_backfill_match_teams.sql`
- `migrations/022_series_tables.sql`
- `migrations/023_drop_legacy_columns.sql`
- `src/lib/types/scoring.ts`
- `src/lib/match-setup.ts`
- `src/lib/series.ts`
- `src/components/setup/setup-phase.tsx`
- `src/components/setup/teams-setup.tsx`
- `src/components/setup/confirm-participants.tsx`
- `src/components/setup/grid-order.tsx`
- `src/components/setup/qualifying.tsx`
- `src/components/setup/classes.tsx`
- `src/components/scoring/TeamMapScoring.tsx`
- `src/components/scoring/FfaMapScoring.tsx`
- `src/components/tournament/leaderboard-view.tsx`
- `src/components/series/series-calendar.tsx`
- `src/components/series/series-standings.tsx`
- `src/components/series/add-event-modal.tsx`
- `src/components/series/scoring-config-editor.tsx`
- `src/app/api/series/route.ts`
- `src/app/api/series/[seriesId]/route.ts`
- `src/app/api/series/[seriesId]/events/route.ts`
- `src/app/api/series/[seriesId]/standings/route.ts`
- `src/app/api/series/[seriesId]/transition/route.ts`
- `src/app/series/page.tsx`
- `src/app/series/create/page.tsx`
- `src/app/series/[seriesId]/page.tsx`
- `src/app/series/[seriesId]/edit/page.tsx`
- `src/app/series/history/page.tsx`

## Source files to DELETE

- `src/components/scoring/SimpleMapScoring.tsx` (Phase 7 — replaced by Team/Ffa variants)
- `src/components/assign-players-modal.tsx` (Phase 3 — renamed to `src/components/setup/setup-phase.tsx`)

## Reuse opportunities

- `tournament_teams` (migration 005) already models N teams per tournament — mirror its shape for `match_teams`.
- Tournament matches already FK to `tournament_teams` via `matches.red_team_id` / `matches.blue_team_id`. Keep these; at `gather → assign` for a tournament match, seed two `match_teams` rows from those references.
- The existing scorecard submission/review flow (queue + review + auto-assign by username) is sound — keep flow, swap extraction prompt per scoring_type.
- Mantine v9 was already adopted (see `MEMORY.md` → `project_mantine_upgrade`). Use v9 calendar/date components from `@mantine/dates` for series scheduling.
- `queueScoreNotification()` (existing) — reuse for series-event-completion announcements.
- `match_participants.receives_map_codes` (commander flag) — keep; still relevant for Normal team modes.
- Migration 018's table-rebuild pattern is the template for migrations 020 and 023 (SQLite can't widen CHECK constraints in place).

---

## Test Plan

The existing test inventory under `tests/` is extensive. Every phase has a corresponding set of test changes. **Each test below is tagged UPDATE / CREATE / DELETE.** Phase order matches the implementation phases.

### Conventions

- "UPDATE" means the file stays but assertions must be revised — usually because legacy columns (`team_assignment`, `winner_id`, `participant_winner_id`, etc.) are replaced with new shape (`team_id`, `match_game_placements`).
- "CREATE" means a new test file added under `tests/` (location specified).
- "DELETE" means the file is removed because the code it tested is removed.
- After Phase 8, **every test must pass against the post-cleanup schema** (no references to dropped columns).

### Phase 1 — schema/migration tests

**UPDATE:**
- `tests/integration/database/migrations.test.ts` — assert new tables exist (`match_teams`, `match_game_placements`, `series`, `series_events`); assert new columns on `matches` / `match_participants` / `tournaments` / `game_modes` / `scorecard_player_stats`; assert backfill produced expected rows for a fixture of each scoring_type.
- `tests/integration/database/migrations-idempotency.test.ts` — run migrations 019–022 twice; verify idempotency (no duplicate rows, no errors).
- `tests/integration/database/schema.test.ts` — update column lists; assert new FKs and indexes.
- `tests/integration/database/foreign-keys.test.ts` — add cases for `match_participants.team_id` → `match_teams.id`, `series_events` FKs, `match_game_placements` FK to `match_games`.
- `tests/integration/database/connection.test.ts` / `connection-extended.test.ts` — verify connection lifecycle still works against new schema (likely minimal changes).
- `tests/integration/database/seeder.test.ts`, `seeder-data-integrity.test.ts`, `seeder-full.test.ts` — assert `game_modes.setup_components` populated correctly from updated `modes.json` files.

**CREATE:**
- `tests/integration/database/backfill-match-teams.test.ts` — dedicated test for migration `021_backfill_match_teams.sql`. Seed legacy fixtures (Normal match with team_assignment='blue'/'red'/'reserve', FFA match with participant_winner_id, Position match with position_results JSON) → run migration → assert correct `match_teams` rows, `match_participants.team_id` values, `match_game_placements` rows.

### Phase 2 — scoring engine tests

**UPDATE (substantial rewrites):**
- `tests/unit/scoring-functions.test.ts` — rewrite around the new dispatcher; cover `saveTeamResult` / `saveFfaResult` / `savePositionResult` round-trips; cover `getOverallMatchScore` per type; cover `determineMatchWinner` per type.
- `tests/unit/scoring-functions-extended.test.ts` — extend with edge cases: ties in Normal, zero-score FFA, DNF (null position) in Position.
- `tests/unit/scoring-edge-cases.test.ts` — update edge cases: per-match override beats game default; missing override falls back to game default; spread shorter than position count.
- `tests/integration/api/match-results.test.ts` — new POST/GET shapes for each scoring_type.
- `tests/integration/api/match-game-result-routes.test.ts` — same.
- `tests/integration/api/match-score-routes.test.ts` — same.

**CREATE:**
- `tests/unit/lib/types/scoring.test.ts` — type-narrowing tests for `MatchGameResult` discriminated union (compile-time + runtime guards).

### Phase 3 — lifecycle / setup tests

**UPDATE:**
- `tests/unit/transition-handlers.test.ts` — assert `match_teams` rows created correctly per scoring_type; FFA creates per-participant rows; Normal creates Blue/Red; Position individual same as FFA; voice channels created up to cap.
- `tests/unit/transition-handlers-extended.test.ts` — extended cases (reserve handling, mid-transition failures).
- `tests/unit/transition-edge-cases.test.ts` — edge cases (zero participants, oversize FFA capped at MAX_VOICE_CHANNELS_PER_MATCH).
- `tests/integration/api/match-transitions.test.ts` — full flow through new transitions for each scoring_type.
- `tests/integration/api/match-full-lifecycle.test.ts` — Normal + FFA + Position lifecycle each with new shape.
- `tests/integration/api/match-cancel-flow.test.ts` — cancel must clean up `match_teams` + `match_game_placements`.
- `tests/integration/api/match-participants.test.ts` — participants now expose `team_id`; legacy `team_assignment` not asserted.
- `tests/integration/api/matches.test.ts` — match creation accepts `team_count` and `position_scoring_override`.
- `tests/unit/discord-bot/interaction-handler.test.ts` / `interaction-handler-extended.test.ts` / `interaction-helpers.test.ts` — N-team assignment commands; suppress for non-Normal modes.
- `tests/unit/discord-bot/announcement-handler.test.ts` / `announcement-handler-extended.test.ts` / `announcement-helpers.test.ts` — embeds read team data from `match_teams`; embed format adapts per scoring_type.
- `tests/unit/lib/voice-channel-manager.test.ts` / `voice-channel-manager-extended.test.ts` / `voice-channel-service.test.ts` — iterate `match_teams` for voice channel creation; honor cap.
- `tests/unit/lib/notifications.test.ts` — match-related notifications include team info from `match_teams`.
- `tests/unit/lib/reminder-helpers.test.ts` / `reminder-helpers-extended.test.ts` — reminders adapt to N teams.

**CREATE:**
- `tests/unit/lib/match-setup.test.ts` — new module's `match_teams` builder helpers.
- `tests/unit/setup/setup-phase-dispatcher.test.ts` — dispatcher renders correct components for each `setup_components` config.
- `tests/unit/setup/grid-order.test.ts` — drag-sort/reorder logic.
- `tests/unit/setup/qualifying.test.ts` — qualifying inputs auto-sort grid.

### Phase 4 — tournament tests

**UPDATE:**
- `tests/unit/tournament-bracket.test.ts` — Normal-only paths gated; add cumulative-format scenarios; verify points sum across rounds.
- `tests/unit/tournament-bracket-extended.test.ts` — extended cumulative cases.
- `tests/unit/tournament-edge-cases.test.ts` — edge cases for cumulative (zero rounds, single-participant tournament, ties at top).
- `tests/integration/api/tournaments.test.ts` — POST accepts `format='cumulative-points'`; standings response shape branches.
- `tests/integration/api/tournament-generate-matches.test.ts` — generates cumulative round correctly.
- `tests/integration/api/tournament-progress.test.ts` — progression for cumulative format.
- `tests/integration/api/tournament-full-lifecycle.test.ts` — full cumulative tournament lifecycle.
- `tests/integration/api/tournament-team-routes-extended.test.ts` — tournament_teams unchanged but verify FFA/Position tournaments don't require team_id pairs on matches.
- `tests/unit/create-tournament/tournament-helpers.test.ts` — cumulative format option in helpers.
- `tests/unit/lib/tournament-notifications.test.ts` / `tournament-notifications-extended.test.ts` — leaderboard format announcements.
- `tests/unit/lib/tournament-transition-handlers.test.ts` / `tournament-transition-handlers-extended.test.ts` — cumulative round advancement.

### Phase 5 — AI stats processor tests

**UPDATE:**
- `tests/unit/stats-processor/ai-extractor.test.ts` — scoring_type aware extraction; resolve teams via `match_teams`; assert no team_id for FFA/Position rows.
- `tests/unit/stats-processor/index.test.ts` / `index-extended.test.ts` — entry-point dispatch by scoring_type.
- `tests/unit/stats-processor/stat-image-generator.test.ts` / `stat-image-generator-extended.test.ts` — image generation adapts per scoring_type (Normal: split blue/red; FFA: ranked list; Position: grid).
- `tests/unit/stats-processor/providers/anthropic.test.ts`, `google.test.ts`, `openrouter.test.ts`, `providers/index.test.ts` — verify prompt variants reach the right provider (likely small changes, since providers are mostly transport).
- `tests/unit/lib/ai-model-resolver.test.ts` — minor (verify no regression).
- `tests/unit/lib/stats-aggregation-extended.test.ts` — aggregations honor scoring_type (sum stats per team_id when present, per participant otherwise).
- `tests/integration/lib/stats-aggregation.test.ts` — same end-to-end.
- `tests/integration/api/scorecard-routes.test.ts` — submission flow per scoring_type.
- `tests/integration/api/scorecard-submission-routes.test.ts` — same.
- `tests/integration/api/match-stats-routes.test.ts` — stats display routes branch on scoring_type.
- `tests/unit/discord-bot/scorecard-handler.test.ts` / `scorecard-handler-extended.test.ts` — DM prompt copy varies by scoring_type.
- `tests/unit/discord-bot/stats-report-handler.test.ts` — stats report adapts.

**CREATE:**
- `tests/unit/stats-processor/extractor-ffa.test.ts` — extraction with FFA fixtures.
- `tests/unit/stats-processor/extractor-position.test.ts` — extraction with Position fixtures.
- `tests/unit/stats-processor/extractor-version-flag.test.ts` — `ai_processor_version='legacy'` falls back; `='v2'` uses new path.

### Phase 6 — series tests

**CREATE:**
- `tests/integration/api/series.test.ts` — CRUD on `/api/series` and `/api/series/[seriesId]`.
- `tests/integration/api/series-events.test.ts` — add/remove/reorder events; CHECK constraint enforcement.
- `tests/integration/api/series-standings.test.ts` — standings endpoint with mixed match + tournament events.
- `tests/integration/api/series-transitions.test.ts` — series lifecycle transitions.
- `tests/unit/lib/series.test.ts` — module unit tests for CRUD and helpers.
- `tests/unit/lib/series-aggregation.test.ts` — `computeSeriesStandings` across mixed event types; verify `points_multiplier` weighting; verify position vs win conversions.
- `tests/unit/create-series/series-helpers.test.ts` — wizard helpers (validation, normalization).
- `tests/unit/discord-bot/series-announcements.test.ts` — kickoff/event-reminder/finale/final-standings announcements.

**UPDATE:**
- `tests/integration/queues/queue-contracts.test.ts` — add series announcement queue contracts.
- `tests/integration/discord-queue-contracts-extended.test.ts` — same.
- `tests/unit/discord-announcements.test.ts` / `shared/discord-announcements.test.ts` — series announcement embeds.
- `tests/unit/scheduler/timed-announcements.test.ts` / `timed-announcements-extended.test.ts` — scheduler dispatches series event reminders.
- `tests/unit/scheduler/index.test.ts` / `index-extended.test.ts` — registers series cron job.

### Phase 7 — UI / helper tests

**UPDATE:**
- `tests/unit/create-match/match-helpers.test.ts` — accept `team_count`; accept `position_scoring_override`; remove blue/red voice channel fields.
- `tests/unit/create-tournament/tournament-helpers.test.ts` — `format='cumulative-points'` option; position override field.
- `tests/unit/lib/match-api-helpers.test.ts` — helper functions adapted to new shape.
- `tests/unit/lib/map-code-service.test.ts` / `map-code-service-extended.test.ts` — map codes still tied to teams via `match_teams`.
- `tests/unit/lib/feed-helpers.test.ts` / `feed-helpers-extended.test.ts` — feed rendering reads team names/colors from `match_teams`.
- `tests/integration/api/games.test.ts`, `games-extended.test.ts` — `game_modes` responses include `setup_components`.
- `tests/integration/api/upload-event-image.test.ts` — series can also have event images (extend to cover `/api/series/[seriesId]/image` if implemented).

**CREATE:**
- `tests/unit/scoring/team-map-scoring.test.ts` — component logic.
- `tests/unit/scoring/ffa-map-scoring.test.ts` — component logic.

### Phase 8 — cleanup verification tests

**UPDATE:**
- `tests/integration/database/migrations.test.ts` — assert legacy columns dropped after migration 023.
- `tests/integration/database/schema.test.ts` — final schema shape.
- `tests/integration/database/foreign-keys.test.ts` — `match_participants.team_id` is NOT NULL now.
- `tests/integration/system/full-suite-sanity.test.ts` — full sanity sweep across the new system.

**DELETE (tests for removed legacy paths):**
- None expected — all existing test files are revised, not deleted. The exception: if any test file solely targets `SimpleMapScoring.tsx` (e.g. a `tests/unit/scoring/simple-map-scoring.test.ts` if it exists post-Phase-2), delete it after Phase 7's split.

### Cross-phase test concerns

- **Test fixtures (`tests/utils/fixtures.ts`, `test-db.ts`)** must be updated alongside Phase 1:
  - `seedBasicTestData()` should include game modes covering all three `scoring_type` values.
  - `createMatch()` should accept optional `scoring_type` / `team_count` / `position_scoring_override` and seed `match_teams` rows appropriately.
  - `createTournament()` should accept `format='cumulative-points'`.
  - Add `createSeries()` helper in Phase 6.
- **Mocks (`tests/mocks/database.ts`, `discord.ts`)** must reflect new schema. Discord mock channel creation should support N voice channels per match.
- **Vitest setup (`tests/setup.ts`, `vitest-mocks.ts`)**: no structural change expected; mocks remain in individual test files.
- **DB isolation:** memory note in `MEMORY.md` says `setDbForTesting()` injects the test DB into `getDbInstance()` so API routes share the test connection. Confirm this still holds for new routes (series, etc.) — every new API route under `src/app/api/series/` must use `getDbInstance()`, not a separately opened sqlite handle.

---

## Verification Plan

After each phase: `npm run lint` clean, and the phase's targeted tests pass.

After all phases:

1. **Migration safety:**
   - Boot fresh DB → `npm run migrate` → assert all new tables/columns exist.
   - Boot against a **copy of a real prod DB** (`./app_data/data/matchexec.db`) → confirm backfill produces correct data for each scoring_type currently present.
   - Confirm legacy column drops in migration 023 don't break any startup queries.

2. **Normal end-to-end:** Create OW2 5v5 match → gather → assign (verify Blue/Red `match_teams` rows) → battle → complete. Compare scoring against pre-migration behavior on a duplicate match.

3. **FFA end-to-end:** Create CS2 Deathmatch → gather → assign (only `confirm_participants` shows; per-participant `match_teams` rows auto-created) → battle (record per-map per-player winner) → complete.

4. **Position end-to-end:** Create ACC Quick Race → gather → assign (qualifying → grid_order) → battle (record positions per round) → complete. Verify per-match override beats game default.

5. **N-team endurance:** Create ACC Endurance with 6 teams × 3 drivers → assign (6 `match_teams` rows) → record team positions → verify team-level cumulative points.

6. **FFA cumulative tournament:** Create Mario Kart cumulative tournament with 8 players × 4 rounds → record positions per round → verify leaderboard.

7. **Series:** Create a series with 3 races + 1 tournament finale (multiplier 2.0) → record results → verify aggregated standings.

8. **AI processor (`ai_processor_version='v2'`):**
   - Normal: upload scorecard → AI tags via `match_teams` lookup.
   - FFA: upload scorecard → per-player stats only, no team_id.
   - Position: upload scorecard → finishing positions extracted.

9. **Discord integration:** Trigger announcements for Normal match, FFA match, Position match, tournament (both formats), and series. Confirm embeds source team names/colors from `match_teams`.

10. **Regression:** `npm run test` (full Vitest suite). No unrelated breakage.

11. **Docker build:** `docker build -t matchexec:test .` → boot container → confirm all processes start and migrations run.

## Risk Notes

- **Biggest risk:** Phase 1 backfill (`021_backfill_match_teams.sql`) on real prod data. Test against a DB copy before deploying. If backfill produces unexpected rows for any historical match, fix the migration before running on prod.
- **AI prompt rewrites** (Phase 5) may need iteration — `ai_processor_version` allows quick rollback to legacy if v2 produces worse extractions.
- **`match_game_placements` can be wide** — 30 rows per game for a 30-player FFA × N maps adds up. Indexed on `(match_game_id)` and `(entity_type, entity_id)`. Watch perf on large FFA matches.
- **N-team voice channels:** Discord rate limits will bite if we naively create one channel per team for a 30-team race. Cap at `MAX_VOICE_CHANNELS_PER_MATCH` (default 8); for FFA/Position default to a single shared voice channel or none.
- **Mantine v9 calendar components:** verify `@mantine/dates` v9 subpackage import paths.
- **SQLite CHECK constraints can't be widened in place.** Migrations 020 and 023 follow migration 018's table-rebuild pattern. Be careful with FK references during rebuilds.
- **Test fixtures churn:** updating `tests/utils/fixtures.ts` (Phase 1) is load-bearing for the entire test suite. Verify fixture changes don't unintentionally break unrelated tests by running the full suite after Phase 1 is complete.
