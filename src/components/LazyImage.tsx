'use client'

import { useState, useRef, useEffect } from 'react';
import { Image, Skeleton } from '@mantine/core';

interface LazyImageProps {
  src: string;
  alt: string;
  height?: number;
  radius?: number;
  fallbackSrc?: string;
  style?: React.CSSProperties;
}

export function LazyImage({ src, alt, height = 80, radius = 0, fallbackSrc, style }: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.1, // Load when 10% of the image is visible
        rootMargin: '50px' // Start loading 50px before the image comes into view
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={imgRef} style={{ height, ...style }}>
      {isInView ? (
        <>
          {!isLoaded && (
            <Skeleton height={height} radius={radius} />
          )}
          <Image
            src={src}
            alt={alt}
            height={height}
            radius={radius}
            fallbackSrc={fallbackSrc}
            style={{
              ...style,
              display: isLoaded ? 'block' : 'none'
            }}
            onLoad={() => setIsLoaded(true)}
          />
        </>
      ) : (
        <Skeleton height={height} radius={radius} />
      )}
    </div>
  );
}