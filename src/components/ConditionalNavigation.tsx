import { useLocation } from 'react-router';
import { Navigation } from '@/components/navigation';
import type { ReactNode } from 'react';
import type { JSX } from 'react';

interface ConditionalNavigationProps {
  children: ReactNode;
}

/**
 * Wrapper that conditionally shows Navigation based on current path
 * Hides navigation on welcome flow pages
 */
export function ConditionalNavigation({ children }: ConditionalNavigationProps): JSX.Element {
  const { pathname } = useLocation();
  const isWelcomePage = pathname.startsWith('/welcome') || pathname.startsWith('/login');

  // On welcome pages, render children without Navigation wrapper
  if (isWelcomePage) {
    return <>{children}</>;
  }

  // On all other pages, render with Navigation
  return <Navigation>{children}</Navigation>;
}
