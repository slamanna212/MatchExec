'use client';

import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { IconSparkles, IconBrandDiscord, IconMessage } from '@tabler/icons-react';
import { ParticleField } from './ParticleField';
import styles from './welcome.module.css';

function getActiveStep(pathname: string): number {
  if (pathname.startsWith('/welcome/channels-setup')) return 2;
  if (pathname.startsWith('/welcome/discord-setup')) return 1;
  return 0;
}

const STEPS = [
  { num: '01', label: 'Welcome', Icon: IconSparkles },
  { num: '02', label: 'Discord', Icon: IconBrandDiscord },
  { num: '03', label: 'Channels', Icon: IconMessage },
];

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2.5 7.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Rail({ active, onStepClick }: { active: number; onStepClick: (i: number) => void }) {
  const fillPct = (active / (STEPS.length - 1)) * 100;

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Track */}
      <div style={{
        position: 'absolute',
        left: 15, right: 15,
        top: 14,
        height: 2,
        background: 'var(--mantine-color-default-border)',
        borderRadius: 999,
        zIndex: 0,
      }}>
        <div style={{
          height: '100%',
          width: `${fillPct}%`,
          background: 'linear-gradient(90deg, #7c3aed, #f7cc02)',
          borderRadius: 999,
          boxShadow: '0 0 12px rgba(124,58,237,0.6)',
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* Step nodes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', position: 'relative', zIndex: 1 }}>
        {STEPS.map((step, i) => {
          let state: 'done' | 'active' | 'todo';
          if (i < active) state = 'done';
          else if (i === active) state = 'active';
          else state = 'todo';

          let align: 'flex-start' | 'center' | 'flex-end';
          if (i === 0) align = 'flex-start';
          else if (i === 2) align = 'flex-end';
          else align = 'center';

          const nodeBaseStyle: React.CSSProperties = {
            width: 30, height: 30,
            borderRadius: '50%',
            display: 'grid', placeItems: 'center',
            fontFamily: 'var(--font-outfit, sans-serif)',
            fontWeight: 700,
            fontSize: 12,
            cursor: state === 'done' ? 'pointer' : 'default',
            transition: 'box-shadow 0.2s',
          };

          let nodeTheme: React.CSSProperties;
          if (state === 'active') {
            nodeTheme = { background: 'linear-gradient(135deg, #7c3aed, #4c1d95)', border: '2px solid transparent', color: 'white' };
          } else if (state === 'done') {
            nodeTheme = { background: 'rgba(124,58,237,0.25)', border: '2px solid #9333ea', color: '#c084fc' };
          } else {
            nodeTheme = { background: 'var(--mantine-color-default)', border: '2px solid var(--mantine-color-default-border)', color: 'var(--mantine-color-dimmed)' };
          }

          return (
            <div key={step.num} style={{ display: 'flex', flexDirection: 'column', alignItems: align, gap: 8 }}>
              <div
                className={state === 'active' ? styles.nodePulseAnim : undefined}
                style={{ ...nodeBaseStyle, ...nodeTheme }}
                onClick={() => state === 'done' && onStepClick(i)}
                role={state === 'done' ? 'button' : undefined}
                aria-label={state === 'done' ? `Go to step ${step.label}` : undefined}
              >
                {state === 'done' ? <CheckIcon /> : <step.Icon size={14} />}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: align }}>
                <div style={{
                  fontFamily: 'var(--font-geist-mono, monospace)',
                  fontSize: 10,
                  color: state === 'active' ? '#f7cc02' : 'var(--mantine-color-dimmed, #8b8fa3)',
                  letterSpacing: '0.08em',
                }}>
                  {step.num}
                </div>
                <div style={{
                  fontFamily: 'var(--font-outfit, sans-serif)',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: state === 'todo' ? 'var(--mantine-color-dimmed, #8b8fa3)' : 'var(--mantine-color-text, #e6e7ee)',
                }}>
                  {step.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function WelcomeLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeStep = getActiveStep(pathname);
  useEffect(() => {
    // iOS 15-18: setting theme-color to transparent tells Safari to render
    // its toolbar with the native glass material instead of a solid tint.
    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    const prevTheme = meta?.content;
    if (meta) meta.content = 'transparent';

    // iOS 26+: Safari falls back to body background-color when no suitable
    // fixed element is near the bottom edge. Adding this class applies a
    // transparent body background via CSS (same specificity, later source
    // order than the dark-mode rule in globals.css) so the toolbar goes glass.
    document.body.classList.add('welcome-flow');

    return () => {
      if (meta && prevTheme !== undefined) meta.content = prevTheme;
      document.body.classList.remove('welcome-flow');
    };
  }, []);

  const handleStepClick = (step: number) => {
    if (step === 0) router.push('/welcome');
    else if (step === 1) router.push('/welcome/discord-setup');
    else if (step === 2) router.push('/welcome/channels-setup');
    // no-op for unrecognized step
  };

  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: 'var(--mantine-color-body)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem env(safe-area-inset-bottom, 2rem) 1rem',
      position: 'relative',
    }}>
      <ParticleField />
      <div style={{ width: '100%', maxWidth: 1000, position: 'relative', zIndex: 1 }}>
        <div style={{ minHeight: 700 }}>
          <div className={styles.stage}>
            <Rail active={activeStep} onStepClick={handleStepClick} />
            <div>{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
