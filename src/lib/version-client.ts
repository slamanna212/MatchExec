export interface VersionInfo {
  version: string;
  branch: string;
  commitHash: string;
  isDev: boolean;
}

export async function getVersionInfo(): Promise<VersionInfo> {
  try {
    const response = await fetch('/api/version');
    if (!response.ok) {
      throw new Error('Failed to fetch version info');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching version info:', error);
    return {
      version: 'unknown',
      branch: 'unknown',
      commitHash: 'unknown',
      isDev: false
    };
  }
}