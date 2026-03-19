import { useEffect, useRef, useState } from 'react';

/**
 * Lazy loads a CSS background image using IntersectionObserver.
 * The background is only applied when the element is near the viewport,
 * preventing network requests for off-screen images.
 */
export function useLazyBackground(url: string | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const [bgUrl, setBgUrl] = useState<string | undefined>();

  useEffect(() => {
    const el = ref.current;
    if (!el || !url) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setBgUrl(url);
          observer.disconnect();
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [url]);

  return {
    ref,
    backgroundImage: bgUrl ? `url(${bgUrl})` : undefined,
  };
}
