import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getUiSettings, invalidateUiSettings } from '../../../src/lib/ui-settings-client';

vi.mock('@/lib/logger/client', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

beforeEach(() => invalidateUiSettings());
afterEach(() => vi.unstubAllGlobals());

describe('ui-settings-client', () => {
  it('fetches the UI settings once and shares the result', async () => {
    const fetchMock = vi.fn(() => ok({ auto_refresh_interval_seconds: 15 }));
    vi.stubGlobal('fetch', fetchMock);
    const [a, b] = await Promise.all([getUiSettings(), getUiSettings()]);
    expect(await getUiSettings()).toEqual({ auto_refresh_interval_seconds: 15 });
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches again after invalidateUiSettings (settings saved)', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => ok({ auto_refresh_interval_seconds: 15 }))
      .mockImplementationOnce(() => ok({ auto_refresh_interval_seconds: 60 }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await getUiSettings()).auto_refresh_interval_seconds).toBe(15);
    invalidateUiSettings();
    expect((await getUiSettings()).auto_refresh_interval_seconds).toBe(60);
  });

  it('resolves to {} on failure and does not cache the failure', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => Promise.resolve(new Response('nope', { status: 500 })))
      .mockImplementationOnce(() => ok({ auto_refresh_interval_seconds: 20 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await getUiSettings()).toEqual({});
    expect((await getUiSettings()).auto_refresh_interval_seconds).toBe(20);
  });
});
