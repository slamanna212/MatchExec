
● All phases 1-13 are complete. Let me give a summary of everything that was implemented:

  ---
  All phases from the STATS.md plan have been implemented. Here's a summary of what was built:

  Phases 1-3 (Foundation)
  - Migration 012_scorecard_stats.sql — 8 new tables (scorecard_submissions, scorecard_player_stats, match_player_stats, stats_processing_queue, stats_image_queue,
  discord_scorecard_prompt_queue, scorecard_dm_messages, stats_settings)
  - stats.json files for Overwatch 2 (6 stats) and Marvel Rivals (6 stats), data versions bumped
  - Seeder updated to seed stat definitions from stats.json
  - 7 new TypeScript interfaces in shared/types.ts

  Phases 4-6 (API Routes)
  - GET/PUT /api/settings/stats — stats settings CRUD with API key masking
  - GET /api/games/[gameId]/stats — returns stat definitions (empty array for games without stats)
  - Full scorecard API: upload, list, get, delete, assign, review, match stats aggregation, image generation queue

  Phase 7 (Stats Processor — 4th Process)
  - processes/stats-processor/index.ts — polls queues every 5s, heartbeat every 5min
  - ai-extractor.ts — calls Claude Vision API, parses results, auto-assigns players by name matching, retry logic (3 retries with backoff), both-sides validation and auto-advance
  - stat-image-generator.ts — aggregates stats, generates team + individual player canvas images using @napi-rs/canvas
  - esbuild.stats-processor.config.mjs — build config

  Phase 8 (Process Config)
  - PM2 ecosystem.config.js — stats-processor as 4th process
  - s6-overlay service files for Docker

  Phase 9 (Discord DM Flow)
  - scorecard-handler.ts — sends DMs to match commanders at map start, handles screenshot replies
  - Discord bot: MessageContent intent, messageCreate event listener
  - Queue processor: processScorecardPromptQueue()

  Phase 10 (Scoring Integration)
  - queueScorecardPrompts() — called when first/next map goes ongoing
  - queueStatsAggregation() — called when match completes

  Phases 11-13 (UI)
  - /settings/stats — two-card settings page (general toggles + API key/model)
  - Settings index updated with Stats card
  - ScorecardUpload.tsx — drag-and-drop upload with team side selector
  - SimpleMapScoring.tsx — "Upload Scorecard" button when stats enabled for current game
  - /matches/[matchId]/stats — review page with map tabs
  - StatsReviewPanel, PlayerStatCard, SubmissionViewer components
  - "Review Stats" button on match detail page for battle/complete matches

  Verification: npm run migrate ✅ | tsc --noEmit ✅ | npm run lint ✅










# AI-Powered Scorecard Stats Extraction - Implementation Plan

## Overview

Add AI-powered scorecard analysis: match commanders photograph in-game scoreboards, the app uses Claude Vision to extract player stats (kills, deaths, damage, healing, etc.), stats are stored, displayed, and shared via Discord.

**Supported games (initial):** Marvel Rivals, Overwatch 2 only. Games without a `stats.json` file will not show any stats UI.

**Key decisions:**
- Match commanders = participants with `receives_map_codes=1` (existing field in `match_participants`)
- Reply-based Discord DM flow: Bot DMs commanders at map start; they reply with screenshot
- New `stats-processor` process (4th PM2/s6 process) for AI calls + image generation
- API key stored in database via Stats settings page
- `stats.json` per game defines extractable fields (builds AI prompt dynamically)

---

## Phase 1: Database Migration

- [x] **Create `migrations/012_scorecard_stats.sql`**

**Tables to create:**

```sql
-- Stats settings (singleton, id=1)
CREATE TABLE IF NOT EXISTS stats_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 0,
  ai_provider TEXT NOT NULL DEFAULT 'anthropic',
  ai_api_key TEXT,
  ai_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  both_sides_required INTEGER NOT NULL DEFAULT 0,
  auto_advance_on_match INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO stats_settings (id) VALUES (1);

-- Game stat definitions (seeded from stats.json)
CREATE TABLE IF NOT EXISTS game_stat_definitions (
  id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  stat_type TEXT NOT NULL DEFAULT 'number',
  category TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0,
  format TEXT,
  PRIMARY KEY (id, game_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

-- Screenshot submissions from commanders
CREATE TABLE IF NOT EXISTS scorecard_submissions (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  match_game_id TEXT NOT NULL,
  submitted_by_participant_id TEXT,
  submitted_by_discord_user_id TEXT,
  team_side TEXT NOT NULL CHECK (team_side IN ('blue', 'red')),
  screenshot_url TEXT NOT NULL,
  discord_message_id TEXT,
  ai_raw_response TEXT,
  ai_extraction_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (ai_extraction_status IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
  ai_error_message TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'auto_approved')),
  reviewed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Extracted player stats per submission
CREATE TABLE IF NOT EXISTS scorecard_player_stats (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  match_game_id TEXT NOT NULL,
  participant_id TEXT,
  extracted_player_name TEXT NOT NULL,
  extracted_hero TEXT,
  team_side TEXT CHECK (team_side IN ('blue', 'red')),
  stats_json TEXT NOT NULL DEFAULT '{}',
  assignment_status TEXT NOT NULL DEFAULT 'unassigned'
    CHECK (assignment_status IN ('unassigned', 'assigned', 'confirmed')),
  confidence_score REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submission_id) REFERENCES scorecard_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY (participant_id) REFERENCES match_participants(id) ON DELETE SET NULL
);

-- Aggregated match-level stats per participant
CREATE TABLE IF NOT EXISTS match_player_stats (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  total_stats_json TEXT NOT NULL DEFAULT '{}',
  maps_played INTEGER NOT NULL DEFAULT 0,
  stat_image_url TEXT,
  stat_image_sent INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY (participant_id) REFERENCES match_participants(id) ON DELETE CASCADE,
  UNIQUE(match_id, participant_id)
);

-- Queue for AI extraction requests
CREATE TABLE IF NOT EXISTS stats_processing_queue (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  match_game_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submission_id) REFERENCES scorecard_submissions(id) ON DELETE CASCADE
);

-- Queue for stat image generation
CREATE TABLE IF NOT EXISTS stats_image_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Queue for scorecard DM prompts to commanders
CREATE TABLE IF NOT EXISTS discord_scorecard_prompt_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  match_game_id TEXT NOT NULL,
  map_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Track DM message <-> map associations (for reply-based flow)
CREATE TABLE IF NOT EXISTS scorecard_dm_messages (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  match_game_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  discord_message_id TEXT NOT NULL,
  participant_id TEXT,
  team_side TEXT CHECK (team_side IN ('blue', 'red')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);
```

**Indexes:**

```sql
CREATE INDEX IF NOT EXISTS idx_scorecard_submissions_match ON scorecard_submissions(match_id);
CREATE INDEX IF NOT EXISTS idx_scorecard_submissions_match_game ON scorecard_submissions(match_game_id);
CREATE INDEX IF NOT EXISTS idx_scorecard_player_stats_submission ON scorecard_player_stats(submission_id);
CREATE INDEX IF NOT EXISTS idx_scorecard_player_stats_match ON scorecard_player_stats(match_id);
CREATE INDEX IF NOT EXISTS idx_scorecard_player_stats_participant ON scorecard_player_stats(participant_id);
CREATE INDEX IF NOT EXISTS idx_match_player_stats_match ON match_player_stats(match_id);
CREATE INDEX IF NOT EXISTS idx_stats_processing_queue_status ON stats_processing_queue(status);
CREATE INDEX IF NOT EXISTS idx_stats_image_queue_status ON stats_image_queue(status);
CREATE INDEX IF NOT EXISTS idx_scorecard_dm_messages_discord ON scorecard_dm_messages(discord_user_id, discord_message_id);
CREATE INDEX IF NOT EXISTS idx_discord_scorecard_prompt_queue_status ON discord_scorecard_prompt_queue(status);
```

**Triggers:**

```sql
CREATE TRIGGER IF NOT EXISTS update_stats_settings_ts AFTER UPDATE ON stats_settings
BEGIN UPDATE stats_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS update_scorecard_submissions_ts AFTER UPDATE ON scorecard_submissions
BEGIN UPDATE scorecard_submissions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS update_scorecard_player_stats_ts AFTER UPDATE ON scorecard_player_stats
BEGIN UPDATE scorecard_player_stats SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS update_match_player_stats_ts AFTER UPDATE ON match_player_stats
BEGIN UPDATE match_player_stats SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;
```

**Verify:** `npm run migrate` then `sqlite3 ./app_data/data/matchexec.db ".tables" | grep -E "score|stats"`

---

## Phase 2: Game Stat Definition Files + Seeder

### Create stat definition files

- [x] **Create `data/games/overwatch2/stats.json`**

```json
[
  { "id": "eliminations", "name": "eliminations", "displayName": "Eliminations", "statType": "number", "category": "combat", "sortOrder": 1, "isPrimary": true },
  { "id": "assists", "name": "assists", "displayName": "Assists", "statType": "number", "category": "combat", "sortOrder": 2, "isPrimary": true },
  { "id": "deaths", "name": "deaths", "displayName": "Deaths", "statType": "number", "category": "combat", "sortOrder": 3, "isPrimary": true },
  { "id": "damage", "name": "damage", "displayName": "Damage", "statType": "number", "category": "combat", "sortOrder": 4, "isPrimary": true, "format": "thousands" },
  { "id": "healing", "name": "healing", "displayName": "Healing", "statType": "number", "category": "support", "sortOrder": 5, "isPrimary": true, "format": "thousands" },
  { "id": "damage_mitigated", "name": "damage_mitigated", "displayName": "Damage Mitigated", "statType": "number", "category": "tank", "sortOrder": 6, "isPrimary": false, "format": "thousands" }
]
```

- [x] **Create `data/games/marvelrivals/stats.json`**

```json
[
  { "id": "kills", "name": "kills", "displayName": "Kills", "statType": "number", "category": "combat", "sortOrder": 1, "isPrimary": true },
  { "id": "deaths", "name": "deaths", "displayName": "Deaths", "statType": "number", "category": "combat", "sortOrder": 2, "isPrimary": true },
  { "id": "assists", "name": "assists", "displayName": "Assists", "statType": "number", "category": "combat", "sortOrder": 3, "isPrimary": true },
  { "id": "kda", "name": "kda", "displayName": "KDA", "statType": "number", "category": "combat", "sortOrder": 4, "isPrimary": true, "format": "decimal" },
  { "id": "damage", "name": "damage", "displayName": "Damage", "statType": "number", "category": "combat", "sortOrder": 5, "isPrimary": true, "format": "thousands" },
  { "id": "healing", "name": "healing", "displayName": "Healing", "statType": "number", "category": "support", "sortOrder": 6, "isPrimary": false, "format": "thousands" }
]
```

### Modify seeder

- [x] **Modify `lib/database/seeder.ts`** — add stats seeding

**1. Add `StatData` interface** near top of file (after `MapData` interface, around line 49):

```typescript
interface StatData {
  id: string;
  name: string;
  displayName: string;
  statType: string;
  category?: string;
  sortOrder: number;
  isPrimary: boolean;
  format?: string;
}
```

**2. Add stats seeding to `seedGame()` method** — after the maps seeding block (after line 179, before the `// Update data version` comment):

```typescript
// Seed stats if they exist
const statsPath = path.join(gamePath, 'stats.json');
if (fs.existsSync(statsPath)) {
  try {
    const statsContent = fs.readFileSync(statsPath, 'utf8').trim();
    if (statsContent) {
      const statsData: StatData[] = JSON.parse(statsContent);
      await this.seedStats(gameData.id, statsData);
      console.log(`✅ Seeded ${statsData.length} stat definitions for ${gameData.name}`);
    }
  } catch (error) {
    console.error(`❌ Error seeding stats for ${gameData.name}:`, error);
    throw error;
  }
} else {
  console.log(`ℹ️ No stats.json found for ${gameData.name}`);
}
```

**3. Add `seedStats()` method** to `DatabaseSeeder` class (before `updateDataVersion` method, around line 355):

```typescript
private async seedStats(gameId: string, statsData: StatData[]): Promise<void> {
  await this.db.run('DELETE FROM game_stat_definitions WHERE game_id = ?', [gameId]);
  for (const stat of statsData) {
    await this.db.run(
      `INSERT INTO game_stat_definitions (id, game_id, name, display_name, stat_type, category, sort_order, is_primary, format)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [stat.id, gameId, stat.name, stat.displayName, stat.statType, stat.category || null, stat.sortOrder, stat.isPrimary ? 1 : 0, stat.format || null]
    );
  }
}
```

### Bump data versions

- [x] **Modify `data/games/overwatch2/game.json`** — change `"dataVersion": "1.7.7"` to `"1.8.0"`
- [x] **Modify `data/games/marvelrivals/game.json`** — change `"dataVersion": "1.8.3"` to `"1.9.0"`

**Verify:** `npm run migrate` then `sqlite3 ./app_data/data/matchexec.db "SELECT * FROM game_stat_definitions;"`

---

## Phase 3: TypeScript Types

- [x] **Modify `shared/types.ts`** — add at end of file (after `SchedulerSettings` interface, around line 337):

```typescript
// === Scorecard Stats Types ===

export interface GameStatDefinition {
  id: string;
  game_id: string;
  name: string;
  display_name: string;
  stat_type: string;
  category?: string;
  sort_order: number;
  is_primary: boolean;
  format?: string;
}

export interface ScorecardSubmission {
  id: string;
  match_id: string;
  match_game_id: string;
  submitted_by_participant_id?: string;
  submitted_by_discord_user_id?: string;
  team_side: 'blue' | 'red';
  screenshot_url: string;
  discord_message_id?: string;
  ai_raw_response?: string;
  ai_extraction_status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
  ai_error_message?: string;
  review_status: 'pending' | 'approved' | 'rejected' | 'auto_approved';
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ScorecardPlayerStat {
  id: string;
  submission_id: string;
  match_id: string;
  match_game_id: string;
  participant_id?: string;
  extracted_player_name: string;
  extracted_hero?: string;
  team_side?: 'blue' | 'red';
  stats_json: string;
  assignment_status: 'unassigned' | 'assigned' | 'confirmed';
  confidence_score?: number;
  created_at: string;
  updated_at: string;
}

export interface MatchPlayerStats {
  id: string;
  match_id: string;
  participant_id: string;
  total_stats_json: string;
  maps_played: number;
  stat_image_url?: string;
  stat_image_sent: boolean;
  created_at: string;
  updated_at: string;
}

export interface StatsSettings {
  enabled: boolean;
  ai_provider: string;
  ai_api_key?: string;
  ai_model: string;
  both_sides_required: boolean;
  auto_advance_on_match: boolean;
}

export interface ScorecardDmMessage {
  id: string;
  match_id: string;
  match_game_id: string;
  discord_user_id: string;
  discord_message_id: string;
  participant_id?: string;
  team_side?: 'blue' | 'red';
  created_at: string;
}

export interface AIExtractionResult {
  players: Array<{
    playerName: string;
    hero?: string;
    teamSide: 'blue' | 'red' | 'unknown';
    stats: Record<string, number>;
    confidence: number;
  }>;
  mapName?: string;
  gameResult?: {
    team1Score?: number;
    team2Score?: number;
    winner?: 'team1' | 'team2';
  };
}
```

**Verify:** `npx tsc --noEmit`

---

## Phase 4: API Routes — Stats Settings

- [x] **Create `src/app/api/settings/stats/route.ts`**

Follow the pattern of `src/app/api/settings/discord/route.ts`:
- **GET**: Query `stats_settings WHERE id = 1`. Mask API key as `'***configured***'` if set, empty string if not.
- **PUT**: Accept JSON body with `enabled`, `ai_provider`, `ai_api_key`, `ai_model`, `both_sides_required`, `auto_advance_on_match`. Skip API key update if value is `'***configured***'`. Ensure settings row exists first with `INSERT OR IGNORE`. Transform booleans to 0/1 for SQLite.
- Use `getDbInstance()` from `@/lib/database-init` and `logger` from `@/lib/logger`.

**Verify:** `curl http://localhost:3000/api/settings/stats`

---

## Phase 5: API Routes — Game Stats

- [x] **Create `src/app/api/games/[gameId]/stats/route.ts`**

**GET**: Query `SELECT * FROM game_stat_definitions WHERE game_id = ? ORDER BY sort_order ASC`. Return as JSON array. Return empty array `[]` if game has no stats defined. This endpoint is used by the UI to decide whether to show stats features.

Use `getDbInstance()` from `@/lib/database-init`. Accept `gameId` from route params (follow pattern of other `[gameId]` routes in the project). The route params in Next.js 15 are accessed via `params` which is a Promise: `const { gameId } = await params;`

**Verify:** `curl http://localhost:3000/api/games/overwatch2/stats`

---

## Phase 6: API Routes — Scorecard Submissions

### Scorecard upload + list

- [x] **Create `src/app/api/matches/[matchId]/scorecard/route.ts`**

**POST** — Upload a scorecard screenshot:
- Accept FormData with `screenshot` (File), `matchGameId` (string), `teamSide` (string: 'blue'|'red')
- Validate file using same MIME/magic bytes pattern from `src/app/api/upload/event-image/route.ts` (lines 8-49)
- Save to `public/uploads/scorecards/{matchId}/` directory
- Generate unique filename with timestamp + random bytes (same pattern as event-image upload)
- Create `scorecard_submissions` row with unique ID (`crypto.randomUUID()`)
- Insert into `stats_processing_queue` for AI processing
- Return `{ success: true, submissionId, screenshotUrl }`

**GET** — List all submissions for this match:
- Optional query param `?matchGameId=` to filter by map
- Join with `scorecard_player_stats` to include extracted stats
- Group results by `match_game_id` in the response

### Single submission

- [x] **Create `src/app/api/matches/[matchId]/scorecard/[submissionId]/route.ts`**

**GET** — Single submission with its `scorecard_player_stats` rows.
**DELETE** — Remove submission and associated player stats (CASCADE handles stats).

### Assignment

- [x] **Create `src/app/api/matches/[matchId]/scorecard/[submissionId]/assign/route.ts`**

**PUT** — Assign participants to extracted players:
- Body: `{ assignments: [{ playerStatId: string, participantId: string }] }`
- Update `scorecard_player_stats.participant_id` and set `assignment_status = 'assigned'`

### Review

- [x] **Create `src/app/api/matches/[matchId]/scorecard/[submissionId]/review/route.ts`**

**PUT** — Approve or reject:
- Body: `{ status: 'approved' | 'rejected' }`
- Update `review_status` and `reviewed_at = CURRENT_TIMESTAMP`
- On approval with `auto_advance_on_match` enabled: check if both sides submitted (when `both_sides_required`), and if matching stats, call `saveMatchResult()` from `src/lib/scoring-functions.ts` to auto-advance

### Match stats

- [x] **Create `src/app/api/matches/[matchId]/stats/route.ts`**

**GET** — Return aggregated match stats from `match_player_stats` for this match.
**POST** — Trigger aggregation: compute totals from all approved `scorecard_player_stats`, upsert into `match_player_stats`.

### Image generation trigger

- [x] **Create `src/app/api/matches/[matchId]/stats/generate-images/route.ts`**

**POST** — Queue image generation by inserting into `stats_image_queue` with unique ID and `status = 'pending'`.

---

## Phase 7: Stats Processor Process

New 4th process. Polls queue tables and performs AI extraction + image generation.

### Main process file

- [x] **Create `processes/stats-processor/index.ts`**

Follow the pattern of `processes/scheduler/index.ts`:
- Import `waitForDatabaseReady` from `../../lib/database`
- Import `logger` from `../../src/lib/logger/server`
- Create `StatsProcessor` class with:
  - `start()` → `waitForDatabaseReady()`, init modules, start intervals
  - `processExtractionQueue()` → poll `stats_processing_queue` WHERE `status = 'pending'` LIMIT 1, process with `AIExtractor`
  - `processImageQueue()` → poll `stats_image_queue` WHERE `status = 'pending'` LIMIT 1, process with `StatImageGenerator`
  - Poll both queues every 5 seconds via `setInterval`
  - Heartbeat every 5 minutes (write to `app_settings` table like scheduler does)
  - Graceful shutdown on SIGTERM/SIGINT
  - Global error handlers (`uncaughtException`, `unhandledRejection`) — log but don't exit

### AI Extractor module

- [x] **Create `processes/stats-processor/modules/ai-extractor.ts`**

```
class AIExtractor {
  constructor(db: Database)

  async processSubmission(submissionId: string):
    1. Update stats_processing_queue status to 'processing'
    2. Load submission from scorecard_submissions
    3. Load match to get game_id
    4. Load stat definitions from game_stat_definitions WHERE game_id
    5. Load screenshot from disk (using screenshot_url path), convert to base64
    6. Load API key + model from stats_settings
    7. Build prompt using buildPrompt(statDefinitions, gameName)
    8. Call Claude Vision API via fetch to https://api.anthropic.com/v1/messages
    9. Parse JSON response
    10. Create scorecard_player_stats rows for each extracted player
    11. Run autoAssignParticipants() for fuzzy name matching
    12. Update submission ai_extraction_status to 'completed'
    13. Update stats_processing_queue status to 'completed'
    14. If both_sides_required, call checkBothSidesAndAutoAdvance()

  buildPrompt(statDefs: GameStatDefinition[], gameName: string) -> string:
    - Include game name
    - List exact stat fields to extract (from statDefs array)
    - Request JSON output matching AIExtractionResult type
    - Rules: no markdown wrapping, normalize numbers (e.g. "12.5K" → 12500), confidence 0-1

  async callClaudeVisionAPI(apiKey, model, imageBase64, mimeType, prompt) -> string:
    - POST to https://api.anthropic.com/v1/messages
    - Headers: x-api-key, anthropic-version: '2023-06-01', content-type: application/json
    - Body: { model, max_tokens: 4096, messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
        { type: 'text', text: prompt }
      ]}]}
    - Return response.content[0].text

  parseExtractionResult(rawResponse: string) -> AIExtractionResult:
    - Strip markdown fences (```json ... ```) if present
    - JSON.parse the cleaned string

  async autoAssignParticipants(submissionId, matchId, players):
    - Load match_participants for this match
    - For each extracted player, normalize name: toLowerCase(), strip spaces/special chars
    - Compare against participant usernames (same normalization)
    - If single match found with confidence > 0.7: set participant_id and assignment_status='assigned'

  async checkBothSidesAndAutoAdvance(matchId, matchGameId):
    - Load stats_settings for both_sides_required and auto_advance_on_match
    - If both_sides_required is false, return
    - Query scorecard_submissions for this matchGameId where ai_extraction_status='completed'
    - Need both blue and red team_side submissions
    - Load scorecard_player_stats for each submission
    - Compare stats: match players by team_side + extracted_player_name
    - Compare numeric stat values: must be exact match for integers
    - If all match: set both submissions review_status='auto_approved'
    - If auto_advance_on_match AND gameResult.winner extracted:
      import { saveMatchResult } from '../../../src/lib/scoring-functions'
      call saveMatchResult() — this triggers existing auto-advance logic
    - If mismatch: leave as review_status='pending', log discrepancies
```

### Image Generator module

- [x] **Create `processes/stats-processor/modules/stat-image-generator.ts`**

Uses `@napi-rs/canvas` for image generation.

```
class StatImageGenerator {
  constructor(db: Database)

  async generateMatchStatImages(matchId: string):
    1. Load all scorecard_player_stats for this match where submission review_status IN ('approved', 'auto_approved')
    2. Group by participant_id, sum numeric stats across maps → upsert into match_player_stats
    3. Load stat definitions for the match's game
    4. Generate team comparison image
    5. Generate individual player stat cards
    6. Save to public/uploads/stats/{matchId}/
    7. Update match_player_stats with stat_image_url
    8. Queue Discord send: insert into discord_scorecard_prompt_queue or use a dedicated mechanism
       (insert a row into discord_bot_requests-style table with type 'send_stat_images')

  async generateTeamStatImage(matchId) -> string (image path):
    - Canvas: ~1200x800
    - Header: match name, game icon, final score
    - Blue team left column, red team right column
    - Each player row: hero icon (if available), name, primary stats
    - Footer: MatchExec branding
    - Save as public/uploads/stats/{matchId}/team.png

  async generatePlayerStatImage(matchId, participantId) -> string (image path):
    - Canvas: ~800x600
    - Player name + hero
    - All stats (not just primary)
    - Per-map breakdown if multiple maps
    - Match result
    - Save as public/uploads/stats/{matchId}/{participantId}.png
```

### Esbuild config

- [x] **Create `esbuild.stats-processor.config.mjs`**

Copy from `esbuild.scheduler.config.mjs` and change:
- `entryPoints`: `processes/stats-processor/index.ts`
- `outfile`: `dist/stats-processor.js`
- Add `@napi-rs/canvas` to `external` array
- Change banner comment to `// Stats Processor Bundle`

```javascript
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

await esbuild.build({
  entryPoints: [join(__dirname, 'processes/stats-processor/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  outfile: join(__dirname, 'dist/stats-processor.js'),
  external: [
    'sqlite3',
    'bufferutil',
    '@napi-rs/canvas',
    'discord.js',
    '@discordjs/voice',
    '@discordjs/rest',
    '@discordjs/builders',
    '@discordjs/util',
    '@discordjs/ws',
    'fs', 'path', 'crypto', 'os', 'stream', 'http', 'https', 'net', 'tls', 'zlib', 'events', 'util',
  ],
  treeShaking: true,
  minify: true,
  sourcemap: false,
  logLevel: 'info',
  banner: {
    js: '// Stats Processor Bundle - Generated by esbuild\n// MatchExec Match Bot\n',
  },
});

console.log('✓ Stats processor bundled successfully');
```

### Package.json updates

- [ ] **Modify `package.json`** — add to scripts:
  - `"build:stats-processor": "node esbuild.stats-processor.config.mjs"`
  - Update `"build:all-processes"` to: `"npm run build:discord-bot && npm run build:scheduler && npm run build:migrator && npm run build:stats-processor"`

- [ ] **Modify `package.json`** — add dependency:
  - `"@napi-rs/canvas": "^0.1.65"` (or latest) — run `npm install @napi-rs/canvas`

- [ ] **Modify `scripts/collect-process-deps.mjs`** — add `'@napi-rs/canvas'` to `PROCESS_DEPS` array (line 24-35)

**Verify:** `npm run build:stats-processor`

---

## Phase 8: PM2 + s6-overlay Configuration

### PM2

- [x] **Modify `ecosystem.config.js`** — add after the scheduler entry (after line 58, before the closing `]`):

```javascript
{
  name: isDev ? 'stats-processor-dev' : 'stats-processor',
  script: './processes/stats-processor/index.ts',
  interpreter: 'npx',
  interpreter_args: 'tsx',
  env: {
    NODE_ENV: isDev ? 'development' : 'production',
    DATABASE_PATH: './app_data/data/matchexec.db',
    TZ: 'UTC'
  },
  ...(isDev && {
    watch: ['./processes/stats-processor', './shared', './lib']
  })
}
```

### s6-overlay (Docker)

Create these files following the exact pattern of `s6-overlay/s6-rc.d/scheduler/`:

- [x] **Create `s6-overlay/s6-rc.d/stats-processor/type`** — content: `longrun`
- [x] **Create `s6-overlay/s6-rc.d/stats-processor/run`** — make executable (`chmod +x`):

```bash
#!/command/with-contenv bash
echo "Starting stats processor..."
cd /app
exec s6-setuidgid abc node dist/stats-processor.js
```

- [ ] **Create `s6-overlay/s6-rc.d/stats-processor/dependencies.d/base`** — empty file
- [ ] **Create `s6-overlay/s6-rc.d/stats-processor/dependencies.d/db-migrator`** — empty file
- [ ] **Create `s6-overlay/s6-rc.d/user/contents.d/stats-processor`** — empty file

**Verify:** `npm run dev:all` then `npx pm2 status` should show stats-processor

---

## Phase 9: Discord Bot — Scorecard DM Flow

### Scorecard handler module

- [x] **Create `processes/discord-bot/modules/scorecard-handler.ts`**

```
import type { Client, Message } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Database } from '../../../lib/database/connection';
import type { DiscordSettings } from '../../../shared/types';
import { logger } from '../../../src/lib/logger/server';

class ScorecardHandler {
  constructor(
    private client: Client,
    private db: Database,
    private settings: DiscordSettings | null
  )

  async sendScorecardPrompts(matchId, matchGameId, mapName) -> boolean:
    1. Check stats_settings.enabled
    2. Check game has stat definitions (query game_stat_definitions count)
    3. Get commanders: SELECT * FROM match_participants WHERE match_id=? AND receives_map_codes=1
    4. For each commander with discord_user_id:
       - Determine team_side from team_assignment ('blue'/'red')
       - Build embed: title="📸 Scorecard Needed", description with map name + instructions
       - Send DM via client.users.fetch(discord_user_id).then(u => u.send({embeds}))
       - Save to scorecard_dm_messages table (id=crypto.randomUUID(), match_id, match_game_id, discord_user_id, discord_message_id=sentMessage.id, team_side)
    5. Return true if any DMs sent

  async handleDMReply(message: Message):
    1. Get message.reference.messageId (the replied-to message)
    2. Look up in scorecard_dm_messages WHERE discord_message_id = reference.messageId
       AND discord_user_id = message.author.id
    3. If not found, ignore (not a scorecard reply)
    4. Check for image attachments (message.attachments.filter by content type)
    5. If no images, reply "Please attach a screenshot image"
    6. Download first image attachment (fetch the URL, get buffer)
    7. Save to public/uploads/scorecards/{matchId}/{timestamp}_{random}.{ext}
    8. Create scorecard_submissions row (id=crypto.randomUUID())
    9. Insert into stats_processing_queue
    10. Reply to user: "✅ Screenshot received! Processing stats..."

  async handleNonReplyDM(message: Message):
    1. Check if sender has any entries in scorecard_dm_messages
       with a match_game that's still in 'ongoing' status
    2. If yes, reply: "Please reply directly to the specific map message with your screenshot"
    3. If no, ignore

  updateSettings(settings: DiscordSettings) { this.settings = settings; }
}
```

### Modify discord bot main

- [x] **Modify `processes/discord-bot/index.ts`**

1. Add import at top (after other module imports, around line 18):
```typescript
import { ScorecardHandler } from './modules/scorecard-handler';
```

2. Add property to `MatchExecBot` class (after `healthMonitor` on line 34):
```typescript
private scorecardHandler: ScorecardHandler | null = null;
```

3. Initialize in `initialize()` method (after `healthMonitor` init, around line 202):
```typescript
this.scorecardHandler = new ScorecardHandler(this.client, this.db, this.settings);
```

4. Pass to `QueueProcessor` constructor — add as 8th parameter

5. Add `messageCreate` event listener in `setupEventListeners()` (after the `interactionCreate` handler, before line 100):
```typescript
this.client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.channel.isDMBased()) return;
  if (!this.scorecardHandler) return;
  if (message.reference?.messageId) {
    await this.scorecardHandler.handleDMReply(message);
  } else if (message.attachments.size > 0) {
    await this.scorecardHandler.handleNonReplyDM(message);
  }
});
```

6. Add `GatewayIntentBits.MessageContent` to Client intents (line 42, in the intents array):
```typescript
GatewayIntentBits.MessageContent
```

7. Add settings refresh in the settings reload interval (line 246, after other `.updateSettings()` calls):
```typescript
this.scorecardHandler?.updateSettings(newSettings);
```

### Modify queue processor

- [x] **Modify `processes/discord-bot/modules/queue-processor.ts`**

1. Accept `ScorecardHandler` as parameter in constructor (add after `voiceHandler` parameter)
2. Add `processScorecardPromptQueue()` method:
   - Query `discord_scorecard_prompt_queue` WHERE `status = 'pending'` LIMIT 5
   - For each entry: call `scorecardHandler.sendScorecardPrompts(matchId, matchGameId, mapName)`
   - Update queue entry status to 'sent' or 'failed'
3. Add stat image sending handler:
   - Look for entries in appropriate queue with type 'send_stat_images'
   - Send team image to channels with `send_match_start = 1`
   - DM individual stat images to each player
4. Call `processScorecardPromptQueue()` in `processAllQueues()`

---

## Phase 10: Scoring Flow Integration

- [x] **Modify `src/lib/scoring-functions.ts`**

### Add `queueScorecardPrompts()` helper (add near end of file, before exports):

```typescript
async function queueScorecardPrompts(matchId: string, matchGameId: string, mapName: string): Promise<void> {
  const db = await getDbInstance();

  // Check if stats feature is enabled
  const statsSettings = await db.get<{ enabled: number }>('SELECT enabled FROM stats_settings WHERE id = 1');
  if (!statsSettings?.enabled) return;

  // Check if game has stat definitions
  const match = await db.get<{ game_id: string }>('SELECT game_id FROM matches WHERE id = ?', [matchId]);
  if (!match) return;

  const statDefs = await db.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM game_stat_definitions WHERE game_id = ?', [match.game_id]);
  if (!statDefs || statDefs.cnt === 0) return;

  const queueId = `scorecard_prompt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  await db.run(
    'INSERT INTO discord_scorecard_prompt_queue (id, match_id, match_game_id, map_name, status) VALUES (?, ?, ?, ?, ?)',
    [queueId, matchId, matchGameId, mapName, 'pending']
  );
  logger.debug(`📸 Scorecard prompt queued for match ${matchId}, game ${matchGameId}`);
}
```

### Call `queueScorecardPrompts()` in two places:

1. **In `initializeMatchGames()`** (around line 131) — after creating the first map that's set to 'ongoing'. Add after `logger.debug('Created match game...')` inside the `if (!existingGame)` block, when `status === 'ongoing'`:
```typescript
if (status === 'ongoing') {
  // Queue scorecard prompts for the first map
  try {
    // Get map name for the prompt
    const mapData = await db.get<{ name: string }>('SELECT name FROM game_maps WHERE id = ?', [mapId.replace(/-\d+-[a-zA-Z0-9]+$/, '')]);
    await queueScorecardPrompts(matchId, gameId, mapData?.name || mapId);
  } catch (err) {
    logger.error('Error queuing scorecard prompts:', err);
  }
}
```

2. **In `setNextMapToOngoing()`** (around line 438) — after `await db.run(updateQuery, [nextMap.id])`, add alongside the existing `queueMapCodePMsForNext` call:
```typescript
// Queue scorecard prompts for the next map
try {
  await queueScorecardPrompts(matchId, nextMap.id, nextMap.map_name || '');
} catch (scorecardError) {
  logger.error('Error queuing scorecard prompts for next map:', scorecardError);
}
```

### Add `queueStatsAggregation()` helper:

```typescript
async function queueStatsAggregation(matchId: string): Promise<void> {
  const db = await getDbInstance();
  const statsSettings = await db.get<{ enabled: number }>('SELECT enabled FROM stats_settings WHERE id = 1');
  if (!statsSettings?.enabled) return;

  const count = await db.get<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM scorecard_submissions WHERE match_id = ? AND review_status IN ('approved', 'auto_approved')",
    [matchId]
  );
  if (!count || count.cnt === 0) return;

  const queueId = `stats_image_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  await db.run('INSERT INTO stats_image_queue (id, match_id, status) VALUES (?, ?, ?)', [queueId, matchId, 'pending']);
  logger.debug(`📊 Stats aggregation queued for completed match ${matchId}`);
}
```

### Call `queueStatsAggregation()` on match completion:

In `updateMatchStatusIfComplete()` (around line 767), after `await queueDiscordDeletion(matchId)`:

```typescript
// Queue stats aggregation and image generation
try {
  await queueStatsAggregation(matchId);
} catch (statsError) {
  logger.error('Error queuing stats aggregation:', statsError);
}
```

---

## Phase 11: Settings Page UI

- [x] **Create `src/app/settings/stats/page.tsx`**

Use the `frontend-design` skill. Follow the pattern of existing settings pages.

**Layout — Two cards:**

**Card 1: General Settings**
- Toggle: Enable Stats Feature (`enabled`)
- Toggle: Require Both Sides (`both_sides_required`)
  - Description: "Both team commanders must submit scorecards. If stats match, the map auto-advances."
- Toggle: Auto-Advance on Match (`auto_advance_on_match`)
  - Description: "Automatically progress to next map when submitted scorecards agree."

**Card 2: AI Provider**
- Section header: "Configure AI model for scorecard analysis"
- Anthropic / Claude card:
  - Status indicator (configured/not configured based on API key being '***configured***')
  - API Key input (password field, show current state)
  - Model selector dropdown: `claude-sonnet-4-20250514`, `claude-haiku-4-5-20251001`
  - Test button: sends GET to `/api/settings/stats` to verify key is set (or a test endpoint)

**Save button** at bottom — PUT to `/api/settings/stats`

Load initial data with `useEffect` → `fetch('/api/settings/stats')` on mount.

### Add to settings index

- [x] **Modify `src/app/settings/page.tsx`**

Add `IconChartBar` to the import from `@tabler/icons-react` (line 12).

Add to `settingsCategories` array (after the Backup & Restore entry, around line 57):
```typescript
{
  title: 'Stats',
  description: 'Configure AI-powered scorecard analysis and stat tracking',
  href: '/settings/stats',
  icon: IconChartBar,
  color: '#e74c3c',
},
```

---

## Phase 12: Scorecard Upload on Scoring Page

### Upload component

- [x] **Create `src/components/scoring/ScorecardUpload.tsx`**

```typescript
interface ScorecardUploadProps {
  matchId: string;
  matchGameId: string;
  onUploadComplete: (submissionId: string) => void;
}
```

- Drag-and-drop or click-to-upload (reuse pattern from `src/components/create-match/EventImageUpload.tsx`)
- Team side selector (blue/red buttons or radio)
- Upload button that POSTs FormData to `/api/matches/{matchId}/scorecard`
- Loading spinner during upload
- Success notification with link to review page (`/matches/{matchId}/stats`)

### Integrate into scoring page

- [x] **Modify `src/components/scoring/SimpleMapScoring.tsx`**

1. On mount, fetch game stats: `GET /api/games/{gameId}/stats`
2. Also fetch stats settings: `GET /api/settings/stats` to check `enabled`
3. If game has stat definitions AND stats feature is enabled:
   - Show "Upload Scorecard" button alongside the existing team winner buttons for the current ongoing map
   - When clicked, show `ScorecardUpload` component (modal or inline)
   - After upload, show notification with link to review page
4. If game has no stat definitions OR stats not enabled, show nothing extra (existing behavior preserved)

---

## Phase 13: Stats Review Page

### Review page

- [x] **Create `src/app/matches/[matchId]/stats/page.tsx`**

Layout:
```
[Back button → /matches/{matchId}] [Match name + game icon]
[Map selector tabs/pills — one per match_game]
[Submission selector — if multiple submissions per map]
[Screenshot image — centered, max-width ~800px]
[Blue Team column]                    [Red Team column]
  ┌─────────────────────┐    ┌─────────────────────┐
  │ Player Card          │    │ Player Card          │
  │ Extracted: "Phr4nk"  │    │ Extracted: "xBlaze"  │
  │ Hero: Mercy          │    │ Hero: Iron Man       │
  │ K:2 D:5 A:12 Dmg:3k │    │ K:15 D:3 A:8 Dmg:22k│
  │ Assign: [Dropdown ▼] │    │ Assign: [Dropdown ▼] │
  │ Confidence: 95%      │    │ Confidence: 88%      │
  └─────────────────────┘    └─────────────────────┘
[Approve All] [Reject] buttons
```

### Components

- [x] **Create `src/components/stats/StatsReviewPanel.tsx`**
  - Main review layout component
  - Fetches submission data from `/api/matches/{matchId}/scorecard?matchGameId=X`
  - Map selector tabs (one per match game)
  - Manages assignment state
  - Approve/reject buttons that PUT to `.../review`

- [x] **Create `src/components/stats/PlayerStatCard.tsx`**
  - Extracted player name + hero
  - Stat values displayed per stat definition (fetched from `/api/games/{gameId}/stats`)
  - Assignment dropdown: lists match participants from `/api/matches/{matchId}/participants`, pre-selected if auto-assigned
  - Confidence badge: green (>0.8), yellow (>0.5), red (<0.5)
  - On dropdown change: PUT to `.../assign` with the assignment

- [x] **Create `src/components/stats/SubmissionViewer.tsx`**
  - Displays the screenshot image from `screenshot_url`
  - Click to expand/zoom

### Link from match detail page

- [ ] **Modify `src/app/matches/[matchId]/page.tsx`** or `src/components/match-details/MatchContentPanel.tsx`
  - Fetch `/api/matches/{matchId}/scorecard` on mount
  - If any submissions exist, show "Review Stats" button
  - Button navigates to `/matches/{matchId}/stats`

---

## Phase 14: Both-Sides Validation + Auto-Advance

This logic lives in `processes/stats-processor/modules/ai-extractor.ts` (already specified in Phase 7).

- [ ] **Implement `checkBothSidesAndAutoAdvance()` fully**

Key logic:
1. If `both_sides_required` is false, skip entirely
2. Need both `team_side = 'blue'` AND `team_side = 'red'` completed submissions for same `matchGameId`
3. Compare extracted player stats between the two submissions
4. Match players by `team_side` and normalized `extracted_player_name`
5. Compare numeric stat values — must be exact match for integers
6. If all match → set both `review_status = 'auto_approved'`
7. If `auto_advance_on_match` AND `gameResult.winner` extracted → call `saveMatchResult()`
8. If mismatch → leave both as `review_status = 'pending'`, log discrepancies

Edge cases:
- [ ] Handle different winners extracted from each side (flag for manual review)
- [ ] Handle one side having more/fewer players than expected

---

## Phase 15: End-of-Match Stats + Discord Images

### Stats aggregation

Handled in `stat-image-generator.ts` when processing `stats_image_queue`:

- [ ] Load all `scorecard_player_stats` WHERE match_id AND submission `review_status IN ('approved', 'auto_approved')`
- [ ] Group by `participant_id`
- [ ] For each participant: sum numeric stats across all maps
- [ ] Upsert into `match_player_stats` (use `INSERT ... ON CONFLICT(match_id, participant_id) DO UPDATE`)

### Image generation

- [ ] Generate team comparison image (`public/uploads/stats/{matchId}/team.png`)
- [ ] Generate individual player images (`public/uploads/stats/{matchId}/{participantId}.png`)

### Discord sending

- [ ] Add `send_stat_images` handler to `processes/discord-bot/modules/queue-processor.ts`
  - Mechanism: use the `stats_image_queue` status or a separate column to signal "images ready, send to Discord"
  - Send team image to channels with `send_match_start = 1` flag
  - DM individual stat images to players who have `discord_user_id`
  - Update `match_player_stats.stat_image_sent = 1`

---

## Phase 16: Error Handling + Edge Cases

### AI extraction failures

- [ ] Retry logic in stats-processor: up to 3 retries with 30s/60s/120s backoff
  - Track `retry_count` in `stats_processing_queue`
  - On retry: set `ai_extraction_status = 'retrying'`, re-queue
- [ ] On final failure: set `ai_extraction_status = 'failed'` with error message
- [ ] DM commander: "Failed to process scorecard. Please submit a clearer screenshot."
- [ ] Admin can see failed submissions on review page with "Retry" button (re-queues via POST)

### Non-reply DMs

- [ ] Bot checks if sender has pending `scorecard_dm_messages` entries
- [ ] If yes, reminds them to reply to the specific map message
- [ ] If no, ignores the message

### Games without stats.json

- [ ] `queueScorecardPrompts()` checks for stat definitions — returns early if none
- [ ] Scoring page checks `/api/games/{gameId}/stats` — hides upload if empty array
- [ ] Stats settings page still works regardless of game support

### Manual scoring still works

- [ ] Existing team winner selection in `SimpleMapScoring.tsx` continues to work
- [ ] Scorecard upload is additive, not a replacement
- [ ] Match can be scored entirely manually even if stats feature is enabled

### Commander never submits

- [ ] Not blocking — match commander can still score manually
- [ ] If screenshot arrives late (after manual scoring), it's still processed and stored

---

## Build Order (Dependencies)

```
Phase 1  (Migration)           ← no deps
Phase 2  (Game data + seeder)  ← Phase 1
Phase 3  (Types)               ← no deps
Phase 4  (Stats settings API)  ← Phase 1
Phase 5  (Game stats API)      ← Phase 1
Phase 6  (Scorecard APIs)      ← Phase 1, 3
Phase 7  (Stats processor)     ← Phase 1, 3, 6
Phase 8  (PM2/s6 config)       ← Phase 7
Phase 9  (Discord DM flow)     ← Phase 1, 3, 7
Phase 10 (Scoring integration) ← Phase 1
Phase 11 (Settings UI)         ← Phase 4
Phase 12 (Upload on scoring)   ← Phase 6
Phase 13 (Review page)         ← Phase 6, 3
Phase 14 (Both-sides logic)    ← Phase 7, 9
Phase 15 (End-of-match images) ← Phase 7, 9
Phase 16 (Error handling)      ← all phases
```

**Recommended execution order:**
1. Phases 1, 2, 3 first (parallel-safe)
2. Phases 4, 5, 6 next
3. Phases 7, 8
4. Phases 9, 10, 11, 12, 13 (mostly parallel)
5. Phases 14, 15, 16 last

---

## Critical Files Reference

| File | Action | Phase |
|------|--------|-------|
| `migrations/012_scorecard_stats.sql` | CREATE | 1 |
| `data/games/overwatch2/stats.json` | CREATE | 2 |
| `data/games/marvelrivals/stats.json` | CREATE | 2 |
| `data/games/overwatch2/game.json` | MODIFY (bump dataVersion 1.7.7→1.8.0) | 2 |
| `data/games/marvelrivals/game.json` | MODIFY (bump dataVersion 1.8.3→1.9.0) | 2 |
| `lib/database/seeder.ts` | MODIFY (add StatData interface, seedStats method, stats seeding in seedGame) | 2 |
| `shared/types.ts` | MODIFY (add 7 interfaces at end of file) | 3 |
| `src/app/api/settings/stats/route.ts` | CREATE | 4 |
| `src/app/api/games/[gameId]/stats/route.ts` | CREATE | 5 |
| `src/app/api/matches/[matchId]/scorecard/route.ts` | CREATE | 6 |
| `src/app/api/matches/[matchId]/scorecard/[submissionId]/route.ts` | CREATE | 6 |
| `src/app/api/matches/[matchId]/scorecard/[submissionId]/assign/route.ts` | CREATE | 6 |
| `src/app/api/matches/[matchId]/scorecard/[submissionId]/review/route.ts` | CREATE | 6 |
| `src/app/api/matches/[matchId]/stats/route.ts` | CREATE | 6 |
| `src/app/api/matches/[matchId]/stats/generate-images/route.ts` | CREATE | 6 |
| `processes/stats-processor/index.ts` | CREATE | 7 |
| `processes/stats-processor/modules/ai-extractor.ts` | CREATE | 7 |
| `processes/stats-processor/modules/stat-image-generator.ts` | CREATE | 7 |
| `esbuild.stats-processor.config.mjs` | CREATE | 7 |
| `package.json` | MODIFY (add scripts + @napi-rs/canvas dep) | 7 |
| `scripts/collect-process-deps.mjs` | MODIFY (add @napi-rs/canvas to PROCESS_DEPS) | 7 |
| `ecosystem.config.js` | MODIFY (add stats-processor entry) | 8 |
| `s6-overlay/s6-rc.d/stats-processor/*` | CREATE (5 files) | 8 |
| `processes/discord-bot/modules/scorecard-handler.ts` | CREATE | 9 |
| `processes/discord-bot/index.ts` | MODIFY (import, init, messageCreate, MessageContent intent, settings refresh) | 9 |
| `processes/discord-bot/modules/queue-processor.ts` | MODIFY (scorecard prompt queue, stat images) | 9 |
| `src/lib/scoring-functions.ts` | MODIFY (add queueScorecardPrompts, queueStatsAggregation, call sites) | 10 |
| `src/app/settings/stats/page.tsx` | CREATE | 11 |
| `src/app/settings/page.tsx` | MODIFY (add Stats card + IconChartBar import) | 11 |
| `src/components/scoring/ScorecardUpload.tsx` | CREATE | 12 |
| `src/components/scoring/SimpleMapScoring.tsx` | MODIFY (conditionally show upload) | 12 |
| `src/app/matches/[matchId]/stats/page.tsx` | CREATE | 13 |
| `src/components/stats/StatsReviewPanel.tsx` | CREATE | 13 |
| `src/components/stats/PlayerStatCard.tsx` | CREATE | 13 |
| `src/components/stats/SubmissionViewer.tsx` | CREATE | 13 |
| Match detail page (MatchContentPanel or page.tsx) | MODIFY (add Review Stats button) | 13 |

---

## Verification Checklist

### Build & Migrate
- [x] `npm run migrate` succeeds and creates all new tables
- [x] `sqlite3 ./app_data/data/matchexec.db "SELECT * FROM game_stat_definitions;"` shows OW2 + MR stats
- [x] `npx tsc --noEmit` passes
- [ ] `npm run build:stats-processor` succeeds
- [ ] `npm run build` (full Next.js build) succeeds
- [x] `npm run lint` passes

### Runtime
- [ ] `npm run dev:all` → `npx pm2 status` shows stats-processor running
- [ ] `curl http://localhost:3000/api/settings/stats` returns default settings
- [ ] `curl http://localhost:3000/api/games/overwatch2/stats` returns 6 stat definitions
- [ ] `curl http://localhost:3000/api/games/valorant/stats` returns empty array `[]`

### Integration
- [ ] Upload screenshot via web UI → scorecard submission created + processing queued
- [ ] Stats processor picks up queue → calls Claude API → stores extracted results
- [ ] Review page shows screenshot + extracted data correctly
- [ ] Assign players → approve → data saved
- [ ] Both-sides with matching stats → auto-approve works
- [ ] Both-sides with mismatching stats → flagged for review
- [ ] Match completes → stat images generated → sent to Discord
- [ ] Discord DM flow: bot prompts → commander replies → screenshot processed
- [ ] Manual scoring still works independently when stats enabled
- [ ] Games without stats.json show no stats UI

### Docker
```bash
docker build -t matchexec:stats-test .
docker run --rm -p 3000:3000 --env-file .env matchexec:stats-test
# Verify stats-processor starts in s6 logs
```
