# MatchExec Improvement Plan

A comprehensive plan for unifying the design, improving performance, and raising code quality across the entire MatchExec application. Tasks are grouped by theme and ordered by priority within each group.

**Branch**: `claude/unify-app-design-X3zD4`

---

## How to Use This Plan

Work through each section in order. Each task includes:
- **Goal**: What to achieve
- **Files**: Exact files to touch
- **Details**: Specific changes required
- **Test**: How to verify it worked

After completing each section run `npm run test` and `npm run lint` to catch regressions.

NOTE: do not do any tests for the stats system, it is not done yet

---

## Section 1 — Design Token Foundation (do this first, everything else builds on it)

### 1.1 Expand the Mantine theme `other` object with centralised tokens

**File**: `src/app/providers.tsx`

Add a comprehensive `other` block to the `createTheme()` call so every component can reference tokens instead of hardcoded values:

```typescript
other: {
  // Page layout
  pageMaxWidth: '72rem',          // replaces scattered max-w-4xl / max-w-6xl
  pageMaxWidthNarrow: '56rem',    // for single-column settings pages
  pagePadding: { base: 'md', sm: 'xl' },

  // Navigation
  navActiveColor: '#f7cc02',      // currently hardcoded in navigation.tsx:75

  // Card hover lift
  cardHoverTransform: 'translateY(-3px)',
  cardHoverShadow: '0 8px 24px rgba(0,0,0,0.25)',

  // Status colours (used by match dashboard)
  statusColors: {
    created:   '#6c757d',
    gather:    '#3b82f6',
    assign:    '#f59e0b',
    battle:    '#22c55e',
    complete:  '#8b5cf6',
    cancelled: '#ef4444',
  },

  // Settings page category colours (currently hardcoded in settings/page.tsx:22-64)
  settingsColors: {
    application: '#27ae60',
    stats:       '#e74c3c',
    announcer:   '#e67e22',
    discord:     '#5865f2',
    scheduler:   '#9b59b6',
    ui:          '#f39c12',
    backup:      '#16a085',
  },

  // Input background (currently repeated 5× in providers.tsx components block)
  inputBg: 'light-dark(var(--mantine-color-white), #1e1e2e)',
  inputBorderColor: 'rgba(139, 92, 246, 0.35)',
}
```

Then update the `components` block in the same file — use the token values instead of repeating the same string in every component override (TextInput, PasswordInput, NumberInput, Textarea, Select all currently duplicate the same two strings).

---

### 1.2 Replace fragile internal Mantine class selectors in globals.css

**File**: `src/app/globals.css`

Lines 36–62 target Mantine internal class names like `.m_f0824112`, `.m_54c44539`, `.m_d0e2b9cd`, `.m_9df02822`. These break silently on Mantine upgrades.

**Fix**:
- Move NavLink hover/active overrides into the Mantine theme's `components.NavLink.classNames` or `components.NavLink.styles` in `providers.tsx`. Use Mantine's `data-active` attribute selector via CSS modules or the `styles` API — both are stable across versions.
- Move modal background overrides into `components.Modal.styles` in `providers.tsx`:
  ```typescript
  Modal: {
    styles: {
      content: { backgroundColor: '#131314' },
      header:  { backgroundColor: '#131314' },
    }
  }
  ```
- Remove the four class-name selectors from `globals.css`.

---

## Section 2 — Shared Layout Components (highest visual impact)

### 2.1 Create `PageLayout` component

**New file**: `src/components/PageLayout.tsx`

Every page currently has its own container width and padding. Create one shared wrapper:

```typescript
interface PageLayoutProps {
  children: React.ReactNode;
  narrow?: boolean;   // uses pageMaxWidthNarrow for settings sub-pages
  noPadding?: boolean;
}

export function PageLayout({ children, narrow, noPadding }: PageLayoutProps) {
  // Uses theme.other.pageMaxWidth / pageMaxWidthNarrow
  // Consistent padding: px-4 py-6 sm:px-6
}
```

**Adopt it in every page** (replace each page's ad-hoc `div className="max-w-... mx-auto"`):
- `src/app/settings/page.tsx` — currently `max-w-6xl mx-auto`
- `src/app/settings/discord/page.tsx` — currently `max-w-4xl mx-auto`
- `src/app/settings/announcer/page.tsx` — currently `max-w-4xl mx-auto`
- `src/app/settings/application/page.tsx` — currently `max-w-4xl mx-auto`
- `src/app/settings/scheduler/page.tsx` — currently `max-w-4xl mx-auto`
- `src/app/settings/ui/page.tsx` — currently `max-w-4xl mx-auto`
- `src/app/settings/backup-restore/page.tsx` — currently `max-w-4xl mx-auto`
- `src/app/settings/stats/page.tsx` — currently `max-w-4xl mx-auto`
- `src/app/channels/page.tsx` — currently `max-w-6xl`
- `src/components/match-dashboard.tsx` — currently `container mx-auto p-6 max-w-6xl`
- `src/components/home-page.tsx` — currently `container mx-auto px-6 pt-3 pb-6 max-w-6xl`

---

### 2.2 Create `PageHeader` component

**New file**: `src/components/PageHeader.tsx`

Every page title is done slightly differently. Unify into one component:

```typescript
interface PageHeaderProps {
  icon: React.ComponentType<{ size: number | string }>;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;   // optional right-side button/badge
}

export function PageHeader({ icon: Icon, title, subtitle, action }: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-start" mb="xl">
      <Group gap="md" align="flex-start">
        <ThemeIcon size={44} radius="md" variant="light" color="violet">
          <Icon size={24} />
        </ThemeIcon>
        <div>
          <Title order={2} size="h3">{title}</Title>
          {subtitle && <Text size="sm" c="dimmed" mt={2}>{subtitle}</Text>}
        </div>
      </Group>
      {action}
    </Group>
  );
}
```

**Adopt in**:
- `src/app/settings/page.tsx` — replace lines 75–81
- `src/app/settings/discord/page.tsx`
- `src/app/settings/announcer/page.tsx`
- `src/app/settings/application/page.tsx`
- `src/app/settings/scheduler/page.tsx`
- `src/app/settings/ui/page.tsx`
- `src/app/channels/page.tsx`
- `src/components/home-page.tsx`
- `src/components/match-dashboard.tsx`
- `src/components/tournament-dashboard.tsx`

Standardise icon size to `24` inside `PageHeader`. Remove all loose `size="1.5rem"` / `size="2rem"` icon instances that were acting as page headers.

---

### 2.3 Create `SectionLabel` component

**New file**: `src/components/SectionLabel.tsx`

For subsection headings inside cards and panels, establish one typographic style:

```typescript
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text size="xs" fw={600} tt="uppercase" c="dimmed" ls="0.05em">
      {children}
    </Text>
  );
}
```

Replace ad-hoc `Text size="sm" fw={600}` / `Text size="md"` / `Text size="lg"` subsection headers throughout `src/components/match-details/` and `src/components/tournament-details/`.

---

### 2.4 Create `EmptyState` component

**New file**: `src/components/EmptyState.tsx`

```typescript
interface EmptyStateProps {
  icon: React.ComponentType<{ size: number }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}
```

Replace the inconsistent empty state implementations in:
- `src/components/match-dashboard.tsx` — lines 608–640
- `src/components/home-page.tsx` — lines 367–375
- `src/components/tournament-dashboard.tsx`
- Any channel/participant empty states

---

## Section 3 — Card & Interactive Element Consistency

### 3.1 Standardise all Card props

Every `<Card>` in the app should use exactly one of two presets unless there is a documented reason to deviate:

**Interactive card** (clickable, navigates somewhere):
```typescript
shadow="sm" radius="md" withBorder padding={0}
style={{ cursor: 'pointer', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}
// onMouseEnter: translateY(-3px) + theme.other.cardHoverShadow
// onMouseLeave: reset
```

**Static card** (information panel, no click action):
```typescript
shadow="sm" radius="md" withBorder padding="lg"
```

**Files to audit and fix**:
- `src/components/match-dashboard.tsx` — MatchCard currently uses `colorScheme === 'light' ? 'lg' : 'sm'` for shadow (line 92). Use `"sm"` always — the color scheme already provides the contrast difference.
- `src/app/settings/page.tsx` — settings cards lines 85–158 have custom hover that's fine but uses `scale(1.01)` which can look jittery; remove scale, keep translateY.
- `src/components/match-details/ReminderCard.tsx` — uses `padding="sm"` and `max-width: 500px` inline, move max-width constraint up to the parent layout.
- All `src/components/match-details/*.tsx` — audit padding consistency.
- All `src/components/tournament-details/*.tsx` — audit padding consistency.

---

### 3.2 Standardise button hierarchy

Establish and document three levels:

| Level | Usage | Mantine props |
|-------|-------|---------------|
| Primary | Main action on a page (Create, Save, Submit) | `variant="filled" color="violet"` |
| Secondary | Supporting action (Edit, View Details, Export) | `variant="light" color="violet"` |
| Destructive | Delete, Cancel match, irreversible action | `variant="light" color="red"` |

**Files to fix**:
- `src/components/match-details/MatchInfoPanel.tsx` lines 82–88: audit button variants
- `src/components/tournament-details/TournamentInfoPanel.tsx` lines 56–151: some use Tailwind grid layout for buttons, convert to Mantine `Group` / `Stack`
- Any button using `color="blue"` that should be `color="violet"` to match primary

---

### 3.3 Standardise left-accent borders on participant/team cards

`src/components/match-details/ParticipantsList.tsx` lines 84–117 has good `border-left: 4px solid` color coding. Ensure the same pattern is used consistently in tournament participant cards — currently tournament cards use different styling.

---

## Section 4 — Typography Pass

Do a single pass across all components to enforce these rules:

| Element | Mantine props |
|---------|--------------|
| Page title | `<Title order={2} size="h3">` (via `PageHeader`) |
| Card / panel title | `<Text size="md" fw={600}>` |
| Section label | `<SectionLabel>` (see 2.3) |
| Body / description | `<Text size="sm">` |
| Secondary / metadata | `<Text size="sm" c="dimmed">` |
| Tiny label | `<Text size="xs" c="dimmed">` |

**Key files to audit**:
- `src/components/home-page.tsx` — stat cards have inconsistent heading sizes
- `src/components/match-details/*.tsx` — mixed `size="sm"` / `size="md"` for same-level labels
- `src/app/settings/*.tsx` — all settings sub-pages

---

## Section 5 — Performance Improvements

### 5.1 Consolidate `parseDbTimestamp` utility

This function is duplicated in at minimum two places:
- `src/components/match-dashboard.tsx` lines 27–39
- `src/app/matches/[matchId]/page.tsx` lines 16–26

**Fix**: Move the canonical implementation to `src/lib/utils/dates.ts` and import it in both files. Remove the duplicates.

---

### 5.2 Add missing database indexes

**New migration file**: `migrations/013_performance_indexes.sql`

Add the following indexes that are missing or implied but not created:

```sql
-- Matches filtered/sorted by status + recency (most common dashboard query)
CREATE INDEX IF NOT EXISTS idx_matches_status_updated
  ON matches(status, updated_at DESC);

-- Match participants lookup by match (used in every match detail load)
CREATE INDEX IF NOT EXISTS idx_match_participants_match_id
  ON match_participants(match_id);

-- Match participants lookup by user (for user's match history)
CREATE INDEX IF NOT EXISTS idx_match_participants_user_id
  ON match_participants(user_id);

-- Match games lookup by match
CREATE INDEX IF NOT EXISTS idx_match_games_match_id
  ON match_games(match_id);

-- Tournament matches lookup by tournament
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament_id
  ON tournament_matches(tournament_id);

-- Tournament participants lookup by tournament
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament_id
  ON tournament_participants(tournament_id);

-- Matches filtered by tournament
CREATE INDEX IF NOT EXISTS idx_matches_tournament_id
  ON matches(tournament_id)
  WHERE tournament_id IS NOT NULL;

-- Discord queue processing (status-based polling)
CREATE INDEX IF NOT EXISTS idx_discord_queues_status
  ON discord_queues(status, created_at);
```

---

### 5.3 Fix N+1 query pattern in stats endpoint

**File**: `src/app/api/stats/route.ts`

The current implementation runs multiple separate `SELECT COUNT(*)` subqueries. Consolidate into a single query using CTEs or combine all counts in one SQL statement to reduce round-trips to SQLite.

---

### 5.4 Add pagination to tournaments list endpoint

**File**: `src/app/api/tournaments/route.ts`

The current query joins 5 tables with no `LIMIT`. Add:
- `?page=1&limit=20` query parameter support
- Return `{ data: [...], total: N, page: N, limit: N }` shaped response
- Update `src/components/tournament-dashboard.tsx` to handle paginated response

---

### 5.5 Fix potential interval leak in match detail page

**File**: `src/app/matches/[matchId]/page.tsx` lines 315–331

The `refreshInterval` state drives `setInterval` but changing `refreshInterval` while an interval is running can create multiple concurrent timers.

**Fix**: Use a single `useEffect` that depends on `refreshInterval`, clears the previous interval in its cleanup function, and sets a new one. Pattern:

```typescript
useEffect(() => {
  if (!refreshInterval) return;
  const id = setInterval(fetchData, refreshInterval);
  return () => clearInterval(id);
}, [refreshInterval, fetchData]);
```

---

### 5.6 Fix synchronous file system calls in participants route

**File**: `src/app/api/matches/[matchId]/participants/route.ts` lines 45–55

`fs.existsSync()` and `fs.readFileSync()` block the Node.js event loop. Replace with async equivalents:

```typescript
import { readFile, access } from 'fs/promises';

// Check existence without blocking:
const exists = await access(signupPath).then(() => true).catch(() => false);
if (exists) {
  const raw = await readFile(signupPath, 'utf8');
  signupConfig = JSON.parse(raw);
}
```

Also validate `game_id` before constructing the path — ensure it matches `/^[a-z0-9_-]+$/i` to prevent path traversal. Return 400 if invalid.

---

### 5.7 Memoize navigation items array

**File**: `src/components/navigation.tsx`

The array of 13+ nav items is currently recreated on every render. Move it outside the component (it's static data) or wrap with `useMemo`. The `getIcon` function map should also be defined once outside the component body.

---

### 5.8 Replace requestAnimationFrame mount trick in navigation

**File**: `src/components/navigation.tsx` line ~130

The `requestAnimationFrame()` on mount is used to avoid hydration mismatches (`mounted` flag). Replace with `useIsClient()` hook from `@mantine/hooks` or the standard pattern:

```typescript
const [mounted, setMounted] = useState(false);
useEffect(() => { setMounted(true); }, []);
```

This is cleaner and avoids possible layout thrashing from rAF.

---

## Section 6 — Code Quality & Architecture

### 6.1 Move shared types to `src/shared/types.ts`

Several interfaces are defined inline in component files and then re-defined or partially re-defined in other files (e.g. `MatchWithGame` in `match-dashboard.tsx` and a similar shape in the match detail page).

Audit all per-file interface definitions and move shareable ones to `src/shared/types.ts`. Key candidates:
- `MatchWithGame` extended interface
- Tournament participant/team shapes
- Settings response shapes

---

### 6.2 Standardise API error responses

All API routes should return errors in the same shape. Currently some return `{ error: string }`, some return plain 500s with no body, and some log differently.

Establish and use a helper in `src/lib/api-response.ts`:

```typescript
export function apiError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export function apiOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}
```

Adopt across all routes in `src/app/api/`.

---

### 6.3 Validate route params before database access

Several routes accept `[matchId]`, `[tournamentId]`, etc. and query the database without validating the parameter format. Add a simple guard at the top of each route handler:

```typescript
const { matchId } = await params;
if (!matchId || typeof matchId !== 'string' || matchId.length > 100) {
  return apiError('Invalid ID', 400);
}
```

---

### 6.4 Fix voice handler map cleanup

**File**: `processes/discord-bot/modules/voice-handler.ts` lines 19–21

The three Maps (`voiceConnections`, `activeAudioPlayers`, `playbackStatus`) accumulate entries for guilds/channels that have been left. Add cleanup on voice disconnect events — when a connection is destroyed, delete its entries from all three maps. Also add a periodic sweep (e.g. every hour) to remove stale entries for connections that are no longer active.

---

### 6.5 Eliminate `@ts-expect-error` suppressions in scheduler

**File**: `processes/scheduler/index.ts` lines 1, 55, 73

Each `@ts-expect-error` indicates a type mismatch being suppressed rather than fixed. Resolve each one properly — either by adding the correct type import, narrowing the type, or adjusting the interface. Document with a comment if a suppression is genuinely necessary (it rarely is).

---

### 6.6 Audit and remove unused `_` prefixed variables

Search for `_mapNames`, `_mapDetails`, `_mapNotes` and similar unused-variable patterns (underscored to suppress lint). Either:
- Remove the variable entirely if the data is truly unused
- Remove the underscore and actually use it if it was meant to be used

Run `npm run lint` after to confirm no new warnings.

---

## Section 7 — Welcome Flow Visual Alignment

**File**: `src/app/welcome/layout.tsx`

The welcome wizard currently uses a bespoke full-screen dark layout with its own `Paper` + sizing that doesn't match the rest of the app. It should feel like the first page of the app, not a separate product.

Changes:
- Use the same background color (`var(--mantine-color-body)`) as the main app rather than `dark-8`
- Apply the same `radius="md"` as the rest of the app's cards
- Use `PageHeader` for the wizard title area (without the navigation chrome — that's correct to omit)
- Ensure Stepper colors use `color="violet"` to match the primary theme color

---

## Section 8 — globals.css Housekeeping

**File**: `src/app/globals.css`

After completing Section 1.2 (replacing fragile selectors), do a cleanup pass:

1. Remove any commented-out CSS that's no longer needed
2. Document each remaining override with a brief comment explaining *why* it can't live in the Mantine theme (there should be very few after Section 1.2)
3. Consolidate the light/dark body background rules — currently they're spread across `:root`, `[data-mantine-color-scheme]`, and `body` selectors with some redundancy

---

## Section 9 — Testing (add after code changes are complete)

The test suite has no coverage of:
- API route handlers (`src/app/api/`)
- Shared utility functions (`src/lib/utils/`)
- The new shared components created in Sections 2 and 3

### 9.1 Add tests for shared utilities

**New file**: `tests/unit/utils/dates.test.ts`

Test `parseDbTimestamp()` with:
- `null` / `undefined` input
- Already-UTC string (with `Z`)
- SQLite plain format (`2025-08-09 00:40:16`)
- String with timezone offset

### 9.2 Add tests for new shared components

**New files**:
- `tests/unit/components/PageHeader.test.tsx`
- `tests/unit/components/EmptyState.test.tsx`
- `tests/unit/components/SectionLabel.test.tsx`

Use Vitest + React Testing Library. Verify render output, prop handling, and accessibility (heading level, icon alt text).

### 9.3 Add integration tests for stats and pagination

**Add to** `tests/integration/api/`:
- `stats.test.ts` — verify the stats endpoint returns correct counts
- `tournaments-pagination.test.ts` — verify `?page=` and `?limit=` work correctly after task 5.4

---

## Completion Checklist

After all sections are done, verify:

- [ ] `npm run lint` passes with 0 errors
- [ ] `npm run test` passes (or failures are pre-existing known issues documented in CLAUDE.md)
- [ ] `npm run build` succeeds
- [ ] No hardcoded hex colour values remain outside of `providers.tsx`'s `other` block and the `globals.css` background colours (which must stay there for iOS Safari reasons — see the comment in that file)
- [ ] No Mantine internal class names (`.m_XXXXXXXX`) remain in `globals.css` except those that cannot be moved to the theme (document why if any remain)
- [ ] Every page uses `PageLayout` and `PageHeader`
- [ ] Every `Card` uses either the interactive or static preset from Section 3.1
- [ ] `parseDbTimestamp` exists in exactly one place: `src/lib/utils/dates.ts`
- [ ] Migration `013_performance_indexes.sql` is present and runs cleanly
- [ ] Voice handler maps are cleaned up on disconnect
- [ ] No `@ts-expect-error` suppressions remain without an explanatory comment

---

## Non-Goals (explicitly out of scope for this plan)

- Authentication/authorization — this is a local/LAN tool by design
- GraphQL or API schema changes beyond what's listed
- Replacing SQLite with another database
- Adding Redis or external caching
- End-to-end or visual regression tests (Playwright etc.)
- Any new feature functionality

---

*Generated by Claude Code — slamanna212/matchexec — 2026-04-07*
