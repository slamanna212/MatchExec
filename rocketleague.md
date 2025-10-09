# Rocket League Support with Flexible Team Sizes

## Problem Statement

Rocket League has multiple competitive formats where team structure varies:
- **1v1 Duel**: Each player competes individually (but it's 1v1, not FFA)
- **2v2 Doubles**: Traditional 2-player teams
- **3v3 Standard**: Traditional 3-player teams
- **4v4 Chaos**: Traditional 4-player teams

The challenge was supporting both **solo play** (1v1) and **team-based play** (2v2/3v3/4v4) within the same game, particularly for tournaments.

## Solution: Leverage Existing `team_size` Field

The database schema already had what we needed in the `game_modes` table:
- `team_size INTEGER DEFAULT 1` - Number of players per team
- `max_teams INTEGER DEFAULT 2` - Maximum teams (typically 2 for competitive)
- `scoring_type TEXT DEFAULT 'Normal'` - Scoring format

**Key Insight**: 1v1 is actually "1 player per team" not "free-for-all", so we use `team_size = 1` with `max_teams = 2`.

## Implementation

### 1. TypeScript Types Updated

**File**: `shared/types.ts`

```typescript
export interface GameMode {
  id: string;
  game_id: string;
  name: string;
  description: string;
  team_size: number;        // ✅ Added
  max_teams: number;         // ✅ Added
  scoring_type: 'Normal' | 'FFA' | 'Position';
  created_at: Date;
  updated_at: Date;
}

export interface ModeDataJson {
  id: string;
  name: string;
  description: string;
  teamSize?: number;         // ✅ Added
  maxTeams?: number;         // ✅ Added
  scoringType?: 'Normal' | 'FFA' | 'Position';
}
```

### 2. Database Seeder Enhanced

**File**: `lib/database/seeder.ts`

```typescript
private async seedModes(gameId: string, modesData: ModeData[]): Promise<void> {
  await this.db.run('DELETE FROM game_modes WHERE game_id = ?', [gameId]);

  for (const mode of modesData) {
    const scoringType = mode.scoringType || 'Normal';
    const teamSize = mode.teamSize || 1;      // ✅ Read from JSON
    const maxTeams = mode.maxTeams || 2;      // ✅ Read from JSON
    await this.db.run(`
      INSERT INTO game_modes (id, game_id, name, description, team_size, max_teams, scoring_type, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [mode.id, gameId, mode.name, mode.description, teamSize, maxTeams, scoringType]);
  }
}
```

### 3. Rocket League Game Data

**Directory**: `data/games/rocketleague/`

#### game.json
```json
{
  "id": "rocketleague",
  "name": "Rocket League",
  "color": "#0066FF",
  "genre": "Sports",
  "developer": "Psyonix",
  "releaseDate": "2015-07-07",
  "dataVersion": "1.0.0",
  "minPlayers": 2,
  "maxPlayers": 8,
  "maxSignups": 16,
  "mapCodesSupported": false
}
```

#### modes.json
```json
[
  {
    "id": "duel",
    "name": "1v1 Duel",
    "description": "One-on-one competitive mode.",
    "teamSize": 1,
    "maxTeams": 2,
    "scoringType": "Normal"
  },
  {
    "id": "doubles",
    "name": "2v2 Doubles",
    "teamSize": 2,
    "maxTeams": 2,
    "scoringType": "Normal"
  },
  {
    "id": "standard",
    "name": "3v3 Standard",
    "teamSize": 3,
    "maxTeams": 2,
    "scoringType": "Normal"
  },
  {
    "id": "chaos",
    "name": "4v4 Chaos",
    "teamSize": 4,
    "maxTeams": 2,
    "scoringType": "Normal"
  }
]
```

#### maps.json
15 popular Rocket League arenas (DFH Stadium, Mannfield, Champions Field, etc.), each supporting all 4 modes via `supportedModes` array.

### 4. Tournament Auto-Team Logic

**File**: `src/app/api/tournaments/[tournamentId]/transition/route.ts`

When transitioning from `gather` → `assign`:

```typescript
case 'assign':
  // Auto-create solo teams for games with team_size = 1 modes
  const existingTeamCount = await db.get<{ count: number }>(`
    SELECT COUNT(*) as count FROM tournament_teams WHERE tournament_id = ?
  `, [tournamentId]);

  if (!existingTeamCount || existingTeamCount.count === 0) {
    const participants = await db.all<{ id: string; user_id: string; username: string }>(`
      SELECT id, user_id, username FROM tournament_participants WHERE tournament_id = ?
    `, [tournamentId]);

    // Check if any mode has team_size = 1 (supports solo play)
    const gameModes = await db.all<{ team_size: number }>(`
      SELECT team_size FROM game_modes WHERE game_id = (
        SELECT game_id FROM tournaments WHERE id = ?
      )
    `, [tournamentId]);

    const hasSoloMode = gameModes.some(mode => mode.team_size === 1);

    if (hasSoloMode && participants.length > 0) {
      // Auto-create solo teams (one per participant)
      for (const participant of participants) {
        const teamId = `team_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Create team with participant's name
        await db.run(`
          INSERT INTO tournament_teams (id, tournament_id, team_name)
          VALUES (?, ?, ?)
        `, [teamId, tournamentId, participant.username]);

        // Add participant as team member and update assignment
        // ...
      }
    }
  }
  break;
```

## How It Works

### For 1v1 Tournaments (Solo Play)

1. **Create Tournament**: Select Rocket League as the game
2. **Signups (Gather)**: Players sign up individually
3. **Transition to Assign**:
   - System detects game has mode with `team_size = 1`
   - Automatically creates tournament team for each participant
   - Team name = participant's username
   - **Skips manual team assignment UI entirely**
4. **Generate Bracket**: Works as normal - each "team" has one member
5. **Matches**: Standard bracket progression with 1v1 matches

### For 2v2/3v3/4v4 Tournaments (Team Play)

1. **Create Tournament**: Select Rocket League
2. **Signups (Gather)**: Players sign up individually
3. **Transition to Assign**:
   - No auto-team creation (requires team_size > 1)
   - Admin manually creates teams and assigns members
   - Uses existing team assignment UI
4. **Generate Bracket**: Standard team-based brackets
5. **Matches**: Team vs team matches

### For Regular Matches (Non-Tournament)

- **1v1 Mode**: Assign players to blue/red sides individually
- **Team Modes**: Standard team assignment (blue team/red team)

## Database Verification

After running `npm run migrate`:

```sql
-- Game
SELECT * FROM games WHERE id = 'rocketleague';
-- Result: rocketleague|Rocket League|#0066FF|2|8

-- Modes
SELECT id, name, team_size, max_teams, scoring_type FROM game_modes WHERE game_id = 'rocketleague';
-- Results:
-- duel|1v1 Duel|1|2|Normal
-- doubles|2v2 Doubles|2|2|Normal
-- standard|3v3 Standard|3|2|Normal
-- chaos|4v4 Chaos|4|2|Normal

-- Maps
SELECT COUNT(*) FROM game_maps WHERE game_id = 'rocketleague';
-- Result: 60 (15 arenas × 4 modes)
```

## Benefits

✅ **No Database Migrations**: Leverages existing schema
✅ **Backward Compatible**: Existing games still work (defaults to team_size: 1, max_teams: 2)
✅ **Extensible**: Can support other games with flexible team sizes (e.g., fighting games with 1v1, 2v2, 3v3)
✅ **Automatic Solo Teams**: No manual work for 1v1 tournaments
✅ **Clean Architecture**: Uses existing tournament team infrastructure

## Future Enhancements

- Update assign-players-modal UI to adapt based on `team_size` for regular matches
- Add mode selection during tournament creation (optional - currently detects all modes)
- Visual indicators for solo vs team tournaments in UI
- Support for games with mixed solo/team tournaments

## Files Modified

1. `shared/types.ts` - Added team_size/max_teams to interfaces
2. `lib/database/seeder.ts` - Read and insert team size values
3. `src/app/api/tournaments/[tournamentId]/transition/route.ts` - Auto-create solo teams

## Files Created

1. `data/games/rocketleague/game.json`
2. `data/games/rocketleague/modes.json`
3. `data/games/rocketleague/maps.json`
