import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function detectPlatform(): string | null {
  if (process.env.KUBERNETES_SERVICE_HOST) return 'kubernetes';
  if (existsSync('/.dockerenv')) return 'docker-compose';
  try {
    const environ = readFileSync('/proc/1/environ', 'utf-8');
    if (environ.includes('container=lxc')) return 'proxmox';
  } catch { /* not an LXC container */ }
  return null;
}

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
    isDev: false,
    platform: detectPlatform(),
  };
}