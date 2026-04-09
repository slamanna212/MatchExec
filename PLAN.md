# Broad Test Coverage Push — Execution Checklist

## Context

Current branch `scoring` sits at **18.22%** overall coverage per Codecov (207 files, 12,189 lines, 2,221 hit). Excluding the `scoring/` code and the feed page (per user request), effective coverage is **17.43%** across 200 files / 11,295 lines. Codecov's `/test-analytics/` API reports **0 failing** and **0 flaky** tests on the latest run, so the focus here is purely net-new coverage, not stabilization.

Test infrastructure is already in good shape (vitest forks, `TestDatabase` wrapper, fixtures, API helpers). The DB-isolation issue mentioned in older CLAUDE.md is fixed. The gap is simply that large swaths of discord-bot, scheduler, lib, and API route code have **zero** test files exercising them.

**Goal:** drive overall coverage (excluding `scoring/*` and feed paths) from ~17% toward **40%+** by adding unit + integration tests targeted at the highest-value uncovered files.

**Explicit exclusions (do not write tests for):**
- Any file under a `scoring/` path or implementing scoring features
- The feed page
- React page components (`src/app/**/page.tsx`) and `src/components/*.tsx` — high line counts but require a new RTL+jsdom harness; out of scope for this push

## Ground Rules

- **Reuse** existing infra — do NOT invent new harnesses:
  - `tests/utils/test-db.ts` — `getTestDb()`, `setupTestDatabase()`, `setDbForTesting()`
  - `tests/utils/fixtures.ts` — `seedBasicTestData()`, `createMatch()`, `createTournament()`
  - `tests/utils/api-helpers.ts` — `createMockRequest()`, `parseResponse()`, `createRouteParams()`
  - `tests/mocks/database.ts`, `tests/mocks/discord.ts`
- **All `vi.mock()` calls must be at the top of each test file** — mocks in setup files don't work (see CLAUDE.md).
- Discord-bot tests must mock `discord.js`, `@discordjs/voice`, and `ffmpeg-static`.
- Use `getTestDb()` for direct inserts; API handlers share the connection via `setDbForTesting()`.
- Commit after each tier with a descriptive message — do NOT bundle all tiers into one commit.
- Run `npm run test:coverage` + `npm run lint` after each tier.

## Critical Files To Read First (patterns to copy)

- [ ] `tests/utils/test-db.ts`
- [ ] `tests/utils/fixtures.ts`
- [ ] `tests/utils/api-helpers.ts`
- [ ] `tests/unit/discord-bot/queue-processor.test.ts` — reference bot-module mocking
- [ ] `tests/integration/api/matches.test.ts` — reference API integration shape
- [ ] `tests/integration/database/seeder.test.ts` — existing partial seeder test
- [ ] `CLAUDE.md` Testing section — `vi.mock()` rule and source-to-test map

---

## Tier 1 — Pure-logic unit tests (do first, fastest wins)

- [ ] `tests/unit/lib/signup-forms.test.ts` — covers `lib/signup-forms.ts` (36 lines, 0%)
- [ ] `tests/unit/lib/reminder-helpers.test.ts` — covers `src/lib/reminder-helpers.ts` (48 lines, 0%)
- [ ] `tests/unit/lib/map-code-service.test.ts` — covers `src/lib/map-code-service.ts` (55 lines, 11% → 85%+)
- [ ] `tests/unit/lib/logger-base.test.ts` — covers `src/lib/logger/base.ts` (98 lines, 51% → 90%+)
- [ ] `tests/unit/lib/database-status.test.ts` — covers `lib/database/status.ts` (21 lines), `lib/database/ready-checker.ts` (22 lines), `lib/database/index.ts` (22 lines) in one file
- [ ] `tests/unit/lib/voice-channel-manager.test.ts` — covers `src/lib/voice-channel-manager.ts` (90 lines, 7% → 80%+)
- [ ] `tests/unit/lib/tournament-transition-handlers.test.ts` — covers `src/lib/tournament-transition-handlers.ts` (89 lines, 13% → 80%+)
- [ ] Run `npm run test:coverage && npm run lint`
- [ ] Commit: `test: add unit tests for lib helpers`

## Tier 2 — Extend existing partial-coverage tests (highest per-line gain)

- [ ] Extend `tests/unit/discord-bot/queue-processor.test.ts`
  - [ ] Add cases for `discord_player_reminder_queue`
  - [ ] Add cases for `discord_deletion_queue`
  - [ ] Add cases for `discord_score_notification_queue`
  - [ ] Add cases for `discord_match_start_queue`
  - [ ] Target: 39% → 65%+ on `queue-processor.ts` (707 lines)
- [ ] Extend `tests/unit/discord-bot/announcement-handler.test.ts`
  - [ ] Cover edit-embed branches
  - [ ] Cover update-roster branches
  - [ ] Cover cancelled-state branches
  - [ ] Target: 65% → 85%+ on `announcement-handler.ts` (633 lines)
- [ ] Extend `tests/unit/discord-bot/voice-handler.test.ts`
  - [ ] Cover connection-failure paths
  - [ ] Cover no-voice-channel paths
  - [ ] Target: 67% → 85%+ on `voice-handler.ts` (230 lines)
- [ ] Extend `tests/integration/api/matches.test.ts`
  - [ ] Exercise PUT/PATCH branches on `src/app/api/matches/[matchId]/route.ts`
  - [ ] Target: 29% → 80%+ on that route (89 lines)
- [ ] Run `npm run test:coverage && npm run lint`
- [ ] Commit: `test: extend queue-processor / announcement-handler / voice-handler / matches route`

## Tier 3 — New discord-bot module unit tests

- [ ] `tests/unit/discord-bot/reminder-handler.test.ts` — `reminder-handler.ts` (193 lines, 0%)
- [ ] `tests/unit/discord-bot/interaction-handler.test.ts` — `interaction-handler.ts` (181 lines, 0%)
- [ ] `tests/unit/discord-bot/event-handler.test.ts` — `event-handler.ts` (68 lines, 0%)
- [ ] `tests/unit/discord-bot/health-monitor.test.ts` — `health-monitor.ts` (62 lines, 0%)
- [ ] `tests/unit/discord-bot/scorecard-handler.test.ts` — `scorecard-handler.ts` (72 lines, 0%)
- [ ] `tests/unit/discord-bot/announcement-helpers.test.ts` — `announcement-helpers.ts` (70 lines, 29% → 85%+)
- [ ] `tests/unit/discord-bot/bot-index.test.ts` — export-level tests for `processes/discord-bot/index.ts` (205 lines); do NOT exercise `client.login`
- [ ] Run `npm run test:coverage && npm run lint`
- [ ] Commit: `test: add discord-bot module unit tests`

## Tier 4 — Scheduler + stats-processor unit tests

- [ ] `tests/unit/scheduler/cron-jobs.test.ts` — extract-and-call the job functions from `processes/scheduler/index.ts` (291 lines, 23% → 60%+)
- [ ] `tests/unit/scheduler/jobs/update-avatars.test.ts` — `processes/scheduler/jobs/update-avatars.ts` (53 lines, 0%)
- [ ] `tests/unit/stats-processor/index.test.ts` — `processes/stats-processor/index.ts` (63 lines, 0%)
- [ ] `tests/unit/stats-processor/ai-extractor.test.ts` — mock AI client, test parsing (`ai-extractor.ts`, 114 lines, 0%)
- [ ] `tests/unit/stats-processor/stat-image-generator.test.ts` — test non-canvas helpers (`stat-image-generator.ts`, 160 lines, 0%)
- [ ] Run `npm run test:coverage && npm run lint`
- [ ] Commit: `test: add scheduler and stats-processor unit tests`

## Tier 5 — Database seeder integration test

- [ ] `tests/integration/database/seeder-full.test.ts`
  - [ ] Full seed from `data/games/` into a fresh test DB
  - [ ] Assert row counts for games, modes, maps
  - [ ] Assert idempotency: re-run seeder, counts unchanged
  - [ ] Assert `dataVersion` bump triggers re-seed
  - [ ] Covers `lib/database/seeder.ts` (197 lines, 0%)
- [ ] `tests/unit/lib/discord-bot-service.test.ts` — covers `lib/discord-bot-service.ts` (25 lines, 0%)
- [ ] Run `npm run test:coverage && npm run lint`
- [ ] Commit: `test: add seeder integration test`

## Tier 6 — New API integration tests

- [ ] `tests/integration/api/tournament-progress.test.ts` — `tournaments/[tournamentId]/progress/route.ts` (86 lines)
- [ ] `tests/integration/api/tournament-generate-matches.test.ts` — `tournaments/[tournamentId]/generate-matches/route.ts` (50 lines)
- [ ] `tests/integration/api/match-scorecard.test.ts` — `matches/[matchId]/scorecard/route.ts` (70 lines)
- [ ] `tests/integration/api/channels.test.ts` — `channels/route.ts` (55 lines)
- [ ] `tests/integration/api/metrics.test.ts` — `metrics/route.ts` (55 lines)
- [ ] `tests/integration/api/settings-restore.test.ts` — `settings/restore/route.ts` (57 lines)
- [ ] `tests/integration/api/settings-scheduler.test.ts` — `settings/scheduler/route.ts` (47 lines)
- [ ] `tests/integration/api/upload-event-image.test.ts` — `upload/event-image/route.ts` (57 lines, mock fs)
- [ ] Run `npm run test:coverage && npm run lint`
- [ ] Commit: `test: add API integration tests for tournament/match/settings/upload`

---

## Final Verification

- [ ] `npm run test` — all suites pass
- [ ] `npm run test:coverage` — overall coverage (excl. `scoring/*` + feed) ≥ **40%**
- [ ] Every Tier-1/Tier-3 file listed has ≥ 70% line coverage
- [ ] Every Tier-2 file meets its stated target
- [ ] `npm run lint` — clean
- [ ] `open coverage/index.html` — visually verify no regressions
- [ ] No pre-existing test was broken or skipped to hit targets

## Reference: Current Coverage Baseline (from Codecov API, branch `scoring`)

- Overall: 18.22% (2221 / 12189 lines)
- Excl. `scoring/*` + feed: 17.43% (1969 / 11295 lines)
- Flaky tests: 0
- Failing tests: 0
- Codecov API endpoint used (public, no auth): `https://api.codecov.io/api/v2/github/slamanna212/repos/MatchExec/report/?branch=scoring`
