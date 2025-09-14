# Tournament System Implementation Guide

## Context & Design Summary

The MatchExec application currently supports individual matches with a flow of: `created` → `gather` → `assign` → `battle` → `complete`. We're extending this to support tournaments that orchestrate multiple matches using the same infrastructure.

### Key Design Decisions:
- Tournaments reuse existing match status flow and Discord integration
- Tournament matches are regular matches with `tournament_id` set
- Teams have custom names that persist throughout tournament
- Individual matches still use red/blue for display
- Double elimination with finals reset scenario support
- Manual bracket seeding and progression (admin controlled)
- Auto-assigned random maps/modes for tournament matches

### Database Design:
```sql
CREATE TABLE tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  format TEXT NOT NULL, -- 'single-elimination', 'double-elimination'
  status TEXT NOT NULL DEFAULT 'created',
  game_id TEXT NOT NULL,
  rounds_per_match INTEGER NOT NULL,
  max_participants INTEGER,
  start_date DATETIME,
  start_time DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE TABLE tournament_teams (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

CREATE TABLE tournament_team_members (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES tournament_teams(id) ON DELETE CASCADE,
  UNIQUE(team_id, user_id)
);

-- Extensions to existing matches table:
ALTER TABLE matches ADD COLUMN tournament_id TEXT REFERENCES tournaments(id);
ALTER TABLE matches ADD COLUMN bracket_type TEXT; -- 'winners', 'losers', 'final'
ALTER TABLE matches ADD COLUMN bracket_round INTEGER;
ALTER TABLE matches ADD COLUMN red_team_id TEXT REFERENCES tournament_teams(id);
ALTER TABLE matches ADD COLUMN blue_team_id TEXT REFERENCES tournament_teams(id);
```

## Implementation Prompts

### Phase 1: Database & Types Foundation

**Prompt 1: Create Database Migration**
```
Create a new database migration file (005_tournament_system.sql) that:
1. Creates the tournaments, tournament_teams, and tournament_team_members tables
2. Adds tournament_id, bracket_type, bracket_round, red_team_id, blue_team_id columns to matches table
3. Includes appropriate indexes for performance
4. Follows the existing migration pattern in the codebase
```

**Prompt 2: Update Shared Types**
```
Update /shared/types.ts to include:
1. Tournament interface with all fields from database schema
2. TournamentTeam interface
3. TournamentTeamMember interface
4. Update Match interface to include new tournament-related fields
5. Add tournament status types and constants (similar to MATCH_FLOW_STEPS)
6. Add tournament format types ('single-elimination', 'double-elimination')
```

### Phase 2: API Endpoints

**Prompt 3: Create Tournament API Endpoints**
```
Create /src/app/api/tournaments/route.ts with:
1. GET endpoint to fetch all tournaments (with game info joined)
2. POST endpoint to create new tournaments
3. Follow existing patterns from /src/app/api/matches/route.ts
4. Support filtering by status (similar to matches)
5. Return tournaments with parsed JSON fields
```

**Prompt 4: Create Individual Tournament API**
```
Create /src/app/api/tournaments/[tournamentId]/route.ts with:
1. GET endpoint to fetch single tournament with teams and members
2. DELETE endpoint to delete tournament
3. Follow existing pattern from /src/app/api/matches/[matchId]/route.ts
4. Include proper error handling
```

**Prompt 5: Create Tournament Teams API**
```
Create /src/app/api/tournaments/[tournamentId]/teams/route.ts with:
1. GET endpoint to fetch all teams for a tournament
2. POST endpoint to create new team
3. PUT endpoint to update team assignments
4. DELETE endpoint to remove team
5. Handle team member assignments
```

**Prompt 6: Create Tournament Transition API**
```
Create /src/app/api/tournaments/[tournamentId]/transition/route.ts with:
1. POST endpoint to transition tournament status
2. Handle transitions: created → gather → assign → battle → complete
3. When transitioning to battle, validate teams are assigned
4. Follow existing pattern from /src/app/api/matches/[matchId]/transition/route.ts
```

### Phase 3: Navigation & Basic UI

**Prompt 7: Add Tournament Navigation**
```
Update /src/components/navigation.tsx to:
1. Add "Tournaments" section under "Matches" with nested links
2. Include "History" sub-link for tournaments (similar to matches)
3. Use appropriate icons (IconTournament already imported)
4. Update navigationItems array following existing patterns
```

**Prompt 8: Create Tournament Pages Structure**
```
Create the following page files following existing patterns:
1. /src/app/tournaments/page.tsx - main tournament dashboard
2. /src/app/tournaments/history/page.tsx - tournament history
3. /src/app/tournaments/create/page.tsx - create tournament form
4. Follow the structure and patterns from the matches pages
```

### Phase 4: Tournament Creation

**Prompt 9: Create Tournament Creation Form**
```
Create /src/components/create-tournament-page.tsx similar to create-match-page.tsx with:
1. Multi-step form: Select Game → Event Info → Team Settings → Review
2. Event Info step: name, description, date, time, format selection, rounds per match
3. Team Settings: max participants (no map selection)
4. Reuse game selection from existing match creation
5. Handle form validation and submission to API
6. No maps selection - will be auto-assigned later
```

### Phase 5: Tournament Dashboard

**Prompt 10: Create Tournament Dashboard**
```
Create /src/components/tournament-dashboard.tsx similar to match-dashboard.tsx with:
1. Tournament cards showing: name, game, format, status, participant count
2. Status-based action buttons (Start Signups, Close Signups, etc.)
3. Search and filtering functionality
4. Tournament creation button
5. Auto-refresh functionality
6. Follow existing patterns from match dashboard
```

**Prompt 11: Create Tournament Card Component**
```
Create tournament card component (similar to MatchCard in match-dashboard.tsx) with:
1. Tournament info display: name, game, format, progress ring
2. Status-specific action buttons
3. Participant count vs max participants
4. Start date/time display
5. Hover effects and responsive design
6. Click to view tournament details
```

### Phase 6: Tournament Details & Team Management

**Prompt 12: Create Tournament Details Modal**
```
Create tournament details modal (similar to MatchDetailsModal) with tabs:
1. Overview tab: basic tournament info, participants list
2. Teams tab: show formed teams and members
3. Bracket tab: show tournament bracket (initially empty)
4. Handle tournament deletion and editing
5. Show tournament-specific actions based on status
```

**Prompt 13: Modify Assign Players Modal for Teams**
```
Modify /src/components/assign-players-modal.tsx to support tournaments:
1. When used for tournaments, show unlimited custom team columns
2. Add "+" button to create new teams with custom names
3. Keep Reserve column, replace Red/Blue with custom team columns
4. Support drag & drop between team columns
5. Save team assignments to tournament_teams and tournament_team_members tables
6. Add props to differentiate between match and tournament modes
```

### Phase 7: Bracket System

**Prompt 14: Create Bracket Visualization Component**
```
Create /src/components/tournament-bracket.tsx with:
1. Tree view: traditional tournament bracket display
2. List view: simple "Round 1", "Round 2" format
3. Toggle between tree and list views
4. Show team names, match results, progression
5. Support both single and double elimination formats
6. Responsive design for mobile/desktop
```

**Prompt 15: Create Bracket Assignment UI**
```
Create bracket assignment functionality in tournament assign phase:
1. Visual bracket with empty slots for teams
2. Drag & drop team assignment (desktop)
3. Dropdown selectors for each bracket slot (mobile)
4. "Generate First Matches" button with confirmation dialog
5. Show warning about bracket lock after generation
6. Validate all positions filled before allowing generation
```

### Phase 8: Match Generation & Tournament Progression

**Prompt 16: Create Tournament Match Generation System**
```
Create /src/lib/tournament-bracket.ts with functions to:
1. Generate first round matches based on team assignments
2. Calculate required matches for single/double elimination
3. Auto-assign random maps/modes to generated matches
4. Set tournament start time for all first round matches
5. Create Match records with tournament_id, bracket info
6. Handle single elimination bracket structure
```

**Prompt 17: Implement Double Elimination Logic**
```
Extend tournament bracket system to support double elimination:
1. Generate winner's bracket and loser's bracket matches
2. Handle teams dropping from winner's to loser's bracket
3. Generate loser's bracket matches when teams lose
4. Handle finals reset scenario (loser's bracket winner vs winner's bracket winner)
5. Calculate proper bracket progression for double elimination
```

**Prompt 18: Create Tournament Progression System**
```
Create tournament progression functionality:
1. "Generate Next Round" button on tournament cards
2. Check if current round matches are complete
3. Generate next round matches based on winners
4. Handle bracket advancement logic
5. Auto-complete tournament when final match ends
6. Support manual admin control over progression
```

### Phase 9: Integration & Polish

**Prompt 19: Integrate Tournament Matches with Existing System**
```
Update existing match system to handle tournament matches:
1. Modify match dashboard to show tournament context
2. Update match details to show tournament info
3. Ensure Discord announcements work for tournament matches
4. Handle team name display in match interface (show custom names)
5. Update match scoring to consider tournament progression
```

**Prompt 20: Create Tournament History Page**
```
Create tournament history page similar to match history:
1. Show completed tournaments
2. Filter and search functionality  
3. Tournament results and bracket views
4. Link to view final brackets and results
5. Follow patterns from /src/app/matches/history/page.tsx
```

### Phase 10: Testing & Refinement

**Prompt 21: Test Tournament Flow End-to-End**
```
Test complete tournament flow:
1. Create tournament → signups → team assignment → bracket generation
2. Play through tournament matches → score matches → progress rounds
3. Test single elimination complete flow
4. Test double elimination with finals reset scenario
5. Verify Discord integration works with tournament matches
6. Test error handling and edge cases
```

**Prompt 22: Polish and Bug Fixes**
```
Final polish pass:
1. Review UI consistency with existing match system
2. Add loading states and error handling
3. Optimize performance for large tournaments
4. Add helpful user messages and confirmation dialogs
5. Test responsive design on mobile/tablet
6. Review and fix any TypeScript errors
7. Update any documentation as needed
```

## Key Files to Reference During Implementation

- **Database**: `/migrations/001_core_schema_and_matches.sql` - existing schema patterns
- **Types**: `/shared/types.ts` - existing match/game types
- **API Patterns**: `/src/app/api/matches/route.ts` - REST endpoint patterns  
- **UI Components**: `/src/components/match-dashboard.tsx` - dashboard patterns
- **Forms**: `/src/components/create-match-page.tsx` - multi-step form patterns
- **Modals**: `/src/components/assign-players-modal.tsx` - drag & drop patterns
- **Navigation**: `/src/components/navigation.tsx` - menu structure

## Implementation Notes

1. **Reuse First**: Always look for existing patterns and components to reuse
2. **Progressive Enhancement**: Start with basic functionality, add complexity gradually
3. **Type Safety**: Keep TypeScript strict throughout implementation
4. **Error Handling**: Follow existing error handling patterns
5. **Performance**: Consider database indexes and query optimization
6. **Testing**: Test each phase before moving to the next
7. **Mobile First**: Ensure responsive design throughout

## Expected Implementation Order

Implement in the exact order of prompts above. Each prompt builds on the previous ones and follows a logical progression from database → API → UI → complex features → polish.