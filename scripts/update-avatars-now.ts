#!/usr/bin/env tsx
/**
 * Manually trigger avatar update for all participants
 */

import { getDbInstance } from '../src/lib/database-init';
import { AvatarUpdateJob } from '../processes/scheduler/jobs/update-avatars';

async function main() {
  console.log('🖼️  Manually updating participant avatars...');

  try {
    const db = await getDbInstance();
    const avatarJob = new AvatarUpdateJob(db);

    await avatarJob.updateAvatars();

    await avatarJob.cleanup();

    console.log('✅ Avatar update complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to update avatars:', error);
    process.exit(1);
  }
}

main();
