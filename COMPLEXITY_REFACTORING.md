# Complexity Refactoring Plan

**Total Warnings:** 46
**Complexity Threshold:** 15 (cyclomatic complexity)
**ESLint Rule:** `"complexity": ["warn", 15]` in `eslint.config.mjs`

---

## Phase 3: Medium Complexity (20-24) - 10 Functions

### 16. generateSingleEliminationMatches (Complexity: 26)
- **File:** `src/lib/brackets.ts:134`
- **Refactor:** Extract seeding logic, match pairing logic, bye handling

### 17. updateMatchMessagesForSignupClosure (Complexity: 26)
- **File:** `processes/discord-bot/modules/queue-processor.ts:1249`
- **Refactor:** Extract message fetching, embed building, update operations

### 18. seedMaps (Complexity: 26)
- **File:** `lib/database-init.ts:238`
- **Refactor:** Extract per-mode seeding, version checking, database operations

### 19. createEventEmbedWithAttachment (Complexity: 25)
- **File:** `processes/discord-bot/modules/announcement-handler.ts:200`
- **Refactor:** Extract embed field builders, attachment handling

### 20. Arrow function in MatchDetailsModal (Complexity: 25)
- **File:** `src/app/matches/components/MatchDetailsModal.tsx:540`
- **Refactor:** Extract to named function, split logic

### 21. generateNextRoundMatches (Complexity: 24)
- **File:** `src/lib/brackets.ts:291`
- **Refactor:** Extract winner determination, match creation logic

### 22. generateDoubleEliminationMatches (Complexity: 24)
- **File:** `src/lib/brackets.ts:476`
- **Refactor:** Extract winners/losers bracket generation

### 23. generateLosersBracketMatches (Complexity: 23)
- **File:** `src/lib/brackets.ts:631`
- **Refactor:** Extract round calculation, pairing logic

### 24. Arrow function in CreateMatchPage (Complexity: 23)
- **File:** `src/app/matches/create/page.tsx:485`
- **Refactor:** Extract to named function, split validation and submission

### 25. cronToHuman (Complexity: 22)
- **File:** `src/app/settings/scheduler/page.tsx:30`
- **Refactor:** Create parsing map, extract formatting logic

### 26. POST /api/matches/[id]/start (Complexity: 22)
- **File:** `src/app/api/matches/[id]/start/route.ts:60`
- **Refactor:** Extract validation, voice channel creation, Discord operations

---

## Phase 4: Low/Minimal Complexity (15-19) - 21 Functions

### Remaining Functions (Complexity 15-19):
- Arrow function in MatchDetailsModal:218 (21)
- createMatchWinnerEmbed:1319 (21)
- createMapScoreEmbed:1096 (21)
- GET /api/games/[id]:7 (20)
- Arrow function in SimpleMapScoring:67 (20)
- updateMatchStatusIfComplete:617 (20)
- processDeletionQueue:278 (20)
- createMapEmbed:347 (20)
- createPlayerReminderEmbed:270 (19)
- generateGrandFinalsMatch:812 (19)
- MatchDashboard:210 (18)
- createDiscordEvent:23 (18)
- createTimedReminderEmbed:604 (18)
- Arrow function in MatchDetailsModal:741 (18)
- Arrow function in CreateTournamentPage:76 (18)
- postEventAnnouncement:26 (17)
- handleTimedAnnouncements:392 (17)
- Arrow function in MatchDetailsModal:357 (16)
- Arrow function in MatchDetailsModal:628 (16)
- saveGeneratedMatches:936 (16)
- POST /api/settings/scheduler:31 (16)

**Refactor Strategy for Phase 4:**
- Most are embed builders → extract field builders
- Arrow functions → convert to named functions, extract sub-logic
- API routes → extract validation helpers
- Bracket functions → extract calculation logic

---

## Refactoring Principles

### Common Patterns to Apply:
1. **Extract Method** - Break large functions into focused helpers
2. **Early Returns** - Reduce nesting depth with guard clauses
3. **Strategy Pattern** - Replace switch statements with handler registries
4. **Component Decomposition** - Split large React components
5. **Separation of Concerns** - Separate validation, business logic, and I/O

### Testing Strategy:
- Run `npm run lint` after each phase to track progress
- Test affected functionality after each refactor
- Ensure Discord bot still functions correctly
- Verify API routes work with existing clients

### Success Criteria:
- All 46 complexity warnings resolved
- No new bugs introduced
- Code remains readable and maintainable
- Tests pass (if any exist)

---

## Execution Order Recommendation:

**Start with Phase 1** (Critical) as these have the highest complexity and likely the most bugs/maintenance issues.

Within each phase, prioritize:
1. Backend/API routes first (less visible if bugs occur)
2. Discord bot functions (can test independently)
3. Frontend components last (most user-visible)

**Estimated Effort:**
- Phase 1: ~8-10 hours
- Phase 2: ~6-8 hours
- Phase 3: ~4-6 hours
- Phase 4: ~3-4 hours
- **Total:** ~21-28 hours
