# Status Inconsistency Fix: "complete" vs "completed"

## Problem Summary
The codebase had inconsistent usage of status values between "complete" and "completed" across different components and database queries, causing type mismatches and potential runtime errors.

## Database Schema Design (Correct)
The database schema uses a semantic distinction:
- **matches/tournaments**: Use `'complete'` status (top-level entities)
- **match_games/queues**: Use `'completed'` status (sub-entities/operations)

## Root Cause
The main issue was in application code incorrectly mapping between these domains, specifically in the tournaments API where database `'complete'` was being converted to `'completed'`.

## Changes Made

### 1. API Status Mapping Fix
**File**: `src/app/api/tournaments/[tournamentId]/matches/route.ts`
- **Lines 110-111**: Removed incorrect status conversion
- **Before**: `status: match.status === 'complete' ? 'completed' : ...`
- **After**: `status: match.status === 'battle' ? 'ongoing' : match.status === 'complete' ? 'complete' : 'pending'`

### 2. Frontend Component Updates

#### Tournament Bracket Component
**File**: `src/components/tournament-bracket.tsx`
- **Line 31**: Updated `BracketMatch` interface: `'completed'` → `'complete'`
- **Line 86**: Fixed `getStatusColor()`: `case 'completed'` → `case 'complete'`
- **Line 94**: Fixed `getStatusLabel()`: `case 'completed'` → `case 'complete'`
- **Line 185**: Updated badge variant check: `'completed'` → `'complete'`

#### Tournament Details Modal
**File**: `src/components/tournament-details-modal.tsx`
- **Line 44**: Updated match interface: `'completed'` → `'complete'`

#### Tournament Matches API
**File**: `src/app/api/tournaments/[tournamentId]/matches/route.ts`
- **Line 35**: Updated `BracketMatch` interface: `'completed'` → `'complete'`

### 3. Database Query Verification
Confirmed all database queries use correct status values:
- **Matches/Tournaments**: Consistently use `'complete'`
- **Match Games**: Consistently use `'completed'`
- **Queue Operations**: Consistently use `'completed'`

## Files Verified as Correct
The following files were verified to have correct status usage:
- `src/lib/scoring-functions.ts` - Uses `'completed'` for match_games, `'complete'` for matches
- `src/lib/tournament-bracket.ts` - Uses `'complete'` for matches
- `src/components/scoring/` - Uses `'completed'` for match_games
- `src/components/match-details-modal.tsx` - Uses `'completed'` for queues/reminders
- All queue-related APIs - Use `'completed'` for queue operations

## Testing Results
- **TypeScript Compilation**: ✅ Passed with no errors
- **ESLint**: ✅ Passed (only unrelated warnings about unused variables)

## Benefits
- No database migration required
- Maintains semantic distinction between entity types
- Fixes type inconsistencies at the application layer
- Preserves existing data integrity
- Eliminates potential runtime errors from status mismatches

## Prevention
The fix maintains the existing database schema design which provides clear semantic meaning:
- Top-level entities (matches/tournaments) use "complete" when finished
- Sub-entities and operations (games/queues) use "completed" when processed