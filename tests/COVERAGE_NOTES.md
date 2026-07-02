# Coverage Notes

Generated: 2026-05-14  
Overall: **44.52% statements / 38.49% branches / 38.81% functions / 45.36% lines**

## Top 5 Low-Coverage Files (by LOC)

These are the largest source files with 0% or very low coverage. Each is a
candidate for a future test session — listed in order of size.

### 1. `src/components/navigation.tsx` — 657 lines, **0% coverage**
Sidebar and top-nav component with collapsible behavior and logo-click logic.
Gap: No component rendering tests at all. Would need JSDOM/happy-dom render
tests + IntersectionObserver mock (similar to `useLazyBackground`) and router
mock. High value because routing bugs affect every page.

### 2. `src/components/feed-dashboard.tsx` — 627 lines, **0% coverage**
Activity feed dashboard shown on the main page. Fetches and displays match/
tournament events. Gap: All rendering and data-fetch logic untested. Needs
`fetch` mock + component render tests.

### 3. `src/components/tournament-bracket.tsx` — 616 lines, **0% coverage**
Tournament bracket visualization component (SVG/canvas based). Gap: Completely
untested. Heavy UI logic — bracket node positioning, click handlers, round
navigation. Hardest to test; would need `@testing-library/react` + layout mocks.

### 4. `src/components/match-dashboard.tsx` — 624 lines, **0% coverage**
Real-time match dashboard showing participant lists, scores, and status. Gap:
Untested. Needs fetch mock and state-machine transitions rendered via component.

### 5. `src/lib/scoring-functions.ts` — 1345 lines, **67% statement coverage**
The largest single file. The existing `scoring-functions.test.ts` covers main
paths, but ~430 lines remain untested. Gaps: edge cases in
`calculateMapWinner`, double-elimination bracket scoring, tiebreaker logic, and
per-mode scoring variants (Valorant rounds, OW2 objective time). Low risk to
add more unit tests here since it's pure functions.

## Other Notable Gaps

- `src/lib/voice-channel-manager.ts` (62.9%) — `deleteMatchVoiceChannels` and
  channel creation side-effects untested; requires Discord client mock.
- `src/lib/transition-handlers.ts` (83.5%) — assign/battle handlers partially
  covered; voice channel setup path untested.
- `processes/scheduler/index.ts` and `processes/discord-bot/index.ts` — 0%
  coverage; process entry points are not exercised in the test suite.

## Future Work

1. Install `@testing-library/react` to enable proper React component tests.
2. Add component tests for `navigation.tsx`, `feed-dashboard.tsx`, and
   `match-dashboard.tsx` with `fetch` mocked via `vi.stubGlobal`.
3. Extend `scoring-functions.test.ts` with edge cases for double-elimination
   and per-mode variants.
4. Add integration tests for the `voice-channel-manager` using the existing
   Discord mock infrastructure in `tests/mocks/discord.ts`.
