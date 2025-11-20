# Test Plan for v0.6.0 (even-more-games branch)

**Branch**: `even-more-games` → `dev`
**Version**: 0.5.1 → 0.6.0
**Test Date**: 2025-11-20
**Tester**: [Your name]

## Overview

This release includes:
- ✨ New game support: Rocket League (4 modes, 15 maps)
- 🎙️ Auto voice channel creation system
- 🏥 Health monitoring for scheduler
- 🔄 Match transition refactoring
- 📦 Next.js 15 → 16 upgrade
- 🧹 Major code quality improvements (46 functions refactored)
- 🐛 Critical bug fixes (SQL injection, race conditions)

**Estimated Testing Time**: 4-6 hours
**Risk Level**: Moderate

---

## Pre-Testing Setup

### ✅ Checklist Before Starting
- [ ] Ensure all processes are running (`npm run dev:all`)
- [ ] Check PM2 status (`npx pm2 status`)
- [ ] Verify database migrations completed successfully
- [ ] Discord bot is online and connected
- [ ] Have a test Discord server with proper permissions
- [ ] Clear browser cache to test fresh UI loads
- [ ] Open browser console to monitor for errors
- [ ] Have PM2 logs ready (`npm run dev:logs --lines 50`)

### Environment Check
```bash
# Check running processes
npx pm2 status

# View logs
npm run dev:logs | tail -100

# Check database
sqlite3 ./app_data/data/matchexec.db "SELECT * FROM migrations;"

# Verify Next.js version
npm list next
```

---

## PRIORITY 1: Critical Path Testing (New Features)

### 1.1 Rocket League Game Support

#### Test 1.1.1: Match Creation - 1v1 Duel Mode
**Steps**:
1. Navigate to `/matches/create`
2. Select "Rocket League" from game dropdown
3. Select "Duel (1v1)" mode
4. Choose any map (e.g., "DFH Stadium")
5. Set match time, number of rounds (best of 3)
6. Complete match creation

**Expected Results**:
- ✅ Rocket League appears in game list
- ✅ All 4 modes visible (1v1, 2v2, 3v3, 4v4)
- ✅ Team configuration shows 1v1 (2 participants total)
- ✅ All 15 maps are selectable
- ✅ Map images load correctly
- ✅ Match is created successfully

**Actual Results**: _______________

**Status**: ⬜ Pass | ⬜ Fail | ⬜ Blocked

**Notes**: _______________

---

#### Test 1.1.2: Match Creation - All Rocket League Modes
**Steps**: Repeat Test 1.1.1 for each mode:
- [ ] Doubles (2v2) - Expected: 2 teams of 2 players
- [ ] Standard (3v3) - Expected: 2 teams of 3 players
- [ ] Chaos (4v4) - Expected: 2 teams of 4 players

**Expected Results**:
- ✅ Team sizes automatically adjust per mode
- ✅ Map selection works for all modes
- ✅ Match creation succeeds for all modes

**Status**: ⬜ Pass | ⬜ Fail

---

#### Test 1.1.3: Rocket League Map Selection
**Steps**:
1. Create Rocket League match
2. View map dropdown for each round

**Expected Maps** (15 total):
- [ ] DFH Stadium
- [ ] Mannfield
- [ ] Urban Central
- [ ] Beckwith Park
- [ ] Utopia Coliseum
- [ ] Wasteland
- [ ] Neo Tokyo
- [ ] Aquadome
- [ ] Starbase ARC
- [ ] Champions Field
- [ ] Farmstead
- [ ] Salty Shores
- [ ] Forbidden Temple
- [ ] Rivals Arena
- [ ] Knockout Bash

**Expected Results**:
- ✅ All 15 maps present in dropdown
- ✅ Map images load (check `/public/assets/games/rocketleague/`)
- ✅ No duplicate maps

**Status**: ⬜ Pass | ⬜ Fail

---

#### Test 1.1.4: Rocket League Signup Form
**Steps**:
1. Create Rocket League match with signup enabled
2. Open signup form
3. Fill out custom fields

**Expected Fields** (from `data/games/rocketleague/signup.json`):
- [ ] Rocket League Username
- [ ] Rank/Skill Level
- [ ] Preferred Position (if applicable)
- [ ] Additional Notes

**Expected Results**:
- ✅ Custom signup fields appear
- ✅ Fields are saved correctly
- ✅ Participants can submit signup

**Status**: ⬜ Pass | ⬜ Fail

---

#### Test 1.1.5: Rocket League Tournament Creation
**Steps**:
1. Navigate to `/tournaments/create`
2. Select "Rocket League"
3. Select a game mode (e.g., "Standard 3v3")
4. Configure tournament (single elimination, 4 teams)
5. Create tournament

**Expected Results**:
- ✅ Rocket League available in tournament creation
- ✅ Mode selection dropdown appears
- ✅ Team size enforced based on selected mode
- ✅ Tournament created successfully
- ✅ Bracket generated correctly

**Status**: ⬜ Pass | ⬜ Fail

---

### 1.2 Voice Channel Auto-Creation

#### Test 1.2.1: Auto-Creation on Assign Transition (Dual Teams)
**Setup**:
1. Create a match with 2 teams (any game)
2. Add participants to both teams
3. Configure Discord voice category in settings

**Steps**:
1. Create match (status: created)
2. Transition to "gather" status
3. Transition to "assign" status
4. Check Discord server

**Expected Results**:
- ✅ Two voice channels created automatically
- ✅ Channel names format: `Match #{id} - {Team Name}`
- ✅ Channels created in configured category
- ✅ Channels are accessible
- ✅ Entry in `auto_voice_channels` table (check DB)

**Database Check**:
```sql
SELECT * FROM auto_voice_channels ORDER BY id DESC LIMIT 2;
```

**Expected Columns**: `match_id`, `discord_channel_id`, `team_name`, `created_at`

**Status**: ⬜ Pass | ⬜ Fail | ⬜ Blocked

**Notes**: _______________

---

#### Test 1.2.2: Auto-Creation for Single Team Match
**Steps**:
1. Create match with single team configuration
2. Transition to "assign"
3. Check Discord

**Expected Results**:
- ✅ One voice channel created
- ✅ Channel name: `Match #{id} - {Team Name}`

**Status**: ⬜ Pass | ⬜ Fail

---

#### Test 1.2.3: Auto-Creation for Tournament Match
**Steps**:
1. Create tournament with teams
2. Generate bracket matches
3. Transition first match to "assign"
4. Check Discord

**Expected Results**:
- ✅ Voice channels use tournament team names
- ✅ Channels created successfully

**Status**: ⬜ Pass | ⬜ Fail

---

#### Test 1.2.4: Voice Channel Cleanup After Match
**Setup**: Configure cleanup delay in settings (default: 10 minutes)

**Steps**:
1. Complete a match (or cancel it)
2. Note the `updated_at` timestamp
3. Wait for cleanup delay + 1 minute
4. Check scheduler logs
5. Check Discord server

**Expected Results**:
- ✅ Scheduler detects eligible channels
- ✅ Channels are deleted from Discord
- ✅ Entries removed from `auto_voice_channels` table
- ✅ Log message: "Cleaned up X voice channels"

**Scheduler Log Check**:
```bash
tail -100 ./app_data/data/logs/scheduler.log | grep -i "voice"
```

**Status**: ⬜ Pass | ⬜ Fail

**Notes**: _______________

---

#### Test 1.2.5: Voice Channel Error Handling
**Test Scenarios**:

**A. Missing Discord Permissions**
- [ ] Remove "Manage Channels" permission from bot
- [ ] Try to create match and assign
- [ ] Expected: Graceful error, match still transitions

**B. Category Deleted**
- [ ] Delete configured voice category
- [ ] Try to create match and assign
- [ ] Expected: Error logged, match still transitions

**C. Cleanup During Active Match**
- [ ] Manually set `updated_at` to old timestamp
- [ ] Keep match in "battle" status
- [ ] Wait for scheduler run
- [ ] Expected: Channels NOT deleted (match still active)

**Status**: ⬜ Pass | ⬜ Fail | ⬜ Partial

---

### 1.3 Health Monitoring System

#### Test 1.3.1: Scheduler Health Alert - Normal Operation
**Setup**:
1. Navigate to `/settings/discord`
2. Enable "Send Health Alerts" for a channel
3. Save settings

**Steps**:
1. Verify scheduler is running (`npx pm2 list`)
2. Wait 3-5 minutes
3. Check database for heartbeat

**Database Check**:
```sql
SELECT setting_value FROM app_settings WHERE setting_key = 'scheduler_last_heartbeat';
```

**Expected Results**:
- ✅ Heartbeat timestamp is recent (< 2 minutes old)
- ✅ No health alerts sent to Discord
- ✅ `health_alerts_sent` table is empty

**Status**: ⬜ Pass | ⬜ Fail

---

#### Test 1.3.2: Scheduler Health Alert - Failure Detection
**Steps**:
1. Stop scheduler process: `npx pm2 stop scheduler-dev`
2. Wait 11 minutes (threshold is 10 minutes)
3. Check Discord channel configured for health alerts
4. Check `health_alerts_sent` table

**Expected Results**:
- ✅ Discord alert received after ~10 minutes
- ✅ Alert message mentions "Scheduler heartbeat stale"
- ✅ Alert severity indicated (critical/error)
- ✅ Entry in `health_alerts_sent` table with `alert_type = 'scheduler_heartbeat'`

**Database Check**:
```sql
SELECT * FROM health_alerts_sent ORDER BY sent_at DESC LIMIT 1;
```

**Status**: ⬜ Pass | ⬜ Fail | ⬜ Blocked

---

#### Test 1.3.3: Health Alert Rate Limiting
**Steps**:
1. Keep scheduler stopped (from Test 1.3.2)
2. Wait for first alert
3. Continue waiting another 30 minutes
4. Check for duplicate alerts

**Expected Results**:
- ✅ Only ONE alert sent in the first hour
- ✅ No duplicate alerts before 1 hour expires
- ✅ After 1 hour, another alert is sent

**Status**: ⬜ Pass | ⬜ Fail

---

#### Test 1.3.4: Health Alert Recovery
**Steps**:
1. Restart scheduler: `npx pm2 restart scheduler-dev`
2. Wait 2-3 minutes for heartbeat to update
3. Check logs and database

**Expected Results**:
- ✅ Scheduler heartbeat resumes
- ✅ No new alerts sent
- ✅ System returns to normal monitoring

**Status**: ⬜ Pass | ⬜ Fail

---

### 1.4 Match Transition Refactoring

#### Test 1.4.1: Gather Transition
**Steps**:
1. Create match (status: created)
2. Transition to "gather"
3. Check Discord channel
4. Check `discord_bot_requests` table

**Expected Results**:
- ✅ Discord announcement queued (check DB)
- ✅ Announcement sent to configured channel
- ✅ No duplicate announcements
- ✅ Signup form accessible (if enabled)

**Discord Message Check**:
- Contains match details
- Mentions date/time
- Includes game and mode

**Database Check**:
```sql
SELECT * FROM discord_bot_requests WHERE request_type = 'send_match_announcement' ORDER BY created_at DESC LIMIT 1;
```

**Status**: ⬜ Pass | ⬜ Fail

---

#### Test 1.4.2: Assign Transition
**Steps**:
1. Transition match from "gather" to "assign"
2. Check Discord, database, and logs

**Expected Results**:
- ✅ Signups closed (cannot submit signup form)
- ✅ Voice channels created (if configured)
- ✅ No duplicate announcements
- ✅ Transition completes successfully

**Status**: ⬜ Pass | ⬜ Fail

---

#### Test 1.4.3: Battle Transition
**Steps**:
1. Transition match from "assign" to "battle"
2. Monitor Discord bot queue and logs
3. Check match games are initialized

**Expected Results**:
- ✅ Welcome voice announcement queued
- ✅ "Match has started" Discord message sent
- ✅ Match games initialized in `match_games` table
- ✅ First map code sent to participants (if configured)
- ✅ No errors in transition

**Database Check**:
```sql
SELECT * FROM match_games WHERE match_id = ? ORDER BY game_number;
```

**Expected**: One row per round with `status = 'not_started'`

**Status**: ⬜ Pass | ⬜ Fail

---

#### Test 1.4.4: Transition Error Handling
**Test Scenarios**:

**A. Discord Bot Offline During Transition**
- [ ] Stop Discord bot: `npx pm2 stop discord-bot-dev`
- [ ] Try to transition match to "gather"
- [ ] Expected: Transition succeeds, announcement queued for later

**B. Invalid Transition**
- [ ] Try to transition from "created" directly to "battle" (skip gather/assign)
- [ ] Expected: Error message, transition rejected

**C. Database Error During Transition**
- [ ] (Difficult to simulate - document if encountered)

**Status**: ⬜ Pass | ⬜ Fail | ⬜ Blocked

---

### 1.5 Map Code Management

#### Test 1.5.1: Map Code Sent on Battle Transition
**Steps**:
1. Create match with map codes configured for first map
2. Add participants with Discord user IDs
3. Transition to "battle"
4. Check Discord DMs to participants

**Expected Results**:
- ✅ First map code sent to each participant via DM
- ✅ Message includes map name and code
- ✅ Queue entry in `discord_bot_requests` table

**Database Check**:
```sql
SELECT * FROM discord_bot_requests WHERE request_type = 'send_dm' ORDER BY created_at DESC;
```

**Status**: ⬜ Pass | ⬜ Fail | ⬜ Blocked

---

#### Test 1.5.2: Map Code Service Error Handling
**Test Scenarios**:

**A. Participant Missing Discord ID**
- [ ] Create match with participant (no Discord ID)
- [ ] Transition to battle with map code
- [ ] Expected: Error logged, but transition succeeds

**B. Empty Map Code**
- [ ] Create match with empty map code
- [ ] Transition to battle
- [ ] Expected: No DM sent, no error

**Status**: ⬜ Pass | ⬜ Fail

---

## PRIORITY 2: Regression Testing (Existing Features)

### 2.1 Existing Games - Match Creation

Test match creation for each existing game to ensure Rocket League addition didn't break anything.

#### Game Checklist
- [ ] **Overwatch 2** - Create match, select mode (Role Queue, Open Queue), verify maps load
- [ ] **Valorant** - Create match, select mode (Competitive, Spike Rush), verify maps load
- [ ] **Marvel Rivals** - Create match, verify new "Heart of Heaven" map appears
- [ ] **League of Legends** - Create match, select mode (Summoner's Rift, ARAM), verify maps
- [ ] **Rainbow Six Siege** - Create match, select mode (Bomb, Secure Area), verify maps
- [ ] **Counter-Strike 2** - Create match, select mode (Competitive, Wingman), verify maps

**Expected Results for All**:
- ✅ Game appears in dropdown
- ✅ Modes load correctly
- ✅ Maps load correctly
- ✅ Match creation succeeds

**Status**: ⬜ Pass | ⬜ Fail

---

### 2.2 Tournament System

#### Test 2.2.1: Single Elimination Tournament
**Steps**:
1. Create tournament (Overwatch 2, single elimination, 4 teams)
2. Add teams and participants
3. Generate bracket
4. Verify bracket structure

**Expected Results**:
- ✅ Tournament created successfully
- ✅ Bracket has 3 matches (2 semifinals, 1 final)
- ✅ Bracket visualization displays correctly
- ✅ Can navigate between rounds

**Status**: ⬜ Pass | ⬜ Fail

---

#### Test 2.2.2: Double Elimination Tournament
**Steps**:
1. Create tournament (Valorant, double elimination, 4 teams)
2. Generate bracket
3. Verify winners and losers brackets

**Expected Results**:
- ✅ Winners bracket created
- ✅ Losers bracket created
- ✅ Grand finals match created
- ✅ Can transition matches through bracket

**Status**: ⬜ Pass | ⬜ Fail

---

#### Test 2.2.3: Tournament with Game Mode
**Steps**:
1. Create tournament with game mode selected (e.g., Valorant Competitive)
2. Verify team size constraints
3. Generate matches

**Expected Results**:
- ✅ Team size enforced based on mode
- ✅ All tournament matches use selected mode
- ✅ No errors in bracket generation

**Status**: ⬜ Pass | ⬜ Fail

---

### 2.3 Scoring System

#### Test All Scoring Modes
- [ ] **Normal Scoring** - Best of 3, enter scores for each map
- [ ] **Score-Based** - Enter team scores (e.g., 13-7)
- [ ] **Control Points** - Enter point captures per team
- [ ] **Winner Selection** - Simple winner per map

**Expected Results**:
- ✅ Each scoring type works correctly
- ✅ Winner determined accurately
- ✅ Scores saved to database
- ✅ Match history shows correct results

**Status**: ⬜ Pass | ⬜ Fail

---

### 2.4 Discord Bot Commands

#### Test Bot Interactions
- [ ] `/ping` - Bot responds
- [ ] `/match info <id>` - Shows match details
- [ ] `/tournament info <id>` - Shows tournament details
- [ ] View match announcement embeds
- [ ] Test reminder DMs

**Expected Results**:
- ✅ All commands respond correctly
- ✅ Embeds display properly
- ✅ No permission errors

**Status**: ⬜ Pass | ⬜ Fail

---

### 2.5 Settings Pages

#### Test Each Settings Page
- [ ] **Discord Settings** (`/settings/discord`)
  - Bot token (masked)
  - Guild ID
  - Channel selections
  - Voice category

- [ ] **Announcer Settings** (`/settings/announcer`)
  - Voice settings
  - TTS options
  - Test announcements

- [ ] **Scheduler Settings** (`/settings/scheduler`)
  - Reminder timings
  - Cleanup delays

- [ ] **UI Settings** (`/settings/ui`)
  - Theme options
  - Display preferences

- [ ] **Application Settings** (`/settings/application`)
  - Log level
  - System settings

**Expected Results**:
- ✅ All settings load correctly
- ✅ Changes save successfully
- ✅ Settings persist after reload

**Status**: ⬜ Pass | ⬜ Fail

---

### 2.6 Welcome Flow

#### Test First-Time Setup
**Steps**:
1. Reset welcome completion flag in database:
   ```sql
   UPDATE settings SET value = 'false' WHERE key = 'welcome_complete';
   ```
2. Reload application
3. Go through welcome wizard
4. Complete all setup steps

**Expected Results**:
- ✅ Redirect to `/welcome` on first load
- ✅ Cannot access main app before completion
- ✅ Discord setup step works
- ✅ Channel setup step works
- ✅ Completion sets flag and redirects to dashboard

**Status**: ⬜ Pass | ⬜ Fail

---

## PRIORITY 3: Edge Cases and Error Scenarios

### 3.1 Voice Channel Edge Cases

#### Test 3.1.1: No Voice Category Configured
**Steps**:
1. Remove voice category from Discord settings
2. Create match and transition to "assign"

**Expected**: Match transitions, warning logged, no channels created

**Status**: ⬜ Pass | ⬜ Fail

---

#### Test 3.1.2: Voice Channels Already Exist
**Steps**:
1. Create match, transition to assign (channels created)
2. Manually transition back to "gather"
3. Transition to "assign" again

**Expected**: Existing channels reused OR new channels created (check logs)

**Status**: ⬜ Pass | ⬜ Fail

---

#### Test 3.1.3: Cleanup While Match Active
**Steps**:
1. Create match, transition to "battle"
2. Manually update `match.updated_at` to old timestamp
3. Wait for scheduler run

**Expected**: Channels NOT deleted (match status prevents cleanup)

**Status**: ⬜ Pass | ⬜ Fail

---

### 3.2 Health Monitoring Edge Cases

#### Test 3.2.1: Multiple Scheduler Failures
**Steps**:
1. Stop scheduler
2. Wait for multiple health check cycles (20+ minutes)

**Expected**: Only one alert per hour (rate limiting works)

**Status**: ⬜ Pass | ⬜ Fail

---

#### Test 3.2.2: Health Alerts Disabled
**Steps**:
1. Disable "Send Health Alerts" in settings
2. Stop scheduler
3. Wait 15 minutes

**Expected**: No alerts sent to Discord

**Status**: ⬜ Pass | ⬜ Fail

---

### 3.3 Transition Edge Cases

#### Test 3.3.1: Rapid Status Changes
**Steps**:
1. Create match
2. Quickly transition: created → gather → assign → battle
3. Check for duplicate announcements or errors

**Expected**: Each transition executes once, no duplicates

**Status**: ⬜ Pass | ⬜ Fail

---

#### Test 3.3.2: Transition Rollback
**Steps**:
1. Create match in "assign" status
2. Try to transition back to "gather" (if allowed)

**Expected**: Check if backward transitions are allowed/blocked

**Status**: ⬜ Pass | ⬜ Fail

---

### 3.4 Rocket League Edge Cases

#### Test 3.4.1: Special Characters in Signup
**Steps**:
1. Create Rocket League match with signup
2. Submit signup with special characters in username field
   - Example: `Player@#$%^&*()`

**Expected**: Characters handled safely, no XSS or SQL injection

**Status**: ⬜ Pass | ⬜ Fail

---

#### Test 3.4.2: Empty Signup Fields
**Steps**:
1. Submit Rocket League signup with minimal fields

**Expected**: Validation works correctly, required fields enforced

**Status**: ⬜ Pass | ⬜ Fail

---

## PRIORITY 4: Dependency Updates Testing

### 4.1 Next.js 16 Compatibility

#### Test 4.1.1: All Routes Load
**Critical Routes to Test**:
- [ ] `/` - Home/Dashboard
- [ ] `/matches/create` - Match creation
- [ ] `/matches/history` - Match history
- [ ] `/matches/[matchId]` - Match details
- [ ] `/tournaments/create` - Tournament creation
- [ ] `/tournaments/[tournamentId]` - Tournament bracket
- [ ] `/settings/*` - All settings pages
- [ ] `/welcome` - Welcome flow

**Expected Results**:
- ✅ No console errors
- ✅ No 404 or 500 errors
- ✅ Pages render correctly
- ✅ Client-side navigation works

**Browser Console Check**: No warnings about deprecated APIs

**Status**: ⬜ Pass | ⬜ Fail

---

#### Test 4.1.2: API Routes Function
**Test Sample Routes**:
- [ ] `GET /api/games` - List games
- [ ] `POST /api/matches` - Create match
- [ ] `PUT /api/matches/[id]/status` - Transition match
- [ ] `GET /api/tournaments` - List tournaments
- [ ] `GET /api/settings/discord` - Get Discord settings

**Expected Results**:
- ✅ All routes return correct status codes
- ✅ Response bodies are valid JSON
- ✅ No server errors in logs

**Status**: ⬜ Pass | ⬜ Fail

---

### 4.2 React 19.2 Compatibility

#### Test 4.2.1: Component Rendering
**Focus Areas**:
- Interactive components (buttons, forms)
- Modal components
- Tournament bracket visualization
- Scoring interfaces

**Expected Results**:
- ✅ No React warnings in console
- ✅ No hydration errors
- ✅ Event handlers work correctly
- ✅ State updates properly

**Status**: ⬜ Pass | ⬜ Fail

---

### 4.3 Discord.js 14.24 Compatibility

#### Test 4.3.1: Bot Functionality
- [ ] Bot connects successfully
- [ ] Slash commands work
- [ ] Embeds send correctly
- [ ] Voice announcements work
- [ ] DM sending works

**Expected Results**:
- ✅ No deprecation warnings in logs
- ✅ All Discord features functional

**Status**: ⬜ Pass | ⬜ Fail

---

## PRIORITY 5: Performance and Load Testing

### 5.1 Voice Channel Creation Performance

**Steps**:
1. Create 5 matches simultaneously
2. Transition all to "assign" at once
3. Monitor Discord API rate limits
4. Check response times

**Expected Results**:
- ✅ All channels created within 10 seconds
- ✅ No rate limit errors
- ✅ Transitions complete successfully

**Status**: ⬜ Pass | ⬜ Fail

---

### 5.2 Database Migration Performance

**Steps**:
1. Stop all processes
2. Delete database: `rm app_data/data/matchexec.db`
3. Start processes: `npm run dev:all`
4. Monitor migration time

**Expected Results**:
- ✅ Migrations complete in < 30 seconds
- ✅ Game data seeded successfully
- ✅ No migration errors

**Status**: ⬜ Pass | ⬜ Fail

---

### 5.3 Build Performance

**Steps**:
```bash
npm run build
```

**Expected Results**:
- ✅ Build completes without errors
- ✅ No type errors
- ✅ Bundle size reasonable (< 5MB for client bundles)

**Check for warnings**:
- Large bundle sizes
- Deprecated APIs
- Missing dependencies

**Status**: ⬜ Pass | ⬜ Fail

---

## Post-Testing Checklist

### ✅ Before Merging to Dev

- [ ] All Priority 1 tests passed
- [ ] All Priority 2 tests passed (or issues documented)
- [ ] Critical edge cases tested
- [ ] No console errors in production build
- [ ] PM2 logs show no errors
- [ ] Database migrations successful
- [ ] Discord bot functioning correctly
- [ ] Performance acceptable

### 📝 Issues Found

**Document any issues here**:

| Test | Issue | Severity | Notes |
|------|-------|----------|-------|
|      |       |          |       |

### 🚀 Merge Decision

**Recommendation**: ⬜ Merge | ⬜ Fix Issues First | ⬜ Rollback

**Reason**: _______________

---

## Rollback Procedure (If Needed)

If critical issues found during testing:

```bash
# Stop all processes
npm run dev:stop

# Switch back to dev branch
git checkout dev

# Restart processes
npm run dev:all

# Database will remain intact (migrations are additive)
# If needed, restore database backup
```

---

## Test Execution Log

**Test Started**: _______________
**Test Completed**: _______________
**Total Duration**: _______________
**Tests Passed**: _____ / _____
**Tests Failed**: _____
**Tests Blocked**: _____

**Tester Signature**: _______________

---

## Notes and Observations

(Use this space for additional notes during testing)
