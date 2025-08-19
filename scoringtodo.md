# Scoring System Implementation Todo

## Overview
Comprehensive todo list for implementing format-aware, mode-specific scoring system for MatchExec Match Bot.

## Data & Configuration Tasks

### data-1: Create Valorant game data (game.json, modes.json, maps.json)
- [ ] Use the Valorant Wiki for game mode and scoring info https://valorant.fandom.com/wiki/Game_Modes
- [ ] Create `/data/games/valorant/` directory
- [ ] Add `game.json` with Valorant metadata
- [ ] Create `modes.json` with Valorant game modes (Unrated, Competitive, Spike Rush, etc.)
- [ ] Add `maps.json` with Valorant map data

### data-2: Add Valorant scoring types to scoring.json reference
- [ ] Update `/data/scoring.json` with Valorant-specific scoring types
- [ ] Document round-based scoring with economy system
- [ ] Add format variants for different Valorant modes

### data-3: Update all existing modes.json files (overwatch2, marvelrivals) with scoringTiming and format variants
- [ ] Update `/data/games/overwatch2/modes.json` with `scoringTiming` field
- [ ] Add `formatVariants` for casual vs competitive
- [ ] Update `/data/games/marvelrivals/modes.json` with timing and format data

### data-4: Add competitive vs casual scoring variants to all game modes
- [ ] Define casual scoring rules for all modes
- [ ] Define competitive scoring rules for all modes
- [ ] Document differences in round counts, win conditions

### data-5: Update scoring.json reference with format-specific examples
- [ ] Add examples showing casual vs competitive scoring
- [ ] Document format-specific win conditions
- [ ] Create comprehensive reference for developers

## Schema & Database Tasks

### schema-1: Update scoring config schema to include scoringTiming and formatVariants
- [ ] Define TypeScript interfaces for new scoring schema
- [ ] Update existing scoring config validation
- [ ] Document schema changes

### schema-2: Create database migration to add match_format column to matches table
- [ ] Write migration file `041_add_match_format.sql`
- [ ] Add `match_format` column (casual/competitive)
- [ ] Update existing matches with default format

### schema-3: Update match creation UI to capture competitive/casual format selection
- [ ] Add format selection to match creation form
- [ ] Create format toggle/radio buttons
- [ ] Update form validation for format selection

## Architecture Tasks

### arch-1: Create TypeScript interfaces for format-aware scoring (CasualScore, CompetitiveScore)
- [ ] Define base scoring interfaces
- [ ] Create format-specific score types
- [ ] Add type safety for scoring operations

### arch-2: Design component hierarchy: ScoringModal > FormatDetector > TimingDetector > ScoringForm
- [ ] Plan component structure and data flow
- [ ] Define props and state management
- [ ] Create component interaction patterns

## Modal & Core Components

### modal-1: Build base ScoringModal component with Mantine Modal
- [ ] Create modal component with proper styling
- [ ] Add modal open/close functionality
- [ ] Integrate with Mantine UI library

### modal-2: Create format and timing detection logic from match and mode data
- [ ] Build logic to determine scoring format from match data
- [ ] Implement timing detection (realtime vs endgame)
- [ ] Handle edge cases and fallbacks

### modal-3: Add format indicator in modal header (Casual/Competitive)
- [ ] Display current match format prominently
- [ ] Style format indicator appropriately
- [ ] Ensure accessibility

## Real-time Scoring Components

### realtime-1: Build RealTimeScoring for modes allowing mid-game scoring
- [ ] Create component for round-by-round scoring
- [ ] Handle Control, Domination, Valorant modes
- [ ] Implement live score updates

### realtime-2: Add format-aware round limits (e.g., Control: casual=3 rounds, comp=5 rounds)
- [ ] Implement dynamic round generation
- [ ] Validate round limits based on format
- [ ] Handle round completion logic

### realtime-3: Create round-by-round input with dynamic round generation
- [ ] Build round input interface
- [ ] Add round winner selection
- [ ] Handle round progression

### realtime-4: Add current round indicator with format-specific progression
- [ ] Show current round vs total rounds
- [ ] Visual progress indication
- [ ] Format-aware round labeling

## End-game Scoring Components

### endgame-1: Build EndGameScoring for modes scored only at completion
- [ ] Create final score input interface
- [ ] Handle Escort, Push, Convoy, etc. modes
- [ ] Simple winner determination

### endgame-2: Create format-aware final score validation (different win thresholds)
- [ ] Implement format-specific validation rules
- [ ] Different win conditions for casual vs competitive
- [ ] Score range validation

### endgame-3: Add essential mode-specific fields based on format
- [ ] Conditional fields based on game mode
- [ ] Format-specific scoring details
- [ ] Keep interface minimal but complete

## Shared Components

### shared-1: Create WinnerSelector component (Team 1/Team 2/Draw)
- [ ] Build reusable winner selection component
- [ ] Visual winner indication
- [ ] Handle draw/tie scenarios

### shared-2: Build FormatAwareScoreInput with dynamic validation rules
- [ ] Create input component with format-based validation
- [ ] Dynamic min/max values
- [ ] Real-time validation feedback

### shared-3: Create RoundIndicator component for multi-round modes with format limits
- [ ] Visual round progression indicator
- [ ] Format-aware round counting
- [ ] Responsive design

### shared-4: Build FormatBadge component to display match format
- [ ] Visual format indicator badge
- [ ] Consistent styling across app
- [ ] Accessibility features

## Database Operations

### db-1: Create getMatchFormatConfig() to combine match format + mode scoring config
- [ ] Build function to fetch match-specific scoring rules
- [ ] Combine format and mode configurations
- [ ] Handle missing/invalid data

### db-2: Build saveMatchScore() with format-aware JSON structure
- [ ] Create score persistence function
- [ ] Format-aware JSON serialization
- [ ] Handle different scoring structures

### db-3: Create getMatchScore() for displaying format-specific scores
- [ ] Build score retrieval function
- [ ] Format-aware deserialization
- [ ] Handle legacy score data

### db-4: Update match creation logic to store selected format
- [ ] Modify match creation to capture format
- [ ] Update database insertion logic
- [ ] Validate format selection

## User Interface Tasks

### ui-1: Add format selection to match creation form (Casual/Competitive toggle)
- [ ] Add format selection UI to match creation
- [ ] Clear labeling and descriptions
- [ ] Form validation for format

### ui-2: Add Score button to match games with format-aware modal trigger
- [ ] Add scoring button to match interface
- [ ] Pass format context to modal
- [ ] Handle different game states

### ui-3: Create format-aware score display component for completed games
- [ ] Display scores with format context
- [ ] Show format-specific details
- [ ] Handle different score structures

### ui-4: Add score editing capability with format validation
- [ ] Allow score editing for completed games
- [ ] Format-aware validation during editing
- [ ] Permission checking for edits

## Validation Tasks

### validation-1: Implement format-aware score validation (different limits per format)
- [ ] Create validation rules for each format
- [ ] Dynamic validation based on mode and format
- [ ] User-friendly error messages

### validation-2: Add winner consistency validation for format-specific rules
- [ ] Ensure winner matches score data
- [ ] Format-specific winner determination
- [ ] Handle edge cases and ties

### validation-3: Create round limit validation based on format selection
- [ ] Validate round counts against format rules
- [ ] Prevent invalid round configurations
- [ ] Clear validation messaging

## State Management

### state-1: Setup form state management with format and timing context
- [ ] Create context for scoring state
- [ ] Handle format and timing state
- [ ] Efficient state updates

### state-2: Add loading and error states for format-aware operations
- [ ] Loading states for database operations
- [ ] Error handling and user feedback
- [ ] Retry logic for failed operations

## Integration Tasks

### integration-1: Update match_games table with format-aware winner determination
- [ ] Update winner determination logic
- [ ] Format-specific winner calculation
- [ ] Database consistency

### integration-2: Update match status progression based on format-specific completion
- [ ] Match progression logic
- [ ] Format-aware completion detection
- [ ] Status updates

## Documentation

### examples-1: Document scoring examples for each format variant
- [ ] Create comprehensive scoring examples
- [ ] Document edge cases and special rules
- [ ] Developer and user documentation

---

## Implementation Priority

1. **Phase 1**: Data & Schema (data-*, schema-*)
2. **Phase 2**: Core Architecture (arch-*, modal-*)
3. **Phase 3**: Scoring Components (realtime-*, endgame-*, shared-*)
4. **Phase 4**: Database & UI Integration (db-*, ui-*)
5. **Phase 5**: Validation & Polish (validation-*, state-*, integration-*)

## Notes

- Focus on MVP functionality first
- Format variants can be added incrementally
- Testing can be added after core functionality
- Keep user experience simple despite complex backend logic