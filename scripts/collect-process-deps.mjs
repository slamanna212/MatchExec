#!/usr/bin/env node

/**
 * Collects process-specific runtime dependencies (and their transitive deps)
 * from node_modules into an output directory.
 *
 * Usage: node scripts/collect-process-deps.mjs <output-dir>
 *
 * Only package NAMES are listed here — versions come from the main node_modules
 * (managed by package.json + package-lock.json, compatible with Dependabot).
 */

import { cpSync, existsSync, readFileSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const NODE_MODULES = join(ROOT, 'node_modules');

// Top-level packages needed by processes at runtime.
// These are packages marked as 'external' in esbuild configs
// that are NOT already provided by Next.js standalone output.
const PROCESS_DEPS = [
  '@napi-rs/canvas',
  'discord.js',
  '@discordjs/voice',
  '@discordjs/rest',
  '@discordjs/builders',
  '@discordjs/util',
  '@discordjs/ws',
  '@snazzah/davey',
  'bufferutil',
  'umzug',
  'tslib',
];

const outDir = process.argv[2];
if (!outDir) {
  console.error('Usage: node scripts/collect-process-deps.mjs <output-dir>');
  process.exit(1);
}

const collected = new Set();

/**
 * Collect a package and all its transitive dependencies.
 * Handles both top-level and nested node_modules (packages that bundle
 * their own versions of dependencies).
 */
function collectPackage(name) {
  if (collected.has(name)) return;
  collected.add(name);

  const pkgDir = join(NODE_MODULES, name);
  if (!existsSync(pkgDir)) {
    console.warn(`  ⚠ Package not found: ${name} (may be optional)`);
    return;
  }

  // Copy the package directory (includes any nested node_modules)
  const dest = join(outDir, name);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(pkgDir, dest, { recursive: true });

  // Trace deps from this package's package.json
  traceDepsFrom(pkgDir);

  // Also trace deps from any nested node_modules packages,
  // since their dependencies resolve from the top-level node_modules
  const nestedNM = join(pkgDir, 'node_modules');
  if (existsSync(nestedNM)) {
    scanNestedNodeModules(nestedNM);
  }
}

/**
 * Read a package.json and collect all its dependencies/optionalDependencies.
 */
function traceDepsFrom(pkgDir) {
  const pkgJsonPath = join(pkgDir, 'package.json');
  if (!existsSync(pkgJsonPath)) return;

  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    const deps = {
      ...pkg.dependencies,
      ...pkg.optionalDependencies,
    };
    for (const dep of Object.keys(deps)) {
      collectPackage(dep);
    }
  } catch {
    // If we can't read package.json, skip tracing
  }
}

/**
 * Scan a nested node_modules directory and trace deps from each package inside.
 * These nested packages are already copied (they live inside their parent),
 * but their own deps may resolve from the top-level node_modules.
 */
function scanNestedNodeModules(nestedNM) {
  try {
    const entries = readdirSync(nestedNM);
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      if (entry.startsWith('@')) {
        // Scoped package — read one level deeper
        const scopeDir = join(nestedNM, entry);
        for (const scopedPkg of readdirSync(scopeDir)) {
          traceDepsFrom(join(scopeDir, scopedPkg));
        }
      } else {
        traceDepsFrom(join(nestedNM, entry));
      }
    }
  } catch {
    // Ignore errors reading nested node_modules
  }
}

console.log('Collecting process dependencies...');
mkdirSync(outDir, { recursive: true });

for (const dep of PROCESS_DEPS) {
  collectPackage(dep);
}

console.log(`✓ Collected ${collected.size} packages to ${outDir}`);
