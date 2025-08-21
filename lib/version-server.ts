import { execSync } from 'child_process';
import pkg from '../package.json';

export function getVersionInfo() {
  const baseVersion = pkg.version;
  
  try {
    // Get current branch
    const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    
    // Get short commit hash
    const commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    
    // Determine version display based on branch
    if (branch === 'main') {
      return {
        version: `v${baseVersion}`,
        branch,
        commitHash,
        isDev: false
      };
    } else {
      return {
        version: `v${baseVersion}-${branch}.${commitHash}`,
        branch,
        commitHash,
        isDev: true
      };
    }
  } catch {
    // Fallback if git commands fail
    return {
      version: `v${baseVersion}`,
      branch: 'unknown',
      commitHash: 'unknown',
      isDev: false
    };
  }
}