# SonarCloud Issue Remediation Plan

Generated: 2026-04-19  
Source: https://sonarcloud.io/project/overview?id=slamanna212_MatchExec  
Total issues: 150 issues + 90 security hotspots

---

## Priority 1 — Blocker Bug

### [ ] Missing WHERE clause in migration SQL
**File**: `migrations/004_fix_voice_alternation_schema.sql:8`  
**Severity**: BLOCKER / BUG  
**Rule**: `plsql:DeleteOrUpdateWithoutWhereCheck`  
**Fix**: Add a `WHERE` clause to the `UPDATE` statement to scope it to the intended rows. If the intent truly is to update all rows, add a comment and a `WHERE 1=1` to make it explicit.

---

## Priority 2 — Security Hotspots (HIGH)

### [ ] Command injection risk in docker-start.ts
**File**: `scripts/docker-start.ts:14`  
**Category**: command-injection  
**Fix**: Review the OS command being executed. If the command includes any user-supplied or environment-derived input, sanitize it or use a safer API (e.g. `execFile` with an args array instead of `exec` with a shell string).

### [ ] Dockerfile — files copied with write permissions
**Files**: `Dockerfile:67`, `Dockerfile:68`, `Dockerfile:77`  
**Category**: auth (file permissions)  
**Fix**: After `COPY` instructions, use `RUN chmod -R a-w <path>` to strip write permissions, or use `--chown` with a restricted user so copied files are read-only in the running container.

---

## Priority 3 — Vulnerabilities (MAJOR)

### [ ] Kubernetes — service account token auto-mounted without RBAC
**File**: `kubernetes/helm/matchexec/templates/deployment.yaml:37`  
**Rule**: `kubernetes:S6865`  
**Fix**: Either add `automountServiceAccountToken: false` to the pod spec (if the app doesn't need the SA token), or create a scoped `Role`/`ClusterRole` and bind it to the service account.

### [ ] Kubernetes — no memory/storage limit on container
**File**: `kubernetes/helm/matchexec/templates/deployment.yaml:38`  
**Rule**: `kubernetes:S6870`  
**Fix**: Add `resources.limits.memory` and `resources.limits.ephemeral-storage` to the container spec.

---

## Priority 4 — Security Hotspots (MEDIUM)

### [ ] ReDoS — regex vulnerable to super-linear backtracking
**Files**:
- `processes/discord-bot/modules/interaction-helpers.ts:172`
- `src/app/matches/[matchId]/edit/page.tsx:78`

**Category**: dos  
**Fix**: Review each regex and rewrite to avoid catastrophic backtracking. Common patterns to fix: nested quantifiers (`(a+)+`), alternation with overlap (`(a|aa)+`). Use a tool like [safe-regex](https://github.com/davisjam/safe-regex) or [regexploit](https://github.com/nicowillis/regexploit) to validate.

### [ ] Dockerfile — glob COPY may include sensitive files
**File**: `Dockerfile:22`  
**Category**: permission  
**Fix**: Replace wildcard `COPY` instructions with explicit file/directory lists, or add a `.dockerignore` entry for any sensitive files that might match the glob.

### [ ] Dockerfile — running as root user
**File**: `Dockerfile:34`  
**Category**: permission  
**Fix**: Add `USER node` (or a dedicated non-root user) after the base image is set up. The production stage already does this — confirm the intermediate build stages don't inadvertently run sensitive operations as root.

### [ ] Math.random() used for non-trivial operations
**Affected files** (~30 locations):
- `src/lib/scoring-functions.ts` (lines 509, 619, 832, 1100, 1136)
- `processes/discord-bot/modules/interaction-helpers.ts` (lines 70, 92)
- `processes/discord-bot/modules/queue-processor.ts:529`
- `processes/discord-bot/modules/voice-handler.ts:157`
- `processes/discord-bot/modules/utils.ts:80`
- `processes/scheduler/index.ts` (lines 251, 322, 344, 482)
- `shared/discord-announcements.ts:33`
- `src/app/api/channels/route.ts:167`
- `src/app/api/matches/[matchId]/route.ts:214`
- `src/app/api/matches/helpers.ts:61`
- `src/app/api/tournaments/[tournamentId]/generate-matches/route.ts:63`
- `src/app/api/tournaments/[tournamentId]/route.ts` (lines 170, 185)
- `src/app/api/tournaments/[tournamentId]/teams/route.ts` (lines 134, 205)
- `src/app/api/tournaments/route.ts:157`
- `src/app/matches/[matchId]/edit/page.tsx` (lines 255, 267)
- `src/components/create-match-page.tsx` (lines 235, 258)
- `src/components/create-match/AnnouncementsStep.tsx:36`
- `src/lib/map-code-service.ts:63`
- `lib/discord-bot-service.ts:44`
- `scripts/add-test-match-participants.js` (lines 11, 12, 13, 19)
- `scripts/add-test-participants.js` (lines 11, 12, 13, 19, 51, 52)

**Category**: weak-cryptography  
**Assessment**: For game/team shuffling and map selection this is almost certainly acceptable. Review each usage and suppress (with a comment) any that are genuinely non-security-sensitive. For any usage that generates IDs, tokens, or values with security implications, replace with `crypto.randomUUID()` or `crypto.getRandomValues()`.

---

## Priority 5 — Critical Bug

### [ ] Unreliable string sort in announcement-handler
**File**: `processes/discord-bot/modules/announcement-handler.ts:240`  
**Severity**: CRITICAL / BUG  
**Rule**: `typescript:S2871`  
**Fix**: Replace `.sort()` with `.sort((a, b) => a.localeCompare(b))` to ensure consistent alphabetical ordering across all locales.

---

## Priority 6 — Critical Code Smells (Cognitive Complexity)

All functions below exceed the allowed cognitive complexity of 15. Refactor by extracting helper functions or simplifying conditional logic.

| File | Line | Complexity |
|------|------|-----------|
| `src/app/api/tournaments/[tournamentId]/progress/route.ts` | 196 | 26 |
| `processes/discord-bot/modules/queue-processor.ts` | 1317 | 24 |
| `src/app/games/page.tsx` | 46 | 22 |
| `processes/discord-bot/modules/voice-handler.ts` | 381 | 21 |
| `processes/discord-bot/modules/queue-processor.ts` | 787 | 20 |
| `processes/discord-bot/modules/queue-processor.ts` | 1027 | 20 |
| `processes/discord-bot/modules/interaction-handler.ts` | 431 | 20 |
| `src/components/match-dashboard.tsx` | 243 | 20 |
| `processes/scheduler/index.ts` | 593 | 19 |
| `processes/discord-bot/modules/queue-processor.ts` | 718 | 19 |
| `src/lib/scoring-functions.ts` | 461 | 19 |
| `src/app/api/health/ready/route.ts` | 13 | 18 |
| `lib/database/seeder.ts` | 106 | 17 |
| `processes/discord-bot/modules/interaction-handler.ts` | 338 | 16 |
| `src/app/api/channels/refresh-names/route.ts` | 5 | 16 |
| `processes/discord-bot/modules/announcement-handler.ts` | 201 | 16 |
| `processes/discord-bot/modules/queue-processor.ts` | 889 | 16 |
| `processes/discord-bot/modules/voice-handler.ts` | 68 | 16 |

### [ ] Async operation in constructor
**File**: `src/lib/logger/base.ts:45`  
**Fix**: Move the async initialization out of the constructor into a static factory method or a lazy-init pattern called on first use.

---

## Priority 7 — Critical Code Smells (Duplicate Literals in SQL)

SQL migrations cannot use constants, so these may need suppression comments or be restructured into views/CTEs if the duplication is truly problematic.

| File | Line | Issue |
|------|------|-------|
| `migrations/007_v0_6.sql` | 34 | Literal duplicated 3–4 times |
| `migrations/007_v0_6.sql` | 134 | Literal duplicated 4 times |
| `migrations/002_discord_integration_and_queues.sql` | 110 | Literal duplicated 12–24 times |

**Fix**: These are historical migration files — adding `-- NOSONAR` inline comments is the pragmatic resolution since migrations are append-only and cannot be restructured.

---

## Summary Checklist

| # | Item | Priority | Status |
|---|------|----------|--------|
| 1 | Missing WHERE in migration 004 | BLOCKER | [ ] |
| 2 | Command injection in docker-start.ts | HIGH | [ ] |
| 3 | Dockerfile write permissions (3 lines) | HIGH | [ ] |
| 4 | Kubernetes RBAC — SA token | MAJOR | [ ] |
| 5 | Kubernetes storage limit | MAJOR | [ ] |
| 6 | ReDoS — interaction-helpers.ts:172 | MEDIUM | [ ] |
| 7 | ReDoS — edit/page.tsx:78 | MEDIUM | [ ] |
| 8 | Dockerfile glob COPY | MEDIUM | [ ] |
| 9 | Dockerfile running as root | MEDIUM | [ ] |
| 10 | Math.random() audit (~30 locations) | MEDIUM | [ ] |
| 11 | String sort without comparator | CRITICAL | [ ] |
| 12 | Cognitive complexity refactors (18 functions) | CRITICAL | [ ] |
| 13 | Async in constructor (logger/base.ts) | CRITICAL | [ ] |
| 14 | SQL duplicate literal suppression | CRITICAL | [ ] |
