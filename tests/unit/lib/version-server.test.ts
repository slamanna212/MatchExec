import { describe, it, expect, afterEach } from 'vitest';
import { getVersionInfo } from '../../../src/lib/version-server';

// version-server.ts reads package.json via readFileSync — we test against
// real behavior rather than mocking the fs built-in (ESM binding makes it
// unreliable). Platform detection is testable via env vars.

const savedKubernetes = process.env.KUBERNETES_SERVICE_HOST;

afterEach(() => {
  // Restore env
  if (savedKubernetes !== undefined) {
    process.env.KUBERNETES_SERVICE_HOST = savedKubernetes;
  } else {
    delete process.env.KUBERNETES_SERVICE_HOST;
  }
});

describe('getVersionInfo', () => {
  it('returns a version string prefixed with v', () => {
    const info = getVersionInfo();
    expect(info.version).toMatch(/^v\d+\.\d+\.\d+/);
  });

  it('always returns branch=production', () => {
    const info = getVersionInfo();
    expect(info.branch).toBe('production');
  });

  it('always returns commitHash=docker', () => {
    const info = getVersionInfo();
    expect(info.commitHash).toBe('docker');
  });

  it('isDev is always false', () => {
    const info = getVersionInfo();
    expect(info.isDev).toBe(false);
  });

  it('platform field is null or a known string', () => {
    const info = getVersionInfo();
    const valid = [null, 'kubernetes', 'docker-compose', 'proxmox'];
    expect(valid).toContain(info.platform);
  });

  it('platform is kubernetes when KUBERNETES_SERVICE_HOST is set', () => {
    process.env.KUBERNETES_SERVICE_HOST = '10.0.0.1';
    const info = getVersionInfo();
    expect(info.platform).toBe('kubernetes');
  });

  it('platform is null when KUBERNETES_SERVICE_HOST is absent and not in container', () => {
    delete process.env.KUBERNETES_SERVICE_HOST;
    const info = getVersionInfo();
    // In the test runner we're not in a container
    expect(info.platform).toBeNull();
  });

  it('returns all expected keys', () => {
    const info = getVersionInfo();
    expect(info).toHaveProperty('version');
    expect(info).toHaveProperty('branch');
    expect(info).toHaveProperty('commitHash');
    expect(info).toHaveProperty('isDev');
    expect(info).toHaveProperty('platform');
  });
});
