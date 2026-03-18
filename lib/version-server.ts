import pkg from '../package.json';

export function getVersionInfo(): { version: string; branch: string; commitHash: string; isDev: boolean } {
  const baseVersion = pkg.version;
  
  // Always use fallback in production/Docker to avoid git errors
  return {
    version: `v${baseVersion}`,
    branch: 'production',
    commitHash: 'docker',
    isDev: false
  };
}