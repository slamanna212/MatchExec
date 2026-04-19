# NOSONAR Test Coverage — Continuation Plan

## What Was Done This Session

### 1. `insertParticipant` — DONE
- Added `insertParticipant` import + 4 tests to `tests/unit/discord-bot/interaction-helpers.test.ts`
- Tests cover: match participant insertion (ID format), unique ID per call, tournament participant without team, tournament participant with team (also inserts `tournament_team_members`)

### 2. `checkDiscordBotHeartbeat` — DONE
- Added 5 tests to `tests/unit/scheduler/index.test.ts`
- Tests cover: no heartbeat in DB → skip, recent heartbeat → skip, stale + no rate-limit → queues alert (ID format verified), stale + rate-limited → skip, stale + expired rate-limit → queues again

### 3. `AnnouncementsStep.test.tsx` — NOT YET WRITTEN
### 4. Page-level component tests — NOT YET WRITTEN

---

## What Still Needs to Be Done

### Step 1: `AnnouncementsStep` test
**New file**: `tests/unit/components/AnnouncementsStep.test.tsx`

The component (`src/components/create-match/AnnouncementsStep.tsx`) is pure props-in/callbacks-out — no API calls, no router. Use the `renderWithMantine` + `createRoot` + `act` pattern from `tests/unit/components/EmptyState.test.tsx`.

```
vi.mock('@tabler/icons-react', () => ({ IconPlus: () => null, IconX: () => null }));
```

Tests to write:
- Renders without crashing with empty announcements array
- Clicking the "Add Announcement" card calls `updateFormData` with a new announcement whose `id` matches `/^[a-z0-9]{13,}$/`
- Two consecutive add clicks produce two different IDs
- Clicking the X button calls `updateFormData` with the announcement removed (use `announcements` prop with one pre-existing item)
- `onBack` and `onNext` buttons call their respective callbacks
- announcements are sorted: minutes < hours < days (pass three unsorted, verify callback receives sorted order)

Note: clicking the card is done via `container.querySelector('[style*="dashed"]')?.dispatchEvent(new Event('click', { bubbles: true }))` or by finding the "Add Announcement" text parent.

### Step 2: `CreateMatchPage` smoke test
**New file**: `tests/unit/components/CreateMatchPage.test.tsx`

Mocks needed:
```ts
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ get: () => '1' }),
}));
vi.mock('@/lib/logger/client', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/notifications', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
// mock fetch globally
beforeEach(() => { global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }); });
```

Import: `import { CreateMatchPage } from '../../../src/components/create-match-page';`

Tests:
- Renders without throwing (basic smoke test)
- The `handleMapSelect` ID format: call the internal handler by simulating a map card click or by calling the function directly after rendering — ID must match `/^.+-\d+-[a-z0-9]+$/`

Because `handleMapSelect` is a closure inside the component, the simplest approach is just the smoke render test — the NOSONAR code is reached during normal render/interaction.

### Step 3: `MatchEditPage` smoke test
**New file**: `tests/unit/components/MatchEditPage.test.tsx`

The page uses `use(params)` (React 19 `use()` with a Promise). This requires wrapping in Suspense.

Mocks needed (same as above plus):
```ts
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
```

Import: `import MatchEditPage from '../../../src/app/matches/[matchId]/edit/page';`

The page component accepts `params: Promise<{ matchId: string }>`. Render with `<Suspense><MatchEditPage params={Promise.resolve({ matchId: 'test-match' })} /></Suspense>`.

Test: renders without throwing.

### Step 4: `MatchDashboard` smoke test
**New file**: `tests/unit/components/MatchDashboard.test.tsx`

Mocks needed:
```ts
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/logger/client', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/notifications', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('framer-motion', () => ({ motion: { div: ({ children, ...p }: any) => <div {...p}>{children}</div> } }));
```

Import: `import { MatchDashboard } from '../../../src/components/match-dashboard';`

Tests:
- Renders without throwing (validates the S3776-suppressed component mounts cleanly)

---

## Verification

After writing all files, run:
```bash
npm run test
```

All 883+ existing tests should still pass, plus ~20 new ones.

## Quick Reference: renderWithMantine Pattern

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';

function renderWithMantine(element: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { createRoot(container).render(<MantineProvider>{element}</MantineProvider>); });
  return container;
}
```
