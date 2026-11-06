# Series rework: seasons, entrants, stages, generators, playoffs

Goal: a series can run a whole competitive season (inspiration: Overwatch League 2018-2019), a solo championship
(Mario Kart, Fortnite) or a team championship (endurance racing). The series **creates** its matches and tournaments,
in any order and number, instead of only attaching existing ones.

The wire contract (DTOs, request bodies, standings shape) is `shared/series-types.ts`. This document is the design and
the work breakdown. When they disagree, `shared/series-types.ts` wins.

## 1. Concepts

- **Series** (season). Locked to one **scoring type** (`Normal` | `FFA` | `Position`) and a set of allowed games that
  all support it (for example Overwatch 2 + Marvel Rivals, or several racing games). `game_id` is the primary/default
  game, `game_ids` the allowed set (empty = just `game_id`). Legacy series have `scoring_type = null` (no restriction).
- **Entrant**: who competes all season: a team or a single player. `entrant_type` = `solo` | `team` with `roster_min`/
  `roster_max`. Solo entrant = exactly one member. Team entrants cover OWL teams and endurance cars alike: the match
  engine already handles Normal team-vs-team, FFA/Position one-row-per-participant, and Position team endurance
  (`team_size > 1`, `createTeamEnduranceTeams` in `src/lib/matches/teams.ts`).
  Entrants belong to one series; "copy entrants from a previous series" seeds a new season.
  Optional **division** per entrant (free text, e.g. "Atlantic"/"Pacific").
- **Stage**: an ordered group of events with its own standings (`Stage 1`, `Stage 2`, `Playoffs`). Optional: events may
  have `stage_id = null` (legacy series and simple seasons are effectively one implicit stage). `counts_toward_season`
  controls whether a stage's events feed the season table.
- **Event**: one match or one tournament, any order, any number. `role` = `regular` | `stage_playoff` |
  `season_playoff` | `exhibition`; `week`; `points_multiplier`; `counts_for_standings` (default true for `regular`,
  false otherwise); `entrant_ids` (null = all active entrants); `status` = `live` (has a target) or `planned`
  (playoff placeholder with a `seeding_rule` and no target yet).
- **Batch**: the config of a generator run (round robin / race calendar) so its unplayed fixtures can be regenerated or
  removed as one unit.

## 2. Schema (one Drizzle migration, `drizzle/0003_*.sql`)

All in `lib/db/schema/series.ts` unless stated. Text ids via the existing `genId` helper pattern.

### `series` (alter)
| column | type |
|---|---|
| `status` | enum adds `registration`: `created, registration, active, complete, cancelled` (update the check constraint) |
| `entrant_type` | text enum `solo, team`, not null, default `solo` |
| `roster_min`, `roster_max` | integer null |
| `scoring_type` | text enum `Normal, FFA, Position`, null |
| `game_ids` | jsonb `string[]`, not null, default `[]` |
| `game_mode_id` | text null |
| `match_defaults` | jsonb `SeriesMatchDefaults` null |
| `discord_config` | jsonb `SeriesDiscordConfig` null |
| `previous_series_id` | text null, FK `series.id` on delete set null |

`scoring_config` keeps its name; its type becomes `SeriesScoringConfig` from `shared/series-types.ts`.
No data backfill is needed: `game_ids = []` means "just `game_id`", a config without `mode` is legacy.

### `series_entrants` (new)
`id` pk, `series_id` FK cascade, `name` not null, `tag`, `color`, `logo_url`, `division`, `seed` integer,
`status` enum `pending, active, withdrawn` default `active`, `source_entrant_id` text null (no FK; copied-from),
`created_at`, `updated_at` ($onUpdate). Unique (`series_id`, `name`). Index `series_id`.

### `series_entrant_members` (new)
`id` pk, `entrant_id` FK `series_entrants` cascade, `series_id` FK `series` cascade (denormalised for the uniqueness
rule), `user_id` not null, `discord_user_id`, `username` not null, `role` enum `captain, player, sub` default `player`,
`joined_at` default now, `left_at` null. Partial unique index (`series_id`, `user_id`) WHERE `left_at IS NULL` (a player
is on at most one current roster per series). Indexes on `entrant_id`, `discord_user_id`.

### `series_stages` (new)
`id` pk, `series_id` FK cascade, `name`, `stage_order` int, `status` enum `upcoming, active, complete` default
`upcoming`, `counts_toward_season` boolean default true, `scoring_config` jsonb null, timestamps. Unique
(`series_id`, `stage_order`).

### `series_event_batches` (new)
`id` pk, `series_id` FK cascade, `stage_id` FK `series_stages` set null, `kind` enum `round_robin, race_calendar`,
`config` jsonb not null, `created_at`.

### `series_events` (alter)
`stage_id` FK `series_stages` **on delete set null**; `role` enum default `regular`; `week` int null;
`counts_for_standings` boolean not null default true; `batch_id` FK batches set null; `status` enum `planned, live`
default `live`; `entrant_ids` jsonb `string[]` null; `seeding_rule` jsonb `SeriesSeedingRule` null.
Replace `series_events_event_type_target_check` with:
`(status = 'planned' AND match_id IS NULL AND tournament_id IS NULL) OR (status = 'live' AND <existing condition>)`.
Index `stage_id`.

### Links from the match / tournament side
- `match_teams.series_entrant_id` text null FK `series_entrants` on delete set null (index).
- `tournament_teams.series_entrant_id` text null FK `series_entrants` on delete set null (index).

### Discord
- `discord_channels.send_series_updates` boolean not null default false (label in the UI: **Series Updates**). Only the
  weekly schedule and standings posts use it; registration goes to announcement channels and playoff/champion posts to
  live-update channels (see section 5, Discord).
- `discord_series_update_queue` (in `lib/db/schema/queues.ts`, same shape as `discord_health_alert_queue`):
  `id`, `series_id` FK series cascade, `kind` text (`SeriesUpdateKind`), `dedupe_key` text null, `payload` jsonb,
  `status` enum `pending, processing, completed, failed` + check, `created_at`, `processed_at`, `last_error`,
  `attempts`, `max_attempts` default 5, `claimed_at`, `claimed_by`, `next_attempt_at`, `external_message_id`.
  Unique (`series_id`, `kind`, `dedupe_key`) (NULLs distinct, so un-keyed posts never collide). Index on `status`.

### SQLite importer (`lib/import-sqlite/mappings.ts`)
Every new column must be mapped (it is a compile error otherwise): new `series` / `series_events` / `match_teams` /
`tournament_teams` / `discord_channels` columns map to their defaults (legacy databases never have them). New tables
have no legacy source. Keep `tests/integration/import` and `tests/unit/import-sqlite` green.

## 3. Domain modules (`src/lib/series/`)

| file | owner | contents |
|---|---|---|
| `series.ts`, `validation.ts` | A | new fields, status `registration`, validation of `scoring_type`/`game_ids` (every game must have a mode with that scoring type), `match_defaults`, `discord_config`, `entrant_type`/roster bounds |
| `entrants.ts` | A | entrant + member CRUD, soft leave (`left_at`), copy from previous series, `resolveEntrantForPlayer`, `listActiveRoster`, player search |
| `stages.ts` | A | stage CRUD, reorder, status (`upcoming -> active -> complete`) |
| `events.ts` | A | placement fields on attach/update, scoring-type/game checks on attach, planned-event rows, list read model per `SeriesEventDto` |
| `standings.ts` (+ `standings-*.ts`) | B | standings engine (section 5), `getSeriesChampion` |
| `builder.ts`, `rosters.ts` | C | create match / tournament events with preset entrants, preset-team tournaments, withdraw |
| `generators/round-robin.ts`, `generators/race-calendar.ts`, `generators/schedule.ts` | C | pure generators + slot scheduling + commit/regenerate |
| `playoffs.ts` | E | seed preview, seeding (materialise planned events), stage completion hooks |
| `registration.ts` | D | Discord registration flows (register / join / leave) built on `entrants.ts` |
| `src/lib/tournaments/bracket-math.ts` `seedOrder(n)` | C | standard bracket seeding (1 v n, byes to top seeds) |

`src/lib/series/index.ts` re-exports every module (append your own export line; do not reorder others).

## 4. API (`/api/series/...`)

Router files: `src/server/routes/series.ts` (existing; A extends it), `series-entrants.ts` (A: entrants + stages +
player search), `series-builder.ts` (C: event creation, generators, batches, withdraw), `series-playoffs.ts` (E).
A creates all four files and mounts the new ones from `series.ts` (`.route('/', ...)`) so later agents only fill them.

**A (entrants / stages / series)**
- `GET/POST /api/series`, `GET/PATCH/DELETE /api/series/:id`: new fields. `POST /:id/transition`: `registration` status.
- `GET /:id/entrants?include_left=true` -> `{ entrants: SeriesEntrantDto[] }`
- `POST /:id/entrants` (`CreateSeriesEntrantInput`) -> `{ entrant }`; `PATCH /:id/entrants/:entrantId` -> `{ entrant }`;
  `DELETE /:id/entrants/:entrantId` (409 when the entrant has played results; withdraw instead)
- `POST /:id/entrants/:entrantId/members` -> `{ member }`; `PATCH .../members/:memberId` (`role`) ;
  `DELETE .../members/:memberId` (sets `left_at`)
- `POST /:id/entrants/copy` (`CopySeriesEntrantsInput`) -> `{ entrants }`
- `GET /api/series/players/search?q=` -> `{ players: Array<{ user_id, discord_user_id, username, avatar_url }> }` (distinct
  players from match/tournament participants and series members). Register this before `/:seriesId` routes.
- `GET/POST /:id/stages`, `PATCH/DELETE /:id/stages/:stageId` -> `{ stages }` / `{ stage }`
- `GET /:id/events` -> `{ events: SeriesEventDto[] }`; `POST /:id/events` (`AttachSeriesEventInput`);
  `PATCH /:id/events/:eventId` (placement fields + `stage_id`); `DELETE /:id/events/:eventId`
  (deleting a series-created event also deletes its match/tournament when it has not started: status `created`/`assign`/`gather`).

**B (standings)**: `GET /:id/standings?scope=season|<stageId>&view=entrant|individual` -> `SeriesStandingsResponse`.
`GET /:id` and the summaries gain `champion: SeriesChampionDto | null` (B wires `getSeriesChampion` into `summary.ts`).

**C (builder)**
- `POST /:id/events/match` (`CreateSeriesMatchInput`) -> `{ event: SeriesEventDto, match_id }`
- `POST /:id/events/tournament` (`CreateSeriesTournamentInput`) -> `{ event, tournament_id }`
- `POST /:id/events/planned` (`CreateSeriesPlannedEventInput`) -> `{ event }`
- `POST /:id/generators/round-robin/preview` (`RoundRobinConfig`) -> `GeneratorPreview`;
  `POST /:id/generators/round-robin` (`GeneratorCommitInput<RoundRobinConfig>`) -> `{ batch_id, events: SeriesEventDto[] }`
- same pair for `race-calendar` (`RaceCalendarConfig`)
- `POST /:id/batches/:batchId/regenerate` -> `{ removed, events }`; `DELETE /:id/batches/:batchId` (removes the batch's
  unplayed events and their matches; played ones stay and keep `batch_id = null`)
- `POST /:id/entrants/:entrantId/withdraw` (`WithdrawEntrantInput`) -> `{ entrant, cancelled, forfeited }`

**E (playoffs)**
- `GET /:id/events/:eventId/seed-preview` -> `SeedPreviewResponse`
- `POST /:id/events/:eventId/seed` (`{ entrant_ids?: string[] }` = manual order override) -> `{ event, tournament_id }`
- `POST /:id/stages/:stageId/complete` -> `{ stage, seedable_event_ids }` (marks complete; lists planned events now seedable)

Errors: throw `SeriesError(message, status)`; routes use the existing `guard` helper. 400 validation, 404 missing,
409 state conflicts.

## 5. Behaviour

### Creating events (C)
- Validate: series not `complete`/`cancelled`; game in the allowed set; the mode's `scoring_type` equals
  `series.scoring_type` (when set); entrants belong to the series and are `active`; each entrant's current roster
  satisfies `roster_min` (warn-free hard 400 when below).
- **Match**: build with `createMatchFromRequest` (series `match_defaults` as prefill), then preset rosters inside the same
  transaction:
  - Normal: one `match_teams` row per entrant (name = entrant name, color = entrant color, `team_order` = order given,
    `series_entrant_id`), current members added as participants on that team (captain gets `receives_map_codes`),
    `team_count` = entrant count. Status `assign` (like tournament matches), so signups are skipped.
  - Position with `team_size > 1` and team entrants (endurance): same, one `match_teams` row per entrant.
  - FFA/Position solo: add each solo entrant's member as a participant, then `createMatchTeams` (per participant rows),
    and set `series_entrant_id` on those rows.
  - Queue the standard announcement (`enqueueAnnouncement`) when the series has announcements on; voice channels via
    `AfterCommit` like `saveGeneratedMatches`.
- **Tournament**: `createTournament`, then one `tournament_teams` row per entrant (`series_entrant_id`), members copied to
  `tournament_participants` + `tournament_team_members` (captain flag), status set to `assign`, bracket generated with
  `generateTournamentMatches`-equivalent logic using `seedOrder` positions from `seed_order` (default entrant seed then
  name). Cumulative-points works with the same teams. Must run in one transaction (lock order: series -> tournament ->
  matches); refactor `generateTournamentMatches` into a tx-taking inner function if needed (keep its route behaviour).
- `event_order` = max + 1 (under the series lock), unless given.
- **Rosters**: creation copies the current roster; later roster changes do not touch existing matches.
- **Withdraw**: entrant -> `withdrawn`; unplayed (`created`/`gather`/`assign`) 2-entrant matches are cancelled
  (`transitionMatch` to `cancelled`) or, for `forfeit`, completed with the opponent as winner (use the existing results
  API in `src/lib/matches` so placements are written; score each map as an opponent win). Multi-entrant races: remove
  the entrant's participants from unplayed matches instead.

### Generators (C)
- Round robin: circle method; odd count adds a bye. `double` mirrors home/away. Divisions: `within` pairs inside each
  division; `within_and_cross` = double round robin within + single round robin across. Fixture list -> greedy slot
  scheduler: walk dates from `start_date` (skip `skip_dates`, only `match_days`), for each `time_slots` entry fill up to
  `concurrent_matches` fixtures while respecting `max_per_entrant_per_week` (weeks are Monday-based from the first
  match day; week numbers start at 1), keeping round order as much as possible. Convert wall-clock + `timezone` to UTC
  with `Intl` (no new dependency).
- Race calendar: `count` events every `interval_days` at `time`; each event a match with all selected entrants, or a
  tournament (default `cumulative-points`) when `event_kind = tournament`. Week = 1-based index.
- Preview is pure (no writes). Commit creates a batch row, then every fixture through the same builder code as single
  events (one transaction for the whole batch). Regenerate: remove the batch's unplayed events/matches, compute the
  fixtures still owed (round robin: pairings not yet played or in progress), schedule them from today/next slot.

### Standings (B)
Resolve every result to an **entrant**: a `match_teams` row with `series_entrant_id` -> that entrant; a
`tournament_teams` row with `series_entrant_id` -> that entrant; otherwise the participant's player key (discord id,
else user id) looked up in the series' members (`left_at` ignored: history counts) -> entrant. A series with **no
entrants** (legacy) treats each player as an implicit entrant (`entrant_id = null`, key = player key), which reproduces
today's numbers exactly. Unmapped players in a series with entrants are ignored.

Scope: `season` = events with `counts_for_standings` whose stage is null or `counts_toward_season`; a stage = its events
with `counts_for_standings`. `planned` events and incomplete targets never score. Stage `scoring_config` overrides series
keys.

- **Legacy** (no `mode`): exactly today's per-player algorithm, re-expressed through the resolver. Existing tests must
  pass unchanged in behaviour.
- **head_to_head**: every completed match with exactly 2 entrants (standalone or inside a counting tournament) adds
  W/L/T; maps from completed `match_games` placements (`is_winner`; neither = tie) add map W/L/T. League points =
  `win_points*W + loss_points*L + tie_points*T` (defaults 0, so the table is a record unless configured) times the
  event multiplier. Sorting by `tiebreakers` (default `match_wins, map_diff, head_to_head, maps_won`); `head_to_head`
  compares the record between the tied entrants only (a mini-table when 3+ tie); final fallback name.
- **points**: per event, entrant points =
  - Position/FFA match: entrant finishing order (team placement for team rows; best member placement otherwise) ->
    `position_points[i]`, or the match's own `points_awarded` spread when `position_event_use_event_spread !== false`
    and the match has one; fallback `match_win_points`/`match_loss_points`.
  - Normal match: `match_win_points` / `match_loss_points` (ties 0).
  - Tournament: placement -> `tournament_position_points` (cumulative-points: rank by total points; brackets:
    `resolveBracketPlacings`).
  - times multiplier; `drop_worst` removes each entrant's N lowest-scoring events they played (marked `dropped`).
  Tiebreakers default `points, event_wins, best_finishes` (count-back on finishing positions).
- **individual view**: same events scored per player (team entrants' members each get their entrant's event points
  for points mode; for head_to_head the record of matches they played). `entrant_name` = latest entrant.
- Ranks are tie-aware (`tieAwareRanks`), only fully-equal rows after all tiebreakers share a rank.
- `getSeriesChampion`: winner of the completed `season_playoff` tournament (champion team -> entrant) if any, else rank 1
  of the season table when the series is `complete`; null otherwise.

### Playoffs (E)
- Seed preview: standings for the rule's scope (`stage` or `season`), active entrants only, top `top` (or top `top`
  per division, interleaved by rank: div A #1, div B #1, div A #2, ...). Warn when the source stage is not complete or
  ties straddle the cut-off.
- Seed: lock series, require the event to be `planned`, build `CreateSeriesTournamentInput` from `seeding_rule.template`
  + qualifiers (override order if given) and call the builder's tournament creation; event becomes `live` with
  `tournament_id`. Enqueue `playoff_seeded` (`enqueueSeriesUpdate`).
- Stage complete: allowed from `active` (or `upcoming`), sets `complete`, next stage (by order) becomes `active` if it
  is `upcoming`, returns planned events whose rule points at this stage (or at season when it was the last stage).
- Series `complete` transition enqueues `champion` (in A's transition code path; E provides the helper
  `onSeriesCompleted(tx, seriesId)` and A's transition calls it if it exists, otherwise E adds the call).

### Discord (D)
- Channel flag `send_series_updates` wired everywhere `send_health_alerts` is (channel routes, `src/lib/discord-channels.ts`,
  channels pages, welcome channel setup, `shared/types.ts`, bot settings/utils, tests).
- Queue: bot claims `discord_series_update_queue` with the worker contract (`claimJobs` / `completeJob` / `failJob`).
  **Channel routing follows the existing match/tournament patterns; only series-specific posts use the new flag:**
  | kind | channels |
  |---|---|
  | `registration_open` | `send_announcements` (same channels and helpers as match/tournament announcements) |
  | `playoff_seeded`, `champion` | `send_match_start` ("Live Updates" in the UI, same as live match/tournament updates) |
  | `weekly_schedule`, `standings` | `send_series_updates` ("Series Updates", new) |
  Reuse the existing channel-selection helpers the announcement / live-update handlers use rather than writing new
  queries. Skip with a completed job when no channel matches (log at info). Embeds follow the existing announcement
  embed style (series image, game color):
  - `registration_open`: series info + buttons **Register** (`series_reg:<id>`), and for team series **Join team**
    (`series_join:<id>`) and **Leave** (`series_leave:<id>`).
  - `weekly_schedule`: the week's matches/events with Discord timestamps (`<t:unix:F>`), entrants and stage.
  - `standings`: top 10 of the season table (code-block table like other stat posts) + link text to the web UI.
  - `playoff_seeded`: qualifiers with seeds; `champion`: champion embed.
- Scheduler job `processes/scheduler/jobs/series-updates.ts` (every 15 min, `nonOverlapping`): for each `active` series
  with `announcements = true`:
  - weekly schedule: group live events by `week` (null week = ISO week of the start date); when now >= first start of a
    week minus `schedule_lead_hours` and that week has unplayed events, enqueue `weekly_schedule` with
    `dedupe_key = 'week:<n>'`.
  - standings: when every live event of a week is complete/cancelled, enqueue `standings` with `dedupe_key = 'week:<n>'`.
  - honour `discord_config` toggles.
- Series transition to `registration` enqueues `registration_open` (when `registration_posts !== false`).
- Registration (`src/lib/series/registration.ts`, used by the interaction handler; follow the existing pattern for how
  bot handlers reach the domain, direct `db` or internal API):
  - Register, solo: pending entrant named after the user, user as member. Team: modal (team name, tag) -> pending entrant,
    user as captain.
  - Join team: ephemeral select of non-withdrawn entrants with room (`roster_max`), adds the user as player.
  - Leave: sets `left_at`; a pending entrant with no members left is deleted.
  - Rejections (already on a roster, series not in registration, roster full) reply ephemerally.
  - Admins approve (pending -> active) in the web UI.

### UI (F1, F2) — follow the existing series pages' Mantine style exactly
- **F1**: `series-form.tsx` (create/edit): entrant type + roster bounds, scoring type, allowed games (multi-select filtered
  to games that have a mode with the scoring type; primary game), default mode, match defaults, Discord toggles,
  `scoring-config-editor.tsx` rewritten for `mode` (head_to_head: win/loss/tie points + tiebreaker order; points:
  position points spread, drop worst, tournament placement points, event-spread toggle; legacy configs shown as
  points). Create flow option "Copy entrants from" a previous series (sets `previous_series_id`, calls copy after
  create). New `series-entrants-panel.tsx` (+ modals): entrants list grouped by division, roster with roles, add/edit
  entrant, add member via player search (`/api/series/players/search`) or manual Discord id + name, remove member,
  approve pending, withdraw (choose cancel/forfeit), seed and color editing, copy entrants.
  Status `registration` in badges/filters/transition buttons everywhere series status is shown.
- **F2**: `series-detail-page.tsx` becomes tabbed (Overview, Schedule, Standings, Entrants (F1's panel)). Schedule tab:
  stages as sections (add / rename / reorder / complete stage), events in order with role/week badges, up/down reorder,
  move to stage, **Add event** menu: Match, Tournament, Round robin, Race calendar, Playoff placeholder, Attach existing
  (the old picker). Generator modals with a preview table (week, time, fixture) editable before commit; batch actions
  (regenerate, remove unplayed). Planned events show **Seed playoffs** (preview modal with manual reorder, then seed).
  Standings tab: scope selector (Season / each stage), view toggle (Entrants / Individual) for team series, division
  filter, head_to_head columns (W-L-T, maps, diff, pts) vs points columns (per-event points, dropped greyed out).
  Champion banner on Overview when present.

## 6. Work breakdown and order

1. **A**: schema + migration + importer mappings + `enqueueSeriesUpdate` + series/entrants/stages/events domain + routes
   (+ stub routers for C/E) + tests.
2. In parallel after A: **B** standings, **C** builder + generators, **D** Discord, **F1** form + entrants UI.
3. In parallel after B and C: **E** playoffs, **F2** schedule/standings/playoffs UI.
4. Integration: typecheck, lint, full test suite, build; docs (CLAUDE.md series section).

`enqueueSeriesUpdate(ex, { seriesId, kind, dedupeKey?, payload? }): Promise<string | null>` lives in
`src/lib/queues/enqueue.ts` (A): inserts a pending row, `ON CONFLICT DO NOTHING` on the dedupe unique, returns the id or
null.

## 7. Rules for every implementer

- Stay on the current branch. No `git` commits, branches, stashes, resets or checkouts. Leave changes in the tree.
- Only A runs `pnpm db:generate`. If you need a schema change, stop and report it instead of generating a migration.
- Several agents work in this tree at once. Never revert or reformat files you don't own; when editing a shared file
  (barrels, `shared/types.ts`), make minimal additive edits. `pnpm typecheck` may show errors in other agents' files:
  only fix your own.
- Follow `CLAUDE.md` conventions: `Executor` first, explicit `tx`, row locks (`lockSeries` first), `AfterCommit` for
  Discord waits, queue inserts in the business tx, `HttpError`/`SeriesError`, logger not console, pnpm only.
- Write tests next to the existing series tests (`tests/unit/lib/pg-series-*.test.ts`,
  `tests/integration/server/series-*.test.ts`, `tests/unit/discord-bot/`, `tests/unit/scheduler/`) using
  `setupPgTestFile` and the fixtures in `tests/utils/pg-series-fixtures.ts` (extend it additively).
- Before finishing: `pnpm typecheck` (your files clean), `pnpm lint` (no new errors), and run your tests plus the
  existing series tests (`pnpm exec vitest run tests/unit/lib/pg-series tests/integration/server/series`).
