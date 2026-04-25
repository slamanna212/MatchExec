# Discord Auth Integration Plan

**Goal**: Add Better Auth + Discord OAuth login with multi-tier role-based access control driven by Discord server roles.

---

## Permission Levels (Preset Tiers)

| Level | Label | Description |
|-------|-------|-------------|
| `owner` | Owner | Full access including role management. Guild owner is auto-assigned this. |
| `admin` | Admin | Match/tournament management + all settings (except role management) |
| `moderator` | Moderator | Create/score/transition matches and tournaments; no settings access |
| `viewer` | Viewer | Read-only access to all match/tournament data |
| `none` | No Access | Authenticated but no permissions; shown an access-denied message |

Users receive the **highest** level matched across all their Discord roles. The Discord guild owner always gets `owner` regardless of role mappings.

---

## How Discord Role Mapping Works

1. Admin configures mappings on the Roles settings page: `Discord Role → App Permission Level`
2. Multiple Discord roles can map to the same app level
3. On login, the bot token fetches the user's guild membership and resolves their highest level
4. Role is re-synced on every login (not on every request, to avoid rate limits)
5. Guild owner is auto-granted `owner` on login, bypassing mappings
6. Users with no matching role get `none` and see an access-denied prompt

---

## New Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_CLIENT_ID` | Yes | OAuth app client ID from discord.com/developers |
| `DISCORD_CLIENT_SECRET` | Yes | OAuth app client secret |
| `BETTER_AUTH_SECRET` | Yes (prod) | Random secret for session signing (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | No | Defaults to `PUBLIC_URL` or `http://localhost:3000` |

Discord OAuth redirect URI to register: `{BASE_URL}/api/auth/callback/discord`

---

## New Dependencies

```bash
npm install better-auth better-sqlite3
npm install --save-dev @types/better-sqlite3
```

> **Note**: `better-sqlite3` (synchronous) is used exclusively by Better Auth's internal adapter. All application code continues to use the `sqlite3` async driver via `database-init.ts`. Both can safely operate on the same SQLite file.

---

## Database Changes

### New Migration: `migrations/015_auth_tables.sql`

Better Auth auto-creates its own tables (`user`, `session`, `account`, `verification`) at startup using `CREATE TABLE IF NOT EXISTS`. We only need to add:

```sql
CREATE TABLE IF NOT EXISTS "role_mappings" (
  "id"                INTEGER PRIMARY KEY AUTOINCREMENT,
  "discord_role_id"   TEXT    NOT NULL UNIQUE,
  "discord_role_name" TEXT    NOT NULL,
  "discord_role_color" INTEGER NOT NULL DEFAULT 0,
  "app_role"          TEXT    NOT NULL
    CHECK("app_role" IN ('owner', 'admin', 'moderator', 'viewer')),
  "created_at"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_role_mappings_discord_role
  ON "role_mappings"("discord_role_id");
```

Better Auth's `user` table will include a custom `appRole TEXT DEFAULT 'none'` column configured via `additionalFields` in the auth config.

---

## New Files

### Core Auth

| File | Purpose |
|------|---------|
| `src/lib/auth.ts` | Better Auth server config (Discord provider, `appRole` field, better-sqlite3 adapter) |
| `src/lib/auth-client.ts` | Client-side auth (`signIn`, `signOut`, `useSession` exports) |
| `src/lib/permissions.ts` | Permission levels, `requirePermission()` helper for API routes, role labels/colors |
| `src/middleware.ts` | Next.js middleware — redirects unauthenticated users to `/login` |

### Auth API Routes

| Route | Purpose |
|-------|---------|
| `src/app/api/auth/[...all]/route.ts` | Better Auth catch-all handler (OAuth flow, session, etc.) |
| `src/app/api/auth/sync/route.ts` | Called after OAuth completes — fetches Discord guild roles, updates user's `appRole`, redirects home |

### Role Management API Routes

| Route | Method | Min Role | Purpose |
|-------|--------|----------|---------|
| `src/app/api/settings/roles/route.ts` | GET | admin | List all mappings |
| `src/app/api/settings/roles/route.ts` | POST | owner | Create/upsert a mapping |
| `src/app/api/settings/roles/[id]/route.ts` | PUT | owner | Update a mapping's app role |
| `src/app/api/settings/roles/[id]/route.ts` | DELETE | owner | Remove a mapping |
| `src/app/api/discord/server-roles/route.ts` | GET | admin | List all Discord guild roles (via bot token) |
| `src/app/api/discord/server-roles/create/route.ts` | POST | owner | Create a new role on the Discord server |

### UI

| File | Purpose |
|------|---------|
| `src/app/login/page.tsx` | Login page with "Login with Discord" button; shows access-denied message if needed |
| `src/app/settings/roles/page.tsx` | Role management settings page (list/add/edit/delete mappings, create Discord roles) |

---

## Modified Files

### `src/lib/auth.ts` (new — but affects startup)

Better Auth initialises at module load time. It will:
- Open the SQLite DB via `better-sqlite3`
- Auto-create `user`, `session`, `account`, `verification` tables with `appRole` column
- Register the Discord OAuth provider

### `src/components/navigation.tsx`

Replace the static "Space Man" / 👽 user card (lines 442–464 mobile, 579–609 desktop) with:
- `useSession()` from auth-client for real user data
- Discord avatar (`session.data.user.image`) as the `Avatar` `src`
- Discord username (`session.data.user.name`)
- App role badge colored by permission level
- Logout button/icon that calls `signOut()` and redirects to `/login`
- Graceful loading state while session loads

### `src/app/settings/page.tsx`

Add a **Role Management** card to the settings hub grid:
- Icon: `IconShield` (Tabler)
- Color: `#7c3aed` (violet)
- Route: `/settings/roles`
- Description: "Configure Discord role permissions for app access"

### `src/middleware.ts` (new)

Lightweight session check at the Next.js edge:
- Public paths (no auth needed): `/login`, `/welcome/*`, `/api/auth/*`, `/api/health/*`, `/api/db-status`, `/api/version`, `/api/welcome-flow/*`
- All other paths: check for `better-auth.session_token` cookie → redirect to `/login?redirect=<path>` if missing
- Does **not** check role level (that happens in API route handlers)

---

## Login & OAuth Flow

```
User clicks "Login with Discord"
  └─ signIn.social({ provider: 'discord', callbackURL: '/api/auth/sync' })
       └─ Redirects to Discord OAuth
            └─ Discord redirects to /api/auth/callback/discord (Better Auth handler)
                 └─ Better Auth creates/updates user + session
                      └─ Redirects to /api/auth/sync
                           ├─ Fetches Discord guild roles via bot token
                           ├─ Resolves highest app role from role_mappings
                           ├─ Updates user.appRole in DB
                           └─ Redirects to / (or ?redirect= path)
```

If the user ends up with `none` role, redirect to `/login?access=denied` instead of `/`.

---

## Role Management UI (`/settings/roles`)

**Owner-only page.** Two main sections:

### Current Mappings Table
- Columns: Discord Role (name + color swatch) | Permission Level (colored badge) | Actions (edit, delete)
- Edit: modal with dropdown to change the app role
- Delete: confirmation prompt

### Add Mapping Form
- Dropdown: Available Discord roles (pre-filtered to exclude already-mapped roles)
- Dropdown: App permission level
- Submit button

### Create Discord Role
- Button opens a modal with a text input for role name
- Calls `POST /api/discord/server-roles/create` which uses the bot token to create the role on Discord
- After creation, role appears in the "Add Mapping" dropdown

---

## Permission Enforcement

### Middleware (page-level)
Redirects unauthenticated users to `/login`. Does not check role level.

### API Routes (`requirePermission` helper)
```typescript
// Pattern for every protected route handler:
const check = await requirePermission(req, 'moderator'); // or 'admin', 'owner', 'viewer'
if (check instanceof NextResponse) return check; // 401 or 403
// ... handler continues with check.user
```

### Suggested Permission Matrix

| Route Group | Viewer | Moderator | Admin | Owner |
|-------------|:------:|:---------:|:-----:|:-----:|
| GET `/api/matches/*` | ✓ | ✓ | ✓ | ✓ |
| POST/PUT/DELETE `/api/matches/*` | — | ✓ | ✓ | ✓ |
| GET `/api/tournaments/*` | ✓ | ✓ | ✓ | ✓ |
| POST/PUT/DELETE `/api/tournaments/*` | — | ✓ | ✓ | ✓ |
| GET/POST/PUT `/api/games/*` | — | — | ✓ | ✓ |
| `/api/settings/*` | — | — | ✓ | ✓ |
| `/api/settings/roles/*` | — | — | — | ✓ |
| `/api/channels/*` | — | — | ✓ | ✓ |
| `/api/upload/*` | — | — | ✓ | ✓ |

> **Note**: Adding `requirePermission` to all 47+ existing route handlers is a follow-up task. The initial implementation should protect the roles and settings endpoints; other routes can be hardened incrementally.

---

## Docker / Production Considerations

- `better-sqlite3` is a native module — it must be added to `PROCESS_DEPS` in `scripts/collect-process-deps.mjs` if it's ever used in the Discord bot or scheduler processes. For the web app (Next.js standalone), it will be included automatically.
- Better Auth auto-migrates its tables on startup. Since PM2/s6-overlay runs `migrate-background.ts` before the web app starts, `role_mappings` will exist before the web app loads.
- All four new env vars should be added to the Docker run command / `.env` file.

---

## Bootstrap (First Run)

On first deployment with no users and no role mappings:
1. Guild owner logs in via Discord
2. Sync route detects they are the guild owner → sets `appRole = 'owner'`
3. Owner navigates to Settings → Role Management
4. Owner maps existing Discord roles (or creates new ones) to app permission levels
5. Other users log in; their roles are resolved from the mappings
