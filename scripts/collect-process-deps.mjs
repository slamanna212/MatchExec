#!/usr/bin/env node

/**
 * Collects process-specific runtime dependencies (and their transitive deps)
 * from node_modules into an output directory.
 *
 * Usage: node scripts/collect-process-deps.mjs <output-dir>
 *
 * Only package NAMES are listed here — versions come from the main node_modules
 * (managed by package.json + pnpm-lock.yaml, compatible with Dependabot).
 * Works with pnpm's symlinked node_modules by following real paths.
 */

import { cpSync, existsSync, readFileSync, realpathSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

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

// Real (symlink-resolved) package directory -> output locations it was copied to.
const placed = new Map();
let packageCount = 0;

/**
 * Resolve a dependency the way Node does: walk up from `fromDir` looking for
 * node_modules/<name>. With pnpm, `fromDir` is a package's REAL path inside
 * node_modules/.pnpm/<pkg>@<ver>/node_modules/, so its dependencies are found
 * as siblings in that virtual-store directory. Returns the real path or null.
 */
function resolveDep(name, fromDir) {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(candidate)) return realpathSync(candidate);
    // Inside a virtual store the package itself sits at <...>/node_modules/<name>;
    // siblings live in that same node_modules directory.
    if (basename(dir) === 'node_modules') {
      const sibling = join(dir, name);
      if (existsSync(sibling)) return realpathSync(sibling);
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Collect a package and all its transitive dependencies into a flat layout.
 * `fromDir` is the real directory of the requiring package (or ROOT) and
 * `parentDest` is where that package was copied. If a different version of
 * `name` already occupies the top-level slot, the package is nested inside
 * the parent's own node_modules so Node resolution still finds the right one.
 */
function collectPackage(name, fromDir, parentDest, optional) {
  const realDir = resolveDep(name, fromDir);
  if (!realDir) {
    console.warn(`  ⚠ Package not found: ${name} (${optional ? 'optional' : 'may be optional'})`);
    return;
  }

  const topDest = join(outDir, name);
  const nestedDest = parentDest ? join(parentDest, 'node_modules', name) : null;
  const seen = placed.get(realDir) ?? [];

  let dest;
  if (seen.includes(topDest)) return;
  if (nestedDest && seen.includes(nestedDest)) return;
  if (!existsSync(topDest)) {
    dest = topDest;
  } else if (nestedDest) {
    dest = nestedDest;
  } else {
    console.warn(`  ⚠ Version conflict for top-level ${name}, keeping first copy`);
    return;
  }

  seen.push(dest);
  placed.set(realDir, seen);
  packageCount++;

  mkdirSync(dirname(dest), { recursive: true });
  cpSync(realDir, dest, { recursive: true, dereference: true });

  traceDepsFrom(realDir, dest);
}

/**
 * Read a package.json and collect all its dependencies/optionalDependencies.
 */
function traceDepsFrom(realDir, dest) {
  const pkgJsonPath = join(realDir, 'package.json');
  if (!existsSync(pkgJsonPath)) return;

  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      collectPackage(dep, realDir, dest, false);
    }
    for (const dep of Object.keys(pkg.optionalDependencies ?? {})) {
      collectPackage(dep, realDir, dest, true);
    }
  } catch {
    // If we can't read package.json, skip tracing
  }
}

console.log('Collecting process dependencies...');
mkdirSync(outDir, { recursive: true });

// Some entries (e.g. @discordjs/rest, tslib) are only transitive deps. pnpm does not
// hoist those to the root node_modules, so fall back to resolving them from discord.js.
const discordJsDir = resolveDep('discord.js', ROOT);

for (const dep of PROCESS_DEPS) {
  const base = resolveDep(dep, ROOT) ? ROOT : (discordJsDir ?? ROOT);
  collectPackage(dep, base, null, false);
}

console.log(`✓ Collected ${packageCount} packages to ${outDir}`);
