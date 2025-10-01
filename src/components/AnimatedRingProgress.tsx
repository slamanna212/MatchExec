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

  useEffect(() => {
    // Only animate once when first coming into view
    if (!isInView || hasAnimated.current) {
      // If already animated, just update to the new value immediately
      if (hasAnimated.current) {
        setAnimatedSections(sections);
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
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
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
