#!/usr/bin/env node
/**
 * Script to replace console statements with logger calls
 * Automatically adds logger imports where needed
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get files with console errors from ESLint
function getFilesWithConsoleErrors() {
  try {
    execSync('npm run lint', { stdio: 'pipe' });
    return [];
  } catch (error) {
    const output = error.stdout?.toString() || '';
    const lines = output.split('\n');
    const files = new Set();

    lines.forEach(line => {
      if (line.includes('Unexpected console statement')) {
        const match = lines[lines.indexOf(line) - 1]?.match(/^(.+):\d+:\d+/);
        if (match) {
          files.add(match[1]);
        }
      }
    });

    return Array.from(files);
  }
}

// Determine if file is client-side or server-side
function isClientSide(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  // Check for 'use client' directive
  if (content.includes("'use client'") || content.includes('"use client"')) {
    return true;
  }

  // Files in src/app are server-side unless they have 'use client'
  if (filePath.includes('/src/app/') && !content.includes("'use client'")) {
    return false;
  }

  // Components are usually client-side
  if (filePath.includes('/src/components/')) {
    return true;
  }

  // API routes are server-side
  if (filePath.includes('/api/')) {
    return false;
  }

  // Default to server-side for src/lib
  if (filePath.includes('/src/lib/')) {
    return false;
  }

  return false;
}

// Add logger import if not present
function addLoggerImport(content, isClient) {
  const importStatement = isClient
    ? "import { logger } from '@/lib/logger/client';"
    : "import { logger } from '@/lib/logger/server';";

  // Check if logger is already imported
  if (content.includes("from '@/lib/logger")) {
    return content;
  }

  // Find the last import statement
  const lines = content.split('\n');
  let lastImportIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('import ')) {
      lastImportIndex = i;
    } else if (lines[i].trim() && !lines[i].trim().startsWith('//') && lastImportIndex !== -1) {
      break;
    }
  }

  if (lastImportIndex !== -1) {
    lines.splice(lastImportIndex + 1, 0, importStatement);
  } else {
    // No imports found, add at the beginning after 'use client' if present
    let insertIndex = 0;
    if (lines[0]?.includes('use client') || lines[0]?.includes('use server')) {
      insertIndex = 1;
      if (lines[1]?.trim() === '') insertIndex = 2;
    }
    lines.splice(insertIndex, 0, importStatement, '');
  }

  return lines.join('\n');
}

// Replace console statements with logger calls
function replaceConsoleStatements(content) {
  // Replace console.log -> logger.info
  content = content.replace(/console\.log\(/g, 'logger.info(');

  // Replace console.error -> logger.error
  content = content.replace(/console\.error\(/g, 'logger.error(');

  // Replace console.warn -> logger.warning
  content = content.replace(/console\.warn\(/g, 'logger.warning(');

  // Replace console.debug -> logger.debug
  content = content.replace(/console\.debug\(/g, 'logger.debug(');

  // Replace console.info -> logger.info
  content = content.replace(/console\.info\(/g, 'logger.info(');

  return content;
}

// Process a single file
function processFile(filePath) {
  console.log(`Processing: ${filePath}`);

  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;

  // Replace console statements
  content = replaceConsoleStatements(content);

  // Add logger import if we made changes
  if (content !== originalContent) {
    const isClient = isClientSide(filePath);
    content = addLoggerImport(content, isClient);

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  ✓ Fixed (${isClient ? 'client' : 'server'} logger)`);
    return true;
  }

  return false;
}

// Main execution
console.log('Finding files with console errors...\n');

// Get all TypeScript/TSX files in src
const files = execSync('find src lib -name "*.ts" -o -name "*.tsx"', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter(f => !f.includes('node_modules'))
  .filter(f => !f.includes('.next'))
  .filter(f => !f.includes('database-init.ts')) // Skip excepted files
  .filter(f => !f.includes('logger/base.ts'));

let processedCount = 0;

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  if (content.match(/console\.(log|error|warn|debug|info)\(/)) {
    if (processFile(file)) {
      processedCount++;
    }
  }
});

console.log(`\n✓ Processed ${processedCount} files`);
console.log('\nRunning ESLint to verify fixes...');

try {
  execSync('npm run lint', { stdio: 'inherit' });
  console.log('\n✓ All console errors fixed!');
} catch (error) {
  console.log('\n⚠ Some issues remain - review output above');
}
