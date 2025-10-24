'use client';

import { usePathname } from 'next/navigation';
import { Navigation } from '@/components/navigation';
import { ReactNode } from 'react';

interface ConditionalNavigationProps {
  children: ReactNode;
}

/**
 * Wrapper that conditionally shows Navigation based on current path
 * Hides navigation on welcome flow pages
 */
export function ConditionalNavigation({ children }: ConditionalNavigationProps) {
  const pathname = usePathname();
  const isWelcomePage = pathname.startsWith('/welcome');

  // On welcome pages, render children without Navigation wrapper
  if (isWelcomePage) {
    return <>{children}</>;
  }

  // On all other pages, render with Navigation
  return <Navigation>{children}</Navigation>;
}
