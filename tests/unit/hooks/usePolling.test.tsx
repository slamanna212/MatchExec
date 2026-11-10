import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { usePolling } from '../../../src/hooks/usePolling';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let visibility: DocumentVisibilityState = 'visible';
let root: Root | null = null;
let container: HTMLElement;

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange'));
}

function Poller({ cb, ms }: { cb: () => void; ms: number | null }) {
  usePolling(cb, ms);
  return null;
}

async function mount(cb: () => void, ms: number | null) {
  container = document.createElement('div');
  root = createRoot(container);
  await act(async () => { root!.render(createElement(Poller, { cb, ms })); });
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('usePolling', () => {
  it('calls back on every interval while the tab is visible', async () => {
    const cb = vi.fn();
    await mount(cb, 1000);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it('pauses while hidden and refreshes once immediately when the tab becomes visible again', async () => {
    const cb = vi.fn();
    await mount(cb, 1000);
    setVisibility('hidden');
    vi.advanceTimersByTime(10_000);
    expect(cb).not.toHaveBeenCalled();
    setVisibility('visible');
    expect(cb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('does not start while mounted in a hidden tab', async () => {
    visibility = 'hidden';
    const cb = vi.fn();
    await mount(cb, 1000);
    vi.advanceTimersByTime(5000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('is disabled with a null interval', async () => {
    const cb = vi.fn();
    await mount(cb, null);
    vi.advanceTimersByTime(5000);
    setVisibility('hidden');
    setVisibility('visible');
    expect(cb).not.toHaveBeenCalled();
  });

  it('uses the latest callback without restarting the timer', async () => {
    const first = vi.fn();
    const second = vi.fn();
    await mount(first, 1000);
    vi.advanceTimersByTime(500);
    await act(async () => { root!.render(createElement(Poller, { cb: second, ms: 1000 })); });
    vi.advanceTimersByTime(500);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops on unmount', async () => {
    const cb = vi.fn();
    await mount(cb, 1000);
    await act(async () => { root!.unmount(); });
    root = null;
    vi.advanceTimersByTime(5000);
    setVisibility('visible');
    expect(cb).not.toHaveBeenCalled();
  });
});
