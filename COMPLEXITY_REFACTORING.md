# Complexity Refactoring Plan

**Total Warnings:** 46
**Complexity Threshold:** 15 (cyclomatic complexity)
**ESLint Rule:** `"complexity": ["warn", 15]` in `eslint.config.mjs`

---

## Phase 1: Critical Complexity (>30) - 6 Functions

### 1. MatchDetailsModal (Complexity: 42)
- **File:** `src/app/matches/components/MatchDetailsModal.tsx:106`
- **Type:** React Component
- **Issues:** Massive conditional rendering, multiple state checks, complex map/round/participant rendering
- **Refactor Strategy:**
  - Extract `MapResultsSection` component
  - Extract `ParticipantsList` component
  - Extract `MatchActions` component based on state
  - Create validation helper functions
  - Use early returns for state checks

### 2. POST /api/tournaments/[id]/matches (Complexity: 41)
- **File:** `src/app/api/tournaments/[id]/matches/route.ts:200`
- **Type:** API Route Handler
- **Issues:** Validation, bracket generation logic, database operations, error handling all in one function
- **Refactor Strategy:**
  - Extract `validateTournamentMatchRequest()`
  - Extract `generateBracketMatches()` (may already exist, use it)
  - Extract `saveTournamentMatches()`
  - Separate round progression logic
  - Use early returns for validation failures

### 3. createMatchStartEmbed (Complexity: 37)
- **File:** `processes/discord-bot/modules/announcement-handler.ts:783`
- **Type:** Discord Embed Builder
- **Issues:** Multiple embed field builders, format-specific logic, complex conditional formatting
- **Refactor Strategy:**
  - Extract `buildMatchInfoFields()`
  - Extract `buildTeamFields()`
  - Extract `buildFormatSpecificFields()`
  - Extract `buildFooterText()`
  - Create format-specific embed builders (casual vs competitive)

### 4. POST /api/matches (Complexity: 32)
- **File:** `src/app/api/matches/route.ts:118`
- **Type:** API Route Handler
- **Issues:** Complex validation, team assignment, participant processing, Discord queue operations
- **Refactor Strategy:**
  - Extract `validateMatchRequest()`
  - Extract `processTeamAssignments()`
  - Extract `createMatchParticipants()`
  - Extract `queueDiscordOperations()`
  - Separate transaction logic

### 5. handleModalSubmit (Complexity: 31)
- **File:** `processes/discord-bot/modules/interaction-handler.ts:261`
- **Type:** Discord Modal Handler
- **Issues:** Large switch/if-else for different modal types
- **Refactor Strategy:**
  - Create modal handler registry: `{ [modalId]: handlerFunction }`
  - Extract each modal type into separate handler function
  - Use strategy pattern: `modalHandlers[customId](interaction, ...)`

### 6. SimpleMapScoring (Complexity: 31)
- **File:** `src/components/scoring/SimpleMapScoring.tsx:41`
- **Type:** React Component
- **Issues:** Score calculation, validation, UI rendering, state management all mixed
- **Refactor Strategy:**
  - Extract `calculateMapScore()` utility
  - Extract `validateScoreInput()` utility
  - Split into `ScoreInput` and `ScoreDisplay` sub-components
  - Separate winner determination logic

---

## Phase 2: High Complexity (25-30) - 9 Functions

### 7. CreateMatchPage (Complexity: 30)
- **File:** `src/app/matches/create/page.tsx:70`
- **Type:** React Page Component
- **Issues:** Large form with multiple sections, validation, submission logic
- **Refactor Strategy:**
  - Extract `MatchBasicInfoSection` component
  - Extract `MatchTeamSection` component
  - Extract `MatchSchedulingSection` component
  - Extract `useMatchForm()` custom hook
  - Move validation to separate module

### 8. PUT /api/matches/[id] (Complexity: 30)
- **File:** `src/app/api/matches/[id]/route.ts:69`
- **Type:** API Route Handler
- **Issues:** State transition validation, multiple update paths, Discord operations
- **Refactor Strategy:**
  - Extract `validateStateTransition()`
  - Extract `updateMatchState()` for each state
  - Create state machine or transition map
  - Separate Discord queue logic

### 9. createMatchVoiceChannels (Complexity: 30)
- **File:** `src/lib/voice-utils.ts:16`
- **Type:** Utility Function
- **Issues:** Channel creation, permission setup, category management, error handling
- **Refactor Strategy:**
  - Extract `getOrCreateCategory()`
  - Extract `createVoiceChannel()`
  - Extract `setupChannelPermissions()`
  - Extract `saveChannelToDatabase()`

### 10. POST /api/tournaments (Complexity: 29)
- **File:** `src/app/api/tournaments/route.ts:58`
- **Type:** API Route Handler
- **Issues:** Validation, team processing, participant handling, database operations
- **Refactor Strategy:**
  - Extract `validateTournamentRequest()`
  - Extract `processTeams()`
  - Extract `processParticipants()`
  - Separate transaction logic

### 11. sendSignupNotification (Complexity: 29)
- **File:** `processes/discord-bot/modules/reminder-handler.ts:116`
- **Type:** Discord Notification Function
- **Issues:** Multiple embed builders, notification types, error handling
- **Refactor Strategy:**
  - Extract `buildMatchSignupEmbed()`
  - Extract `buildTournamentSignupEmbed()`
  - Extract `sendNotificationToUser()`
  - Use notification type registry

### 12. processDiscordBotRequests (Complexity: 28)
- **File:** `processes/discord-bot/modules/queue-processor.ts:605`
- **Type:** Queue Processor
- **Issues:** Large switch statement for request types
- **Refactor Strategy:**
  - Create request handler registry
  - Extract each request type into separate handler
  - Use: `requestHandlers[type](data)`

### 13. CreateTournamentPage (Complexity: 28)
- **File:** `src/app/tournaments/create/page.tsx:40`
- **Type:** React Page Component
- **Issues:** Large form with multiple sections
- **Refactor Strategy:**
  - Extract `TournamentBasicInfoSection`
  - Extract `TournamentFormatSection`
  - Extract `TournamentParticipantsSection`
  - Extract `useTournamentForm()` hook

### 14. handleButtonInteraction (Complexity: 27)
- **File:** `processes/discord-bot/modules/interaction-handler.ts:111`
- **Type:** Discord Button Handler
- **Issues:** Large switch/if-else for button types
- **Refactor Strategy:**
  - Create button handler registry
  - Extract each button action into separate handler
  - Use strategy pattern

### 15. updateTournamentMessagesForSignupClosure (Complexity: 27)
- **File:** `processes/discord-bot/modules/queue-processor.ts:1404`
- **Type:** Queue Processor Function
- **Issues:** Message fetching, embed building, update logic all mixed
- **Refactor Strategy:**
  - Extract `fetchTournamentMessages()`
  - Extract `buildClosedSignupEmbed()`
  - Extract `updateMessageWithEmbed()`

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
