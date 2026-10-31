import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

// Mock framer-motion — animate defers via queueMicrotask so both useEffect hooks
// register their listeners before the value fires (mirrors real animation timing).
vi.mock('framer-motion', () => {
  function makeMotionValue(initial: number) {
    let current = initial;
    const listeners: Array<(v: number) => void> = [];
    return {
      get: () => current,
      set: (v: number) => {
        current = v;
        listeners.forEach(fn => fn(v));
      },
      on: (_event: string, fn: (v: number) => void) => {
        listeners.push(fn);
        return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
      },
    };
  }

  return {
    useMotionValue: (initial: number) => makeMotionValue(initial),
    useTransform: (mv: ReturnType<typeof makeMotionValue>, fn: (v: number) => number) => {
      const derived = makeMotionValue(fn(mv.get()));
      mv.on('change', (v: number) => derived.set(fn(v)));
      return derived;
    },
    animate: vi.fn().mockImplementation((mv, target) => {
      queueMicrotask(() => mv.set(target));
      return { stop: vi.fn() };
    }),
  };
});

import { AnimatedCounter } from '../../../src/components/AnimatedCounter';

async function renderCounter(value: number, duration?: number): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(<AnimatedCounter value={value} duration={duration} />);
    await Promise.resolve();
  });
  return container;
}

describe('AnimatedCounter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders initial value', async () => {
    const container = await renderCounter(42);
    expect(container.textContent).toContain('42');
    container.remove();
  });

  it('renders zero', async () => {
    const container = await renderCounter(0);
    expect(container.textContent).toContain('0');
    container.remove();
  });

  it('renders negative number without crashing', async () => {
    const container = await renderCounter(-5);
    expect(container.textContent).not.toBe('');
    container.remove();
  });

  it('renders large number', async () => {
    const container = await renderCounter(1000000);
    expect(container.textContent).toMatch(/1.000.000|1000000/);
    container.remove();
  });

  it('rerenders to new value', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: ReturnType<typeof createRoot>;
    await act(async () => {
      root = createRoot(container);
      root.render(<AnimatedCounter value={10} />);
      await Promise.resolve();
    });
    expect(container.textContent).toContain('10');

    await act(async () => {
      root.render(<AnimatedCounter value={99} />);
      await Promise.resolve();
    });
    expect(container.textContent).toContain('99');
    container.remove();
  });

  it('accepts custom duration without crashing', async () => {
    const container = await renderCounter(50, 0.1);
    expect(container.textContent).toContain('50');
    container.remove();
  });

  it('is a function component', () => {
    expect(typeof AnimatedCounter).toBe('function');
  });
});
