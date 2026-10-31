/**
 * L4 — useLazyBackground Hook Tests
 *
 * Tests IntersectionObserver-based lazy background loading.
 * Uses a manual IntersectionObserver mock + React's createRoot via happy-dom.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useLazyBackground } from '../../../src/hooks/useLazyBackground';

// ─── IntersectionObserver mock ────────────────────────────────────────────────

type IOCallback = (entries: IntersectionObserverEntry[]) => void;

let lastCallback: IOCallback | null = null;
let lastOptions: IntersectionObserverInit | null = null;
let disconnectCallCount = 0;
let constructorCallCount = 0;

class MockIntersectionObserver {
  constructor(callback: IOCallback, options?: IntersectionObserverInit) {
    lastCallback = callback;
    lastOptions = options ?? null;
    constructorCallCount++;
  }
  observe = vi.fn();
  disconnect = vi.fn(() => { disconnectCallCount++; });
  unobserve = vi.fn();
}

function triggerIntersection(isIntersecting: boolean) {
  lastCallback?.([{ isIntersecting } as IntersectionObserverEntry]);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function mountHook(url: string | undefined) {
  let captured: ReturnType<typeof useLazyBackground> | null = null;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(function Wrapper() {
        captured = useLazyBackground(url);
        // Attach the ref to an actual div so the effect fires
        return createElement('div', { ref: captured.ref });
      })
    );
  });

  return {
    result: () => captured!,
    unmount: async () => {
      await act(async () => { root.unmount(); });
      document.body.removeChild(container);
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useLazyBackground (L4)', () => {
  beforeEach(() => {
    lastCallback = null;
    lastOptions = null;
    disconnectCallCount = 0;
    constructorCallCount = 0;
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hook is exported as a function', () => {
    expect(typeof useLazyBackground).toBe('function');
  });

  it('does not create IntersectionObserver when url is undefined', async () => {
    const { unmount } = await mountHook(undefined);
    expect(constructorCallCount).toBe(0);
    await unmount();
  });

  it('creates IntersectionObserver with rootMargin 400px when url is provided', async () => {
    const { unmount } = await mountHook('https://example.com/bg.jpg');
    expect(constructorCallCount).toBeGreaterThanOrEqual(1);
    expect(lastOptions).toMatchObject({ rootMargin: '400px' });
    await unmount();
  });

  it('backgroundImage is undefined before intersection', async () => {
    const { result, unmount } = await mountHook('https://example.com/bg.jpg');
    expect(result().backgroundImage).toBeUndefined();
    await unmount();
  });

  it('backgroundImage is set when element enters viewport', async () => {
    const { result, unmount } = await mountHook('https://example.com/bg.jpg');

    await act(async () => {
      triggerIntersection(true);
    });

    expect(result().backgroundImage).toBe('url(https://example.com/bg.jpg)');
    await unmount();
  });

  it('backgroundImage uses url(...) wrapper format', async () => {
    const url = 'https://example.com/image.png';
    const { result, unmount } = await mountHook(url);

    await act(async () => {
      triggerIntersection(true);
    });

    expect(result().backgroundImage).toBe(`url(${url})`);
    await unmount();
  });

  it('backgroundImage stays undefined when not intersecting', async () => {
    const { result, unmount } = await mountHook('https://example.com/bg.jpg');

    await act(async () => {
      triggerIntersection(false);
    });

    expect(result().backgroundImage).toBeUndefined();
    await unmount();
  });

  it('backgroundImage is undefined when url is undefined (no intersection)', async () => {
    const { result, unmount } = await mountHook(undefined);
    await act(async () => { triggerIntersection(true); });
    expect(result().backgroundImage).toBeUndefined();
    await unmount();
  });

  it('disconnects observer on unmount', async () => {
    const { unmount } = await mountHook('https://example.com/bg.jpg');
    const priorDisconnects = disconnectCallCount;
    await unmount();
    expect(disconnectCallCount).toBeGreaterThan(priorDisconnects);
  });

  it('disconnects observer after intersection is detected', async () => {
    const { unmount } = await mountHook('https://example.com/bg.jpg');
    const priorDisconnects = disconnectCallCount;

    await act(async () => {
      triggerIntersection(true);
    });

    expect(disconnectCallCount).toBeGreaterThan(priorDisconnects);
    await unmount();
  });

  it('returns a ref object alongside backgroundImage', async () => {
    const { result, unmount } = await mountHook('https://example.com/bg.jpg');
    expect(result()).toHaveProperty('ref');
    expect(result()).toHaveProperty('backgroundImage');
    await unmount();
  });
});
