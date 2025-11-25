# Discord Profile Pictures Implementation Plan - v0.7

## Overview

Add Discord profile pictures to match participant lists in the MatchExec web UI using database storage with scheduler-based updates.

## Architecture Decision

**Storage Strategy**: Store avatar URLs directly in database
- Add `avatar_url` column to `match_participants` table
- Fetch and store on signup (immediate)
- Scheduler updates every 2 hours (keep fresh)
- Browser loads images from Discord CDN (fast, cached)

**Performance Characteristics**:
- Page load: Instant - avatar URL already in database
- Image load: ~50ms from Discord CDN (browser caches automatically)
- No API calls during page load
- Updates happen in background via scheduler

## Implementation Steps

### Phase 1: Database Schema

#### 1.1 Create Migration for Avatar Storage
**File**: `migrations/008_add_avatar_urls.sql` (NEW)

```sql
-- Add avatar_url column to match_participants
ALTER TABLE match_participants ADD COLUMN avatar_url TEXT;

-- Add last_avatar_check timestamp for scheduler optimization
ALTER TABLE match_participants ADD COLUMN last_avatar_check DATETIME;
```

**Why add to match_participants?**
- Simple queries - no JOINs needed
- Consistent with existing architecture (username, signup_data already duplicated)
- Fast participant list queries
- Easy scheduler updates

### Phase 2: Discord Bot Integration

#### 2.1 Create Avatar Fetching Utility
**File**: `processes/discord-bot/utils/avatar-fetcher.ts` (NEW)

Create shared utility for fetching Discord avatar URLs:

```typescript
export async function getDiscordAvatarUrl(
  client: Client,
  discordUserId: string
): Promise<string | null> {
  try {
    const user = await client.users.fetch(discordUserId);
    if (!user.avatar) {
      return null; // No custom avatar
    }
    const format = user.avatar.startsWith('a_') ? 'gif' : 'webp';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${format}?size=128`;
  } catch (error) {
    logger.error('Failed to fetch avatar for user:', discordUserId, error);
    return null;
  }
}
```

**Why a utility?**
- Reused by both signup handler and scheduler
- Consistent avatar URL construction
- Centralized error handling

#### 2.2 Update Signup Flow to Store Avatar
**File**: `processes/discord-bot/modules/interaction-helpers.ts` (MODIFY)

Update `insertParticipant()` function (line ~78-79):

**Current**:
```typescript
INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username, signup_data)
VALUES (?, ?, ?, ?, ?, ?)
```

**New**:
```typescript
// Fetch avatar URL when user signs up
const avatarUrl = await getDiscordAvatarUrl(client, interaction.user.id);

INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username, signup_data, avatar_url, last_avatar_check)
VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
```

**Result**: Avatar is captured immediately on signup, available instantly for UI.

### Phase 3: Scheduler Job for Avatar Updates

#### 3.1 Create Avatar Update Scheduler Job
**File**: `processes/scheduler/jobs/update-avatars.ts` (NEW)

Create new cron job that runs every 2 hours:

```typescript
import { CronJob } from 'cron';
import { Client } from 'discord.js';
import { Database } from '../../../lib/database/connection';
import { getDiscordAvatarUrl } from '../../discord-bot/utils/avatar-fetcher';
import { logger } from '../../../src/lib/logger/server';

export class AvatarUpdateJob {
  private job: CronJob;

  constructor(private db: Database, private discordClient: Client) {
    // Run every 2 hours at minute 0
    this.job = new CronJob('0 */2 * * *', () => this.updateAvatars());
  }

  async updateAvatars() {
    logger.info('🖼️  Starting avatar update job');

    try {
      // Get all unique Discord user IDs from participants
      const participants = await this.db.all<{ discord_user_id: string }>(`
        SELECT DISTINCT discord_user_id
        FROM match_participants
        WHERE discord_user_id IS NOT NULL
      `);

      let updated = 0;
      let failed = 0;

      // Update each user's avatar
      for (const { discord_user_id } of participants) {
        try {
          const avatarUrl = await getDiscordAvatarUrl(this.discordClient, discord_user_id);

          // Update all records for this user
          await this.db.run(`
            UPDATE match_participants
            SET avatar_url = ?, last_avatar_check = CURRENT_TIMESTAMP
            WHERE discord_user_id = ?
          `, [avatarUrl, discord_user_id]);

          updated++;
        } catch (error) {
          logger.error(`Failed to update avatar for user ${discord_user_id}:`, error);
          failed++;
        }
      }

      logger.info(`✅ Avatar update complete: ${updated} updated, ${failed} failed`);
    } catch (error) {
      logger.error('❌ Avatar update job failed:', error);
    }
  }

  start() {
    this.job.start();
    logger.info('🖼️  Avatar update job scheduled (every 2 hours)');
  }

  stop() {
    this.job.stop();
  }
}
```

#### 3.2 Register Job in Scheduler
**File**: `processes/scheduler/index.ts` (MODIFY)

Add the avatar update job to the scheduler process:

```typescript
import { AvatarUpdateJob } from './jobs/update-avatars';

// ... existing code ...

// Initialize avatar update job
const avatarUpdateJob = new AvatarUpdateJob(db, discordClient);
avatarUpdateJob.start();
```

**Notes**:
- Requires Discord bot client to be accessible from scheduler
- May need to refactor to share Discord client or create separate instance
- Runs every 2 hours automatically

### Phase 4: Frontend Integration

#### 4.1 Update Participants API Endpoint
**File**: `src/app/api/matches/[matchId]/participants/route.ts` (MODIFY)

Update SELECT query (line 30) to include avatar_url:

```typescript
SELECT id, user_id, discord_user_id, username, avatar_url, joined_at, signup_data, team_assignment, receives_map_codes
FROM match_participants
WHERE match_id = ?
ORDER BY joined_at ASC
```

#### 4.2 Update ParticipantsList Component
**File**: `src/components/match-details/ParticipantsList.tsx` (MODIFY)

**Changes**:
1. Add `avatar_url` to `MatchParticipant` interface
2. Update `Avatar` component (line ~69-71):
   ```typescript
   <Avatar src={participant.avatar_url || undefined}>
     {index + 1}
   </Avatar>
   ```
3. Fallback behavior: If `avatar_url` is null/undefined, Avatar shows numeric index (current behavior maintained)

**No hook needed** - avatar URL comes directly from API response!

#### 4.3 Update AssignPlayersModal Component
**File**: `src/components/assign-players-modal.tsx` (MODIFY)

**Changes**:
1. Add `avatar_url` to `MatchParticipant` interface (line ~39-47)
2. Update `Avatar` in `renderParticipantCard()` (line ~265):
   ```typescript
   <Avatar src={participant.avatar_url || undefined}>
     {index + 1}
   </Avatar>
   ```

**Note**: Tournament components excluded from v0.7 scope (being redesigned soon).

### Phase 5: Type Definitions

#### 5.1 Update Shared Types
**File**: `shared/types.ts` (MODIFY)

**Changes**:
1. Add `avatar_url` to `ParticipantDbRow` interface:
```typescript
export interface ParticipantDbRow {
  id: string;
  match_id: string;
  user_id: string;
  discord_user_id: string;
  username: string;
  avatar_url?: string | null;  // NEW
  joined_at: Date;
  signup_data?: string;
  team_assignment?: 'reserve' | 'blue' | 'red';
  receives_map_codes?: number;
}
```

2. Add to `MatchParticipant` interface used by frontend components

## Data Flow

1. **User Signs Up for Match**:
   - Discord bot captures signup via interaction
   - Fetches user avatar from Discord API immediately
   - Constructs CDN URL: `https://cdn.discordapp.com/avatars/{userId}/{hash}.webp?size=128`
   - Stores URL in `match_participants.avatar_url`
   - Page loads instantly show avatar (already in database)

2. **Every 2 Hours** (Scheduler):
   - Fetch all unique Discord user IDs from `match_participants`
   - For each user, fetch current avatar from Discord API
   - Update all `match_participants` records for that user
   - Keeps avatars fresh when users change profile pictures

3. **Page Load**:
   - Frontend fetches participants from API
   - API includes `avatar_url` in response
   - Browser loads image from Discord CDN (~50ms)
   - Browser caches image automatically
   - **No Discord API calls from frontend**

## Fallback Strategy

Per user requirement: **Show initials/numbers when no custom avatar**

Implementation:
- If `avatar_url` is `null` or `undefined`: Display numeric index (current behavior)
- If image fails to load: Mantine Avatar component automatically shows fallback
- If Discord API unavailable during signup: Stores `null`, shows number
- Scheduler updates will fix missing avatars on next run

## Testing Checklist

### Migration Testing
- [ ] Run migration on test database
- [ ] Verify `avatar_url` column added to `match_participants`
- [ ] Verify `last_avatar_check` column added
- [ ] Existing participants have `NULL` for new columns

### Signup Flow Testing
- [ ] Sign up new participant via Discord bot
- [ ] Verify `avatar_url` is stored in database
- [ ] View match participants list - avatar appears immediately
- [ ] User with no custom avatar - shows numeric fallback
- [ ] Discord API error during signup - stores NULL, shows fallback

### Scheduler Testing
- [ ] Manually trigger avatar update job
- [ ] Verify all participant avatars are updated
- [ ] Check logs for success/failure counts
- [ ] Change Discord avatar, wait 2 hours, verify update appears
- [ ] Scheduler handles deleted Discord accounts gracefully

### Frontend Testing
- [ ] View ParticipantsList - avatars display from database
- [ ] Open AssignPlayersModal - avatars visible
- [ ] Refresh page - avatars load instantly (already in DB)
- [ ] Browser network tab shows images loaded from Discord CDN
- [ ] 50+ participants - loads without delay

### Performance Validation
- [ ] Page load: Instant (avatar URLs already in database)
- [ ] Image load: ~50ms per image from Discord CDN
- [ ] Browser caches images after first load
- [ ] Database query performance unchanged (simple column addition)

## Performance Benefits

1. **Instant page loads**: Avatar URLs already in database (no API calls)
2. **Fast image loads**: Discord CDN is highly optimized (~50ms per image)
3. **Browser caching**: Images cached automatically by browser
4. **Background updates**: Scheduler runs independently, doesn't block UI
5. **Simple queries**: No JOINs, no complexity

## Rate Limiting Strategy

Discord API limit: 50 requests/second

**Protection mechanisms**:
- **Signup**: One API call per user (unavoidable, necessary)
- **Scheduler**: Runs every 2 hours during off-peak times
- **Batch processing**: Scheduler updates 100 users = 100 calls over ~2 seconds (well below limit)
- **No frontend calls**: Page loads don't hit Discord API at all

**Typical load**:
- 100 active participants = 100 Discord API calls every 2 hours = 0.013 calls/second
- Extremely low Discord API usage

## Critical Files Summary

### New Files
- `migrations/008_add_avatar_urls.sql` - Database migration for avatar storage
- `processes/discord-bot/utils/avatar-fetcher.ts` - Shared avatar fetching utility
- `processes/scheduler/jobs/update-avatars.ts` - Cron job for updating avatars every 2 hours

### Modified Files
- `processes/discord-bot/modules/interaction-helpers.ts` - Store avatar on signup (line ~78-79)
- `processes/scheduler/index.ts` - Register avatar update job
- `src/app/api/matches/[matchId]/participants/route.ts` - Include avatar_url in query (line 30)
- `src/components/match-details/ParticipantsList.tsx` - Display avatars from database
- `src/components/assign-players-modal.tsx` - Display avatars in team assignment (line ~265)
- `shared/types.ts` - Add avatar_url to participant interfaces

## Rollout Strategy

**Phase 1**: Deploy migration and Discord bot updates
- Run migration to add avatar_url column
- Deploy bot changes to store avatars on signup
- Test with new signups
- Existing participants will have NULL avatars (shows fallback)

**Phase 2**: Deploy scheduler job
- Deploy avatar update job
- Manually trigger first run to populate existing participants
- Verify avatars appear in database

**Phase 3**: Deploy frontend updates
- Update components to display avatars
- Verify images load from Discord CDN
- Monitor browser console for errors

**Rollback**:
- Database column is harmless if unused
- Revert component changes to hide avatars
- Stop scheduler job if causing issues

## Future Enhancements (Post v0.7)

### v0.8: Discord Embeds
- Use avatar_url from database for Discord embed generation
- Add profile pictures to match announcements (setThumbnail, setAuthor)
- Consistent user representation across UI and Discord
- No additional Discord API calls needed - data already available

### Future Considerations
- Add to tournament_participants table when tournaments are redesigned
- Optimize scheduler to only update avatars that haven't been checked recently
- Add manual "refresh avatar" button for admins
- Track avatar change history for analytics

## Dependencies & Configuration

**No new dependencies required** - uses existing:
- discord.js 14.24.2 (already installed for bot and scheduler)
- node-cron (already used by scheduler)
- Next.js 16.0.1 (already installed)
- SQLite3 (already in use)

**Environment**: Uses existing `bot_token` from `discord_settings` database table

**Scheduler Configuration**:
- Cron pattern: `'0 */2 * * *'` (every 2 hours at minute 0)
- Runs at: 12:00 AM, 2:00 AM, 4:00 AM, etc.
- Can adjust frequency if needed

## Risk Assessment

**Low Risk**:
- ✅ Database migration (simple column addition)
- ✅ Discord API integration (already used in reminder-handler.ts)
- ✅ Component updates (additive, non-breaking)
- ✅ Scheduler job (follows existing cron pattern)

**Medium Risk**:
- ⚠️ Discord client sharing between scheduler and bot - may need refactoring
- ⚠️ First-time scheduler run with many participants - rate limiting protection needed

**High Risk**: None identified

## Architecture Notes

### Discord Client Sharing

The scheduler needs access to the Discord client to fetch avatar data. Two options:

**Option A**: Share the Discord bot client instance
- Pass client reference from bot to scheduler
- Requires refactoring process initialization

**Option B**: Create separate Discord client in scheduler
- Scheduler initializes its own Discord.js client
- Uses same bot token from database
- Independent operation, simpler architecture

**Recommendation**: Option B - separate client for independence and reliability.

## Estimated Implementation Time

5-7 hours total:
- Migration + avatar fetcher utility: 1 hour
- Discord bot signup integration: 1-2 hours
- Scheduler job creation: 2-3 hours (includes Discord client setup)
- Frontend updates: 1 hour
- Testing: 1 hour
