# Discord Auth Integration Plan

**Goal**: Add Better Auth + Discord OAuth login with multi-tier role-based access control
driven by Discord server roles.

---

## Permission Levels (Preset Tiers)

| Level | Label | Description |
|-------|-------|-------------|
| `owner` | Owner | Full access including role management. Guild owner is auto-assigned this. |
| `admin` | Admin | Match/tournament management + all settings (except role management) |
| `moderator` | Moderator | Create/score/transition matches and tournaments; no settings access |
| `viewer` | Viewer | Read-only access to all match/tournament data |
| `none` | No Access | Authenticated but no permissions; redirected to access-denied page |

Users receive the **highest** level matched across all their Discord roles.
The Discord guild owner always gets `owner` automatically, regardless of role mappings.

---

## How Discord Role Mapping Works

1. Owner configures mappings on the Roles settings page: `Discord Role → App Permission Level`
2. Multiple Discord roles can map to the same app level
3. On login, the bot token fetches the user's guild membership and resolves their highest level
4. Role is re-synced on every login (not on every request — avoids Discord API rate limits)
5. Guild owner is auto-granted `owner` on login, bypassing all mappings
6. Users with no matching role get `none` and are redirected to `/login?access=denied`

---

## Step 1 — Discord OAuth App Setup

1. Go to <https://discord.com/developers/applications>
2. Create a new application (or use the existing bot's application)
3. Navigate to **OAuth2 → General**
4. Add redirect URI: `{BASE_URL}/api/auth/callback/discord`
   - Development: `http://localhost:3000/api/auth/callback/discord`
   - Production: `https://yourdomain.com/api/auth/callback/discord`
5. Copy **Client ID** and **Client Secret** → add to `.env` (see Environment Variables below)

---

## Step 2 — New Dependencies

```bash
# --legacy-peer-deps is required due to a Vite peer-dep conflict between
# better-auth's optional Svelte kit dependency and the project's current vitest version
npm install better-auth better-sqlite3 --legacy-peer-deps
npm install --save-dev @types/better-sqlite3 --legacy-peer-deps
```

> **Note on `better-sqlite3`**: Better Auth's SQLite adapter requires the synchronous
> `better-sqlite3` driver. All existing application code continues to use the `sqlite3`
> async callback driver via `database-init.ts`. Both libraries can safely open the same
> SQLite file — SQLite's WAL mode handles concurrent access at this scale.

---

## Step 3 — Environment Variables

Add to `.env` (and Docker run command / compose file):

```env
# Required — from Discord OAuth app (Step 1)
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_CLIENT_SECRET=your_client_secret_here

# Required in production — generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=your_random_secret_here

# Optional — defaults to PUBLIC_URL or http://localhost:3000
BETTER_AUTH_URL=http://localhost:3000
```

---

## Step 4 — Database Migration

Create `migrations/015_auth_tables.sql`.

Better Auth **auto-creates** its own tables (`user`, `session`, `account`, `verification`)
at startup using `CREATE TABLE IF NOT EXISTS`, so they do not need to be in this file.
The `appRole` column is included automatically because it is declared in `additionalFields`
in the auth config. We only need to create our custom table:

```sql
-- Role mappings: Discord server role → App permission level
-- Core auth tables are managed by Better Auth at startup.

CREATE TABLE IF NOT EXISTS "role_mappings" (
  "id"                 INTEGER  PRIMARY KEY AUTOINCREMENT,
  "discord_role_id"    TEXT     NOT NULL UNIQUE,
  "discord_role_name"  TEXT     NOT NULL,
  "discord_role_color" INTEGER  NOT NULL DEFAULT 0,
  "app_role"           TEXT     NOT NULL
    CHECK("app_role" IN ('owner', 'admin', 'moderator', 'viewer')),
  "created_at"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_role_mappings_discord_role
  ON "role_mappings"("discord_role_id");
```

---

## Step 5 — New Files

### `src/lib/auth.ts` — Better Auth server config

```typescript
import { betterAuth } from 'better-auth';
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve('./app_data/data/matchexec.db');

// better-sqlite3 used exclusively for Better Auth's adapter.
// All other app code uses the sqlite3 async driver.
const authDb = new Database(DB_PATH);

const discordProvider =
  process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
    ? {
        discord: {
          clientId: process.env.DISCORD_CLIENT_ID,
          clientSecret: process.env.DISCORD_CLIENT_SECRET,
          scope: ['identify', 'email'],
        },
      }
    : {};

export const auth = betterAuth({
  database: authDb,
  baseURL: process.env.BETTER_AUTH_URL || process.env.PUBLIC_URL || 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET || 'dev-secret-CHANGE-IN-PRODUCTION',
  socialProviders: discordProvider,
  user: {
    additionalFields: {
      appRole: {
        type: 'string',
        defaultValue: 'none',
        required: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,       // refresh session if older than 1 day
  },
});
```

If `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET` are not set, the Discord provider is
omitted and Better Auth starts without it — users will see an error on the login page
until the env vars are configured.

---

### `src/lib/auth-client.ts` — client-side auth

```typescript
'use client';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient();
export const { signIn, signOut, useSession } = authClient;
```

`useSession()` returns `{ data: { user, session } | null, isPending: boolean }`.
No provider wrapper is needed in `providers.tsx` — Better Auth's React client
manages its own state internally.

---

### `src/lib/permissions.ts` — permission helpers

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from './auth';

export type AppRole = 'owner' | 'admin' | 'moderator' | 'viewer' | 'none';

export const ROLE_PRIORITY: Record<AppRole, number> = {
  owner: 4, admin: 3, moderator: 2, viewer: 1, none: 0,
};

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: 'Owner', admin: 'Admin', moderator: 'Moderator',
  viewer: 'Viewer', none: 'No Access',
};

export const ROLE_COLORS: Record<AppRole, string> = {
  owner: '#f7cc02', admin: '#ef4444', moderator: '#3b82f6',
  viewer: '#22c55e', none: '#6c757d',
};

export const ALL_ROLES: AppRole[] = ['owner', 'admin', 'moderator', 'viewer'];

export function hasPermission(userRole: AppRole, required: AppRole): boolean {
  return ROLE_PRIORITY[userRole] >= ROLE_PRIORITY[required];
}

// Use in API route handlers:
export async function requirePermission(req: NextRequest, minRole: AppRole) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = ((session.user as any).appRole as AppRole) || 'none';
  if (!hasPermission(role, minRole))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return { user: { ...session.user, appRole: role } };
}
```

---

### `src/middleware.ts` — session guard

```typescript
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PREFIXES = [
  '/login', '/welcome', '/api/auth', '/api/health',
  '/api/db-status', '/api/version', '/api/welcome-flow', '/api/feed', '/_next',
];
const SESSION_COOKIE = 'better-auth.session_token';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p)) || pathname.includes('.'))
    return NextResponse.next();

  if (!req.cookies.get(SESSION_COOKIE)?.value) {
    const url = new URL('/login', req.url);
    if (!pathname.startsWith('/api/')) url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo\\.svg).*)'],
};
```

This only checks that the cookie **exists** (fast, no DB hit). Actual session validity
and role checks happen inside each API route handler via `requirePermission`.

---

### `src/app/api/auth/[...all]/route.ts` — Better Auth handler

```typescript
import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler(auth);
```

---

### `src/app/api/auth/sync/route.ts` — post-OAuth role sync

Called as the `callbackURL` after Discord OAuth completes. Steps:

1. Get session from Better Auth
2. Look up the user's Discord account ID from Better Auth's `account` table:
   `SELECT accountId FROM account WHERE userId = ? AND providerId = 'discord'`
3. Fetch `bot_token` and `guild_id` from `discord_settings`
4. Call `GET /guilds/{guild_id}` — if `owner_id` matches → set `appRole = 'owner'`, done
5. Otherwise call `GET /guilds/{guild_id}/members/{discordId}` → get `roles[]`
6. Cross-reference against `role_mappings` → pick highest `app_role` → update `user.appRole`
7. If resolved role is `'none'` → redirect to `/login?access=denied`; else redirect to `/`
8. Pass `?redirect=<path>` through so deep-link redirects work after login

Open-redirect protection: only allow paths starting with `/`.

---

### `src/app/api/settings/roles/route.ts` — role mapping list + create

| Method | Min Role | Behaviour |
|--------|----------|-----------|
| GET | admin | `SELECT * FROM role_mappings ORDER BY discord_role_name` |
| POST | owner | `INSERT … ON CONFLICT(discord_role_id) DO UPDATE` (upsert) |

Request body for POST:
```json
{ "discord_role_id": "...", "discord_role_name": "...", "discord_role_color": 65280, "app_role": "moderator" }
```

---

### `src/app/api/settings/roles/[id]/route.ts` — update + delete

| Method | Min Role | Behaviour |
|--------|----------|-----------|
| PUT | owner | `UPDATE role_mappings SET app_role = ? WHERE id = ?` |
| DELETE | owner | `DELETE FROM role_mappings WHERE id = ?` |

---

### `src/app/api/discord/server-roles/route.ts` — list guild roles

- Min role: **admin**
- Fetches `discord_settings.bot_token` + `guild_id`
- Calls `GET https://discord.com/api/v10/guilds/{guild_id}/roles`
- Filters out `@everyone`, sorts by `position` descending
- Returns `{ roles: [{ id, name, color, position, managed }] }`

---

### `src/app/api/discord/server-roles/create/route.ts` — create Discord role

- Min role: **owner**
- Body: `{ name: string, color?: number }`
- Calls `POST https://discord.com/api/v10/guilds/{guild_id}/roles` with bot token
- Returns `{ role: { id, name, color } }`

---

### `src/app/login/page.tsx` — login page

Client component. Renders centered on a dark gradient background matching the sidebar.

- Discord avatar/logo at top
- Card with "Login with Discord" button (`background: '#5865f2'`, `IconBrandDiscord`)
- On click: `signIn.social({ provider: 'discord', callbackURL: '/api/auth/sync?redirect=...' })`
- If `?access=denied` in query: show a red alert — "Your Discord account doesn't have access.
  Contact your server admin to be assigned a role."
- If `?redirect=` in query: preserve it through to the callbackURL so users land back
  where they were after logging in
- Wrap `useSearchParams()` usage in `<Suspense>` (required by Next.js)

---

### `src/app/settings/roles/page.tsx` — role management UI

Owner-only page. Sections:

**Permission Level Reference card** — coloured badges showing all levels with a note
that guild owner always gets Owner automatically.

**Current Mappings table**
- Columns: Discord Role (ColorSwatch + name) | Permission Level (coloured Badge) | Actions
- Actions: edit icon (opens modal) + delete icon (window.confirm prompt)
- Edit modal: Select dropdown for `app_role`, Save / Cancel buttons

**Add Mapping form**
- Select: Discord role (fetched from `/api/discord/server-roles`, pre-filtered to exclude
  already-mapped roles)
- Select: App permission level (owner / admin / moderator / viewer)
- Add button — disabled until both fields are filled

**Create Discord Role card**
- "Create Role on Discord" button → modal with TextInput for name
- On submit: `POST /api/discord/server-roles/create` → role appears in Add Mapping dropdown
  after refresh

All data fetched via `useEffect` on mount with a refresh button. Mantine `notifications`
for success/error feedback.

---

## Step 6 — Modified Files

### `src/components/navigation.tsx`

Import `useSession` and `signOut` from `@/lib/auth-client`.
Import `ROLE_LABELS` and `ROLE_COLORS` from `@/lib/permissions`.

Replace the static user card at:
- **Lines 442–464** (mobile/Drawer footer)
- **Lines 579–609** (desktop sidebar footer)

With a dynamic user card that:
1. Calls `const { data: session, isPending } = useSession()`
2. While `isPending`: show skeleton/placeholder (existing 👽 avatar is fine as fallback)
3. When loaded: show `<Avatar src={session.user.image}>` (Discord CDN avatar URL)
4. Show `session.user.name` (Discord username)
5. Show a small coloured Badge for `session.user.appRole` using `ROLE_COLORS`/`ROLE_LABELS`
6. Add a logout `ActionIcon` (e.g. `IconLogout` from Tabler) that calls
   `signOut({ fetchOptions: { onSuccess: () => router.push('/login') } })`

In collapsed desktop state: show only the avatar with a Tooltip containing username + role.

---

### `src/app/settings/page.tsx`

Add one entry to the `settingsCategories` array:

```typescript
{
  title: 'Role Management',
  description: 'Map Discord server roles to MatchExec permission levels',
  href: '/settings/roles',
  icon: IconShield,   // from @tabler/icons-react
  color: '#7c3aed',
},
```

Also add `IconShield` to the existing import from `@tabler/icons-react`.

---

## OAuth Flow (end-to-end)

```
User hits protected page (no session cookie)
  └─ middleware redirects → /login?redirect=/matches

User clicks "Login with Discord"
  └─ signIn.social({ provider: 'discord', callbackURL: '/api/auth/sync?redirect=/matches' })
       └─ Browser → Discord OAuth authorization page
            └─ User authorizes → Discord → /api/auth/callback/discord (Better Auth)
                 └─ Better Auth creates/updates user row + session cookie
                      └─ Redirects to /api/auth/sync?redirect=/matches
                           ├─ Resolves Discord guild roles via bot token
                           ├─ Updates user.appRole in DB
                           ├─ appRole == 'none'  → redirect /login?access=denied
                           └─ appRole != 'none'  → redirect /matches
```

---

## Permission Enforcement

### Middleware — page-level only
Checks cookie presence. Unauthenticated → `/login`. Does not check `appRole`.

### API routes — `requirePermission` helper
Add to the top of every handler that needs protection:

```typescript
const check = await requirePermission(req, 'moderator'); // minimum role
if (check instanceof NextResponse) return check;          // returns 401 or 403
// check.user is now available with id, name, appRole, etc.
```

### Suggested permission matrix

| Route group | Viewer | Moderator | Admin | Owner |
|-------------|:------:|:---------:|:-----:|:-----:|
| GET `/api/matches/*` | ✓ | ✓ | ✓ | ✓ |
| POST/PUT/DELETE `/api/matches/*` | — | ✓ | ✓ | ✓ |
| GET `/api/tournaments/*` | ✓ | ✓ | ✓ | ✓ |
| POST/PUT/DELETE `/api/tournaments/*` | — | ✓ | ✓ | ✓ |
| `/api/games/*` (mutations) | — | — | ✓ | ✓ |
| `/api/channels/*` | — | — | ✓ | ✓ |
| `/api/upload/*` | — | — | ✓ | ✓ |
| `/api/settings/*` | — | — | ✓ | ✓ |
| `/api/settings/roles/*` | — | — | — | ✓ |

> Protecting all 47+ existing route handlers is a follow-up task. Start by protecting
> `settings/roles`, then harden other routes incrementally.

---

## Docker / Production Checklist

- [ ] Add all four env vars to Docker run / compose
- [ ] Register the production redirect URI in the Discord OAuth app
- [ ] `better-sqlite3` is a native module. For the **web app** (Next.js standalone output)
      it is included automatically. If the Discord bot or scheduler ever import from
      `src/lib/auth.ts`, add `'better-sqlite3'` to `PROCESS_DEPS` in
      `scripts/collect-process-deps.mjs` and mark it `external` in the relevant esbuild
      config — but this should not be necessary since auth is web-app-only.
- [ ] `BETTER_AUTH_SECRET` must be a stable random value — changing it invalidates all
      active sessions.

---

## Bootstrap Sequence (First Run)

On a fresh deployment with no users or role mappings:

1. Guild owner navigates to the app → middleware redirects to `/login`
2. Owner clicks "Login with Discord" and authorises
3. Sync route detects `owner_id` match → sets `appRole = 'owner'`
4. Owner lands at the home page with full access
5. Owner goes to **Settings → Role Management**
6. Owner creates any needed Discord roles (optional) and maps existing roles to app levels
7. Other users log in → roles resolved from mappings → access granted

If the guild owner ever needs to transfer ownership within the app, they can manually
update the target user's `appRole` in the `user` table via SQLite, or a future
"Users" admin page could expose this.
