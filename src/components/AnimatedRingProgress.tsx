'use client'

import { useEffect, useState, useRef } from 'react';
import { RingProgress } from '@mantine/core';
import { useInView } from 'framer-motion';

interface AnimatedRingProgressProps {
  size: number;
  thickness: number;
  sections: Array<{ value: number; color: string }>;
  duration?: number;
}

export function AnimatedRingProgress({
  size,
  thickness,
  sections,
  duration = 1000
}: AnimatedRingProgressProps) {
  const [animatedSections, setAnimatedSections] = useState(
    sections.map(section => ({ ...section, value: 0 }))
  );
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const hasAnimated = useRef(false);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isInView || hasAnimated.current) {
      // If already animated, update immediately on prop changes
      if (hasAnimated.current) {
        // Use requestAnimationFrame to avoid synchronous setState in effect
        animationRef.current = requestAnimationFrame(() => {
          setAnimatedSections(sections);
        });
      }
      return;
    }

    hasAnimated.current = true;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (easeOutCubic)
      const eased = 1 - Math.pow(1 - progress, 3);

      setAnimatedSections(
        sections.map(section => ({
          ...section,
          value: section.value * eased
        }))
      );

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isInView, sections, duration]);

  return (
    <div ref={ref}>
      <RingProgress
        size={size}
        thickness={thickness}
        sections={animatedSections}
      />
    </div>
  );
}
