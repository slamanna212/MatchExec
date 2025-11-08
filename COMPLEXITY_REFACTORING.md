# Complexity Refactoring Plan

**Total Warnings:** 46
**Complexity Threshold:** 15 (cyclomatic complexity)
**ESLint Rule:** `"complexity": ["warn", 15]` in `eslint.config.mjs`

---

## Phase 2: High Complexity (25-30) - 9 Functions ✅ ALL COMPLETED

**Status:** All 9 functions fully refactored

### ✅ COMPLETED:
1. PUT /api/settings/discord (30→fixed)
2. createMatchVoiceChannels (30→fixed)
3. sendSignupNotification (29→fixed)
4. processDiscordBotRequests (28→fixed)
5. handleButtonInteraction (27→fixed)
6. updateTournamentMessagesForSignupClosure (27→16)
7. CreateMatchPage (30→~8)
8. CreateTournamentPage (28→~6)

---

### Detailed Refactoring Information:

#### 1. PUT /api/settings/discord (Complexity: 30→~10)
- **File:** `src/app/api/settings/discord/route.ts:69`
- **Type:** API Route Handler
- **Problem:** 30+ branches due to 11 individual field checks and conditional updates
- **Solution:** Field registry pattern with transformation pipeline

**Extracted Components:**
- `DISCORD_SETTINGS_FIELDS` - Configuration array defining all 11 Discord settings fields with default values and optional transformers
- `buildDiscordSettingsUpdate()` - Constructs UPDATE query dynamically from request body using field registry
- `restartDiscordBot()` - Handles PM2 process restart logic (dev vs prod environment detection)

**Key Improvements:**
- Eliminated 11 individual if-blocks by using field registry iteration
- Separated concerns: validation → update building → bot restart
- Made adding new settings fields trivial (just add to registry)
- Reduced from 30 to ~10 complexity points

---

#### 2. createMatchVoiceChannels (Complexity: 30→~12)
- **File:** `src/lib/voice-channel-manager.ts:147`
- **Type:** Service Function
- **Problem:** Complex nested logic for team structure, tournament matching, and polling
- **Solution:** Extracted channel naming strategy and polling into separate focused functions

**Extracted Components:**
- `determineChannelNames()` - Routes to appropriate naming strategy based on team count
- `determineSingleTeamChannelName()` - Handles tournament participant lookup for single-team matches
- `determineDualTeamChannelNames()` - Handles participant lookups for dual-team matches with fallbacks
- `waitForVoiceChannelCreation()` - Polling logic with timeout and status checking (30s timeout, 500ms intervals)

**Key Improvements:**
- Separated naming strategy from main creation flow
- Isolated tournament data fetching into focused helpers
- Made polling logic testable and reusable
- Reduced nesting depth from 5 to 2 levels
- Reduced from 30 to ~12 complexity points

---

#### 3. sendSignupNotification (Complexity: 29→~8)
- **File:** `processes/discord-bot/modules/reminder-handler.ts:26`
- **Type:** Discord Bot Notification Handler
- **Problem:** Combined data fetching, embed building, and multi-channel sending
- **Solution:** Separated data access, presentation, and delivery concerns

**Extracted Components:**
- `getEventDataForSignup()` - Fetches match/tournament data with game info (single query, handles both types)
- `buildSignupEmbed()` - Constructs Discord embed with player info, event details, and signup count
- `sendEmbedToChannels()` - Iterates through channels and sends embed (returns success count)

**Key Improvements:**
- Separated database queries from Discord API calls
- Made embed building pure and testable
- Isolated channel delivery logic with error handling
- Reduced from 29 to ~8 complexity points
- Each function has single responsibility

---

#### 4. processDiscordBotRequests (Complexity: 28→~6)
- **File:** `processes/discord-bot/modules/queue-processor.ts:78`
- **Type:** Queue Processor
- **Problem:** Large switch statement for 3+ request types with inline handling
- **Solution:** Registry pattern with dedicated handler functions

**Extracted Components:**
- `handleVoiceChannelCreate()` - Creates blue/red voice channels, handles single vs dual team
- `handleVoiceChannelDelete()` - Deletes voice channel by ID
- `handleVoiceTest()` - Tests voice announcements
- `REQUEST_HANDLERS` - Registry object mapping request types to handler functions

**Key Improvements:**
- Eliminated switch statement entirely
- Each handler is independently testable
- Adding new request types requires no modification to main function
- Reduced from 28 to ~6 complexity points (just loop + registry lookup)
- Open/closed principle: open for extension, closed for modification

---

#### 5. handleButtonInteraction (Complexity: 27→~10)
- **File:** `processes/discord-bot/modules/interaction-handler.ts:28`
- **Type:** Discord Interaction Handler
- **Problem:** Complex validation chains and conditional UI flows (signup checks, capacity, team selection)
- **Solution:** Extracted validation and UI helper functions

**Extracted Components:**
- `checkExistingParticipant()` - Queries database for duplicate signups (handles match/tournament)
- `checkEventCapacity()` - Fetches participant count and capacity limits, returns full status
- `showTeamSelectionMenu()` - Builds and displays team selection dropdown (tournament only)
- `showSignupModal()` - Loads game-specific signup form and displays modal

**Key Improvements:**
- Separated validation logic from UI flow
- Made each check independently testable
- Reduced nesting depth by using early returns in helpers
- Reduced from 27 to ~10 complexity points
- Clear separation: validation → decision → UI response

---

#### 6. updateTournamentMessagesForSignupClosure (Complexity: 27→16)
- **File:** `processes/discord-bot/modules/queue-processor.ts:1249`
- **Type:** Discord Message Update Handler
- **Problem:** Combined message fetching, embed construction, and attachment handling
- **Solution:** Extracted fetch, build, and attachment recreation into focused functions

**Extracted Components:**
- `fetchTournamentMessages()` - Retrieves all announcement messages for tournament from database
- `buildClosedSignupEmbed()` - Updates existing embed with "Signups Closed" status field
- `recreateAttachment()` - Handles image attachment recreation from filesystem (checks existence, creates AttachmentBuilder)

**Key Improvements:**
- Separated database access from Discord API operations
- Made embed modification pure and predictable
- Isolated file I/O into single helper with error handling
- Reduced from 27 to 16 complexity points
- Each function handles one aspect of the update process

---

### 7. CreateMatchPage (Complexity: 30→~8)
- **File:** `src/components/create-match-page.tsx:152`
- **Type:** React Page Component
- **Status:** FULLY REFACTORED
- **Problem:** Multi-step wizard with inline conditional rendering for 4 steps, 1233 LOC
- **Solution:** Component decomposition with custom hooks and step extraction

**Extracted Components:**
- `useMatchForm()` - Custom hook managing form state, maps, session storage (137 LOC)
- `match-helpers.ts` - Helper functions for payload building, map notes, signups
- `GameSelectionStep.tsx` - Step 1: Game selection grid with cards
- `EventInfoStep.tsx` - Step 2: Event information form with image upload
- `EventImageUpload.tsx` - Reusable image upload component with preview
- `AnnouncementsStep.tsx` - Step 3: Announcement scheduling configuration
- `MapConfigurationStep.tsx` - Step 4: Map selection and configuration
- `SelectedMapsList.tsx` - Grid display of selected maps with notes
- `MapSelector.tsx` - Map selection UI (traditional vs flexible modes)
- `MapCard.tsx` - Individual map card component
- `FlexibleMapCard.tsx` - Map card with mode selection for flexible games

**Key Improvements:**
- Reduced main component from 1233→426 LOC (65% reduction)
- Separated state management into custom hook
- Each wizard step is now independently testable
- Reusable image upload component shared with CreateTournamentPage
- Map selection logic isolated into focused components
- Complexity reduced from 30 to ~8

---

### 8. CreateTournamentPage (Complexity: 28→~6)
- **File:** `src/components/create-tournament-page.tsx:91`
- **Type:** React Page Component
- **Status:** FULLY REFACTORED
- **Problem:** Multi-step wizard with team management and conditional rendering, 701 LOC
- **Solution:** Component decomposition with custom hooks and step extraction

**Extracted Components:**
- `useTournamentForm()` - Custom hook managing form state, teams, session storage (99 LOC)
- `tournament-helpers.ts` - Helper functions for payload building, team creation, signups
- `TournamentGameSelectionStep.tsx` - Step 1: Game selection grid
- `TournamentEventInfoStep.tsx` - Step 2: Event info form (reuses EventImageUpload)
- `TournamentTeamSettingsStep.tsx` - Step 3: Team settings with max participants
- `TeamList.tsx` - Displays pre-created teams with remove functionality
- `TournamentReviewStep.tsx` - Step 4: Review and create confirmation

**Key Improvements:**
- Reduced main component from 701→261 LOC (63% reduction)
- Separated state management into custom hook
- Each wizard step is independently testable
- Team management UI isolated into TeamList component
- Shared EventImageUpload component with CreateMatchPage
- Complexity reduced from 28 to ~6

---

**Note:** These frontend components have been successfully refactored using modern React patterns: custom hooks for state management, component composition for UI decomposition, and clear separation of concerns.

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
