# MatchExec — Overnight Test Expansion Plan

> Comprehensive plan for adding valid, behavior-grounded tests to MatchExec.
> Intended to be executed sequentially by an automated coding agent over a long
> session. Each task is self-contained, scoped to 15–40 minutes of work, and
> ends with a green test run plus a single commit.

---

## Context

Current state (baseline at the start of this plan):
- **77 test files**, **1012 passing tests**.
- Strong unit coverage on: `scoring-functions` (25 cases), `tournament-bracket`
  (23), `transition-handlers` (27); most Discord-bot modules have at least a
  smoke test; settings/matches API routes have integration coverage.
- **Major gaps**:
  - 60 of 63 React components are untested (only `EmptyState`, `PageHeader`,
    `SectionLabel`).
  - 10 API routes have no integration test: `welcome-flow`, `welcome-flow/screen`,
    `settings/backup`, `settings/restore`, `upload/event-image`,
    `debug/scoring-ai-test`, `debug/test-voice`, `debug/trigger-update-event`,
    `matches/[id]/stats/generate-images`, `matches/[id]/stats/per-map`.
  - `src/lib`: `api-response.ts`, `rate-limit.ts`, `notifications.ts`,
    `utils/map-utils.ts`, `logger/{server,client,index}.ts`, `version-client.ts`,
    `version-server.ts` — none have unit tests.
  - `processes/stats-processor/modules/providers/*` (anthropic, google,
    openrouter), `ai-extractor.ts`, `dm-builder.ts`, `avatar-fetcher.ts` — all
    untested.
  - The largest production files have shallow coverage relative to their size:
    `scoring-functions.ts` (1345 LOC), `tournament-bracket.ts` (1042),
    `queue-processor.ts` (2025), `announcement-handler.ts` (1823),
    `interaction-handler.ts` (666), `reminder-handler.ts` (662). Many branches
    and error paths are unverified.
  - Tournament bracket logic (single + double elimination) has no tests for
    walkovers, bracket reset, non-power-of-2 sizes ≥ 9 teams.
  - No end-to-end "match lifecycle" or "tournament lifecycle" integration test
    walks all state transitions.

Goal: add **valid, behavior-grounded tests** that catch real regressions — not
snapshot fluff, not implementation-mirror tests, not 100%-coverage box-checking.
Work through this plan in order; complete each task before moving on.

---

## Ground Rules — Read Before Doing Anything

1. **One task at a time.** Complete every task in the order below. After each
   task: run the tests you just added with
   `npx vitest run <path/to/new-test>` and make sure they pass. If a test fails:
     - First try to fix the test (assumption about the source was wrong).
     - If the test reveals a genuine bug in the source, log it in
       `BUGS_FOUND.md` at the repo root, mark the offending case with
       `it.skip(...)` and a TODO comment pointing at `BUGS_FOUND.md`, and move
       on.
2. **Do NOT modify source files** (`src/`, `lib/`, `processes/`, `shared/`,
   `migrations/`, `scripts/`). This plan is purely additive testing.
   - If you find that a source file is genuinely untestable (e.g. it imports a
     module that crashes at top-level), write the test as `describe.skip(...)`,
     log it in `BUGS_FOUND.md`, and move on. Do not refactor source.
3. **Reuse existing infrastructure.** Reference patterns:
   - API route tests: `tests/integration/api/matches.test.ts` — use
     `createMockRequest`, `parseResponse`, `createRouteParams`,
     `seedBasicTestData`, `getTestDb`.
   - Component tests: `tests/unit/components/EmptyState.test.tsx` — wrap in
     `MantineProvider`, use `react-dom/client` + `act()`.
   - Pure unit tests: `tests/unit/lib/pure-utils.test.ts`.
   - Discord-bot module tests: `tests/unit/discord-bot/announcement-handler.test.ts`
     — `vi.mock()` for `discord.js` at top of each file (mocks don't work in
     setup files for that module).
   - Test setup hooks (`tests/setup.ts`) seed/reset a SQLite DB per worker. Use
     `getTestDb()` from `tests/utils/test-db.ts`; the test DB is injected into
     `getDbInstance()` via `setDbForTesting()`, so route handlers see the same
     data.
   - Fixtures: `tests/utils/fixtures.ts` (`seedBasicTestData`, `createMatch`,
     `createTournament`).
4. **Test behavior, not implementation.** A good test:
   - Asserts an *observable outcome* (return value, DB row, response status,
     rendered text, mock-called-with).
   - Has a name that reads like a spec ("returns 400 when name is missing").
   - Fails for a real reason and passes for a real reason — not because it
     mirrors implementation line-for-line.
   - Avoid: `expect(typeof X).toBe('function')` style assertions. The
     `EmptyState.test.tsx`'s "is a function component" line is the kind of
     weak check NOT to repeat.
5. **No new test helpers unless reused 3+ times.** Prefer extending
   `tests/utils/fixtures.ts` or `tests/utils/api-helpers.ts`. Don't invent
   abstractions for one-off use.
6. **Time budget per task: 15–40 min.** If a task balloons past an hour,
   commit what works, log the blocker in `BUGS_FOUND.md`, move on.
7. **Commit cadence: one commit per task.** Message:
   `test: <task title>` (e.g., `test: add api-response unit tests`).
   Each commit must be self-contained and green. Do NOT push.
8. **Run the full suite at milestones** — after Tasks 10, 25, 50, 75, and the
   final task. If something else turns red because of a shared mock or new
   import, investigate and fix before continuing.
9. **Never use `vi.fn().mockResolvedValue` for the actual DB.** Use
   `getTestDb()` and write real SQL — this catches schema drift. Mocks are
   appropriate for: Discord.js client, AI providers (anthropic/google/openrouter),
   external HTTP (`fetch`), filesystem outside `app_data/`, and `@mantine/notifications`.
10. **Coverage target**: this plan aims to add ~700–900 new test cases
    across ~60+ new test files. By the end, lines covered in `src/lib` and
    `processes/discord-bot/modules` should be substantially higher.

---

## Index of Phases

- **Phase A** — Small pure-function lib tests (8 tasks) — warm-up.
- **Phase B** — Untested API routes (8 tasks).
- **Phase C** — Deepen big-file unit coverage (10 tasks).
- **Phase D** — Discord-bot modules deep dive (10 tasks).
- **Phase E** — Stats processor (8 tasks).
- **Phase F** — Component tests — pure & display (18 tasks).
- **Phase G** — Component tests — form/interactive (12 tasks).
- **Phase H** — Scheduler & process integration (5 tasks).
- **Phase I** — Database & migrations (4 tasks).
- **Phase J** — Property-based & edge-case (4 tasks).
- **Phase K** — Full lifecycle integrations (3 tasks).
- **Phase L** — Cross-cutting concerns (5 tasks).
- **Phase M** — Final sweep & coverage report (2 tasks).

**Total: 97 tasks.**

---

## Phase A — Small Pure-Function Lib Tests (Warm-Up)

No DB needed for most. Each file: 6–15 cases.

### A1 — `tests/unit/lib/api-response.test.ts`
Cover every export in `src/lib/api-response.ts` (9 LOC — read first). Likely
`success()` / `error()` helpers. Assert: returns a `NextResponse` (or
`Response`) with right status code, JSON body shape, `Content-Type:
application/json`. Cases: `data` undefined / null / object / array, status
override, error with stack vs without. If file is type-only, no-op and log it.

### A2 — `tests/unit/lib/rate-limit.test.ts`
`src/lib/rate-limit.ts` (44 LOC). Cases:
- Under limit → allowed.
- At limit → blocked.
- After window with `vi.useFakeTimers()` + `vi.advanceTimersByTime()` → allowed.
- Distinct keys do not share counter.
- Zero limit (blocks everything immediately).
- Large limit (never blocks within window).
- Special-char key.
- Concurrent calls in same tick: count is accurate.

### A3 — `tests/unit/lib/utils/map-utils.test.ts`
`src/lib/utils/map-utils.ts` (53 LOC). For each export: happy path + one
edge case (empty array, missing field, duplicate inputs).

### A4 — `tests/unit/lib/version-server.test.ts`
Mock `fs/promises`. Cases:
- Valid `package.json` → returns parsed semver.
- Missing file → returns fallback / throws as documented.
- Malformed JSON → returns fallback.
- Caching: second call doesn't re-read fs (if cached).

### A5 — `tests/unit/lib/version-client.test.ts`
Mock `fetch`. Cases:
- 200 response with JSON body → returns version.
- 404 → returns fallback.
- Network error → returns fallback / throws.
- Response shape mismatch → fallback.

### A6 — `tests/unit/lib/logger-server.test.ts` and `tests/unit/lib/logger-client.test.ts`
Two files in one task (small).
- `logger/server.ts`: spy on `console.*`; verify level filtering (e.g. at
  `warning`, `debug`/`info` calls produce nothing; `warning`/`error` do).
  Verify color codes appear when TTY-like and absent otherwise. Verify
  timestamp prefix format.
- `logger/client.ts`: verify it calls `console.*` directly, respects level.
- `logger/index.ts` (6 LOC, probably re-exports) — one assertion on the
  exported shape.

### A7 — `tests/unit/lib/notifications.test.ts`
Mock `@mantine/notifications`. For each helper (`success`, `error`, `warning`,
`info`, `loading`, `update` — whatever the file exports):
- `notifications.show` called with right `color`, default title, default
  `autoClose`.
- Custom options override defaults.
- `id` is forwarded.
- Icon is a valid React element (assert via element type).

### A8 — `tests/unit/lib/welcome-check-extended.test.ts`
Existing test exists. Read it; add only what isn't covered:
- DB error during welcome check → safe default (log + return appropriate state).
- Partial config: Discord configured but no announcer settings → returns the
  "incomplete" state.
- Concurrent calls race-safe (verify by issuing two awaited promises).

---

## Phase B — Untested API Routes

Pattern: `tests/integration/api/matches.test.ts`. Always seed via `getTestDb()`.
Each task: one test file, 6–10 cases.

### B1 — `tests/integration/api/welcome-flow.test.ts`
Routes: `src/app/api/welcome-flow/route.ts`,
`src/app/api/welcome-flow/screen/route.ts`. Cases:
- `GET` with no welcome row → initial state.
- `GET` after completion → completed state.
- `POST/PUT` advance → DB updated.
- `POST/PUT` screen with valid value → updates correctly.
- Invalid screen value → 400.
- Idempotency on complete.
- Skipping ahead more than one screen — reject or allow (match source).

### B2 — `tests/integration/api/settings-backup-restore.test.ts`
Routes: `src/app/api/settings/backup/route.ts`,
`src/app/api/settings/restore/route.ts`. Cases:
- `GET /api/settings/backup` → returns JSON dump with each settings table.
- Round-trip: feed backup into restore, verify all settings restored.
- Restore with malformed JSON → 400.
- Restore missing required fields → 400.
- Restore preserves untouched tables.
- Restore replaces (not merges) settings.

### B3 — `tests/integration/api/upload-event-image.test.ts`
Route: `src/app/api/upload/event-image/route.ts`. Use `FormData`. Cases:
- Valid PNG → 200, returns URL or path.
- Valid JPEG → 200.
- Non-image MIME → 400.
- Oversized file → 400.
- Missing file → 400.
- File with path-traversal name (`../../etc/passwd`) sanitized.
Test writes go into `os.tmpdir()`, clean up in `afterEach`.

### B4 — `tests/integration/api/match-stats-routes.test.ts`
Routes: `matches/[matchId]/stats/generate-images/route.ts`,
`matches/[matchId]/stats/per-map/route.ts`. Cases:
- `per-map` no games → empty array / 200.
- `per-map` with results → aggregated per map.
- Match not found → 404.
- `generate-images` happy path → row inserted into expected queue/table.
- `generate-images` for nonexistent match → 404.
- `generate-images` for match without games → graceful no-op or 400.

### B5 — `tests/integration/api/debug-routes.test.ts`
Routes: `debug/scoring-ai-test`, `debug/test-voice`, `debug/trigger-update-event`.
For each:
- Happy path returns 200 (mock external AI / Discord client).
- Missing required body fields → 400.
- Internal error → 500 with sane message.
- Verify any dev-flag gating (read source).

### B6 — `tests/integration/api/scorecard-submission-routes.test.ts`
Routes: `matches/[matchId]/scorecard/[submissionId]/assign`, `/retry`, `/review`.
Cases per route:
- Assign to a valid game in the match → row updated.
- Assign to a game in a different match → 400.
- Retry on a failed submission → status reset to pending, retry count bumped.
- Retry on an already-complete submission → 400.
- Review approve → submission marked approved, results written.
- Review reject → submission marked rejected, no results written.
- 404 on missing submission.
- 404 on missing match.

### B7 — `tests/integration/api/match-game-result-routes.test.ts`
Route: `matches/[matchId]/games/[gameId]/result/route.ts`. Cases:
- POST result for casual match → row inserted, overall score updated.
- POST result for competitive match → uses different scoring path.
- POST result for position-scoring game → correct points awarded per
  participant (verify against game's `scoring_config`).
- POST same game twice → second call overwrites first (or rejects — match
  source).
- Invalid score shape (negative, NaN, missing teams) → 400.
- Match in wrong state (`created`) → 409 or 400.

### B8 — `tests/integration/api/tournament-team-routes-extended.test.ts`
Routes: `tournaments/[tournamentId]/teams`,
`tournaments/[tournamentId]/bracket-assignments`,
`tournaments/[tournamentId]/standings`. Extend existing coverage:
- Create team with duplicate name → 400.
- Delete team after bracket is generated → rejected.
- Bracket-assignments POST: assign each team a seed; verify DB.
- Bracket-assignments with duplicate seeds → 400.
- Standings before any matches → all teams at 0.
- Standings after match results → correctly ordered by wins, then by
  point differential.

---

## Phase C — Deepen Big-File Unit Coverage

**Read existing test first** to avoid duplication. Each task creates an
`*-extended.test.ts` file alongside.

### C1 — `tests/unit/scoring-functions-extended.test.ts`
`src/lib/scoring-functions.ts` (1345 LOC, 25 tests). Add 25–40 new cases:
- `getPointsForPosition`: position absent → 0; negative position → 0;
  fractional position keys in config; very high position.
- `calculatePositionPoints`: malformed `scoring_config` → all 0 + warning log.
- `getMatchFormat`: missing match → `casual` default; explicit format honored.
- `initializeMatchGames`: idempotent — calling twice yields one row per map.
  Verify by querying `match_games`.
- Casual format: simple win/loss tallies — write 5 cases covering best-of-1,
  best-of-3, best-of-5 outcomes.
- Competitive format: ranked-style points (read source for rule).
- First-to-N: stops counting after winner reached.
- Tiebreaker: equal score in last game → resolved by ??? (read source).
- Per-map ratio: percentage-based scoring (if exists).
- Overall-score helper: sums per-game scores correctly.

Use real DB via `getTestDb()`.

### C2 — `tests/unit/tournament-bracket-extended.test.ts`
`src/lib/tournament-bracket.ts` (1042 LOC, 23 tests). Add 20–30 cases:
- **Single elimination** team counts: 2, 3, 4, 5, 6, 7, 8, 9, 12, 16, 17, 32.
  Verify number of rounds and bye placement (byes always to top seeds).
- **Double elimination** 4, 6, 8, 16 teams: winners bracket, losers bracket,
  grand finals. Bracket reset on losers champion winning grand finals.
- Walkover: missing opponent → automatic advance, downstream node updated.
- Re-progressing a bracket where a match already played → no-op for that node.
- `tournament_bracket_nodes` parent/child integrity after each progression.
- Invalid inputs: 0 teams, 1 team, duplicate team ids → throws or returns
  error (match source).
- Re-seeding after pool stage if implemented.

### C3 — `tests/unit/transition-handlers-extended.test.ts`
`src/lib/transition-handlers.ts` (420 LOC, 27 tests). Add:
- Each from→to handler enumerated by reading source: `created→gather`,
  `gather→assign`, `assign→battle`, `battle→complete`, any→`cancelled`.
- For each: verify side effects in DB (queue rows inserted, voice channels
  created/deleted, feed event logged).
- `handleStatusTransition` with unknown status pairs → no-op, no throw.
- Calling twice in a row → safe, no duplicate side effects.

### C4 — `tests/unit/lib/tournament-transition-handlers-extended.test.ts`
`src/lib/tournament-transition-handlers.ts` (370 LOC). Parallel to C3 but for
tournaments:
- Each state-pair handler: side effects in DB.
- Cancelling mid-bracket: in-progress matches marked cancelled, but completed
  matches kept.

### C5 — `tests/unit/lib/voice-channel-manager-extended.test.ts`
`src/lib/voice-channel-manager.ts` (313 LOC). Mock `discord.js` client. Cases:
- Create voice channels for a match: correct names, parent category, region.
- Existing channels → no duplicate creates.
- Delete voice channels: removes from Discord and DB.
- Empty match (no participants) → graceful (no channels created).
- Discord error during create → logged, partial cleanup, no throw.
- `deleteMatchVoiceChannels` for nonexistent match → no-op.

### C6 — `tests/unit/lib/reminder-helpers-extended.test.ts`
`src/lib/reminder-helpers.ts` (255 LOC, has existing test). Extend:
- Window calculations: 60min, 30min, 15min, 5min, 1min before start.
- Reminder selection: which window applies for a given match start time.
- Boundary: exactly 60min before → first window. Exactly 0min → no future
  reminder.
- DST/timezone safety: same wall-clock time across a DST boundary calculates
  correctly (use a fixed timezone in test).

### C7 — `tests/unit/lib/map-code-service-extended.test.ts`
`src/lib/map-code-service.ts` (159 LOC). Already tested — extend:
- Storing a code for a match+map pair: upsert behavior.
- Retrieving stored codes returns them keyed correctly.
- Deleting a code.
- Code with special chars sanitized.

### C8 — `tests/unit/lib/feed-helpers-extended.test.ts`
`src/lib/feed-helpers.ts` (45 LOC, has tests). Extend:
- Event payload JSON serialization round-trips.
- Feed retention pruning: rows older than N days deleted, newer kept.
- Pruning with retention=0 → no-op (or delete all — match source).

### C9 — `tests/unit/lib/stats-aggregation-extended.test.ts`
Existing integration test. Extend with edge cases:
- Match with mixed wins/losses across maps.
- Multi-match aggregation per player.
- Empty input → empty output, no throw.
- Malformed `match_games.results` JSON → handled gracefully.
- Tie maps included or excluded per spec.

### C10 — `tests/unit/lib/tournament-notifications-extended.test.ts`
`src/lib/tournament-notifications.ts` (89 LOC, has tests). Extend:
- Notification for each tournament state transition.
- DM-vs-channel routing based on settings.
- Mention syntax in body strings.

---

## Phase D — Discord-Bot Modules Deep Dive

Existing pattern: `vi.mock('discord.js', () => ...)` at top of each file.

### D1 — `tests/unit/discord-bot/queue-processor-extended.test.ts`
`processes/discord-bot/modules/queue-processor.ts` (2025 LOC, 20 tests). For each
action type (read source — likely `send_dm`, `send_announcement`,
`create_voice_channel`, `delete_voice_channel`, `update_event`, `reaction`, etc):
- Happy path: pending row → action invoked with correct args → row marked
  `completed`.
- Failure path: action throws → row marked `failed`, retry count incremented.
- Retry exhaustion: max retries → row marked `dead`.
- Malformed payload → marked failed without invoking.
- Two concurrent pollers picking up same row → only one processes (verify
  locking semantics in source).
- Backoff delay between retries (use fake timers).

### D2 — `tests/unit/discord-bot/announcement-handler-extended.test.ts`
`processes/discord-bot/modules/announcement-handler.ts` (1823 LOC, 16 tests). For
each announcement type (read source — match created, gathering, starting,
complete; tournament announcements; voice/text variants):
- Embed builder: correct title, fields, color, image URL, footer.
- Voice announcement triggers correct TTS clip selection.
- Missing optional fields don't crash builder.
- Mention rendering: `@everyone`, role, user mentions formatted right.
- Long descriptions truncated to Discord limits (4096 desc, 1024 field).
- Embed renders correctly with no maps / no participants.

### D3 — `tests/unit/discord-bot/reminder-handler-extended.test.ts`
`processes/discord-bot/modules/reminder-handler.ts` (662 LOC). Cases:
- 60-min window: triggers once, second tick doesn't re-fire.
- Multiple matches in same window → each gets one reminder.
- Participant opt-out → not DM'd.
- DM failure for one participant → others still DM'd.
- `complete` / `cancelled` matches not reminded.
- Reminder respects channel-vs-DM setting.

### D4 — `tests/unit/discord-bot/interaction-handler-extended.test.ts`
`processes/discord-bot/modules/interaction-handler.ts` (666 LOC, 20 tests). Cases:
- Each slash-command branch: handler responds, DB updated.
- Non-admin invoking admin command → denial reply.
- Button interactions: each customId pattern routes correctly.
- Select-menu interactions.
- Unhandled customId → safe no-op (match source — defer ack or ignore).
- Interaction expired (token invalidated) → log + skip.

### D5 — `tests/unit/discord-bot/scorecard-handler-extended.test.ts`
`processes/discord-bot/modules/scorecard-handler.ts` (253 LOC). Cases:
- DM with image attachment → stats-processor queue row inserted.
- DM without attachment → friendly error reply.
- Image too large → rejected.
- Non-image attachment → rejected.
- Reassign submission: DB row updated to new match_id.
- Review approve writes results; reject does not.

### D6 — `tests/unit/discord-bot/winner-vote-handler-extended.test.ts`
`processes/discord-bot/modules/winner-vote-handler.ts` (257 LOC, has tests).
Cases:
- Tie: votes split equally — resolution rule (re-vote? captain decides?).
- Late vote after window closed → rejected.
- Same user double-votes: second replaces or rejected (match source).
- Vote for nonexistent option → rejected.
- Anonymous vs identified votes (if applicable).

### D7 — `tests/unit/discord-bot/event-handler-extended.test.ts`
Existing tests. Extend:
- `guildScheduledEventCreate` / `Update` / `Delete` propagating to DB.
- Multiple guilds → events isolated per guild.

### D8 — `tests/unit/discord-bot/voice-handler-extended.test.ts`
`processes/discord-bot/modules/voice-handler.ts` (517 LOC, 19 tests). Cases:
- Voice connection lifecycle: connect → play → idle → disconnect.
- Multiple announcements queued: played in order.
- Voice region change mid-play → recovers.
- TTS clip missing on disk → falls back to text-channel announcement.
- Two teams in separate channels: both played sequentially.

### D9 — `tests/unit/discord-bot/health-monitor-extended.test.ts`
`processes/discord-bot/modules/health-monitor.ts` (237 LOC, has tests). Cases:
- Heartbeat row updated on tick.
- Bot disconnected → status flipped to `unhealthy`.
- Reconnect → status flipped back.
- Stale heartbeat (no update in N seconds) → flagged.

### D10 — `tests/unit/discord-bot/dm-builder.test.ts` (NEW FILE)
`processes/discord-bot/modules/dm-builder.ts` (112 LOC). Pure formatting. Cases:
- Each DM type (signup confirmation, reminder, scorecard request,
  team-assignment notice): text contains expected fields.
- Discord-mention syntax for user IDs.
- Truncation if body exceeds Discord's 2000-char DM limit.
- Edge cases: no description, no maps, empty participants list.

---

## Phase E — Stats Processor (Currently Untested)

### E1 — `tests/unit/stats-processor/providers/anthropic.test.ts`
`processes/stats-processor/modules/providers/anthropic.ts` (49 LOC). Mock
Anthropic SDK. Cases:
- Successful response → parsed JSON returned.
- Network error → throws with context.
- Malformed JSON response → throws with parser context.
- Correct model id passed (claude-sonnet-4-6 or whatever current).
- API key from env; missing key → throws.
- Token usage / cost reported if implemented.

### E2 — `tests/unit/stats-processor/providers/google.test.ts`
`google.ts` (33 LOC). Mock Google AI SDK. Same case categories as E1.

### E3 — `tests/unit/stats-processor/providers/openrouter.test.ts`
`openrouter.ts` (38 LOC). Mock `fetch`. Same case categories as E1, plus:
- HTTP 429 (rate limit) → retry-with-backoff if implemented, or throw.
- HTTP 5xx → throws.

### E4 — `tests/unit/stats-processor/providers/index.test.ts`
`providers/index.ts` (18 LOC) — factory. Cases:
- Each known provider name → right provider returned.
- Unknown name → throws or returns null (match source).
- Default provider selection.

### E5 — `tests/unit/stats-processor/ai-extractor.test.ts`
`processes/stats-processor/modules/ai-extractor.ts` (427 LOC). Mock provider
layer. Cases:
- Successful extraction → shaped stat object returned.
- Provider returns garbage JSON → safe error.
- Image preprocessing (resize / base64 encoding): shape passed to provider.
- Prompt template: system + user prompt assembled correctly per game.
- Provider failure → retry once with backoff (if implemented).
- Different game schemas yield different prompts.
- Sensitive data not logged (no PII in error paths).

### E6 — `tests/unit/discord-bot/avatar-fetcher.test.ts`
`processes/discord-bot/utils/avatar-fetcher.ts` (23 LOC). Mock `fetch`. Cases:
- URL construction for given user id and hash.
- 200 → returns buffer.
- 404 → returns null / default.
- Network error → propagates / fallback.

### E7 — `tests/unit/stats-processor/stat-image-generator-extended.test.ts`
`processes/stats-processor/modules/stat-image-generator.ts` (306 LOC, 6 tests).
Cases:
- Each layout / image type renders without throwing.
- Stat overflow (very long names) truncated.
- Empty stats input → produces empty placeholder.
- Color/theme variations (if any).

### E8 — `tests/unit/stats-processor/index-extended.test.ts`
Process index has existing test. Extend:
- A `pending` submission picked up → extractor invoked → status `processed`.
- Extractor throws → status `failed`, retry count incremented.
- Max retries exhausted → status `dead`.
- Two pending in same tick → both processed.

---

## Phase F — Component Tests: Pure & Display

Use `EmptyState.test.tsx` pattern. One file per component, 4–8 tests each.

### F1 — `tests/unit/components/AnimatedCounter.test.tsx`
- Renders initial value.
- Rerender to new value updates DOM.
- Zero renders.
- Negative renders.
- Very large numbers render with formatting (commas/k/M if implemented).

### F2 — `tests/unit/components/StageRing.test.tsx`
- All stages render.
- Active stage has distinguishing class/attribute.
- Completed stages show completion indicator.
- Skipping an unknown stage doesn't crash.

### F3 — `tests/unit/components/PageLayout.test.tsx`
- Children render inside layout.
- Title/subtitle render.
- Optional breadcrumbs.

### F4 — `tests/unit/components/SettingsSaveButton.test.tsx`
- Disabled when not dirty.
- Enabled when dirty.
- Click → `onSave` called.
- Loading state disables and shows spinner.

### F5 — `tests/unit/components/DatabaseLoadingScreen.test.tsx`
- Renders status text.
- Renders progress bar / percentage.
- Renders error state with retry button.

### F6 — `tests/unit/components/DatabaseStatusWrapper.test.tsx`
Mock polling hook / fetch. Cases:
- Loading → fallback renders.
- Ready → children render.
- Error → error UI renders.

### F7 — `tests/unit/components/ConditionalNavigation.test.tsx`
Mock `usePathname`. Cases:
- Path matches → navigation renders.
- Path doesn't match → returns null.
- Nested routes match if prefix-matching is the behavior.

### F8 — `tests/unit/components/map-note-modal.test.tsx`
- Renders modal content when open.
- Returns null when closed.
- Save calls `onSave` with current text.
- Cancel calls `onClose`.
- Initial text populates input.

### F9 — `tests/unit/components/match-details/MapCard.test.tsx`
- Renders map name, mode.
- Renders score when provided.
- Renders "TBD" placeholder when no score.
- Renders winner indicator.

### F10 — `tests/unit/components/match-details/ParticipantsList.test.tsx`
- All participants render.
- Empty list shows empty-message.
- Captains marked correctly.
- Voice/non-voice indicator if applicable.

### F11 — `tests/unit/components/match-details/RemindersList.test.tsx` + `ReminderCard.test.tsx`
Two test files. Cases:
- List: each reminder renders its window text.
- List: empty state.
- Card: sent vs pending visual states.
- Card: timestamp formatting.

### F12 — `tests/unit/components/match-details/MatchInfoPanel.test.tsx`
- Match name, time, game, format render.
- Optional description renders when present, absent when not.
- Cancelled/complete badges render in those states.

### F13 — `tests/unit/components/match-details/MapResultsSection.test.tsx`
- Renders per-map results.
- Empty results → empty state.
- Winning team highlighted.

### F14 — `tests/unit/components/match-details/MatchContentPanel.test.tsx`
- Renders all child panels.
- Conditional sections based on match state.

### F15 — `tests/unit/components/stats/PlayerStatCard.test.tsx`
- Player name and stats render.
- Missing optional stats don't crash.
- Top performer styling (if any).

### F16 — `tests/unit/components/stats/StatCallouts.test.tsx`
- Each callout renders.
- Empty data → empty state.

### F17 — `tests/unit/components/stats/MapStatCard.test.tsx`
- Map name + stat grid render.
- Missing values handled.

### F18 — `tests/unit/components/shared/MapCard.test.tsx`
- Shared variant renders correctly.
- Differs from `match-details/MapCard` only as documented in source.

---

## Phase G — Component Tests: Form / Interactive

These are bigger and may need router/store mocks. Keep tests focused on one
visible behavior each.

### G1 — `tests/unit/components/match-page-layout.test.tsx`
- Children render.
- Header shows match metadata.
- Sidebars render in correct states.

### G2 — `tests/unit/components/scoring/FormatBadge.test.tsx`
`src/components/scoring/shared/FormatBadge.tsx`. Tests:
- Renders correct label per format.
- Renders correct color per format.
- Unknown format → fallback.

### G3 — `tests/unit/components/scoring/SimpleMapScoring.test.tsx`
`src/components/scoring/SimpleMapScoring.tsx` (489 LOC). Cases:
- Renders maps with current scores.
- Click to increment score → state updates and `onChange` fires.
- Click to decrement.
- Save button calls `onSave` with current state.
- Reset button clears scores.
- Disabled when readonly.

### G4 — `tests/unit/components/scoring/PositionScoring.test.tsx`
`src/components/scoring/PositionScoring.tsx` (440 LOC). Cases:
- Renders position selector for each participant.
- Selecting a position updates state.
- Duplicate position warning if applicable.
- Computed points preview matches game config.
- Save dispatches correct shape.

### G5 — `tests/unit/components/scoring/ScorecardUpload.test.tsx`
- Renders upload widget.
- File selected → upload triggered.
- Upload success state.
- Upload error state.

### G6 — `tests/unit/components/create-match/EventInfoStep.test.tsx`
- Inputs render and bind.
- Required field empty → step invalid.
- Date in past → validation error.

### G7 — `tests/unit/components/create-match/GameSelectionStep.test.tsx`
- Lists available games.
- Selecting a game updates form state.
- No games → empty state.

### G8 — `tests/unit/components/create-match/MapSelector.test.tsx` + `SelectedMapsList.test.tsx` + `MapCard.test.tsx` + `FlexibleMapCard.test.tsx`
Four test files (small). Each component: 3–5 cases — render, select,
deselect, empty state.

### G9 — `tests/unit/components/create-match/MapConfigurationStep.test.tsx`
- Renders configured maps.
- Adding a map appends.
- Removing a map removes from list.
- Reorder if drag-drop is implemented.

### G10 — `tests/unit/components/create-match/AnnouncementsStep.test.tsx`
- Channel selector renders.
- Voice-vs-text toggle works.
- Mention settings configurable.

### G11 — `tests/unit/components/create-tournament/*` (5 files in one task)
For each step component:
- `TournamentEventInfoStep.test.tsx`
- `TournamentGameSelectionStep.test.tsx`
- `TournamentFormatStep.test.tsx`
- `TournamentTeamSettingsStep.test.tsx`
- `TournamentReviewStep.test.tsx`
Each: 3 cases — render with empty state, render with filled form, validation.

### G12 — `tests/unit/components/keyboard-shortcuts/KeyboardShortcutsProvider.test.tsx`
- Provider mounts and registers shortcuts.
- Triggering a key dispatches the registered handler.
- Unmount cleans up listeners (verify by triggering after unmount).
- Modifier-key handling (Ctrl, Shift, Alt).

---

## Phase H — Scheduler & Process Integration

### H1 — `tests/unit/scheduler/check-for-update-extended.test.ts`
Existing test. Extend:
- Mock GitHub fetch: newer version → notification row inserted.
- Same version → no notification.
- Older version → no notification.
- Fetch error → logs error, no notification, no throw out of cron.
- Throttling: doesn't re-check within configured interval.

### H2 — `tests/unit/scheduler/update-avatars-extended.test.ts`
Existing test. Extend:
- Multiple users in one tick.
- One user's fetch fails → others still updated.
- Last-updated timestamp persisted.
- Avatar URL change detected → DB updated; same URL → skipped.

### H3 — `tests/unit/scheduler/timed-announcements-extended.test.ts`
Existing test. Extend:
- Announcement scheduled in past → fires immediately.
- Announcement in future → not fired until time arrives (fake timers).
- Already-fired announcement → not re-fired.

### H4 — `tests/unit/scheduler/index-extended.test.ts`
Existing test. Extend:
- Cron schedule registration: each job registered with its expected cron
  string.
- Process startup: bootstrap order is migrate → register jobs → start.
- Graceful shutdown cancels all jobs.

### H5 — `tests/unit/discord-bot/index-extended.test.ts`
Existing test. Extend:
- Bot login with valid token.
- Bot login with missing token → process logs error and does not crash with
  unhelpful stack.
- Event handlers registered for `ready`, `interactionCreate`,
  `messageCreate`.

---

## Phase I — Database & Migrations

### I1 — `tests/integration/database/migrations-idempotency.test.ts`
- `migrations` table records each migration exactly once.
- Re-running migrate does not alter seeded data.
- All 16 migrations apply cleanly on empty DB.
- Schema includes expected indexes (query `sqlite_master`).

### I2 — `tests/integration/database/foreign-keys.test.ts`
Document current FK state.
- With `PRAGMA foreign_keys=OFF` (current): existing seed inserts succeed.
- With `PRAGMA foreign_keys=ON`: identify which inserts fail. Mark failing
  cases as `.skip()` and add note to `BUGS_FOUND.md` pointing at the
  malformed `matches.game_maps` FK.

### I3 — `tests/integration/database/seeder-data-integrity.test.ts`
For each game in `data/games/*`:
- After seeding, game row exists with expected `dataVersion`.
- Every mode in `modes.json` inserted and linked.
- Every map in `maps.json` exists and links to a valid mode.
- Re-running seeder with same `dataVersion` is a no-op (no duplicate rows).
- Bumping `dataVersion` (in-memory) re-seeds the changed entities.

### I4 — `tests/integration/database/connection-extended.test.ts`
Existing test. Extend:
- Concurrent reads from multiple workers don't corrupt data.
- DB file recovers from corruption gracefully (simulate by truncating).
- WAL mode behavior if used.
- Connection pooling / single-connection semantics verified.

---

## Phase J — Property-Based & Edge-Case

Use plain `it.each(...)` for table-driven; don't add `fast-check` dependency.

### J1 — `tests/unit/scoring-edge-cases.test.ts`
Table-driven for scoring:
- 0-0 score → no winner / tie reported correctly.
- All-zeros across all maps in a match.
- Single map, single team (no opposition).
- Float scores (if allowed) round correctly.
- Negative scores rejected.
- Scores larger than reasonable max (1e9) accepted or rejected per spec.

### J2 — `tests/unit/tournament-edge-cases.test.ts`
- 2-team bracket: single match decides everything.
- 3-team: bye placement.
- 9-team: bye placement and round count.
- 1024-team: smoke test that generation doesn't time out.
- Tournament with one team withdrawing mid-bracket.

### J3 — `tests/unit/lib/validation-edge-cases.test.ts`
Extend `validation.ts` coverage:
- `validateRequiredFields` with: `{}`, fields with value `0`, value `false`,
  value `""` empty string, value `null`, value `undefined`, deeply nested.
- `safeJSONParse` with: valid, malformed, empty string, `null`, very deep
  nesting (within reason), object with cycles via `JSON.stringify`.
- `safeJSONStringify` with: cycles, BigInt, undefined, Symbol.

### J4 — `tests/unit/transition-edge-cases.test.ts`
- Transition from a state to itself → no-op.
- Skip a state (`created` → `battle`) → rejected at API layer (verify in
  route test), but `handleStatusTransition` itself doesn't validate.
- Concurrent transitions: two API calls in quick succession — second sees the
  state set by the first.

---

## Phase K — Full Lifecycle Integration

### K1 — `tests/integration/api/match-full-lifecycle.test.ts`
Walk a match through every state in one test:
1. POST `/api/matches` → match in `created`.
2. PUT transition → `gather`.
3. Insert participants directly via DB (add-participant is bot-driven).
4. PUT transition → `assign`.
5. POST `/api/matches/[id]/assign-teams` → teams written.
6. PUT transition → `battle`.
7. POST results for each game via `games/[gameId]/result` endpoint.
8. PUT transition → `complete`.
9. GET `/api/matches/[id]` → final state shows scores and winner.

At each step: assert 200 response, DB state matches, expected queue rows
inserted.

### K2 — `tests/integration/api/tournament-full-lifecycle.test.ts`
Parallel to K1 for tournaments:
1. Create tournament.
2. Set teams.
3. Generate bracket.
4. Generate matches.
5. Progress each match to completion.
6. Verify final standings.

### K3 — `tests/integration/api/match-cancel-flow.test.ts`
- Create match → gather → cancel mid-flow.
- Voice channels cleaned up.
- Reminders cancelled.
- Feed event logged.
- Subsequent transitions rejected.

---

## Phase L — Cross-Cutting Concerns

### L1 — `tests/integration/discord-queue-contracts-extended.test.ts`
Existing test. Extend:
- Every queue table referenced by `queue-processor`:
  `discord_announcement_queue`, `discord_event_queue`,
  `discord_voice_channel_queue`, `discord_dm_queue` (read schema).
- Each table has expected columns and constraints.
- Inserting via lib helpers writes the expected JSON shape.

### L2 — `tests/integration/api/health-extended.test.ts`
Existing test. Extend:
- `/api/health` returns 200 in healthy state.
- `/api/health/ready` returns 503 before migrations complete (simulate by
  not seeding).
- Returns 200 once migrations complete.
- Includes process/uptime info if implemented.

### L3 — `tests/unit/shared/discord-announcements.test.ts`
`shared/discord-announcements.ts` (46 LOC). Cases:
- `postEventAnnouncement` happy path: row inserted with status `pending`.
- Existing announcement → no duplicate insert, returns true.
- DB error → returns false, logs.
- Each announcement type (`standard`, others if any) routes to its row.

### L4 — `tests/unit/hooks/useLazyBackground.test.tsx`
`src/hooks/useLazyBackground.ts` (35 LOC). Cases:
- Mounts and observes ref.
- Element enters viewport → background style applied.
- Unobserve on unmount.
- No `IntersectionObserver` → graceful (uses `window.IntersectionObserver`
  mock).

### L5 — `tests/integration/api/rate-limit-integration.test.ts`
Pick 2–3 representative routes (e.g. `POST /api/matches`,
`POST /api/upload/event-image`):
- Burst of N+1 requests within window → last request 429.
- After window elapsed → next request allowed.
- Distinct IPs / keys don't share counter.
Skip if rate-limiting isn't actually wired to routes.

---

## Phase M — Final Sweep & Coverage

### M1 — Run `npm run test:coverage`
- Run full coverage.
- Read the summary.
- Identify the top 5 source files (by LOC) that still have lowest coverage.
- Write `tests/COVERAGE_NOTES.md` listing them and noting any gaps. Do NOT
  add more tests in this session — list as future work.

### M2 — `tests/integration/system/full-suite-sanity.test.ts`
Smoke test ensuring the whole world boots in test mode:
- Migrate DB.
- Seed all 6 games.
- Verify `games`, `game_modes`, `game_maps` counts match the data files.
- Spot-check one match-creation route end-to-end.
- Verify no console.error fires during this run (spy).

---

## Critical Files Reference

| Purpose | File |
|---|---|
| API integration pattern | `tests/integration/api/matches.test.ts` |
| Component test pattern | `tests/unit/components/EmptyState.test.tsx` |
| Discord-bot module pattern | `tests/unit/discord-bot/announcement-handler.test.ts` |
| Pure-unit pattern | `tests/unit/lib/pure-utils.test.ts` |
| DB utilities | `tests/utils/test-db.ts` |
| Fixtures | `tests/utils/fixtures.ts` |
| API request helpers | `tests/utils/api-helpers.ts` |
| Discord mocks | `tests/mocks/discord.ts` |
| DB mocks | `tests/mocks/database.ts` |
| Global setup/teardown | `tests/setup.ts` |
| Vitest config | `vitest.config.ts` |
| Test-only DB injection | `setDbForTesting` in `lib/database-init.ts` |

## Verification

After each task:
```bash
npx vitest run <path/to/new-test-file>
```

At milestones (after Tasks 10, 25, 50, 75, and the final task):
```bash
npm run test
```
All tests must pass. Total test count should grow monotonically — if it
shrinks, a previous test was deleted; investigate.

At the final task:
```bash
npm run test:coverage
```

## Stopping Conditions

Stop and wait for the user if:
- The full suite has more than 3 failing tests after a single task is added
  (something foundational is broken — don't pile on).
- A task requires non-trivial source modification to be testable
  (anything beyond exporting a helper is "non-trivial" here).
- More than 5 tasks have been logged in `BUGS_FOUND.md`. That's a triage
  signal.

Otherwise, work through every task in order.

## Order of Operations Cheat Sheet

| Phase | Tasks | Focus | Approx. Time |
|---|---|---|---|
| A | 8 | Small lib unit tests (warm-up) | 1.5h |
| B | 8 | Untested API routes | 3h |
| C | 10 | Deepen big-file unit coverage | 4h |
| D | 10 | Discord-bot deep dive | 4h |
| E | 8 | Stats processor | 3h |
| F | 18 | Pure/display components | 4h |
| G | 12 | Interactive components | 4h |
| H | 5 | Scheduler/process | 2h |
| I | 4 | Migrations/DB | 1.5h |
| J | 4 | Edge cases | 1.5h |
| K | 3 | Lifecycle integrations | 2h |
| L | 5 | Cross-cutting | 2h |
| M | 2 | Final sweep | 1h |

**Total: ~33–35 hours of focused execution** for 97 tasks adding ~700–900
test cases. A full overnight run will get through Phases A–F at minimum;
Phases G–M are extended scope.
