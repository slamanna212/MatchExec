#!/usr/bin/env node
/**
 * Fix broken logger imports that were inserted in the middle of other imports
 */

const fs = require('fs');

const files = [
  'src/components/assign-players-modal.tsx',
  'src/components/assign-tournament-teams-modal.tsx',
  'src/components/match-dashboard.tsx',
  'src/components/match-details-modal.tsx',
  'src/components/match-history-dashboard.tsx',
  'src/components/navigation.tsx',
  'src/components/scoring/ScoringModal.tsx',
  'src/components/tournament-dashboard.tsx',
  'src/components/tournament-details-modal.tsx',
  'src/components/tournament-history-dashboard.tsx'
];

files.forEach(file => {
  console.log(`Fixing ${file}...`);
  let content = fs.readFileSync(file, 'utf8');

  // Find the pattern where logger import is in the middle of another import
  // Pattern: "import {\nimport { logger ..."
  const brokenPattern = /import \{\nimport { logger } from '@\/lib\/logger\/client';/g;

  if (brokenPattern.test(content)) {
    // Remove the broken logger import
    content = content.replace(/\nimport { logger } from '@\/lib\/logger\/client';/g, '');

    // Find the end of the first import block (after 'use client')
    const lines = content.split('\n');
    let insertIndex = -1;

    // Find the position after 'use client' and any empty lines
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("'use client'") || lines[i].includes('"use client"')) {
        // Skip empty lines after 'use client'
        insertIndex = i + 1;
        while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
          insertIndex++;
        }
        break;
      }
    }

    if (insertIndex !== -1) {
      // Insert logger import at the correct position
      lines.splice(insertIndex, 0, "import { logger } from '@/lib/logger/client';");
      content = lines.join('\n');
    }

    fs.writeFileSync(file, content, 'utf8');
    console.log(`  ✓ Fixed!`);
  } else {
    console.log(`  ✓ Already OK`);
  }
});

console.log('\nDone!');
