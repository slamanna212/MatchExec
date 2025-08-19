# Scoring System Examples

This document provides comprehensive examples of how the scoring system works for each game mode and format variant.

## Valorant Scoring Examples

### Standard Mode - Casual Format
- **Max Rounds**: 13 (first to 7 wins)
- **Overtime**: Disabled
- **Winner Determination**: First team to win 7 rounds

**Example Score**:
```json
{
  "scoringType": "rounds",
  "format": "casual",
  "currentRound": 13,
  "maxRounds": 13,
  "team1Rounds": 7,
  "team2Rounds": 6,
  "winner": "team1",
  "rounds": [
    {"round": 1, "winner": "team1"},
    {"round": 2, "winner": "team2"},
    {"round": 3, "winner": "team1"}
    // ... up to round 13
  ]
}
```

### Standard Mode - Competitive Format
- **Max Rounds**: 13 (first to 7 wins)
- **Overtime**: Enabled with "firstTo2Lead"
- **Winner Determination**: First team to win 7 rounds OR first to lead by 2 in overtime

**Example Overtime Score**:
```json
{
  "scoringType": "rounds",
  "format": "competitive",
  "currentRound": 16,
  "maxRounds": 13,
  "team1Rounds": 8,
  "team2Rounds": 6,
  "winner": "team1",
  "overtime": {
    "enabled": true,
    "rounds": [
      {"round": 14, "winner": "team1"},
      {"round": 15, "winner": "team2"},
      {"round": 16, "winner": "team1"}
    ]
  }
}
```

### Spike Rush Mode - Casual Format
- **Max Rounds**: 7 (first to 4 wins)
- **Overtime**: Disabled
- **Winner Determination**: First team to win 4 rounds

**Example Score**:
```json
{
  "scoringType": "rounds",
  "format": "casual",
  "currentRound": 7,
  "maxRounds": 7,
  "team1Rounds": 4,
  "team2Rounds": 3,
  "winner": "team1"
}
```

## Overwatch 2 Scoring Examples

### Control Mode - Casual Format
- **Max Rounds**: 3 (first to 2 wins)
- **Overtime**: Disabled
- **Winner Determination**: First team to win 2 control points

**Example Score**:
```json
{
  "scoringType": "rounds",
  "format": "casual",
  "currentRound": 3,
  "maxRounds": 3,
  "team1Rounds": 2,
  "team2Rounds": 1,
  "winner": "team1",
  "rounds": [
    {"round": 1, "winner": "team1", "map": "Lijiang Tower"},
    {"round": 2, "winner": "team2", "map": "Nepal"},
    {"round": 3, "winner": "team1", "map": "Ilios"}
  ]
}
```

### Control Mode - Competitive Format
- **Max Rounds**: 5 (first to 3 wins)
- **Overtime**: Enabled
- **Winner Determination**: First team to win 3 control points

**Example Score**:
```json
{
  "scoringType": "rounds",
  "format": "competitive",
  "currentRound": 5,
  "maxRounds": 5,
  "team1Rounds": 3,
  "team2Rounds": 2,
  "winner": "team1"
}
```

### Escort Mode - Casual Format
- **Scoring Type**: Objective (distance-based)
- **Winner Determination**: Team that pushes payload furthest

**Example Score**:
```json
{
  "scoringType": "objective",
  "format": "casual",
  "team1Distance": 142.5,
  "team2Distance": 98.7,
  "winner": "team1",
  "checkpointsReached": {
    "team1": 2,
    "team2": 1
  },
  "completedAt": "2025-01-15T20:45:00Z"
}
```

### Escort Mode - Competitive Format
- **Scoring Type**: Objective with time bank
- **Winner Determination**: Team that completes map OR pushes furthest with time remaining

**Example Completion Score**:
```json
{
  "scoringType": "objective",
  "format": "competitive",
  "team1Distance": 250.0,
  "team2Distance": 180.3,
  "winner": "team1",
  "checkpointsReached": {
    "team1": 3,
    "team2": 2
  },
  "timeRemaining": {
    "team1": "2:15",
    "team2": "0:00"
  },
  "completedAt": "2025-01-15T20:58:00Z"
}
```

## Marvel Rivals Scoring Examples

### Domination Mode - Casual Format
- **Max Rounds**: 3 (first to 2 wins)
- **Overtime**: Disabled
- **Winner Determination**: First team to win 2 domination rounds

**Example Score**:
```json
{
  "scoringType": "rounds",
  "format": "casual",
  "currentRound": 3,
  "maxRounds": 3,
  "team1Rounds": 2,
  "team2Rounds": 1,
  "winner": "team1",
  "rounds": [
    {"round": 1, "winner": "team1"},
    {"round": 2, "winner": "team2"},
    {"round": 3, "winner": "team1"}
  ]
}
```

### Domination Mode - Competitive Format
- **Max Rounds**: 5 (first to 3 wins)
- **Overtime**: Enabled
- **Winner Determination**: First team to win 3 rounds

### Conquest Mode - Casual Format
- **Scoring Type**: Points-based
- **Target Points**: 100
- **Winner Determination**: First team to reach 100 points

**Example Score**:
```json
{
  "scoringType": "points",
  "format": "casual",
  "team1Points": 100,
  "team2Points": 87,
  "targetPoints": 100,
  "winner": "team1",
  "completedAt": "2025-01-15T21:12:00Z"
}
```

### Conquest Mode - Competitive Format
- **Scoring Type**: Points-based
- **Target Points**: 150
- **Winner Determination**: First team to reach 150 points

**Example Score**:
```json
{
  "scoringType": "points",
  "format": "competitive",
  "team1Points": 150,
  "team2Points": 142,
  "targetPoints": 150,
  "winner": "team1",
  "overtime": {
    "triggered": true,
    "finalScore": {"team1": 150, "team2": 142}
  }
}
```

### Deathmatch Mode - Casual Format
- **Scoring Type**: Eliminations
- **Target**: 30 eliminations
- **Winner Determination**: First team to reach 30 eliminations

**Example Score**:
```json
{
  "scoringType": "deathmatch",
  "format": "casual",
  "team1Eliminations": 30,
  "team2Eliminations": 28,
  "targetEliminations": 30,
  "winner": "team1",
  "mvpPlayer": "SpiderMan_Main",
  "completedAt": "2025-01-15T21:25:00Z"
}
```

### Vehicle Mode - Casual Format
- **Scoring Type**: Vehicle escort progress
- **Winner Determination**: Team that escorts vehicle furthest

**Example Score**:
```json
{
  "scoringType": "vehicle",
  "format": "casual",
  "team1Progress": 100,
  "team2Progress": 73,
  "winner": "team1",
  "checkpointsReached": {
    "team1": 4,
    "team2": 3
  },
  "completedAt": "2025-01-15T21:38:00Z"
}
```

## Edge Cases and Special Scenarios

### Draw Scenarios

**Valorant Overtime Draw (Rare)**:
```json
{
  "scoringType": "rounds",
  "format": "competitive",
  "currentRound": 20,
  "maxRounds": 13,
  "team1Rounds": 10,
  "team2Rounds": 10,
  "winner": "draw",
  "overtime": {
    "enabled": true,
    "maxOvertimeRounds": 6,
    "rounds": [/* overtime rounds */]
  }
}
```

**Escort Distance Tie**:
```json
{
  "scoringType": "objective",
  "format": "casual",
  "team1Distance": 125.0,
  "team2Distance": 125.0,
  "winner": "draw",
  "checkpointsReached": {
    "team1": 2,
    "team2": 2
  },
  "tiebreaker": "time_remaining"
}
```

### Perfect Games

**Valorant Perfect Game (13-0)**:
```json
{
  "scoringType": "rounds",
  "format": "competitive",
  "currentRound": 13,
  "maxRounds": 13,
  "team1Rounds": 13,
  "team2Rounds": 0,
  "winner": "team1",
  "perfectGame": true
}
```

### Custom Scoring Example

**Tournament with Special Rules**:
```json
{
  "scoringType": "custom",
  "format": "competitive",
  "winner": "team1",
  "customData": {
    "ruleset": "Best of 7 with map bans",
    "finalScore": "Red Team: 4 maps, Blue Team: 2 maps",
    "mapResults": [
      {"map": "Bind", "winner": "team1"},
      {"map": "Haven", "winner": "team2"},
      {"map": "Split", "winner": "team1"}
    ]
  },
  "completedAt": "2025-01-15T22:15:00Z"
}
```

## UI Display Examples

### Real-Time Scoring Display
During a Valorant match, the UI shows:
- Current round: 5
- Score: Red Team: 3, Blue Team: 2
- Progress bar: 5/13 rounds completed
- Next round button enabled
- Format badge: "Casual"

### End-Game Scoring Display
For an Escort mode match:
- Distance inputs for both teams
- Checkpoint counters
- Winner determination button
- Format badge: "Competitive"
- Completion time stamp

### Score History Display
Completed match shows:
- Final score with winner badge
- Format indicator
- Progress visualization
- Round-by-round history (if applicable)
- Edit button (if permissions allow)

This comprehensive example set covers all supported game modes, format variants, and edge cases in the scoring system.