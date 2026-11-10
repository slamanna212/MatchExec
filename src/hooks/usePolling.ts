import { useEffect, useRef } from 'react';

/**
 * Run `callback` every `intervalMs` while the browser tab is visible. Polling stops while the tab is hidden (a forgotten
 * background tab no longer hits the API) and resumes with one immediate refresh when it becomes visible again.
 * `intervalMs` null or <= 0 disables polling. The latest `callback` is always used, so it need not be memoised.
 */
export function usePolling(callback: () => unknown, intervalMs: number | null): void {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!intervalMs || intervalMs <= 0) return undefined;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => { void saved.current(); };
    const start = () => {
      if (timer === null) timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
      } else if (timer === null) {
        tick();
        start();
      }
    };

    if (document.visibilityState !== 'hidden') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);
}
