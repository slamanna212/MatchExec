import { readFileSync } from 'fs';
import { join } from 'path';

export function getVersionInfo() {
  // Read package.json at runtime to avoid Next.js import issues
  const packageJsonPath = join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const baseVersion = packageJson.version;

  // Always use fallback in production/Docker to avoid git errors
  return {
    version: `v${baseVersion}`,
    branch: 'production',
    commitHash: 'docker',
    isDev: false
  };
}