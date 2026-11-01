#!/usr/bin/env tsx
/**
 * Manually trigger avatar update for all participants
 */

import { AvatarUpdateJob } from '../processes/scheduler/jobs/update-avatars';

async function main() {
  console.log('🖼️  Manually updating participant avatars...');

  try {
    const avatarJob = new AvatarUpdateJob();

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
