'use client';

import { useEffect, useRef } from 'react';
import { useComputedColorScheme } from '@mantine/core';

const KEYFRAME_ID = 'matchexec-particle-kf';

function ensureKeyframe() {
  if (document.getElementById(KEYFRAME_ID)) return;
  const s = document.createElement('style');
  s.id = KEYFRAME_ID;
  s.textContent = `
    @keyframes me-particle-star {
      0%   { opacity: 0;    transform: translate(-50%, -50%) scale(0.15); }
      6%   { opacity: 0.9; }
      88%  { opacity: 0.85; }
      100% { opacity: 0;    transform: translate(calc(-50% + var(--me-ex)), calc(-50% + var(--me-ey))) scale(1.6); }
    }
  `;
  document.head.appendChild(s);
}

function targetCount() {
  const area = window.innerWidth * window.innerHeight;
  return Math.round(Math.max(60, Math.min(300, area / 8000)));
}

export function ParticleField() {
  const containerRef = useRef<HTMLDivElement>(null);
  const colorScheme = useComputedColorScheme('dark');

  useEffect(() => {
    if (!containerRef.current) return () => {};
    const el: HTMLDivElement = containerRef.current;

    ensureKeyframe();

    const fragments: HTMLSpanElement[] = [];

    function spawn() {
      fragments.forEach((p) => p.remove());
      fragments.length = 0;

      const count = targetCount();
      const blendMode = colorScheme === 'dark' ? 'normal' : 'multiply';

      for (let i = 0; i < count; i++) {
        const p = document.createElement('span');
        const size = 3 + Math.random() * 5;
        const duration = 12 + Math.random() * 14;
        const delay = -(Math.random() * duration);
        const isGold = Math.random() < 0.38;
        const alpha = colorScheme === 'dark'
          ? 0.55 + Math.random() * 0.4
          : 0.35 + Math.random() * 0.35;
        const color = isGold
          ? `rgba(247,204,2,${alpha.toFixed(2)})`
          : `rgba(168,85,247,${alpha.toFixed(2)})`;

        const angle = Math.random() * Math.PI * 2;
        const dist = 85 + Math.random() * 65;
        const ex = (Math.cos(angle) * dist).toFixed(1);
        const ey = (Math.sin(angle) * dist).toFixed(1);

        p.style.position = 'absolute';
        p.style.borderRadius = '50%';
        p.style.left = '50%';
        p.style.top = '50%';
        p.style.width = `${size}px`;
        p.style.height = `${size}px`;
        p.style.background = color;
        p.style.boxShadow = `0 0 ${(size * 3).toFixed(1)}px ${color}`;
        p.style.setProperty('--me-ex', `${ex}vw`);
        p.style.setProperty('--me-ey', `${ey}vh`);
        p.style.mixBlendMode = blendMode;
        p.style.animation = `me-particle-star ${duration.toFixed(1)}s ease-in ${delay.toFixed(1)}s infinite`;
        p.style.willChange = 'transform, opacity';

        el.appendChild(p);
        fragments.push(p);
      }
    }

    spawn();

    let timer: ReturnType<typeof setTimeout>;
    let prevWidth = window.innerWidth;
    function onResize() {
      if (window.innerWidth === prevWidth) return;
      prevWidth = window.innerWidth;
      clearTimeout(timer);
      timer = setTimeout(spawn, 250);
    }

    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(timer);
      fragments.forEach((p) => p.remove());
    };
  }, [colorScheme]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 0,
      }}
    />
  );
}
