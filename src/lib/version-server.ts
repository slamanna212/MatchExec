import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

function detectPlatform(): string | null {
  if (process.env.KUBERNETES_SERVICE_HOST) return 'kubernetes';
  if (existsSync('/.dockerenv')) {
    if (process.env.COMPOSE_PROJECT_NAME || process.env.COMPOSE_FILE) return 'docker-compose';
    return 'docker';
  }
  try {
    const environ = readFileSync('/proc/1/environ', 'utf-8');
    if (environ.includes('container=lxc')) return 'proxmox';
  } catch { /* not an LXC container */ }
  return null;
}

export function getVersionInfo(): { version: string; branch: string; commitHash: string; isDev: boolean; platform: string | null } {
  const packageJsonPath = join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const baseVersion = packageJson.version;

  if (process.env.NODE_ENV === 'development') {
    let branch = 'development';
    let commitHash = 'local';
    try {
      branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
      commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    } catch { /* not in a git repo or git unavailable */ }
    return { version: `v${baseVersion}`, branch, commitHash, isDev: true, platform: detectPlatform() };
  }

  return {
    version: `v${baseVersion}`,
    branch: 'production',
    commitHash: 'docker',
    isDev: false,
    platform: detectPlatform(),
  };
}