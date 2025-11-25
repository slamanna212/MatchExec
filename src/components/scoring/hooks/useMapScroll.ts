/**
 * Custom hook for managing horizontal map carousel scrolling
 */

import { useState, useRef, useCallback } from 'react';

const CARD_WIDTH = 180 + 16; // Card width + gap

export interface UseMapScrollResult {
  scrollPosition: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  scrollToMap: (index: number) => void;
  handleScrollLeft: () => void;
  handleScrollRight: () => void;
  getMaxScroll: () => number;
}

export function useMapScroll(_mapCount?: number): UseMapScrollResult {
  const [scrollPosition, setScrollPosition] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const getMaxScroll = useCallback(() => {
    if (containerRef.current) {
      return containerRef.current.scrollWidth - containerRef.current.clientWidth;
    }
    return 0;
  }, []);

  const scrollToMap = useCallback((index: number) => {
    if (containerRef.current) {
      // Center the card in the viewport
      const targetPosition = Math.max(0, (index * CARD_WIDTH) - (containerRef.current.clientWidth / 2) + (CARD_WIDTH / 2));
      const maxScroll = getMaxScroll();
      const finalPosition = Math.min(targetPosition, maxScroll);

      containerRef.current.scrollTo({
        left: finalPosition,
        behavior: 'smooth'
      });

      setScrollPosition(finalPosition);
    }
  }, [getMaxScroll]);

  const handleScrollLeft = useCallback(() => {
    if (containerRef.current) {
      const newPosition = Math.max(0, scrollPosition - CARD_WIDTH * 3);
      containerRef.current.scrollTo({
        left: newPosition,
        behavior: 'smooth'
      });
      setScrollPosition(newPosition);
    }
  }, [scrollPosition]);

  const handleScrollRight = useCallback(() => {
    if (containerRef.current) {
      const maxScroll = getMaxScroll();
      const newPosition = Math.min(maxScroll, scrollPosition + CARD_WIDTH * 3);
      containerRef.current.scrollTo({
        left: newPosition,
        behavior: 'smooth'
      });
      setScrollPosition(newPosition);
    }
  }, [scrollPosition, getMaxScroll]);

  return {
    scrollPosition,
    containerRef,
    scrollToMap,
    handleScrollLeft,
    handleScrollRight,
    getMaxScroll
  };
}
